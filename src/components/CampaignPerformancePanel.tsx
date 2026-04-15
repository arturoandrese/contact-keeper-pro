import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchSheetTabs, fetchSheetReport } from "@/lib/googleSheets";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { toast } from "sonner";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";

interface CampaignData {
  name: string;
  date: string;
  total: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  notSent: number;
  openRate: number;
  bounceRate: number;
  clickRate: number;
  deliveryRate: number;
}

const chartConfig: ChartConfig = {
  openRate: { label: "Apertura %", color: "hsl(210 80% 55%)" },
  bounceRate: { label: "Rebote %", color: "hsl(0 70% 55%)" },
  clickRate: { label: "Click %", color: "hsl(270 60% 55%)" },
  deliveryRate: { label: "Entrega %", color: "hsl(150 60% 45%)" },
};

function classifyStatus(status: string) {
  const s = status.toUpperCase();
  if (s.includes("BOUNC")) return "bounced";
  if (s.includes("CLICK")) return "clicked";
  if (s.includes("OPEN")) return "opened";
  if (s.includes("DELIVER")) return "delivered";
  if (s.includes("NOT_SENT") || s === "UNKNOWN") return "notSent";
  if (s.includes("MERGE_COMPLETE") || s.includes("SENT")) return "sent";
  return "sent";
}

function TrendBadge({ current, previous, label, invert = false }: { current: number; previous: number; label: string; invert?: boolean }) {
  const diff = current - previous;
  const improved = invert ? diff < 0 : diff > 0;
  const worse = invert ? diff > 0 : diff < 0;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-1">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="font-display text-2xl font-bold tabular-nums">{current.toFixed(1)}%</p>
      <div className="flex items-center gap-1 text-xs">
        {Math.abs(diff) < 0.5 ? (
          <><Minus className="h-3 w-3 text-muted-foreground" /><span className="text-muted-foreground">Sin cambio</span></>
        ) : improved ? (
          <><TrendingUp className="h-3 w-3 text-emerald-500" /><span className="text-emerald-600 dark:text-emerald-400">+{Math.abs(diff).toFixed(1)}pp vs inicio</span></>
        ) : (
          <><TrendingDown className="h-3 w-3 text-destructive" /><span className="text-destructive">{diff > 0 ? "+" : ""}{diff.toFixed(1)}pp vs inicio</span></>
        )}
      </div>
    </div>
  );
}

