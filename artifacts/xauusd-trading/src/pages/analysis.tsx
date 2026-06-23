import { useGetMarketAnalysis, getGetMarketAnalysisQueryKey } from "@workspace/api-client-react";
import Layout from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Layers, AlertTriangle } from "lucide-react";

const ZONE_COLORS: Record<string, string> = {
  FVG: "zone-fvg",
  ORDER_BLOCK: "zone-ob",
  LIQUIDITY: "zone-liquidity",
  CHOCH: "zone-choch",
  BOS: "zone-bos",
  DEMAND: "zone-demand",
  SUPPLY: "zone-supply",
  SUPPORT: "zone-support",
  RESISTANCE: "zone-resistance",
  RBS: "zone-rbs",
  SBR: "zone-sbr",
};

const ZONE_ICONS: Record<string, string> = {
  FVG: "⬛",
  ORDER_BLOCK: "🟨",
  LIQUIDITY: "💧",
  CHOCH: "🔄",
  BOS: "💥",
  DEMAND: "📈",
  SUPPLY: "📉",
  SUPPORT: "🟢",
  RESISTANCE: "🔴",
  RBS: "🔁",
  SBR: "⚠️",
  RETEST: "🎯",
  PULLBACK: "↩️",
  HNSS: "👁️",
};

export default function AnalysisPage() {
  const { data: analysis, isLoading, error } = useGetMarketAnalysis({
    query: { queryKey: getGetMarketAnalysisQueryKey(), refetchInterval: 3 * 60 * 1000 },
  });

  const zones = analysis?.smcZones ?? [];
  const bullishZones = zones.filter((z) => z.direction === "BULLISH");
  const bearishZones = zones.filter((z) => z.direction === "BEARISH");
  const neutralZones = zones.filter((z) => z.direction === "NEUTRAL");

  return (
    <Layout>
      <div className="space-y-5 slide-up">
        <div>
          <h1 className="text-lg font-bold tracking-tight">SMC Analysis</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Smart Money Concepts — FVG, Order Block, CHoCH, BOS, Liquidity & lebih
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
            <AlertTriangle className="w-4 h-4" />
            Gagal memuat data analisis SMC.
          </div>
        )}

        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-card animate-pulse border border-border/40" />
            ))}
          </div>
        )}

        {/* Summary Bar */}
        {analysis && (
          <div className="bg-card border border-border/60 rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Layers className="w-4 h-4 text-primary" />
                <span>{zones.length} SMC Zones Terdeteksi</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Badge className="bg-emerald-400/10 text-emerald-400 border-emerald-400/20 text-[10px]">
                  {bullishZones.length} Bullish
                </Badge>
                <Badge className="bg-red-400/10 text-red-400 border-red-400/20 text-[10px]">
                  {bearishZones.length} Bearish
                </Badge>
                {neutralZones.length > 0 && (
                  <Badge className="bg-muted text-muted-foreground border-border/40 text-[10px]">
                    {neutralZones.length} Neutral
                  </Badge>
                )}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{analysis.summary}</p>
          </div>
        )}

        {/* Zones Grid */}
        {zones.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {zones.map((zone, i) => (
              <div key={i} className={cn(
                "rounded-xl p-4 transition-all card-hover",
                ZONE_COLORS[zone.type] ?? "zone-default"
              )}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{ZONE_ICONS[zone.type] ?? "◆"}</span>
                    <div>
                      <div className="text-sm font-semibold text-foreground">{zone.type}</div>
                      <div className={cn("text-[10px] font-medium",
                        zone.direction === "BULLISH" ? "text-emerald-400" :
                        zone.direction === "BEARISH" ? "text-red-400" : "text-muted-foreground"
                      )}>
                        {zone.direction}
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className={cn("text-[10px] h-5 px-1.5",
                    zone.strength === "STRONG" ? "text-amber-400 border-amber-400/30" :
                    zone.strength === "MEDIUM" ? "text-blue-400 border-blue-400/30" :
                    "text-muted-foreground border-border/40"
                  )}>
                    {zone.strength}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div className="bg-background/20 rounded-md p-2 border border-white/5">
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wide mb-0.5">High</div>
                    <div className="text-xs font-mono font-semibold text-red-400">{zone.high.toFixed(2)}</div>
                  </div>
                  <div className="bg-background/20 rounded-md p-2 border border-white/5">
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wide mb-0.5">Low</div>
                    <div className="text-xs font-mono font-semibold text-emerald-400">{zone.low.toFixed(2)}</div>
                  </div>
                </div>

                {zone.description && (
                  <p className="text-[10px] text-muted-foreground leading-relaxed">{zone.description}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {zones.length === 0 && !isLoading && !error && (
          <div className="text-center py-16 text-muted-foreground">
            <Layers className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Belum ada SMC zone terdeteksi.</p>
            <p className="text-xs mt-1">Analisis membutuhkan data candle yang cukup.</p>
          </div>
        )}

        {/* Legend */}
        <div className="bg-card border border-border/40 rounded-xl p-4">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Legenda SMC</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {[
              { type: "FVG", desc: "Fair Value Gap — imbalance price" },
              { type: "ORDER_BLOCK", desc: "Zona institusi sebelum impulse" },
              { type: "CHOCH", desc: "Change of Character — perubahan struktur" },
              { type: "BOS", desc: "Break of Structure — konfirmasi tren" },
              { type: "DEMAND", desc: "Area beli institusi kuat" },
              { type: "SUPPLY", desc: "Area jual institusi kuat" },
              { type: "LIQUIDITY", desc: "Target stop hunt institusi" },
              { type: "SUPPORT", desc: "Level support horizontal" },
              { type: "RESISTANCE", desc: "Level resistance horizontal" },
              { type: "RBS", desc: "Resistance Becomes Support" },
            ].map(({ type, desc }) => (
              <div key={type} className={cn("rounded-lg p-2.5 text-[10px]", ZONE_COLORS[type] ?? "zone-default")}>
                <div className="font-semibold text-foreground mb-0.5">{type}</div>
                <div className="text-muted-foreground">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
