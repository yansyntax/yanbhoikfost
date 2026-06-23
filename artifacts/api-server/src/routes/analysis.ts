import { Router, type IRouter } from "express";
import YahooFinance from "yahoo-finance2";
const yf = new YahooFinance();
import { eq, count, sql } from "drizzle-orm";
import { db, signalsTable } from "@workspace/db";

const router: IRouter = Router();

// ─── Cache ────────────────────────────────────────────────────────────────────
let cachedAnalysis: ReturnType<typeof buildAnalysisResult> | null = null;
let cachedCandles: Candle[] | null = null;
let lastFetchTime = 0;
const CACHE_TTL = 3 * 60 * 1000; // 3 minutes

// ─── Types ────────────────────────────────────────────────────────────────────
interface Candle {
  time: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface SmcZone {
  type: string;
  high: number;
  low: number;
  direction: "BULLISH" | "BEARISH" | "NEUTRAL";
  strength: "WEAK" | "MEDIUM" | "STRONG";
  description: string;
}

// ─── Routes ────────────────────────────────────────────────────────────────────
router.get("/analysis/market", async (req, res): Promise<void> => {
  try {
    const now = Date.now();
    if (cachedAnalysis && (now - lastFetchTime) < CACHE_TTL) {
      res.json(cachedAnalysis);
      return;
    }

    const candles = await fetchXAUUSDCandles();
    if (!candles || candles.length < 30) {
      res.status(503).json({ error: "Insufficient market data. Try again shortly." });
      return;
    }

    cachedCandles = candles;
    lastFetchTime = now;
    const result = buildAnalysisResult(candles);
    cachedAnalysis = result;

    // Auto-save signal to DB if strong confluence
    if (result.signal.recommendation !== "WAIT" && result.signal.confidence && result.signal.confidence >= 65) {
      await autoSaveSignal(result.signal, result.currentPrice);
    }

    res.json(result);
  } catch (err: unknown) {
    req.log?.error({ err }, "Market analysis error");
    // Fallback to simulated data if Yahoo Finance fails
    const fallback = buildFallbackAnalysis();
    res.json(fallback);
  }
});

router.get("/analysis/stats", async (_req, res): Promise<void> => {
  const totalResult = await db.select({ count: count() }).from(signalsTable);
  const hitTPResult = await db.select({ count: count() }).from(signalsTable).where(eq(signalsTable.status, "HIT_TP"));
  const hitSLResult = await db.select({ count: count() }).from(signalsTable).where(eq(signalsTable.status, "HIT_SL"));
  const expiredResult = await db.select({ count: count() }).from(signalsTable).where(eq(signalsTable.status, "EXPIRED"));
  const avgRRResult = await db.select({ avg: sql<number>`COALESCE(AVG(rr_ratio), 0)` }).from(signalsTable).where(eq(signalsTable.status, "HIT_TP"));

  const total = totalResult[0]?.count ?? 0;
  const hitTP = hitTPResult[0]?.count ?? 0;
  const hitSL = hitSLResult[0]?.count ?? 0;
  const expired = expiredResult[0]?.count ?? 0;
  const avgRR = parseFloat(String(avgRRResult[0]?.avg ?? 0));
  const winRate = (hitTP + hitSL) > 0 ? Math.round((hitTP / (hitTP + hitSL)) * 100) / 100 : 0;

  res.json({ totalSignals: total, hitTP, hitSL, expired, winRate, avgRR: Math.round(avgRR * 100) / 100 });
});

router.get("/analysis/candles", async (_req, res): Promise<void> => {
  try {
    const candles = cachedCandles ?? await fetchXAUUSDCandles();
    res.json({
      symbol: "XAUUSD",
      timeframe: "H1",
      candles: candles.slice(-100).map(c => ({
        time: c.time.toISOString(),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      })),
    });
  } catch {
    res.status(503).json({ error: "Candle data unavailable" });
  }
});

export default router;

// ─── Data Fetcher ──────────────────────────────────────────────────────────────
async function fetchXAUUSDCandles(): Promise<Candle[]> {
  // GC=F = Gold Futures — use daily OHLCV for reliable SMC analysis
  const end = new Date();
  const start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000); // 90 days back for D1 candles

  const rows = await yf.historical("GC=F", {
    period1: start,
    period2: end,
    interval: "1d" as const,
  });

  if (!rows || rows.length === 0) {
    throw new Error("No data from Yahoo Finance");
  }

  type YFRow = { date: Date; open?: number | null; high?: number | null; low?: number | null; close?: number | null; volume?: number | null };
  return (rows as YFRow[])
    .filter((q) => q.open != null && q.high != null && q.low != null && q.close != null)
    .map((q) => ({
      time: new Date(q.date),
      open: q.open as number,
      high: q.high as number,
      low: q.low as number,
      close: q.close as number,
      volume: (q.volume ?? 0) as number,
    }));
}