export default function CampaignPerformancePanel({ onBack }: { onBack: () => void }) {
  const [campaigns, setCampaigns] = useState<CampaignData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAllCampaigns();
  }, []);

  const loadAllCampaigns = async () => {
    setLoading(true);
    try {
      const { data: bases } = await supabase
        .from("bases")
        .select("id, name, sheet_id, created_at")
        .not("sheet_id", "is", null)
        .order("created_at", { ascending: true });

      if (!bases || bases.length === 0) {
        setCampaigns([]);
        setLoading(false);
        return;
      }

      const allCampaigns: CampaignData[] = [];

      for (const base of bases) {
        const sheetId = (base as any).sheet_id;
        if (!sheetId) continue;

        try {
          const tabs = await fetchSheetTabs(sheetId);
          for (const tab of tabs) {
            // Skip tabs that are clearly not campaigns
            if (tab.rowCount < 5) continue;

            try {
              const report = await fetchSheetReport(sheetId, tab.title);
              if (report.total < 5) continue;

              const counts = { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, notSent: 0 };
              for (const [status, count] of Object.entries(report.stats)) {
                const cat = classifyStatus(status);
                counts[cat as keyof typeof counts] += count;
              }

              const totalSent = counts.sent + counts.delivered + counts.opened + counts.clicked + counts.bounced;
              if (totalSent < 3) continue;

              allCampaigns.push({
                name: `${base.name.substring(0, 15)}/${tab.title.substring(0, 10)}`,
                date: base.created_at || "",
                total: report.total,
                ...counts,
                openRate: totalSent > 0 ? (counts.opened / totalSent) * 100 : 0,
                bounceRate: totalSent > 0 ? (counts.bounced / totalSent) * 100 : 0,
                clickRate: totalSent > 0 ? (counts.clicked / totalSent) * 100 : 0,
                deliveryRate: totalSent > 0 ? (counts.delivered / totalSent) * 100 : 0,
              });
            } catch {
              // Skip tabs that fail
            }
          }
        } catch {
          // Skip bases that fail
        }
      }

      setCampaigns(allCampaigns);
    } catch (err) {
      console.error(err);
      toast.error("Error cargando campañas");
    }
    setLoading(false);
  };

  const { firstHalf, secondHalf } = useMemo(() => {
    if (campaigns.length < 2) return { firstHalf: campaigns, secondHalf: campaigns };
    const mid = Math.ceil(campaigns.length / 2);
    return {
      firstHalf: campaigns.slice(0, mid),
      secondHalf: campaigns.slice(mid),
    };
  }, [campaigns]);

  const avg = (arr: CampaignData[], key: keyof CampaignData) => {
    if (arr.length === 0) return 0;
    return arr.reduce((sum, c) => sum + (c[key] as number), 0) / arr.length;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Cargando todas las campañas… esto puede tardar un momento</p>
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
          <h2 className="font-display text-2xl font-bold tracking-tight">📈 Índice de Rendimiento</h2>
          <p className="text-sm text-muted-foreground">{campaigns.length} campañas analizadas — ¿está mejorando tu filtrado?</p>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">No hay campañas con datos suficientes para analizar.</p>
          <p className="text-xs text-muted-foreground mt-1">Necesitas bases con Google Sheet vinculado y al menos 5 envíos.</p>
        </div>
      ) : (
        <>
          {/* Trend cards: recent vs early */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <TrendBadge
              label="Tasa Apertura"
              current={avg(secondHalf, "openRate")}
              previous={avg(firstHalf, "openRate")}
            />
            <TrendBadge
              label="Tasa Rebote"
              current={avg(secondHalf, "bounceRate")}
              previous={avg(firstHalf, "bounceRate")}
              invert
            />
            <TrendBadge
              label="Tasa Click"
              current={avg(secondHalf, "clickRate")}
              previous={avg(firstHalf, "clickRate")}
            />
            <TrendBadge
              label="Tasa Entrega"
              current={avg(secondHalf, "deliveryRate")}
              previous={avg(firstHalf, "deliveryRate")}
            />
          </div>

          {/* Line chart */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Evolución por campaña</h3>
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <LineChart data={campaigns} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} unit="%" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="openRate" stroke="var(--color-openRate)" strokeWidth={2} dot={{ r: 3 }} name="Apertura %" />
                <Line type="monotone" dataKey="bounceRate" stroke="var(--color-bounceRate)" strokeWidth={2} dot={{ r: 3 }} name="Rebote %" />
                <Line type="monotone" dataKey="clickRate" stroke="var(--color-clickRate)" strokeWidth={2} dot={{ r: 3 }} name="Click %" />
                <Line type="monotone" dataKey="deliveryRate" stroke="var(--color-deliveryRate)" strokeWidth={2} dot={{ r: 3 }} name="Entrega %" />
              </LineChart>
            </ChartContainer>
          </div>

          {/* Campaign table */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Detalle por campaña</h3>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/60">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Campaña</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Total</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Enviados</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Entregados</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Abiertos</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Clicks</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Rebotes</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">% Apertura</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">% Rebote</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-3 py-2 text-xs font-medium max-w-[200px] truncate">{c.name}</td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums">{c.total}</td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums">{c.sent}</td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums text-emerald-600 dark:text-emerald-400">{c.delivered}</td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums text-blue-600 dark:text-blue-400">{c.opened}</td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums text-violet-600 dark:text-violet-400">{c.clicked}</td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums text-destructive">{c.bounced}</td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums font-medium">{c.openRate.toFixed(1)}%</td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums font-medium">{c.bounceRate.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Resumen</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Primeras campañas (1ª mitad)</p>
                <p className="font-medium">Rebote: <span className="text-destructive">{avg(firstHalf, "bounceRate").toFixed(1)}%</span> · Apertura: <span className="text-blue-600 dark:text-blue-400">{avg(firstHalf, "openRate").toFixed(1)}%</span></p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Últimas campañas (2ª mitad)</p>
                <p className="font-medium">Rebote: <span className="text-destructive">{avg(secondHalf, "bounceRate").toFixed(1)}%</span> · Apertura: <span className="text-blue-600 dark:text-blue-400">{avg(secondHalf, "openRate").toFixed(1)}%</span></p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
