import { Link, useLocation } from "wouter";
import { Activity, BarChart2, History, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Dashboard", icon: Zap },
  { href: "/analysis", label: "SMC Analysis", icon: BarChart2 },
  { href: "/history", label: "History", icon: History },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border/60 bg-card/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <span className="text-primary font-bold text-sm">G</span>
            </div>
            <div>
              <div className="font-bold text-sm tracking-wide text-foreground">GOLD Signal Pro</div>
              <div className="text-[10px] text-muted-foreground">XAUUSD · SMC Analysis</div>
            </div>
          </div>

          <nav className="flex items-center gap-1">
            {nav.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                location === href
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}>
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 blink" />
              LIVE
            </span>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-4">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>GOLD Signal Pro — Real XAUUSD Data via GC=F</span>
          <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> Auto-refresh tiap 3 menit</span>
        </div>
      </footer>
    </div>
  );
}
