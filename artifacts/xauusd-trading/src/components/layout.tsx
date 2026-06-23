import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Activity, History, LineChart, LayoutDashboard } from "lucide-react";
import { useGetMarketAnalysis, getGetMarketAnalysisQueryKey } from "@workspace/api-client-react";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function Sidebar() {
  const [location] = useLocation();

  const links = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/history", label: "History", icon: History },
    { href: "/analysis", label: "Analysis", icon: LineChart },
  ];

  return (
    <aside className="w-64 border-r border-border bg-sidebar flex flex-col hidden md:flex">
      <div className="h-16 flex items-center px-6 border-b border-border">
        <div className="flex items-center gap-2">
          <Activity className="h-6 w-6 text-primary" />
          <span className="font-bold text-lg tracking-tight">GOLD SIGNAL PRO</span>
        </div>
      </div>
      <nav className="flex-1 px-4 py-6 space-y-2">
        {links.map((link) => {
          const isActive = location === link.href;
          const Icon = link.icon;
          return (
            <Link key={link.href} href={link.href} className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${isActive ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"}`}>
              <Icon className="h-5 w-5" />
              <span>{link.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-border text-xs text-muted-foreground text-center font-mono">
        SYSTEM ONLINE • SECURE
      </div>
    </aside>
  );
}

function Topbar() {
  const [time, setTime] = useState(new Date());
  
  const { data: analysis } = useGetMarketAnalysis({
    query: { refetchInterval: 60000, queryKey: getGetMarketAnalysisQueryKey() }
  });

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatUTC = (date: Date) => {
    return date.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  };

  const dayOfWeek = time.getUTCDay();
  const hour = time.getUTCHours();
  // Forex market is generally open 24/5 (closed late Friday to late Sunday UTC)
  const isMarketOpen = !(dayOfWeek === 5 && hour >= 21) && dayOfWeek !== 6 && !(dayOfWeek === 0 && hour < 21);

  return (
    <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-4">
        <div className="md:hidden flex items-center gap-2 text-primary font-bold">
          <Activity className="h-5 w-5" />
          <span>GOLD PRO</span>
        </div>
        <div className="hidden md:flex items-center gap-2">
          <div className={`h-2.5 w-2.5 rounded-full ${isMarketOpen ? 'bg-chart-1 animate-pulse' : 'bg-destructive'}`} />
          <span className="text-sm font-medium text-muted-foreground tracking-widest">
            {isMarketOpen ? 'MARKET OPEN' : 'MARKET CLOSED'}
          </span>
        </div>
      </div>
      
      <div className="flex items-center gap-6">
        {analysis && (
          <div className="hidden lg:flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">XAUUSD:</span>
            <span className="font-mono font-bold">{analysis.currentPrice.toFixed(2)}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded-sm font-bold ${
              analysis.bias === 'BULLISH' ? 'bg-chart-1/10 text-chart-1' : 
              analysis.bias === 'BEARISH' ? 'bg-destructive/10 text-destructive' : 
              'bg-muted text-muted-foreground'
            }`}>
              {analysis.bias}
            </span>
          </div>
        )}
        <div className="font-mono text-sm text-muted-foreground border border-border px-3 py-1 rounded bg-background">
          {formatUTC(time)}
        </div>
      </div>
    </header>
  );
}
