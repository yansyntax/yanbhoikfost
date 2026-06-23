import { Layout } from "@/components/layout";
import { useGetSignalHistory, useGetSignalStats, getGetSignalStatsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Target, ShieldAlert, Clock, Percent } from "lucide-react";

export default function HistoryPage() {
  const { data: history, isLoading: loadingHistory } = useGetSignalHistory();
  const { data: stats, isLoading: loadingStats } = useGetSignalStats({
    query: { refetchInterval: 60000, queryKey: getGetSignalStatsQueryKey() }
  });

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">Performance History</h1>
          <p className="text-muted-foreground text-sm">Historical signal tracking and account analytics.</p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard title="Win Rate" value={stats ? `${stats.winRate}%` : null} icon={Percent} loading={loadingStats} highlight={stats && stats.winRate > 50} />
          <StatCard title="Total Signals" value={stats?.totalSignals} icon={TrendingUp} loading={loadingStats} />
          <StatCard title="Avg R:R" value={stats?.avgRR} icon={Target} loading={loadingStats} />
          <StatCard title="TP Hit" value={stats?.hitTP} icon={Target} loading={loadingStats} className="text-chart-1 border-chart-1/20 bg-chart-1/5" />
          <StatCard title="SL Hit" value={stats?.hitSL} icon={ShieldAlert} loading={loadingStats} className="text-destructive border-destructive/20 bg-destructive/5" />
        </div>

        {/* History Table */}
        <Card className="border-border">
          <div className="rounded-md border border-border/50">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow className="border-border/50">
                  <TableHead className="w-[100px]">Type</TableHead>
                  <TableHead>Timeframe</TableHead>
                  <TableHead className="text-right font-mono">Entry</TableHead>
                  <TableHead className="text-right font-mono">TP</TableHead>
                  <TableHead className="text-right font-mono">SL</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingHistory ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-24 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : history && history.length > 0 ? (
                  history.map((signal) => (
                    <TableRow key={signal.id} className="border-border/50 hover:bg-muted/30">
                      <TableCell>
                        <span className={`font-bold text-xs px-2 py-1 rounded ${signal.type === 'BUY' ? 'text-chart-1 bg-chart-1/10' : 'text-destructive bg-destructive/10'}`}>
                          {signal.type}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-background text-xs font-mono">{signal.timeframe}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{signal.entryPrice.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-chart-1">{signal.takeProfit.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-destructive">{signal.stopLoss.toFixed(2)}</TableCell>
                      <TableCell>
                        <StatusBadge status={signal.status} />
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground font-mono">
                        {new Date(signal.createdAt).toLocaleDateString()} {new Date(signal.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                      No signal history found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </Layout>
  );
}

function StatCard({ title, value, icon: Icon, loading, className = "", highlight = false }: any) {
  return (
    <Card className={`border-border ${className}`}>
      <CardContent className="p-4 flex flex-col items-center text-center">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
          <Icon className="h-4 w-4" />
          {title}
        </div>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <div className={`text-2xl font-bold font-mono ${highlight ? 'text-chart-1' : ''}`}>
            {value !== undefined && value !== null ? value : '-'}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  let styles = "bg-muted text-muted-foreground";
  
  if (status === "HIT_TP") styles = "bg-chart-1/20 text-chart-1 border-chart-1/30 border";
  else if (status === "HIT_SL") styles = "bg-destructive/20 text-destructive border-destructive/30 border";
  else if (status === "ACTIVE") styles = "bg-primary/20 text-primary border-primary/30 border animate-pulse";

  return (
    <span className={`text-xs font-bold px-2.5 py-1 rounded-sm tracking-wide ${styles}`}>
      {status.replace("_", " ")}
    </span>
  );
}
