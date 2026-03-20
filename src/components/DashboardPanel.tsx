import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Flame, ThermometerSun, Ban, Ghost, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

type ProspectRow = {
  id: string;
  company: string;
  contact_name: string;
  status: string;
  note: string;
  updated_at: string;
};

type StatusCounts = {
  hot: number;
  warm: number;
  no_for_now: number;
  no_response: number;
  auto_reply: number;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  hot: { label: "Hot", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500", icon: <Flame className="h-5 w-5" /> },
  warm: { label: "Warm", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500", icon: <ThermometerSun className="h-5 w-5" /> },
  no_for_now: { label: "No por ahora", color: "text-red-600 dark:text-red-400", bg: "bg-red-500", icon: <Ban className="h-5 w-5" /> },
  no_response: { label: "Sin respuesta", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500", icon: <Ghost className="h-5 w-5" /> },
  auto_reply: { label: "Auto-reply", color: "text-gray-500 dark:text-gray-400", bg: "bg-gray-400", icon: <Ghost className="h-5 w-5" /> },
};

export default function DashboardPanel({ onBack }: { onBack: () => void }) {
  const [counts, setCounts] = useState<StatusCounts>({ hot: 0, warm: 0, no_for_now: 0, no_response: 0, auto_reply: 0 });
  const [hotProspects, setHotProspects] = useState<ProspectRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("prospects").select("*");
      if (error) throw error;
      const rows = (data || []) as ProspectRow[];

      const c: StatusCounts = { hot: 0, warm: 0, no_for_now: 0, no_response: 0, auto_reply: 0 };
      for (const r of rows) {
        if (r.status in c) c[r.status as keyof StatusCounts]++;
      }
      setCounts(c);

      const hot = rows
        .filter(r => r.status === "hot")
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, 10);
      setHotProspects(hot);
    } catch (err) {
      console.error("Error loading dashboard:", err);
    } finally {
      setLoading(false);
    }
  };

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const barData = Object.entries(STATUS_CONFIG).map(([key, cfg]) => ({
    key,
    label: cfg.label,
    count: counts[key as keyof StatusCounts],
    pct: total > 0 ? (counts[key as keyof StatusCounts] / total) * 100 : 0,
    bg: cfg.bg,
    color: cfg.color,
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-sm text-muted-foreground">{total} prospectos en total</p>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {barData.filter(d => d.key !== "auto_reply").map(d => (
          <div key={d.key} className="rounded-xl border border-border bg-card p-5 space-y-2 transition-shadow hover:shadow-md">
            <div className={`flex items-center gap-2 ${d.color}`}>
              {STATUS_CONFIG[d.key].icon}
              <span className="text-xs font-semibold uppercase tracking-wider">{d.label}</span>
            </div>
            <p className="font-display text-3xl font-bold tabular-nums">{d.count}</p>
            <p className="text-xs text-muted-foreground">{d.pct.toFixed(1)}% del total</p>
          </div>
        ))}
      </div>

      {/* Distribution Bar */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Distribución</h3>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">No hay prospectos aún. Agrega algunos en el CRM.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex h-6 overflow-hidden rounded-full bg-muted">
              {barData.map(d => d.pct > 0 && (
                <div
                  key={d.key}
                  className={`${d.bg} transition-all duration-500`}
                  style={{ width: `${d.pct}%` }}
                  title={`${d.label}: ${d.count}`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-4">
              {barData.map(d => (
                <div key={d.key} className="flex items-center gap-1.5 text-xs">
                  <span className={`h-2.5 w-2.5 rounded-full ${d.bg}`} />
                  <span className="text-muted-foreground">{d.label}</span>
                  <span className="font-medium tabular-nums">{d.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Hot Prospects List */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          🔥 Prospectos Hot — Últimas notas
        </h3>
        {hotProspects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay prospectos Hot aún.</p>
        ) : (
          <div className="space-y-2">
            {hotProspects.map(p => (
              <div key={p.id} className="flex items-start gap-3 rounded-lg border border-border/50 bg-background/50 p-3 transition-colors hover:bg-muted/30">
                <div className="mt-0.5 h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium text-sm truncate">{p.contact_name}</span>
                    <span className="text-xs text-muted-foreground truncate">— {p.company}</span>
                  </div>
                  {p.note && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{p.note}</p>}
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                  {new Date(p.updated_at).toLocaleDateString("es-CL", { day: "2-digit", month: "short" })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
