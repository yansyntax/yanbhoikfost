import { useGetSignalHistory, useGetSignalStats } from "@workspace/api-client-react";
import Layout from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { History, TrendingUp, TrendingDown, Award, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";

const STATUS_CONFIG = {
  ACTIVE: { label: "Aktif", color: "text-amber-400 border-amber-400/30 bg-amber-400/5" },
  HIT_TP: { label: "TP Hit ✓", color: "text-emerald-400 border-emerald-400/30 bg-emerald-400/5" },
  HIT_SL: { label: "SL Hit ✗", color: "text-red-400 border-red-400/30 bg-red-400/5" },
  EXPIRED: { label: "Expired", color: "text-muted-foreground border-border/40" },
};

export default function HistoryPage() {
  const { data: history = [], isLoading } = useGetSignalHistory();
  const { data: stats } = useGetSignalStats();

  const winRate = stats ? Math.round((stats.winRate ?? 0) * 100) : 0;

  return (
    <Layout>
      <div className="space-y-5 slide-up">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Signal History</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Riwayat 50 signal terakhir</p>
        </div>

        {/* Stats Bar */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total Signal", value: stats.totalSignals, icon: History, color: "text-foreground" },
              { label: "Win Rate", value: `${winRate}%`, icon: Award, color: winRate >= 60 ? "text-emerald-400" : winRate >= 40 ? "text-amber-400" : "text-red-400" },
              { label: "TP Hit", value: stats.hitTP, icon: TrendingUp, color: "text-emerald-400" },
              { label: "SL Hit", value: stats.hitSL, icon: TrendingDown, color: "text-red-400" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-card border border-border/60 rounded-xl p-4 card-hover">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] text-muted-foreground">{label}</span>
                  <Icon className={cn("w-4 h-4", color)} />
                </div>
                <div className={cn("text-2xl font-bold", color)}>{value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Win Rate Bar */}
        {stats && (stats.hitTP + stats.hitSL) > 0 && (
          <div className="bg-card border border-border/60 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Win / Loss Ratio</span>
              <span className="text-xs font-semibold text-foreground">{stats.hitTP}W — {stats.hitSL}L</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all"
                style={{ width: `${winRate}%` }}
              />
            </div>
            <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
              <span>0%</span>
              <span className={cn("font-semibold", winRate >= 60 ? "text-emerald-400" : "text-amber-400")}>{winRate}%</span>
              <span>100%</span>
            </div>
          </div>
        )}

        {/* Signal List */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-card animate-pulse border border-border/40" />
            ))}
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Belum ada riwayat signal.</p>
            <p className="text-xs mt-1">Signal akan muncul setelah ada konfluensi SMC yang kuat.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((s) => {
              const statusConf = STATUS_CONFIG[s.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.EXPIRED;
              const isBuy = s.type === "BUY";

              return (
                <div key={s.id} className="bg-card border border-border/60 rounded-xl p-4 card-hover flex items-center gap-4">
                  {/* Type */}
                  <div className={cn("w-14 text-center rounded-lg py-2 shrink-0",
                    isBuy ? "bg-emerald-400/10 border border-emerald-400/20" : "bg-red-400/10 border border-red-400/20"
                  )}>
                    <div className={cn("text-sm font-black", isBuy ? "text-emerald-400" : "text-red-400")}>
                      {isBuy ? "▲" : "▼"}
                    </div>
                    <div className={cn("text-[10px] font-bold", isBuy ? "text-emerald-400" : "text-red-400")}>
                      {s.type}
                    </div>
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className={cn("text-[10px] h-5 px-1.5", statusConf.color)}>
                        {statusConf.label}
                      </Badge>
                      {s.confidence != null && (
                        <span className="text-[10px] text-muted-foreground">{s.confidence}% confidence</span>
                      )}
                      {s.rrRatio != null && (
                        <span className="text-[10px] text-muted-foreground">1:{s.rrRatio.toFixed(1)} R:R</span>
                      )}
                    </div>
                    <div className="text-[11px] font-mono text-muted-foreground">
                      Entry: <span className="text-foreground">{s.entryPrice.toFixed(2)}</span> |
                      TP: <span className="text-emerald-400">{s.takeProfit.toFixed(2)}</span> |
                      SL: <span className="text-red-400">{s.stopLoss.toFixed(2)}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{s.reason}</div>
                  </div>

                  {/* Time */}
                  <div className="text-right shrink-0">
                    <div className="text-[10px] text-muted-foreground">
                      {format(new Date(s.createdAt), "dd MMM", { locale: id })}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {format(new Date(s.createdAt), "HH:mm")}
                    </div>
                    <div className="text-[10px] text-muted-foreground/50 mt-0.5">{s.timeframe}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