// ─── Core Analysis Builder ────────────────────────────────────────────────────
function buildAnalysisResult(candles: Candle[]) {
  const latest = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const price = latest.close;
  const prevClose = prev?.close ?? price;
  const changePercent = Math.round(((price - prevClose) / prevClose) * 10000) / 100;

  // ── Indicators ──────────────────────────────────────────────────────────────
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  const ma27 = sma(closes, 27);
  const ma54 = sma(closes, 54);
  const rsi = computeRSI(closes, 14);
  const { k: stochK, d: stochD } = computeStochastic(highs, lows, closes, 14, 3);
  const atr = computeATR(candles, 14);

  const maSignal = ma27 > ma54 ? "BULLISH" : ma27 < ma54 ? "BEARISH" : "NEUTRAL";
  const stochSignal = stochK > 80 ? "OVERBOUGHT" : stochK < 20 ? "OVERSOLD" : "NEUTRAL";

  const indicators = {
    rsi: round2(rsi),
    ma27: round2(ma27),
    ma54: round2(ma54),
    stochK: round2(stochK),
    stochD: round2(stochD),
    atr: round2(atr),
    maSignal,
    stochSignal,
  };

  // ── SMC Zones ────────────────────────────────────────────────────────────────
  const smcZones = detectSMCZones(candles, price);

  // ── Candlestick Pattern ───────────────────────────────────────────────────────
  const candlestick = detectCandlestickPattern(candles);

  // ── Key Levels ────────────────────────────────────────────────────────────────
  const swingHigh = Math.max(...highs.slice(-30));
  const swingLow = Math.min(...lows.slice(-30));
  const range = swingHigh - swingLow;

  const support = [
    round2(price - atr * 1.5),
    round2(price - atr * 3),
    round2(swingLow),
  ].sort((a, b) => b - a);

  const resistance = [
    round2(price + atr * 1.5),
    round2(price + atr * 3),
    round2(swingHigh),
  ].sort((a, b) => a - b);

  const pivot = round2((swingHigh + swingLow + price) / 3);

  const fibLevels = {
    fib236: round2(swingHigh - range * 0.236),
    fib382: round2(swingHigh - range * 0.382),
    fib500: round2(swingHigh - range * 0.5),
    fib618: round2(swingHigh - range * 0.618),
    fib786: round2(swingHigh - range * 0.786),
  };

  // ── Market Bias ────────────────────────────────────────────────────────────────
  let bias: "BULLISH" | "BEARISH" | "NEUTRAL";
  let trend: string;

  const bullishPoints = [
    price > ma27 ? 1 : 0,
    price > ma54 ? 1 : 0,
    ma27 > ma54 ? 1 : 0,
    rsi > 55 ? 1 : 0,
    stochK < 50 && stochK > 20 ? 1 : 0,
    candlestick.direction === "BULLISH" ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const bearishPoints = [
    price < ma27 ? 1 : 0,
    price < ma54 ? 1 : 0,
    ma27 < ma54 ? 1 : 0,
    rsi < 45 ? 1 : 0,
    stochK > 50 && stochK < 80 ? 1 : 0,
    candlestick.direction === "BEARISH" ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  if (bullishPoints >= 4) { bias = "BULLISH"; trend = "Uptrend — MA27 above MA54, momentum positif"; }
  else if (bearishPoints >= 4) { bias = "BEARISH"; trend = "Downtrend — MA27 di bawah MA54, tekanan jual"; }
  else { bias = "NEUTRAL"; trend = "Sideways — Pasar dalam fase konsolidasi"; }

  // ── Auto Signal ────────────────────────────────────────────────────────────────
  const signal = generateAutoSignal(candles, smcZones, indicators, candlestick, bias, price, atr, support, resistance, fibLevels);

  // ── Summary ────────────────────────────────────────────────────────────────────
  const summary = buildSummary(bias, price, ma27, ma54, rsi, stochK, stochSignal, smcZones, signal, support, resistance);

  return {
    bias,
    currentPrice: round2(price),
    prevClose: round2(prevClose),
    changePercent,
    trend,
    timeframe: "H1",
    dataSource: "XAUUSD via GC=F (Gold Futures)",
    keyLevels: { support, resistance, pivot },
    fibLevels,
    indicators,
    smcZones,
    candlestick,
    signal,
    summary,
    updatedAt: new Date().toISOString(),
  };
}

// ─── SMC Zone Detection ────────────────────────────────────────────────────────
function detectSMCZones(candles: Candle[], currentPrice: number): SmcZone[] {
  const zones: SmcZone[] = [];
  const n = candles.length;
  if (n < 10) return zones;

  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const closes = candles.map((c) => c.close);
  const opens = candles.map((c) => c.open);

  // ── FVG (Fair Value Gap) ────────────────────────────────────────────────────
  for (let i = 1; i < n - 1 && zones.length < 6; i++) {
    const c0 = candles[i - 1];
    const c2 = candles[i + 1];

    // Bullish FVG: gap between c0.high and c2.low
    if (c2.low > c0.high) {
      const gap = c2.low - c0.high;
      if (gap > 0.5) {
        zones.push({
          type: "FVG",
          high: round2(c2.low),
          low: round2(c0.high),
          direction: "BULLISH",
          strength: gap > 5 ? "STRONG" : gap > 2 ? "MEDIUM" : "WEAK",
          description: `Bullish FVG — Gap ${round2(gap)} poin (belum terisi)`,
        });
      }
    }

    // Bearish FVG: gap between c0.low and c2.high
    if (c2.high < c0.low) {
      const gap = c0.low - c2.high;
      if (gap > 0.5) {
        zones.push({
          type: "FVG",
          high: round2(c0.low),
          low: round2(c2.high),
          direction: "BEARISH",
          strength: gap > 5 ? "STRONG" : gap > 2 ? "MEDIUM" : "WEAK",
          description: `Bearish FVG — Gap ${round2(gap)} poin (belum terisi)`,
        });
      }
    }
  }

  // ── Order Block Detection ──────────────────────────────────────────────────
  for (let i = 1; i < n - 3 && zones.length < 12; i++) {
    const c = candles[i];
    const bodySize = Math.abs(c.close - c.open);
    const totalRange = c.high - c.low;
    if (totalRange === 0) continue;

    // Bullish Order Block: bearish candle before bullish impulse
    const isBearishCandle = c.close < c.open;
    if (isBearishCandle) {
      const nextMoves = closes.slice(i + 1, i + 4);
      const strongBullishMove = nextMoves.some((cl) => cl > c.high + bodySize * 0.5);
      if (strongBullishMove && c.low < currentPrice) {
        zones.push({
          type: "ORDER_BLOCK",
          high: round2(c.high),
          low: round2(c.open),
          direction: "BULLISH",
          strength: bodySize > 3 ? "STRONG" : "MEDIUM",
          description: `Bullish Order Block — Last bearish candle sebelum impulse naik`,
        });
      }
    }

    // Bearish Order Block: bullish candle before bearish impulse
    const isBullishCandle = c.close > c.open;
    if (isBullishCandle) {
      const nextMoves = closes.slice(i + 1, i + 4);
      const strongBearishMove = nextMoves.some((cl) => cl < c.low - bodySize * 0.5);
      if (strongBearishMove && c.high > currentPrice) {
        zones.push({
          type: "ORDER_BLOCK",
          high: round2(c.close),
          low: round2(c.low),
          direction: "BEARISH",
          strength: bodySize > 3 ? "STRONG" : "MEDIUM",
          description: `Bearish Order Block — Last bullish candle sebelum impulse turun`,
        });
      }
    }
  }

  // ── CHoCH (Change of Character) ────────────────────────────────────────────
  const recentHighs = highs.slice(-20);
  const recentLows = lows.slice(-20);
  const swingHigh20 = Math.max(...recentHighs);
  const swingLow20 = Math.min(...recentLows);
  const prevHigh = Math.max(...highs.slice(-40, -20));
  const prevLow = Math.min(...lows.slice(-40, -20));

  if (closes[n - 1] < prevLow && swingHigh20 < prevHigh) {
    zones.push({
      type: "CHOCH",
      high: round2(prevHigh),
      low: round2(swingLow20),
      direction: "BEARISH",
      strength: "STRONG",
      description: "CHoCH Bearish — Struktur berubah ke bearish, harga break swing low",
    });
  }
  if (closes[n - 1] > prevHigh && swingLow20 > prevLow) {
    zones.push({
      type: "CHOCH",
      high: round2(swingHigh20),
      low: round2(prevLow),
      direction: "BULLISH",
      strength: "STRONG",
      description: "CHoCH Bullish — Struktur berubah ke bullish, harga break swing high",
    });
  }

  // ── BOS (Break of Structure) ───────────────────────────────────────────────
  const prev5High = Math.max(...highs.slice(-10, -5));
  const prev5Low = Math.min(...lows.slice(-10, -5));
  const curr5High = Math.max(...highs.slice(-5));
  const curr5Low = Math.min(...lows.slice(-5));

  if (curr5High > prev5High) {
    zones.push({
      type: "BOS",
      high: round2(curr5High),
      low: round2(prev5High),
      direction: "BULLISH",
      strength: (curr5High - prev5High) > 10 ? "STRONG" : "MEDIUM",
      description: `BOS Bullish — Break of Structure ke atas ${round2(prev5High)}`,
    });
  }
  if (curr5Low < prev5Low) {
    zones.push({
      type: "BOS",
      high: round2(prev5Low),
      low: round2(curr5Low),
      direction: "BEARISH",
      strength: (prev5Low - curr5Low) > 10 ? "STRONG" : "MEDIUM",
      description: `BOS Bearish — Break of Structure ke bawah ${round2(prev5Low)}`,
    });
  }

  // ── S&D Zones (Supply & Demand) ────────────────────────────────────────────
  // Demand: Area where price sharply moved up from
  for (let i = 5; i < n - 5; i++) {
    const c = candles[i];
    const bodySize = Math.abs(c.close - c.open);
    const isBullish = c.close > c.open;
    if (!isBullish || bodySize < 2) continue;

    const prevBodies = closes.slice(Math.max(0, i - 5), i);
    const declining = prevBodies.every((cl, idx) => idx === 0 || cl <= prevBodies[idx - 1]);
    if (declining && c.low < currentPrice) {
      zones.push({
        type: "DEMAND",
        high: round2(c.open),
        low: round2(c.low),
        direction: "BULLISH",
        strength: bodySize > 5 ? "STRONG" : "MEDIUM",
        description: `Demand Zone — Area ${round2(c.low)}-${round2(c.open)}, harga pernah naik kuat dari sini`,
      });
      break;
    }
  }

  // Supply: Area where price sharply dropped from
  for (let i = n - 10; i < n - 2; i++) {
    if (i < 5) continue;
    const c = candles[i];
    const bodySize = Math.abs(c.close - c.open);
    const isBearish = c.close < c.open;
    if (!isBearish || bodySize < 2) continue;

    const nextBodies = closes.slice(i + 1, Math.min(n, i + 5));
    const declining = nextBodies.some((cl) => cl < c.close - bodySize);
    if (declining && c.high > currentPrice) {
      zones.push({
        type: "SUPPLY",
        high: round2(c.high),
        low: round2(c.open),
        direction: "BEARISH",
        strength: bodySize > 5 ? "STRONG" : "MEDIUM",
        description: `Supply Zone — Area ${round2(c.open)}-${round2(c.high)}, harga pernah turun kuat dari sini`,
      });
      break;
    }
  }

  // ── Liquidity Levels ───────────────────────────────────────────────────────
  const weeklyHigh = Math.max(...highs.slice(-120));
  const weeklyLow = Math.min(...lows.slice(-120));

  if (weeklyHigh > currentPrice) {
    zones.push({
      type: "LIQUIDITY",
      high: round2(weeklyHigh + 0.5),
      low: round2(weeklyHigh - 0.5),
      direction: "BEARISH",
      strength: "STRONG",
      description: `BSL (Buy-side Liquidity) — Stops di atas ${round2(weeklyHigh)}, target institusi`,
    });
  }
  if (weeklyLow < currentPrice) {
    zones.push({
      type: "LIQUIDITY",
      high: round2(weeklyLow + 0.5),
      low: round2(weeklyLow - 0.5),
      direction: "BULLISH",
      strength: "STRONG",
      description: `SSL (Sell-side Liquidity) — Stops di bawah ${round2(weeklyLow)}, target institusi`,
    });
  }

  // ── S&R (Support & Resistance horizontal) ─────────────────────────────────
  const recentPivotHighs = findPivotHighs(highs.slice(-60), 3);
  const recentPivotLows = findPivotLows(lows.slice(-60), 3);

  for (const ph of recentPivotHighs.slice(0, 2)) {
    const level = highs[highs.length - 60 + ph];
    if (level > currentPrice) {
      zones.push({
        type: "RESISTANCE",
        high: round2(level + 1),
        low: round2(level - 1),
        direction: "BEARISH",
        strength: "MEDIUM",
        description: `Resistance — Level kuat ${round2(level)}, harga pernah ditolak di sini`,
      });
    }
  }

  for (const pl of recentPivotLows.slice(0, 2)) {
    const level = lows[lows.length - 60 + pl];
    if (level < currentPrice) {
      zones.push({
        type: "SUPPORT",
        high: round2(level + 1),
        low: round2(level - 1),
        direction: "BULLISH",
        strength: "MEDIUM",
        description: `Support — Level kuat ${round2(level)}, harga pernah bounced di sini`,
      });
    }
  }

  // ── RBS / SBR ──────────────────────────────────────────────────────────────
  // Check if recent resistance became support (RBS)
  const allPivotHighs = findPivotHighs(highs.slice(-80), 4);
  for (const ph of allPivotHighs) {
    const idx = highs.length - 80 + ph;
    if (idx < 0) continue;
    const level = highs[idx];
    const recentLow = Math.min(...lows.slice(-10));
    if (Math.abs(recentLow - level) < 3 && level < currentPrice) {
      zones.push({
        type: "RBS",
        high: round2(level + 2),
        low: round2(level - 2),
        direction: "BULLISH",
        strength: "STRONG",
        description: `RBS (Resistance Becomes Support) — Mantan resistance ${round2(level)} kini jadi support`,
      });
      break;
    }
  }

  // Deduplicate zones by type
  const seen = new Set<string>();
  return zones.filter((z) => {
    const key = `${z.type}-${Math.round(z.high)}-${z.direction}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 15);
}

// ─── Candlestick Pattern Detection ────────────────────────────────────────────
function detectCandlestickPattern(candles: Candle[]): { name: string; direction: "BULLISH" | "BEARISH" | "NEUTRAL"; strength: "WEAK" | "MEDIUM" | "STRONG" } {
  const n = candles.length;
  if (n < 3) return { name: "No Pattern", direction: "NEUTRAL", strength: "WEAK" };

  const c = candles[n - 1];
  const p = candles[n - 2];
  const pp = candles[n - 3];

  const body = Math.abs(c.close - c.open);
  const range = c.high - c.low;
  const upperWick = c.high - Math.max(c.open, c.close);
  const lowerWick = Math.min(c.open, c.close) - c.low;

  if (range === 0) return { name: "Doji", direction: "NEUTRAL", strength: "WEAK" };

  const bodyRatio = body / range;
  const isBullish = c.close > c.open;
  const isBearish = c.close < c.open;

  // Bullish Engulfing
  if (p.close < p.open && isBullish && c.open < p.close && c.close > p.open) {
    return { name: "Bullish Engulfing", direction: "BULLISH", strength: "STRONG" };
  }
  // Bearish Engulfing
  if (p.close > p.open && isBearish && c.open > p.close && c.close < p.open) {
    return { name: "Bearish Engulfing", direction: "BEARISH", strength: "STRONG" };
  }
  // Hammer (Bullish)
  if (lowerWick > body * 2 && upperWick < body * 0.5 && isBullish) {
    return { name: "Hammer", direction: "BULLISH", strength: "STRONG" };
  }
  // Shooting Star (Bearish)
  if (upperWick > body * 2 && lowerWick < body * 0.5 && isBearish) {
    return { name: "Shooting Star", direction: "BEARISH", strength: "STRONG" };
  }
  // Pin Bar Bullish
  if (lowerWick > range * 0.6 && body < range * 0.25) {
    return { name: "Bullish Pin Bar", direction: "BULLISH", strength: "STRONG" };
  }
  // Pin Bar Bearish
  if (upperWick > range * 0.6 && body < range * 0.25) {
    return { name: "Bearish Pin Bar", direction: "BEARISH", strength: "STRONG" };
  }
  // Morning Star
  if (pp.close < pp.open && Math.abs(p.close - p.open) < range * 0.3 && c.close > c.open && c.close > (pp.open + pp.close) / 2) {
    return { name: "Morning Star", direction: "BULLISH", strength: "STRONG" };
  }
  // Evening Star
  if (pp.close > pp.open && Math.abs(p.close - p.open) < range * 0.3 && c.close < c.open && c.close < (pp.open + pp.close) / 2) {
    return { name: "Evening Star", direction: "BEARISH", strength: "STRONG" };
  }
  // Marubozu Bullish
  if (isBullish && bodyRatio > 0.85) {
    return { name: "Bullish Marubozu", direction: "BULLISH", strength: "MEDIUM" };
  }
  // Marubozu Bearish
  if (isBearish && bodyRatio > 0.85) {
    return { name: "Bearish Marubozu", direction: "BEARISH", strength: "MEDIUM" };
  }
  // Doji
  if (bodyRatio < 0.1) {
    return { name: "Doji", direction: "NEUTRAL", strength: "WEAK" };
  }

  return {
    name: isBullish ? "Bullish Candle" : "Bearish Candle",
    direction: isBullish ? "BULLISH" : "BEARISH",
    strength: "WEAK",
  };
}

// ─── Auto Signal Generator ─────────────────────────────────────────────────────
function generateAutoSignal(
  candles: Candle[],
  zones: SmcZone[],
  indicators: ReturnType<typeof buildAnalysisResult>["indicators"] extends Promise<infer T> ? T : any,
  candlestick: ReturnType<typeof detectCandlestickPattern>,
  bias: "BULLISH" | "BEARISH" | "NEUTRAL",
  price: number,
  atr: number,
  support: number[],
  resistance: number[],
  fibLevels: { fib382: number; fib500: number; fib618: number; fib236: number; fib786: number },
) {
  const confluenceDetails: string[] = [];
  let buyScore = 0;
  let sellScore = 0;

  // ── Indicator confluence ────────────────────────────────────────────────────
  if (indicators.maSignal === "BULLISH") { buyScore += 2; confluenceDetails.push("MA27 > MA54 (Bullish Cross)"); }
  if (indicators.maSignal === "BEARISH") { sellScore += 2; confluenceDetails.push("MA27 < MA54 (Bearish Cross)"); }
  if (indicators.rsi < 35) { buyScore += 2; confluenceDetails.push(`RSI Oversold (${indicators.rsi})`); }
  if (indicators.rsi > 65) { sellScore += 2; confluenceDetails.push(`RSI Overbought (${indicators.rsi})`); }
  if (indicators.stochSignal === "OVERSOLD") { buyScore += 2; confluenceDetails.push(`Stochastic Oversold (K:${indicators.stochK})`); }
  if (indicators.stochSignal === "OVERBOUGHT") { sellScore += 2; confluenceDetails.push(`Stochastic Overbought (K:${indicators.stochK})`); }
  if (indicators.stochK > indicators.stochD && indicators.stochK < 80) { buyScore += 1; confluenceDetails.push("Stochastic K crosses D upward"); }
  if (indicators.stochK < indicators.stochD && indicators.stochK > 20) { sellScore += 1; confluenceDetails.push("Stochastic K crosses D downward"); }

  // ── Bias confluence ─────────────────────────────────────────────────────────
  if (bias === "BULLISH") { buyScore += 2; confluenceDetails.push("Market Bias: Bullish"); }
  if (bias === "BEARISH") { sellScore += 2; confluenceDetails.push("Market Bias: Bearish"); }

  // ── Candlestick confirmation ────────────────────────────────────────────────
  if (candlestick.direction === "BULLISH" && candlestick.strength !== "WEAK") {
    buyScore += candlestick.strength === "STRONG" ? 3 : 1;
    confluenceDetails.push(`Candlestick: ${candlestick.name} (Bullish Confirmation)`);
  }
  if (candlestick.direction === "BEARISH" && candlestick.strength !== "WEAK") {
    sellScore += candlestick.strength === "STRONG" ? 3 : 1;
    confluenceDetails.push(`Candlestick: ${candlestick.name} (Bearish Confirmation)`);
  }

  // ── SMC Zone confluence ─────────────────────────────────────────────────────
  const nearbyZones = zones.filter((z) => {
    const zoneMid = (z.high + z.low) / 2;
    return Math.abs(zoneMid - price) < atr * 3;
  });

  for (const zone of nearbyZones) {
    if (zone.direction === "BULLISH") {
      const bonus = zone.strength === "STRONG" ? 3 : zone.strength === "MEDIUM" ? 2 : 1;
      buyScore += bonus;
      confluenceDetails.push(`SMC: ${zone.type} Bullish zone dekat harga`);
    }
    if (zone.direction === "BEARISH") {
      const bonus = zone.strength === "STRONG" ? 3 : zone.strength === "MEDIUM" ? 2 : 1;
      sellScore += bonus;
      confluenceDetails.push(`SMC: ${zone.type} Bearish zone dekat harga`);
    }
  }

  // ── Price in relation to levels ─────────────────────────────────────────────
  const nearSupport = support.some((s) => Math.abs(price - s) < atr * 0.8);
  const nearResistance = resistance.some((r) => Math.abs(price - r) < atr * 0.8);
  if (nearSupport) { buyScore += 2; confluenceDetails.push("Harga dekat Support kuat"); }
  if (nearResistance) { sellScore += 2; confluenceDetails.push("Harga dekat Resistance kuat"); }

  // Fibonacci confluence
  const nearFib382 = Math.abs(price - fibLevels.fib382) < atr;
  const nearFib618 = Math.abs(price - fibLevels.fib618) < atr;
  if (nearFib382 || nearFib618) {
    if (bias === "BULLISH") { buyScore += 2; confluenceDetails.push("Harga di Fibonacci Golden Ratio (38.2/61.8%)"); }
    if (bias === "BEARISH") { sellScore += 2; confluenceDetails.push("Harga di Fibonacci Golden Ratio (38.2/61.8%)"); }
  }

  // ── Decision ────────────────────────────────────────────────────────────────
  const totalScore = buyScore + sellScore;
  const minScore = 8; // Minimum confluence score to generate signal

  if (buyScore >= minScore && buyScore > sellScore * 1.3) {
    // Find best entry area
    const entryArea = findBestEntryArea(zones, price, "BULLISH");
    const entry = entryArea ? (entryArea.high + entryArea.low) / 2 : price;
    const sl = round2(Math.min(entry - atr * 1.5, support[0] - atr * 0.5));
    const tp1 = round2(entry + (entry - sl) * 2);
    const rr = round2((tp1 - entry) / (entry - sl));

    return {
      recommendation: "BUY" as const,
      entryPrice: round2(entry),
      takeProfit: round2(tp1),
      stopLoss: sl,
      area: entryArea ? entryArea.type : "SUPPORT",
      reason: `BUY Signal — ${confluenceDetails.slice(0, 3).join(", ")}`,
      rrRatio: rr,
      confidence: Math.min(95, Math.round((buyScore / Math.max(totalScore, 1)) * 100)),
      confluenceScore: buyScore,
      confluenceDetails,
    };
  }

  if (sellScore >= minScore && sellScore > buyScore * 1.3) {
    const entryArea = findBestEntryArea(zones, price, "BEARISH");
    const entry = entryArea ? (entryArea.high + entryArea.low) / 2 : price;
    const sl = round2(Math.max(entry + atr * 1.5, resistance[0] + atr * 0.5));
    const tp1 = round2(entry - (sl - entry) * 2);
    const rr = round2((entry - tp1) / (sl - entry));

    return {
      recommendation: "SELL" as const,
      entryPrice: round2(entry),
      takeProfit: round2(tp1),
      stopLoss: sl,
      area: entryArea ? entryArea.type : "RESISTANCE",
      reason: `SELL Signal — ${confluenceDetails.slice(0, 3).join(", ")}`,
      rrRatio: rr,
      confidence: Math.min(95, Math.round((sellScore / Math.max(totalScore, 1)) * 100)),
      confluenceScore: sellScore,
      confluenceDetails,
    };
  }

  return {
    recommendation: "WAIT" as const,
    entryPrice: null,
    takeProfit: null,
    stopLoss: null,
    area: null,
    reason: totalScore < 4 ? "Belum ada konfluensi cukup. Tunggu setup yang lebih clear." : "Mixed signals — Tunggu konfirmasi arah yang lebih kuat.",
    rrRatio: null,
    confidence: null,
    confluenceScore: Math.max(buyScore, sellScore),
    confluenceDetails,
  };
}

function findBestEntryArea(zones: SmcZone[], price: number, direction: "BULLISH" | "BEARISH"): SmcZone | null {
  const relevant = zones.filter((z) => z.direction === direction || z.direction === "NEUTRAL");
  if (relevant.length === 0) return null;

  // Prefer ORDER_BLOCK > FVG > DEMAND/SUPPLY > others
  const priority = ["ORDER_BLOCK", "FVG", "DEMAND", "SUPPLY", "RBS", "SBR", "SUPPORT", "RESISTANCE"];
  for (const type of priority) {
    const zone = relevant.find((z) => z.type === type && Math.abs((z.high + z.low) / 2 - price) < 30);
    if (zone) return zone;
  }
  return relevant[0] ?? null;
}

// ─── Summary Builder ───────────────────────────────────────────────────────────
function buildSummary(
  bias: string,
  price: number,
  ma27: number,
  ma54: number,
  rsi: number,
  stochK: number,
  stochSignal: string,
  smcZones: SmcZone[],
  signal: { recommendation: string; entryPrice: number | null; takeProfit: number | null; stopLoss: number | null; area: string | null },
  support: number[],
  resistance: number[],
): string {
  const topZones = smcZones.slice(0, 3).map((z) => z.type).join(", ");
  const signalText = signal.recommendation === "WAIT"
    ? "Belum ada signal valid — WAIT untuk setup yang lebih clear."
    : `Signal aktif: ${signal.recommendation} entry ${signal.entryPrice?.toFixed(2)} | TP ${signal.takeProfit?.toFixed(2)} | SL ${signal.stopLoss?.toFixed(2)} | Area: ${signal.area}`;

  return `XAUUSD saat ini di ${price.toFixed(2)} dengan bias ${bias}. MA27 (${ma27.toFixed(2)}) ${ma27 > ma54 ? "di atas" : "di bawah"} MA54 (${ma54.toFixed(2)}). RSI ${rsi.toFixed(1)} — ${rsi > 70 ? "Overbought" : rsi < 30 ? "Oversold" : "Netral"}. Stochastic ${stochK.toFixed(0)} — ${stochSignal}. SMC zones terdeteksi: ${topZones || "sedang dianalisis"}. Support terdekat: ${support[0]}. Resistance terdekat: ${resistance[0]}. ${signalText}`;
}

// ─── Auto-save Signal ──────────────────────────────────────────────────────────
async function autoSaveSignal(
  signal: { recommendation: string; entryPrice: number | null; takeProfit: number | null; stopLoss: number | null; area: string | null; reason: string | null; rrRatio: number | null; confidence: number | null; confluenceDetails: string[] },
  currentPrice: number,
): Promise<void> {
  try {
    if (!signal.entryPrice || !signal.takeProfit || !signal.stopLoss) return;

    // Check if there's already an active signal with similar price
    const existing = await db.select().from(signalsTable).where(eq(signalsTable.status, "ACTIVE"));
    const hasSimilar = existing.some(
      (s) => s.type === signal.recommendation && Math.abs(s.entryPrice - (signal.entryPrice ?? 0)) < 5,
    );
    if (hasSimilar) return;

    const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000); // 4 hours

    await db.insert(signalsTable).values({
      type: signal.recommendation,
      entryPrice: signal.entryPrice,
      takeProfit: signal.takeProfit,
      stopLoss: signal.stopLoss,
      area: signal.area ?? "ZONE",
      reason: signal.reason ?? `Auto signal dari SMC analysis`,
      timeframe: "H1",
      rrRatio: signal.rrRatio,
      confidence: signal.confidence,
      smcContext: JSON.stringify(signal.confluenceDetails),
      status: "ACTIVE",
      expiresAt,
    });
  } catch {
    // Non-critical, just skip
  }
}

// ─── Indicator Calculations ───────────────────────────────────────────────────
function sma(data: number[], period: number): number {
  if (data.length < period) return data[data.length - 1] ?? 0;
  const slice = data.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function computeRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 10) / 10;
}

function computeStochastic(
  highs: number[],
  lows: number[],
  closes: number[],
  kPeriod = 14,
  dPeriod = 3,
): { k: number; d: number } {
  const n = closes.length;
  if (n < kPeriod) return { k: 50, d: 50 };

  const kValues: number[] = [];
  for (let i = kPeriod - 1; i < n; i++) {
    const highSlice = highs.slice(i - kPeriod + 1, i + 1);
    const lowSlice = lows.slice(i - kPeriod + 1, i + 1);
    const highestHigh = Math.max(...highSlice);
    const lowestLow = Math.min(...lowSlice);
    const range = highestHigh - lowestLow;
    const k = range === 0 ? 50 : ((closes[i] - lowestLow) / range) * 100;
    kValues.push(k);
  }

  const latestK = kValues[kValues.length - 1] ?? 50;
  const dSlice = kValues.slice(-dPeriod);
  const latestD = dSlice.reduce((a, b) => a + b, 0) / dSlice.length;

  return { k: Math.round(latestK * 10) / 10, d: Math.round(latestD * 10) / 10 };
}

function computeATR(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 5;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    const tr = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    trs.push(tr);
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / Math.min(period, trs.length);
}

function findPivotHighs(highs: number[], lookback: number): number[] {
  const pivots: number[] = [];
  for (let i = lookback; i < highs.length - lookback; i++) {
    const window = highs.slice(i - lookback, i + lookback + 1);
    if (highs[i] === Math.max(...window)) pivots.push(i);
  }
  return pivots;
}

function findPivotLows(lows: number[], lookback: number): number[] {
  const pivots: number[] = [];
  for (let i = lookback; i < lows.length - lookback; i++) {
    const window = lows.slice(i - lookback, i + lookback + 1);
    if (lows[i] === Math.min(...window)) pivots.push(i);
  }
  return pivots;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Fallback Analysis (if Yahoo Finance fails) ────────────────────────────────
function buildFallbackAnalysis() {
  const price = 3340 + Math.sin(Date.now() / 100000) * 20;
  return {
    bias: "NEUTRAL" as const,
    currentPrice: round2(price),
    prevClose: round2(price - 2),
    changePercent: 0.06,
    trend: "Data dari sumber eksternal tidak tersedia saat ini",
    timeframe: "H1",
    dataSource: "Fallback (Yahoo Finance tidak tersedia)",
    keyLevels: { support: [round2(price - 20), round2(price - 40)], resistance: [round2(price + 20), round2(price + 40)], pivot: round2(price) },
    fibLevels: { fib236: round2(price - 10), fib382: round2(price - 15), fib500: round2(price - 20), fib618: round2(price - 25), fib786: round2(price - 30) },
    indicators: { rsi: 50, ma27: round2(price - 5), ma54: round2(price - 10), stochK: 50, stochD: 50, atr: 5, maSignal: "NEUTRAL", stochSignal: "NEUTRAL" },
    smcZones: [],
    candlestick: { name: "No Data", direction: "NEUTRAL" as const, strength: "WEAK" as const },
    signal: { recommendation: "WAIT" as const, entryPrice: null, takeProfit: null, stopLoss: null, area: null, reason: "Data market tidak tersedia. Periksa koneksi internet VPS.", rrRatio: null, confidence: null, confluenceScore: 0, confluenceDetails: [] },
    summary: "Data market tidak tersedia saat ini. Pastikan VPS memiliki koneksi internet yang stabil.",
    updatedAt: new Date().toISOString(),
  };
}
