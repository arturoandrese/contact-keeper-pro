import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, ArrowLeft, MailCheck, MailX, Clock, Users, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface SheetReportPanelProps {
  baseId: string;
  baseName: string;
  sheetId: string;
  onBack: () => void;
}

interface SheetStats {
  total: number;
  stats: Record<string, number>;
  contacts: Array<Record<string, string>>;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  EMAIL_SENT: { bg: "bg-primary/10", text: "text-primary", icon: <MailCheck className="h-4 w-4" /> },
  EMAIL_DELIVERED: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", icon: <MailCheck className="h-4 w-4" /> },
  EMAIL_OPENED: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", icon: <MailCheck className="h-4 w-4" /> },
  EMAIL_CLICKED: { bg: "bg-violet-500/10", text: "text-violet-600 dark:text-violet-400", icon: <MailCheck className="h-4 w-4" /> },
  EMAIL_BOUNCED: { bg: "bg-destructive/10", text: "text-destructive", icon: <MailX className="h-4 w-4" /> },
  EMAIL_NOT_SENT: { bg: "bg-muted", text: "text-muted-foreground", icon: <Clock className="h-4 w-4" /> },
  MAIL_MERGE_COMPLETE: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", icon: <MailCheck className="h-4 w-4" /> },
};

const getStatusDisplay = (status: string) => {
  const normalized = status.replace(/\s+/g, "_").toUpperCase();
  return STATUS_COLORS[normalized] || { bg: "bg-muted", text: "text-muted-foreground", icon: <AlertCircle className="h-4 w-4" /> };
};

const SheetReportPanel = ({ baseId, baseName, sheetId, onBack }: SheetReportPanelProps) => {
  const [data, setData] = useState<SheetStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("fetch-sheet-report", {
        body: { sheetId },
      });

      if (error) {
        toast.error("Error conectando con Google Sheets");
        console.error(error);
        return;
      }

      if (result.error) {
        toast.error(result.error);
        return;
      }

      setData(result);
      setLastFetched(new Date());
    } catch (err) {
      toast.error("Error obteniendo reporte");
      console.error(err);
    }
    setLoading(false);
  }, [sheetId]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchReport, 30000);
    return () => clearInterval(interval);
  }, [fetchReport]);

  const sortedStats = data
    ? Object.entries(data.stats).sort(([, a], [, b]) => b - a)
    : [];

  const totalSent = data
    ? Object.entries(data.stats)
        .filter(([k]) => !k.includes("NOT_SENT") && !k.includes("UNKNOWN"))
        .reduce((sum, [, v]) => sum + v, 0)
    : 0;

  const bounced = data?.stats["EMAIL_BOUNCED"] || data?.stats["BOUNCED"] || 0;
  const opened = data?.stats["EMAIL_OPENED"] || data?.stats["OPENED"] || 0;
  const clicked = data?.stats["EMAIL_CLICKED"] || data?.stats["CLICKED"] || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={onBack} className="mb-2">
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
            Volver
          </Button>
          <h2 className="font-display text-2xl font-bold">📊 Reporte en vivo: {baseName}</h2>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-muted-foreground">
              Datos de YAMM en tiempo real
            </p>
            {lastFetched && (
              <span className="text-xs text-muted-foreground/60">
                Actualizado: {lastFetched.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={fetchReport} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {loading && !data && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-xl border border-border bg-card px-5 py-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs font-medium text-muted-foreground">Total</p>
              </div>
              <p className="font-display text-3xl font-bold">{data.total}</p>
            </div>
            <div className="rounded-xl border border-border bg-card px-5 py-4">
              <div className="flex items-center gap-2 mb-1">
                <MailCheck className="h-4 w-4 text-primary" />
                <p className="text-xs font-medium text-muted-foreground">Enviados</p>
              </div>
              <p className="font-display text-3xl font-bold text-primary">{totalSent}</p>
            </div>
            <div className="rounded-xl border border-border bg-card px-5 py-4">
              <div className="flex items-center gap-2 mb-1">
                <MailX className="h-4 w-4 text-destructive" />
                <p className="text-xs font-medium text-muted-foreground">Rebotados</p>
              </div>
              <p className="font-display text-3xl font-bold text-destructive">{bounced}</p>
            </div>
            <div className="rounded-xl border border-border bg-card px-5 py-4">
              <div className="flex items-center gap-2 mb-1">
                <MailCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <p className="text-xs font-medium text-muted-foreground">Abiertos</p>
              </div>
              <p className="font-display text-3xl font-bold text-emerald-600 dark:text-emerald-400">{opened}</p>
              {totalSent > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {Math.round((opened / totalSent) * 100)}% open rate
                </p>
              )}
            </div>
          </div>

          {/* Status breakdown */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-display font-semibold mb-4">Desglose por estado</h3>
            <div className="space-y-2">
              {sortedStats.map(([status, count]) => {
                const display = getStatusDisplay(status);
                const pct = data.total > 0 ? (count / data.total) * 100 : 0;
                return (
                  <div key={status} className="flex items-center gap-3">
                    <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 ${display.bg} min-w-[200px]`}>
                      <span className={display.text}>{display.icon}</span>
                      <span className={`text-xs font-mono font-medium ${display.text}`}>
                        {status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${display.bg.replace("/10", "/40")}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-sm font-mono font-bold min-w-[50px] text-right">{count}</span>
                    <span className="text-xs text-muted-foreground min-w-[40px] text-right">{pct.toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Contact detail table */}
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/60">
                    <th className="whitespace-nowrap px-4 py-3 text-left font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</th>
                    <th className="whitespace-nowrap px-4 py-3 text-left font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">Estado</th>
                    <th className="whitespace-nowrap px-4 py-3 text-left font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nombre</th>
                  </tr>
                </thead>
                <tbody>
                  {data.contacts.slice(0, 100).map((contact, i) => {
                    const display = getStatusDisplay(contact._status || "UNKNOWN");
                    const email =
                      contact["Email Address"] ||
                      contact["email"] ||
                      contact["MAIL1"] ||
                      contact["mail"] ||
                      Object.values(contact).find((v) => v.includes("@")) ||
                      "—";
                    const name =
                      contact["First Name"] ||
                      contact["NOMBRE"] ||
                      contact["nombre"] ||
                      "—";
                    return (
                      <tr key={i} className="border-b border-border/50 transition-colors hover:bg-muted/30">
                        <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">{email}</td>
                        <td className="whitespace-nowrap px-4 py-2.5">
                          <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${display.bg} ${display.text}`}>
                            {contact._status?.replace(/_/g, " ") || "—"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">{name}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {data.contacts.length > 100 && (
              <div className="border-t border-border bg-muted/30 px-4 py-2 text-center text-xs text-muted-foreground">
                Mostrando 100 de {data.contacts.length} contactos
              </div>
            )}
          </div>

          {/* Auto-refresh indicator */}
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/60">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Se actualiza automáticamente cada 30 segundos
          </div>
        </>
      )}
    </div>
  );
};

export default SheetReportPanel;
