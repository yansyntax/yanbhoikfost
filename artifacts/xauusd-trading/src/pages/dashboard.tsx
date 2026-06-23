import { Layout } from "@/components/layout";
import { useGetActiveSignals, useGetMarketAnalysis, useExpireSignal, getGetActiveSignalsQueryKey } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight, ArrowDownRight, Clock, Target, ShieldAlert, Crosshair, AlertTriangle, Activity } from "lucide-react";

export default function Dashboard() {
  const { data: signals, isLoading: loadingSignals } = useGetActiveSignals({
    query: { refetchInterval: 30000, queryKey: getGetActiveSignalsQueryKey() }
  });
  
  const { data: analysis } = useGetMarketAnalysis();

  const expireMutation = useExpireSignal();

  const handleExpire = (id: number) => {
    expireMutation.mutate({ params: { id }, data: {} });
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Chart Section */}
          <div className="lg:col-span-3 rounded-xl border border-border overflow-hidden bg-card h-[500px]">
            <iframe
              src="https://s.tradingview.com/widgetembed/?frameElementId=tradingview_chart&symbol=XAUUSD&interval=1&hidesidetoolbar=0&symboledit=1&saveimage=1&toolbarbg=1A1A1A&studies=RSI%402%2BEMA%40tv-basicstudies%2BMACD%402&theme=dark&style=1&timezone=Etc%2FUTC&studies_overrides={}&overrides={}&enabled_features=[]&disabled_features=[]&locale=en&utm_source=&utm_medium=widget&utm_campaign=chart"
              className="w-full h-full border-0"
              allowFullScreen
            />
          </div>

          {/* Market Summary */}
          <Card className="flex flex-col">
            <CardHeader className="pb-3 border-b border-border">
              <CardTitle className="text-lg">Market Status</CardTitle>
              <CardDescription>XAUUSD Live Analysis</CardDescription>
            </CardHeader>
            <CardContent className="pt-4 flex-1 flex flex-col gap-4">
              {analysis ? (
                <>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Current Price</div>
                    <div className="text-3xl font-mono font-bold text-foreground">
                      {analysis.currentPrice.toFixed(2)}
                    </div>
                  </div>
                  
                  <div>
                    <div className="text-sm text-muted-foreground mb-2">Trend Bias</div>
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-bold tracking-wide ${
                      analysis.bias === 'BULLISH' ? 'bg-chart-1/10 text-chart-1' : 
                      analysis.bias === 'BEARISH' ? 'bg-destructive/10 text-destructive' : 
                      'bg-muted text-muted-foreground'
                    }`}>
                      {analysis.bias === 'BULLISH' ? <ArrowUpRight className="h-4 w-4" /> : 
                       analysis.bias === 'BEARISH' ? <ArrowDownRight className="h-4 w-4" /> : 
                       <Activity className="h-4 w-4" />}
                      {analysis.bias}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Summary</div>
                    <p className="text-sm text-foreground/80 leading-relaxed">
                      {analysis.summary}
                    </p>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-8 w-2/3" />
                  <Skeleton className="h-20 w-full" />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Active Signals */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Active Signals
            </h2>
            <Badge variant="outline" className="font-mono bg-background">
              {signals ? signals.length : 0} ACTIVE
            </Badge>
          </div>

          {loadingSignals ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 w-full rounded-xl" />)}
            </div>
          ) : signals && signals.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {signals.map(signal => (
                <Card key={signal.id} className="pulse-active border-primary/20 relative overflow-hidden">
                  <div className={`absolute top-0 left-0 w-1 h-full ${signal.type === 'BUY' ? 'bg-chart-1' : 'bg-destructive'}`} />
                  <CardHeader className="pb-2 pt-4 px-5 flex flex-row items-start justify-between space-y-0">
                    <div>
                      <Badge className={`font-bold tracking-wider mb-2 ${
                        signal.type === 'BUY' ? 'bg-chart-1 text-white hover:bg-chart-1/90' : 'bg-destructive text-white hover:bg-destructive/90'
                      }`}>
                        {signal.type} {signal.timeframe}
                      </Badge>
                      <div className="text-2xl font-mono font-bold tracking-tight">
                        {signal.entryPrice.toFixed(2)}
                      </div>
                      <div className="text-xs text-muted-foreground font-medium mt-1">ENTRY PRICE</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground font-mono mb-1">
                        <Clock className="inline h-3 w-3 mr-1" />
                        {new Date(signal.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </div>
                      <Badge variant="outline" className="font-mono border-primary/50 text-primary">
                        {signal.fibLevel}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="px-5 pb-4">
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="bg-background rounded border border-border p-2">
                        <div className="text-[10px] text-muted-foreground font-bold flex items-center gap-1 mb-1">
                          <Target className="h-3 w-3 text-chart-1" /> TAKE PROFIT
                        </div>
                        <div className="font-mono text-sm text-chart-1">{signal.takeProfit.toFixed(2)}</div>
                      </div>
                      <div className="bg-background rounded border border-border p-2">
                        <div className="text-[10px] text-muted-foreground font-bold flex items-center gap-1 mb-1">
                          <ShieldAlert className="h-3 w-3 text-destructive" /> STOP LOSS
                        </div>
                        <div className="font-mono text-sm text-destructive">{signal.stopLoss.toFixed(2)}</div>
                      </div>
                    </div>
                    
                    <div className="text-sm text-foreground/80 mb-4 line-clamp-2" title={signal.reason}>
                      {signal.reason}
                    </div>

                    <div className="flex items-center justify-between mt-auto">
                      <div className="flex items-center gap-3">
                        {signal.rrRatio && (
                          <div className="text-xs font-mono">
                            <span className="text-muted-foreground">R:R</span> <span className="font-bold">{signal.rrRatio}</span>
                          </div>
                        )}
                        {signal.confidence && (
                          <div className="text-xs font-mono flex items-center gap-1">
                            <span className="text-muted-foreground">CONF</span> 
                            <span className="text-primary font-bold">{signal.confidence}%</span>
                          </div>
                        )}
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-7 text-xs border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors"
                        onClick={() => handleExpire(signal.id)}
                        disabled={expireMutation.isPending}
                      >
                        Expire
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-border rounded-xl bg-card/50">
              <Crosshair className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground">No Active Signals</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md mt-1">
                Waiting for optimal entry conditions. Market analysis is continuously running.
              </p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
