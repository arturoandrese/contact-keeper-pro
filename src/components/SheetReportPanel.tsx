import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RefreshCw, ArrowLeft, MailCheck, MailX, Clock, Users, AlertCircle, Download } from "lucide-react";
import { toast } from "sonner";
import { fetchSheetReport, fetchSheetTabs, type SheetData, type SheetTab } from "@/lib/googleSheets";

interface SheetReportPanelProps {
  baseId: string;
  baseName: string;
  sheetId: string;
  onBack: () => void;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  EMAIL_SENT: { bg: "bg-primary/10", text: "text-primary", icon: <MailCheck className="h-4 w-4" /> },
  SENT: { bg: "bg-primary/10", text: "text-primary", icon: <MailCheck className="h-4 w-4" /> },
  EMAIL_DELIVERED: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", icon: <MailCheck className="h-4 w-4" /> },
  DELIVERED: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", icon: <MailCheck className="h-4 w-4" /> },
  EMAIL_OPENED: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", icon: <MailCheck className="h-4 w-4" /> },
  OPENED: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", icon: <MailCheck className="h-4 w-4" /> },
  EMAIL_CLICKED: { bg: "bg-violet-500/10", text: "text-violet-600 dark:text-violet-400", icon: <MailCheck className="h-4 w-4" /> },
  CLICKED: { bg: "bg-violet-500/10", text: "text-violet-600 dark:text-violet-400", icon: <MailCheck className="h-4 w-4" /> },
  EMAIL_BOUNCED: { bg: "bg-destructive/10", text: "text-destructive", icon: <MailX className="h-4 w-4" /> },
  BOUNCED: { bg: "bg-destructive/10", text: "text-destructive", icon: <MailX className="h-4 w-4" /> },
  EMAIL_NOT_SENT: { bg: "bg-muted", text: "text-muted-foreground", icon: <Clock className="h-4 w-4" /> },
  NOT_SENT: { bg: "bg-muted", text: "text-muted-foreground", icon: <Clock className="h-4 w-4" /> },
  MAIL_MERGE_COMPLETE: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", icon: <MailCheck className="h-4 w-4" /> },
};

const getStatusDisplay = (status: string) => {
  const normalized = status.replace(/\s+/g, "_").toUpperCase();
  return STATUS_COLORS[normalized] || { bg: "bg-muted", text: "text-muted-foreground", icon: <AlertCircle className="h-4 w-4" /> };
};

