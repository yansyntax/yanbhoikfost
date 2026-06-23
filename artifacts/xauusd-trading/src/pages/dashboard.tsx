import { useGetMarketAnalysis, useGetActiveSignals, useGetSignalStats, useExpireSignal } from "@workspace/api-client-react";
import Layout from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMarketAnalysisQueryKey, getGetActiveSignalsQueryKey } from "@workspace/api-client-react";
import { RefreshCw, TrendingUp, TrendingDown, Minus, AlertTriangle, Target, ShieldAlert, Layers, Percent, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { id } from "date-fns/locale";

const ZONE_LABEL: Record<string, string> = {
  FVG: "Fair Value Gap",
  ORDER_BLOCK: "Order Block",
  CHOCH: "CHoCH",
  BOS: "Break of Structure",
  DEMAND: "Demand Zone",
  SUPPLY: "Supply Zone",
  LIQUIDITY: "Liquidity",
  SUPPORT: "Support",
  RESISTANCE: "Resistance",
  RBS: "Resistance→Support",
  SBR: "Support→Resistance",
  RETEST: "Retest",
  PULLBACK: "Pullback",
  HNSS: "HNSS",
};

export default function Dashboard() {
  const qc = useQueryClient();
  const { data: analysis, isLoading: loadingAnalysis, error } = useGetMarketAnalysis({
    query: { queryKey: getGetMarketAnalysisQueryKey(), refetchInterval: 3 * 60 * 1000 },
  });
  const { data: activeSignals = [] } = useGetActiveSignals({
    query: { queryKey: getGetActiveSignalsQueryKey(), refetchInterval: 60 * 1000 },
  });
  const { data: stats } = useGetSignalStats();
  const expireMutation = useExpireSignal();

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: getGetMarketAnalysisQueryKey() });
    void qc.invalidateQueries({ queryKey: getGetActiveSignalsQueryKey() });
  };

  const signal = analysis?.signal;
  const recommendation = signal?.recommendation ?? "WAIT";

  const signalClass = recommendation === "BUY" ? "signal-buy" : recommendation === "SELL" ? "signal-sell" : "signal-wait";
  const signalColor = recommendation === "BUY" ? "text-emerald-400" : recommendation === "SELL" ? "text-red-400" : "text-amber-400";

  return (
    <Layout>
      <div className="space-y-5 slide-up">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground tracking-tight">Trading Dashboard</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Real-time XAUUSD · SMC Confluences · Auto Signal
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loadingAnalysis} className="gap-1.5 text-xs border-border/60">
            <RefreshCw className={cn("w-3.5 h-3.5", loadingAnalysis && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {/* Error state */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Gagal mengambil data market. Pastikan API server berjalan.
          </div>
        )}

        {/* Price Header */}
        {analysis && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="col-span-2 md:col-span-2 bg-card border border-border/60 rounded-xl p-4 card-hover">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs text-muted-foreground mb-1 font-mono">XAUUSD (GC=F)</div>
                  <div className="text-3xl font-bold font-mono text-foreground tracking-tight">
                    ${analysis.currentPrice?.toFixed(2)}
                  </div>
                  <div className={cn("flex items-center gap-1 mt-1 text-sm font-medium",
                    (analysis.changePercent ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"
                  )}>
                    {(analysis.changePercent ?? 0) >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    {(analysis.changePercent ?? 0) >= 0 ? "+" : ""}{analysis.changePercent?.toFixed(2)}%
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant="outline" className={cn("text-xs font-semibold border",
                    analysis.bias === "BULLISH" ? "text-emerald-400 border-emerald-400/30 bg-emerald-400/5" :
                    analysis.bias === "BEARISH" ? "text-red-400 border-red-400/30 bg-red-400/5" :
                    "text-amber-400 border-amber-400/30 bg-amber-400/5"
                  )}>
                    {analysis.bias === "BULLISH" ? "▲" : analysis.bias === "BEARISH" ? "▼" : "◆"} {analysis.bias}
                  </Badge>
                  <div className="text-[10px] text-muted-foreground mt-2">
                    {analysis.updatedAt ? formatDistanceToNow(new Date(analysis.updatedAt), { addSuffix: true, locale: id }) : ""}
                  </div>
                </div>
              </div>
              <div className="mt-3 text-[11px] text-muted-foreground border-t border-border/40 pt-3 leading-relaxed">
                {analysis.trend}
              </div>
            </div>

            {/* Indicators Quick */}
            <div className="bg-card border border-border/60 rounded-xl p-4 card-hover">
              <div className="text-xs text-muted-foreground mb-3 font-semibold uppercase tracking-wider">Indikator</div>
              <div className="space-y-2">
                {[
                  { label: "RSI (14)", value: analysis.indicators?.rsi?.toFixed(1), color: (analysis.indicators?.rsi ?? 50) > 70 ? "text-red-400" : (analysis.indicators?.rsi ?? 50) < 30 ? "text-emerald-400" : "text-foreground" },
                  { label: "MA 27", value: analysis.indicators?.ma27?.toFixed(2), color: "text-blue-400" },
                  { label: "MA 54", value: analysis.indicators?.ma54?.toFixed(2), color: "text-purple-400" },
                  { label: "ATR (14)", value: analysis.indicators?.atr?.toFixed(2), color: "text-amber-400" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">{label}</span>
                    <span className={cn("text-[11px] font-mono font-semibold", color)}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card border border-border/60 rounded-xl p-4 card-hover">
              <div className="text-xs text-muted-foreground mb-3 font-semibold uppercase tracking-wider">Stochastic</div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">%K</span>
                  <span className="text-[11px] font-mono font-semibold text-foreground">{analysis.indicators?.stochK?.toFixed(1)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">%D</span>
                  <span className="text-[11px] font-mono font-semibold text-foreground">{analysis.indicators?.stochD?.toFixed(1)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Signal</span>
                  <Badge variant="outline" className={cn("text-[10px] h-5 px-1.5",
                    analysis.indicators?.stochSignal === "OVERBOUGHT" ? "text-red-400 border-red-400/30" :
                    analysis.indicators?.stochSignal === "OVERSOLD" ? "text-emerald-400 border-emerald-400/30" :
                    "text-muted-foreground border-border/40"
                  )}>
                    {analysis.indicators?.stochSignal}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">MA Signal</span>
                  <Badge variant="outline" className={cn("text-[10px] h-5 px-1.5",
                    analysis.indicators?.maSignal === "BULLISH" ? "text-emerald-400 border-emerald-400/30" :
                    analysis.indicators?.maSignal === "BEARISH" ? "text-red-400 border-red-400/30" :
                    "text-muted-foreground border-border/40"
                  )}>
                    {analysis.indicators?.maSignal}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Signal Box */}
        {loadingAnalysis ? (
          <div className="h-52 rounded-2xl border border-border/40 bg-card animate-pulse" />
        ) : signal ? (
          <div className={cn("rounded-2xl p-6 transition-all", signalClass)}>
            <div className="flex items-start justify-between mb-5">
              <div>
                <div className="text-xs text-muted-foreground mb-2 uppercase tracking-widest">Auto-Generated Signal</div>
                <div className={cn("text-5xl font-black tracking-tight", signalColor)}>
                  {recommendation === "BUY" ? "📈 BUY" : recommendation === "SELL" ? "📉 SELL" : "⏳ WAIT"}
                </div>
                {signal.area && (
                  <div className="mt-1 text-sm text-muted-foreground">
                    Area: <span className="text-foreground font-medium">{ZONE_LABEL[signal.area] ?? signal.area}</span>
                  </div>
                )}
              </div>
              {signal.confidence != null && (
                <div className="text-right">
                  <div className="text-3xl font-bold text-foreground">{signal.confidence}%</div>
                  <div className="text-xs text-muted-foreground">Confidence</div>
                  <div className="mt-1 w-24 h-1.5 bg-muted rounded-full overflow-hidden ml-auto">
                    <div className={cn("h-full rounded-full transition-all", signalColor.replace("text-", "bg-"))}
                      style={{ width: `${signal.confidence}%` }} />
                  </div>
                </div>
              )}
            </div>

            {recommendation !== "WAIT" && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {[
                  { icon: Target, label: "Entry Price", value: signal.entryPrice?.toFixed(2), color: "text-foreground" },
                  { icon: TrendingUp, label: "Take Profit", value: signal.takeProfit?.toFixed(2), color: "text-emerald-400" },
                  { icon: ShieldAlert, label: "Stop Loss", value: signal.stopLoss?.toFixed(2), color: "text-red-400" },
                  { icon: Percent, label: "R:R Ratio", value: signal.rrRatio ? `1:${signal.rrRatio.toFixed(1)}` : "—", color: "text-amber-400" },
                ].map(({ icon: Icon, label, value, color }) => (
                  <div key={label} className="bg-background/20 rounded-lg p-3 border border-white/5">
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wide">
                      <Icon className="w-3 h-3" />
                      {label}
                    </div>
                    <div className={cn("text-lg font-bold font-mono", color)}>{value}</div>
                  </div>
                ))}
              </div>
            )}

            {signal.reason && (
              <div className="text-sm text-muted-foreground bg-background/10 rounded-lg px-3 py-2 border border-white/5">
                {signal.reason}
              </div>
            )}

            {signal.confluenceDetails && signal.confluenceDetails.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {signal.confluenceDetails.map((d, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-background/20 border border-white/10 text-muted-foreground">
                    {d}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {/* Key Levels + Candlestick */}
        {analysis && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Support & Resistance */}
            <div className="bg-card border border-border/60 rounded-xl p-4 card-hover">
              <div className="text-xs text-muted-foreground mb-3 font-semibold uppercase tracking-wider">Key Levels</div>
              <div className="space-y-1.5">
                {analysis.keyLevels?.resistance?.slice(0, 2).map((r, i) => (
                  <div key={`r${i}`} className="flex items-center justify-between">
                    <span className="text-[11px] text-red-400/80 flex items-center gap-1"><span className="w-2 h-px bg-red-400/50 inline-block" /> Resistance {i + 1}</span>
                    <span className="text-[11px] font-mono text-red-400 font-semibold">{r.toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between py-1 border-y border-border/30 my-1">
                  <span className="text-[11px] text-amber-400/80">◆ Pivot</span>
                  <span className="text-[11px] font-mono text-amber-400 font-semibold">{analysis.keyLevels?.pivot?.toFixed(2)}</span>
                </div>
                {analysis.keyLevels?.support?.slice(0, 2).map((s, i) => (
                  <div key={`s${i}`} className="flex items-center justify-between">
                    <span className="text-[11px] text-emerald-400/80 flex items-center gap-1"><span className="w-2 h-px bg-emerald-400/50 inline-block" /> Support {i + 1}</span>
                    <span className="text-[11px] font-mono text-emerald-400 font-semibold">{s.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Fibonacci */}
            <div className="bg-card border border-border/60 rounded-xl p-4 card-hover">
              <div className="text-xs text-muted-foreground mb-3 font-semibold uppercase tracking-wider">Fibonacci Levels</div>
              <div className="space-y-1.5">
                {[
                  { label: "23.6%", val: analysis.fibLevels?.fib236 },
                  { label: "38.2%", val: analysis.fibLevels?.fib382 },
                  { label: "50.0%", val: analysis.fibLevels?.fib500 },
                  { label: "61.8%", val: analysis.fibLevels?.fib618 },
                  { label: "78.6%", val: analysis.fibLevels?.fib786 },
                ].map(({ label, val }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground font-mono">{label}</span>
                    <span className="text-[11px] font-mono text-foreground font-medium">{val?.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Candlestick + Summary */}
            <div className="bg-card border border-border/60 rounded-xl p-4 card-hover">
              <div className="text-xs text-muted-foreground mb-3 font-semibold uppercase tracking-wider">Candlestick</div>
              {analysis.candlestick && (
                <div className="mb-3">
                  <div className={cn("text-sm font-semibold",
                    analysis.candlestick.direction === "BULLISH" ? "text-emerald-400" :
                    analysis.candlestick.direction === "BEARISH" ? "text-red-400" : "text-muted-foreground"
                  )}>
                    {analysis.candlestick.name}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-border/40">
                      {analysis.candlestick.direction}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-border/40">
                      {analysis.candlestick.strength}
                    </Badge>
                  </div>
                </div>
              )}
              <div className="text-[10px] text-muted-foreground leading-relaxed border-t border-border/30 pt-3">
                {analysis.summary?.slice(0, 200)}...
              </div>
            </div>
          </div>
        )}

        {/* Active Signals */}
        {activeSignals.length > 0 && (
          <div>
            <div className="text-xs text-muted-foreground mb-2 font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 blink" />
              Signal Aktif ({activeSignals.length})
            </div>
            <div className="space-y-2">
              {activeSignals.map((s) => (
                <div key={s.id} className={cn("rounded-xl p-4 flex items-center justify-between gap-4", s.type === "BUY" ? "signal-buy" : "signal-sell")}>
                  <div className="flex items-center gap-3">
                    <div className={cn("text-xl font-black", s.type === "BUY" ? "text-emerald-400" : "text-red-400")}>
                      {s.type === "BUY" ? "▲" : "▼"} {s.type}
                    </div>
                    <div>
                      <div className="text-xs font-mono text-foreground font-semibold">
                        Entry: {s.entryPrice.toFixed(2)} | TP: {s.takeProfit.toFixed(2)} | SL: {s.stopLoss.toFixed(2)}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {ZONE_LABEL[s.area] ?? s.area} · R:R {s.rrRatio ? `1:${s.rrRatio.toFixed(1)}` : "—"}
                        {s.confidence ? ` · ${s.confidence}% confidence` : ""}
                      </div>
                    </div>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-muted-foreground hover:text-destructive h-7"
                        onClick={() => expireMutation.mutate({ id: s.id })}
                      >
                        Close
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Tandai signal sebagai expired</TooltipContent>
                  </Tooltip>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total Signal", value: stats.totalSignals, color: "text-foreground" },
              { label: "Win Rate", value: `${Math.round((stats.winRate ?? 0) * 100)}%`, color: "text-emerald-400" },
              { label: "TP Hit", value: stats.hitTP, color: "text-emerald-400" },
              { label: "SL Hit", value: stats.hitSL, color: "text-red-400" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-card border border-border/60 rounded-xl p-4 text-center card-hover">
                <div className={cn("text-2xl font-bold", color)}>{value}</div>
                <div className="text-[11px] text-muted-foreground mt-1">{label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
