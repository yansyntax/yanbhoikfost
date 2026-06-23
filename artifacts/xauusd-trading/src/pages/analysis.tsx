import { Layout } from "@/components/layout";
import { useGetMarketAnalysis, getGetMarketAnalysisQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, TrendingUp, TrendingDown, Minus, Target } from "lucide-react";

export default function AnalysisPage() {
  const { data: analysis, isLoading } = useGetMarketAnalysis({
    query: { refetchInterval: 60000, queryKey: getGetMarketAnalysisQueryKey() }
  });

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">Market Analysis</h1>
          <p className="text-muted-foreground text-sm">Deep technical analysis and key institutional levels for XAUUSD.</p>
        </div>

        {isLoading || !analysis ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Skeleton className="h-[400px] w-full" />
            <Skeleton className="h-[400px] w-full" />
            <Skeleton className="h-[400px] w-full" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Bias & Trend */}
            <Card className="md:col-span-2 border-border">
              <CardHeader className="border-b border-border bg-muted/20">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" /> 
                  Trend Direction & Bias
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 flex flex-col gap-6">
                <div className="flex items-center gap-4">
                  <div className={`p-4 rounded-full ${
                    analysis.bias === 'BULLISH' ? 'bg-chart-1/10 text-chart-1' : 
                    analysis.bias === 'BEARISH' ? 'bg-destructive/10 text-destructive' : 
                    'bg-muted text-muted-foreground'
                  }`}>
                    {analysis.bias === 'BULLISH' ? <TrendingUp className="h-8 w-8" /> : 
                     analysis.bias === 'BEARISH' ? <TrendingDown className="h-8 w-8" /> : 
                     <Minus className="h-8 w-8" />}
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold tracking-tight">{analysis.bias} BIAS</h3>
                    <p className="text-muted-foreground font-mono text-sm mt-1">{analysis.trend}</p>
                  </div>
                </div>

                <div className="bg-background rounded-lg border border-border p-4">
                  <h4 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Analysis Summary</h4>
                  <p className="text-sm leading-relaxed">{analysis.summary}</p>
                </div>

                <div className="grid grid-cols-3 gap-4 mt-auto">
                  <IndicatorCard name="RSI (14)" value={analysis.indicators.rsi?.toFixed(1)} />
                  <IndicatorCard name="EMA 20" value={analysis.indicators.ema20?.toFixed(2)} isPrice={true} />
                  <IndicatorCard name="EMA 50" value={analysis.indicators.ema50?.toFixed(2)} isPrice={true} />
                </div>
              </CardContent>
            </Card>

            {/* Key Levels & Fibs */}
            <Card className="border-border">
              <CardHeader className="border-b border-border bg-muted/20">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Target className="h-5 w-5 text-primary" /> 
                  Key Levels
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                
                {/* Support / Resistance */}
                <div>
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">S/R Zones</h4>
                  <div className="space-y-2">
                    {analysis.keyLevels.resistance.map((res, i) => (
                      <div key={`r-${i}`} className="flex justify-between items-center bg-destructive/5 border border-destructive/20 px-3 py-2 rounded">
                        <span className="text-xs text-destructive font-bold">R{analysis.keyLevels.resistance.length - i}</span>
                        <span className="font-mono text-sm">{res.toFixed(2)}</span>
                      </div>
                    ))}
                    
                    <div className="flex justify-between items-center bg-primary/10 border border-primary/30 px-3 py-2 rounded my-4">
                      <span className="text-xs text-primary font-bold">PIVOT</span>
                      <span className="font-mono text-sm font-bold text-primary">{analysis.keyLevels.pivot.toFixed(2)}</span>
                    </div>

                    {analysis.keyLevels.support.map((sup, i) => (
                      <div key={`s-${i}`} className="flex justify-between items-center bg-chart-1/5 border border-chart-1/20 px-3 py-2 rounded">
                        <span className="text-xs text-chart-1 font-bold">S{i + 1}</span>
                        <span className="font-mono text-sm">{sup.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Fibonacci */}
                <div>
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Fibonacci Retracement</h4>
                  <div className="space-y-1.5 border-l-2 border-border pl-3 ml-2 relative">
                    <FibLevel label="78.6%" value={analysis.fibLevels.fib786} />
                    <FibLevel label="61.8%" value={analysis.fibLevels.fib618} highlight />
                    <FibLevel label="50.0%" value={analysis.fibLevels.fib500} />
                    <FibLevel label="38.2%" value={analysis.fibLevels.fib382} highlight />
                    <FibLevel label="23.6%" value={analysis.fibLevels.fib236} />
                  </div>
                </div>

              </CardContent>
            </Card>

          </div>
        )}
      </div>
    </Layout>
  );
}

function IndicatorCard({ name, value, isPrice = false }: { name: string, value?: string, isPrice?: boolean }) {
  return (
    <div className="bg-background rounded border border-border p-3 text-center">
      <div className="text-xs text-muted-foreground mb-1">{name}</div>
      <div className={`font-mono font-bold ${value ? 'text-foreground' : 'text-muted-foreground'}`}>
        {value ? value : '-'}
      </div>
    </div>
  );
}

function FibLevel({ label, value, highlight = false }: { label: string, value?: number, highlight?: boolean }) {
  if (!value) return null;
  return (
    <div className={`flex justify-between items-center text-sm ${highlight ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
      <span className="relative">
        <span className={`absolute -left-[17px] top-1/2 -translate-y-1/2 w-3 h-[1px] ${highlight ? 'bg-primary' : 'bg-border'}`} />
        {label}
      </span>
      <span className="font-mono">{value.toFixed(2)}</span>
    </div>
  );
}