const SheetReportPanel = ({ baseId, baseName, sheetId, onBack }: SheetReportPanelProps) => {
  const [data, setData] = useState<SheetData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [updating, setUpdating] = useState(false);
  const [tabs, setTabs] = useState<SheetTab[]>([]);
  const [selectedTab, setSelectedTab] = useState<string>("");
  const [loadingTabs, setLoadingTabs] = useState(true);

  // Fetch available tabs on mount
  useEffect(() => {
    const loadTabs = async () => {
      setLoadingTabs(true);
      try {
        const sheetTabs = await fetchSheetTabs(sheetId);
        setTabs(sheetTabs);
        // Default to last tab (usually the active campaign)
        if (sheetTabs.length > 0) {
          setSelectedTab(sheetTabs[sheetTabs.length - 1].title);
        }
      } catch (err: any) {
        toast.error("Error cargando pestañas: " + (err.message || ""));
        console.error(err);
      }
      setLoadingTabs(false);
    };
    loadTabs();
  }, [sheetId]);

  const fetchReport = useCallback(async () => {
    if (!selectedTab) return;
    setLoading(true);
    try {
      const result = await fetchSheetReport(sheetId, selectedTab);
      setData(result);
      setLastFetched(new Date());
    } catch (err: any) {
      toast.error(err.message || "Error obteniendo reporte");
      console.error(err);
    }
    setLoading(false);
  }, [sheetId, selectedTab]);

  useEffect(() => {
    if (selectedTab) fetchReport();
  }, [selectedTab, fetchReport]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!selectedTab) return;
    const interval = setInterval(fetchReport, 30000);
    return () => clearInterval(interval);
  }, [fetchReport, selectedTab]);

  const handleUpdateBase = async () => {
    if (!data || data.contacts.length === 0) return;
    setUpdating(true);

    try {
      // Get existing contacts from the base
      const { data: existingContacts, error: fetchErr } = await supabase
        .from("contacts")
        .select("id, mail1, mail2, mail3, mail4")
        .eq("base_id", baseId);

      if (fetchErr) throw fetchErr;

      // Build a map: email -> sheet status
      const emailStatusMap = new Map<string, string>();
      for (const sc of data.contacts) {
        const email = (
          sc["Email Address"] || sc["email"] || sc["MAIL1"] || sc["mail"] ||
          Object.values(sc).find((v) => typeof v === "string" && v.includes("@"))
        )?.toLowerCase().trim();
        if (email) {
          emailStatusMap.set(email, sc._status || "UNKNOWN");
        }
      }

      // Find bounced emails
      const bouncedEmails = new Set<string>();
      const deliveredEmails = new Set<string>();
      for (const [email, status] of emailStatusMap) {
        if (status.includes("BOUNCED")) {
          bouncedEmails.add(email);
        } else if (status.includes("DELIVERED") || status.includes("OPENED") || status.includes("CLICKED") || status === "EMAIL_SENT" || status === "MAIL_MERGE_COMPLETE") {
          deliveredEmails.add(email);
        }
      }

      // For each contact, check if any of their emails bounced and clear them
      let updatedCount = 0;
      const updates: Array<{ id: string; changes: Record<string, string> }> = [];

      for (const contact of existingContacts || []) {
        const changes: Record<string, string> = {};
        const mails = [
          { key: "mail1", val: contact.mail1 },
          { key: "mail2", val: contact.mail2 },
          { key: "mail3", val: contact.mail3 },
          { key: "mail4", val: contact.mail4 },
        ];

        for (const m of mails) {
          if (m.val && bouncedEmails.has(m.val.toLowerCase().trim())) {
            changes[m.key] = ""; // Clear bounced email
          }
        }

        if (Object.keys(changes).length > 0) {
          updates.push({ id: contact.id, changes });
        }
      }

      // Batch update bounced emails
      for (const u of updates) {
        await supabase
          .from("contacts")
          .update(u.changes as any)
          .eq("id", u.id);
        updatedCount++;
      }

      // Save delivered contacts to delivered_contacts table
      let deliveredSaved = 0;
      for (const sc of data.contacts) {
        const email = (
          sc["Email Address"] || sc["email"] || sc["MAIL1"] || sc["mail"] ||
          Object.values(sc).find((v) => typeof v === "string" && v.includes("@"))
        )?.toLowerCase().trim();

        if (email && deliveredEmails.has(email)) {
          const name = sc["First Name"] || sc["NOMBRE"] || sc["nombre"] || "";
          await supabase.from("delivered_contacts").upsert(
            {
              base_id: baseId,
              email,
              name,
              status: sc._status,
            } as any,
            { onConflict: "base_id,email" }
          );
          deliveredSaved++;
        }
      }

      // Mark base as crossed
      await supabase
        .from("bases")
        .update({ crossed: true, crossed_at: new Date().toISOString() } as any)
        .eq("id", baseId);

      toast.success(
        `✅ Base actualizada: ${updatedCount} emails rebotados limpiados, ${deliveredSaved} contactos entregados guardados`
      );
    } catch (err: any) {
      toast.error("Error actualizando base: " + (err.message || "Error desconocido"));
      console.error(err);
    }
    setUpdating(false);
  };

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
        <div className="flex items-center gap-2">
          {!loadingTabs && tabs.length > 1 && (
            <Select value={selectedTab} onValueChange={setSelectedTab}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Pestaña..." />
              </SelectTrigger>
              <SelectContent>
                {tabs.map((tab) => (
                  <SelectItem key={tab.index} value={tab.title}>
                    {tab.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {data && (
            <Button size="sm" variant="default" onClick={handleUpdateBase} disabled={updating}>
              {updating ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="mr-1.5 h-3.5 w-3.5" />
              )}
              Actualizar base con reporte
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={fetchReport} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
        </div>
      </div>

      {loading && !data && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {data && (
        <>
          {/* Summary cards - Total + all statuses */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-border bg-card px-5 py-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs font-medium text-muted-foreground">Total</p>
              </div>
              <p className="font-display text-3xl font-bold">{data.total}</p>
            </div>
            {sortedStats.map(([status, count]) => {
              const display = getStatusDisplay(status);
              const pct = data.total > 0 ? Math.round((count / data.total) * 100) : 0;
              return (
                <div key={status} className="rounded-xl border border-border bg-card px-5 py-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={display.text}>{display.icon}</span>
                    <p className="text-xs font-medium text-muted-foreground truncate">
                      {status.replace(/_/g, " ")}
                    </p>
                  </div>
                  <p className={`font-display text-3xl font-bold ${display.text}`}>{count}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{pct}%</p>
                </div>
              );
            })}
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
                  {data.contacts.map((contact, i) => {
                    const display = getStatusDisplay(contact._status || "UNKNOWN");
                    const email =
                      contact["Email Address"] ||
                      contact["email"] ||
                      contact["MAIL1"] ||
                      contact["mail"] ||
                      Object.values(contact).find((v) => typeof v === "string" && v.includes("@")) ||
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
