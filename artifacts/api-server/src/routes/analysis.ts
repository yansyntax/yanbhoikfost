import { Router, type IRouter } from "express";
import { db, signalsTable } from "@workspace/db";
import { eq, count, sql } from "drizzle-orm";

const router: IRouter = Router();

// GET /analysis/market
router.get("/analysis/market", async (_req, res): Promise<void> => {
  // Generate market analysis using a technical model
  // Base price simulated around realistic XAUUSD range (3300-3400)
  const basePrice = getSimulatedPrice();
  const analysis = computeMarketAnalysis(basePrice);
  res.json(analysis);
});

// GET /analysis/stats
router.get("/analysis/stats", async (_req, res): Promise<void> => {
  const totalResult = await db
    .select({ count: count() })
    .from(signalsTable);

  const hitTPResult = await db
    .select({ count: count() })
    .from(signalsTable)
    .where(eq(signalsTable.status, "HIT_TP"));

  const hitSLResult = await db
    .select({ count: count() })
    .from(signalsTable)
    .where(eq(signalsTable.status, "HIT_SL"));

  const expiredResult = await db
    .select({ count: count() })
    .from(signalsTable)
    .where(eq(signalsTable.status, "EXPIRED"));

  const avgRRResult = await db
    .select({ avg: sql<number>`COALESCE(AVG(rr_ratio), 0)` })
    .from(signalsTable)
    .where(eq(signalsTable.status, "HIT_TP"));

  const total = totalResult[0]?.count ?? 0;
  const hitTP = hitTPResult[0]?.count ?? 0;
  const hitSL = hitSLResult[0]?.count ?? 0;
  const expired = expiredResult[0]?.count ?? 0;
  const avgRR = parseFloat(String(avgRRResult[0]?.avg ?? 0));
  const winRate = total > 0 ? Math.round((hitTP / (hitTP + hitSL || 1)) * 100) / 100 : 0;

  res.json({
    totalSignals: total,
    hitTP,
    hitSL,
    expired,
    winRate,
    avgRR: Math.round(avgRR * 100) / 100,
  });
});

function getSimulatedPrice(): number {
  // Stable price seeded on minute, fluctuates realistically
  const now = Date.now();
  const minuteSeed = Math.floor(now / 60000);
  const micro = Math.sin(minuteSeed * 0.7) * 15 + Math.cos(minuteSeed * 1.3) * 10;
  return Math.round((3330 + micro) * 100) / 100;
}

function computeMarketAnalysis(price: number) {
  const rsi = computeRSI(price);
  const ema20 = Math.round((price - 8 + Math.sin(price * 0.01) * 5) * 100) / 100;
  const ema50 = Math.round((price - 18 + Math.sin(price * 0.008) * 8) * 100) / 100;
  const ema200 = Math.round((price - 45 + Math.sin(price * 0.005) * 12) * 100) / 100;

  // Fibonacci levels from swing high/low
  const swingHigh = Math.round((price + 40) * 100) / 100;
  const swingLow = Math.round((price - 60) * 100) / 100;
  const range = swingHigh - swingLow;

  const fib236 = Math.round((swingHigh - range * 0.236) * 100) / 100;
  const fib382 = Math.round((swingHigh - range * 0.382) * 100) / 100;
  const fib500 = Math.round((swingHigh - range * 0.5) * 100) / 100;
  const fib618 = Math.round((swingHigh - range * 0.618) * 100) / 100;
  const fib786 = Math.round((swingHigh - range * 0.786) * 100) / 100;

  // Key levels
  const support = [
    Math.round((price - 25) * 100) / 100,
    Math.round((price - 45) * 100) / 100,
    Math.round((price - 70) * 100) / 100,
  ];
  const resistance = [
    Math.round((price + 20) * 100) / 100,
    Math.round((price + 38) * 100) / 100,
    Math.round((price + 65) * 100) / 100,
  ];
  const pivot = Math.round(((price + support[0] + resistance[0]) / 3) * 100) / 100;

  // Bias determination
  let bias: "BULLISH" | "BEARISH" | "NEUTRAL";
  let trend: string;
  let summary: string;

  if (price > ema20 && price > ema50 && rsi > 55) {
    bias = "BULLISH";
    trend = "Uptrend — Price above EMA20 & EMA50, momentum positive";
    summary = `XAUUSD berada dalam uptrend jangka pendek. Harga di atas EMA20 (${ema20}) dan EMA50 (${ema50}), menunjukkan momentum bullish. RSI di ${rsi.toFixed(1)} mendukung kelanjutan kenaikan. Area entry terbaik di zona Fibonacci 38.2% (${fib382}) dan 50% (${fib500}) sebagai support dinamis. Target resistance pertama di ${resistance[0]} kemudian ${resistance[1]}.`;
  } else if (price < ema20 && price < ema50 && rsi < 45) {
    bias = "BEARISH";
    trend = "Downtrend — Price below EMA20 & EMA50, bearish pressure";
    summary = `XAUUSD dalam tekanan jual. Harga di bawah EMA20 (${ema20}) dan EMA50 (${ema50}), mengindikasikan bias bearish. RSI di ${rsi.toFixed(1)} menunjukkan momentum turun. Area SELL optimal di Fibonacci 61.8% (${fib618}) sebagai resistance dinamis. Target support di ${support[0]} kemudian ${support[1]}.`;
  } else {
    bias = "NEUTRAL";
    trend = "Ranging market — Price oscillating between key levels";
    summary = `XAUUSD dalam fase konsolidasi. Harga bergerak sideways di antara support ${support[0]} dan resistance ${resistance[0]}. RSI di ${rsi.toFixed(1)} menunjukkan pasar seimbang. Tunggu breakout yang konfirmasi sebelum entry. Level pivot ${pivot} menjadi kunci utama arah selanjutnya.`;
  }

  return {
    bias,
    currentPrice: price,
    trend,
    keyLevels: { support, resistance, pivot },
    fibLevels: { fib236, fib382, fib500, fib618, fib786 },
    indicators: { rsi: Math.round(rsi * 10) / 10, ema20, ema50, ema200 },
    summary,
    updatedAt: new Date().toISOString(),
  };
}

function computeRSI(price: number): number {
  // Simplified RSI simulation based on price position in recent range
  const base = ((price - 3280) / 100) * 30 + 50;
  return Math.max(20, Math.min(80, base + Math.sin(price * 0.1) * 8));
}

export default router;
