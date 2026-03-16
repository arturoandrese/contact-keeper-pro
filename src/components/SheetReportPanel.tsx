import { useState, useEffect, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RefreshCw, ArrowLeft, MailCheck, MailX, Clock, Users, AlertCircle, Download, ClipboardCopy } from "lucide-react";
import { toast } from "sonner";
import { fetchSheetReport, fetchSheetTabs, type SheetData, type SheetTab } from "@/lib/googleSheets";
import { crossReference, type EmailLogEntry } from "@/lib/crossReference";
import ExportDropdown from "./ExportDropdown";
import type { CleanedContact } from "@/lib/contactCleaner";

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

const CONTACTS_PAGE_SIZE = 1000;

interface ExistingContactRow {
  id: string;
  nombre: string;
  apellido: string;
  apellido2: string;
  empresa: string;
  web: string;
  mail1: string;
  mail2: string;
  mail3: string;
  mail4: string;
}

const normalizeStatusKey = (status: string): string => {
  const normalized = (status || "").replace(/\s+/g, "_").toUpperCase().trim();
  if (normalized.includes("BOUNC")) return "BOUNCED";
  if (normalized.includes("CLICK")) return "CLICKED";
  if (normalized.includes("OPEN")) return "OPENED";
  if (normalized.includes("DELIVER")) return "DELIVERED";
  if (normalized.includes("NOT_SENT") || normalized.includes("NO_ENVIAD")) return "NOT_SENT";
  if (normalized.includes("MERGE_COMPLETE")) return "MERGE_COMPLETE";
  if (normalized.includes("SENT")) return "SENT";
  return normalized || "UNKNOWN";
};

const getSheetContactEmail = (contact: Record<string, string>): string => {
  const value =
    contact["Email Address"] ||
    contact["email"] ||
    contact["MAIL1"] ||
    contact["mail"] ||
    Object.values(contact).find((v) => typeof v === "string" && v.includes("@")) ||
    "";
  return value.toString().toLowerCase().trim();
};

const getSheetContactName = (contact: Record<string, string>): string =>
  (
    contact["First Name"] ||
    contact["NOMBRE"] ||
    contact["nombre"] ||
    ""
  )
    .toString()
    .trim();

const toEmailLog = (contacts: Array<Record<string, string>>): EmailLogEntry[] =>
  contacts.map((c) => ({
    NOMBRE: (c["NOMBRE"] || c["First Name"] || c["nombre"] || "").toString().trim(),
    APELLIDO: (c["APELLIDO"] || c["Last Name"] || c["apellido"] || "").toString().trim(),
    EMPRESA: (c["EMPRESA"] || c["Company"] || c["empresa"] || "").toString().trim(),
    WEB: (c["WEB"] || c["Website"] || c["web"] || "").toString().trim(),
    MAIL1: getSheetContactEmail(c),
    MAIL2: (c["MAIL2"] || c["email2"] || "").toString().trim().toLowerCase(),
    status: (c._status || "").toString().trim(),
  }));

const toCleanedContacts = (rows: ExistingContactRow[]): CleanedContact[] =>
  rows.map((c) => ({
    NOMBRE: c.nombre || "",
    APELLIDO: c.apellido || "",
    APELLIDO2: c.apellido2 || "",
    EMPRESA: c.empresa || "",
    WEB: c.web || "",
    MAIL1: c.mail1 || "",
    MAIL2: c.mail2 || "",
    MAIL3: c.mail3 || "",
    MAIL4: c.mail4 || "",
  }));

async function fetchAllContacts(baseId: string): Promise<ExistingContactRow[]> {
  const all: ExistingContactRow[] = [];

  for (let from = 0; ; from += CONTACTS_PAGE_SIZE) {
    const to = from + CONTACTS_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("contacts")
      .select("id, nombre, apellido, apellido2, empresa, web, mail1, mail2, mail3, mail4")
      .eq("base_id", baseId)
      .range(from, to);

    if (error) throw error;
    if (!data || data.length === 0) break;

    all.push(...(data as ExistingContactRow[]));
    if (data.length < CONTACTS_PAGE_SIZE) break;
  }

  return all;
}

const SheetReportPanel = ({ baseId, baseName, sheetId, onBack }: SheetReportPanelProps) => {
  const [data, setData] = useState<SheetData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [updating, setUpdating] = useState(false);
  const [tabs, setTabs] = useState<SheetTab[]>([]);
  const [selectedTab, setSelectedTab] = useState<string>("");
  const [loadingTabs, setLoadingTabs] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);

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
      const existingContacts = await fetchAllContacts(baseId);
      if (existingContacts.length === 0) {
        toast.error("No hay contactos en esta base para actualizar");
        setUpdating(false);
        return;
      }

      const log = toEmailLog(data.contacts);
      const cleanedContacts = toCleanedContacts(existingContacts);
      const { filtered, delivered } = crossReference(cleanedContacts, log, undefined, { onlyBounced: true });

      const correctionMap = new Map<string, string>();
      for (const row of filtered) {
        const key = `${row.NOMBRE}|${row.APELLIDO}|${row.MAIL_ORIGINAL}`.toLowerCase();
        if (row.MAIL_ORIGINAL && row.MAIL1) {
          correctionMap.set(key, row.MAIL1.toLowerCase());
        }
      }

      const updates: Array<{ id: string; changes: Record<string, string> }> = [];
      for (const contact of existingContacts) {
        const mails = [
          { key: "mail1", val: (contact.mail1 || "").toLowerCase().trim() },
          { key: "mail2", val: (contact.mail2 || "").toLowerCase().trim() },
          { key: "mail3", val: (contact.mail3 || "").toLowerCase().trim() },
          { key: "mail4", val: (contact.mail4 || "").toLowerCase().trim() },
        ] as const;

        const nameKey = `${contact.nombre || ""}|${contact.apellido || ""}`.toLowerCase();
        const matched = mails.find((m) => !!m.val && correctionMap.has(`${nameKey}|${m.val}`));
        if (!matched) continue;

        const correctedMail = correctionMap.get(`${nameKey}|${matched.val}`) || "";
        if (!correctedMail) continue;

        const changes: Record<string, string> = {};
        if (correctedMail !== mails[0].val) {
          changes.mail1 = correctedMail;
        }

        for (const m of mails) {
          if (!m.val || m.key === "mail1") continue;
          if (m.val === matched.val || m.val === correctedMail) {
            changes[m.key] = "";
          }
        }

        if (Object.keys(changes).length > 0) {
          updates.push({ id: contact.id, changes });
        }
      }

      await Promise.all(
        updates.map((u) =>
          supabase
            .from("contacts")
            .update(u.changes as any)
            .eq("id", u.id)
        )
      );

      const uniqueDeliveredRows = Array.from(
        new Map(
          delivered
            .filter((d) => !!d.mail)
            .map((d) => [
              d.mail.toLowerCase(),
              {
                ...d,
                mail: d.mail.toLowerCase(),
              },
            ])
        ).values()
      );

      const existingDeliveredMap = new Map<string, { times_contacted: number; last_campaign?: string }>();
      const emailChunks: string[][] = [];
      for (let i = 0; i < uniqueDeliveredRows.length; i += 300) {
        emailChunks.push(uniqueDeliveredRows.slice(i, i + 300).map((r) => r.mail));
      }

      const existingDeliveredResponses = await Promise.all(
        emailChunks.map((chunk) =>
          supabase
            .from("delivered_contacts")
            .select("mail, times_contacted, last_campaign")
            .in("mail", chunk)
        )
      );

      for (const response of existingDeliveredResponses) {
        for (const row of response.data || []) {
          existingDeliveredMap.set((row.mail || "").toLowerCase(), {
            times_contacted: row.times_contacted || 0,
            last_campaign: (row as any).last_campaign || "",
          });
        }
      }

      const now = new Date().toISOString();
      const campaignKey = `${sheetId}:${selectedTab}`;
      const deliveredPayload = uniqueDeliveredRows.map((row) => {
        const prev = existingDeliveredMap.get(row.mail);
        // Only increment if this is a different campaign (different sheet tab)
        const prevCampaign = prev?.last_campaign || "";
        const isNewCampaign = prevCampaign !== campaignKey;
        return {
          ...row,
          times_contacted: isNewCampaign ? (prev?.times_contacted || 0) + 1 : (prev?.times_contacted || 1),
          last_contacted_at: now,
          last_campaign: campaignKey,
        };
      });

      await Promise.all(
        deliveredPayload.length === 0
          ? []
          : Array.from({ length: Math.ceil(deliveredPayload.length / 500) }, (_, i) => {
              const batch = deliveredPayload.slice(i * 500, (i + 1) * 500);
              return supabase
                .from("delivered_contacts")
                .upsert(batch as any, { onConflict: "mail" });
            })
      );

      await supabase
        .from("bases")
        .update({ crossed: true, crossed_at: new Date().toISOString() } as any)
        .eq("id", baseId);

      toast.success(
        `✅ Base actualizada: ${updates.length} contactos corregidos, ${deliveredPayload.length} contactos entregados guardados`
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

  const filteredContacts = useMemo(() => {
    if (!data) return [];
    if (!selectedStatus) return data.contacts;
    return data.contacts.filter((contact) => normalizeStatusKey(contact._status || "UNKNOWN") === selectedStatus);
  }, [data, selectedStatus]);

  const statusFilterLabel = selectedStatus ? selectedStatus.replace(/_/g, " ") : "TODOS";

  const handleDownloadCurrentView = () => {
    if (!data) return;

    const rows = filteredContacts.map((contact) => ({
      EMAIL: getSheetContactEmail(contact) || "",
      ESTADO: (contact._status || "UNKNOWN").toString().replace(/_/g, " "),
      NOMBRE: getSheetContactName(contact),
      APELLIDO: (contact["Last Name"] || contact["APELLIDO"] || contact["apellido"] || "").toString().trim(),
      EMPRESA: (contact["EMPRESA"] || contact["Company"] || contact["empresa"] || "").toString().trim(),
      WEB: (contact["WEB"] || contact["Website"] || contact["web"] || "").toString().trim(),
      MAIL1: (contact["MAIL1"] || "").toString().trim(),
      MAIL2: (contact["MAIL2"] || "").toString().trim(),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reporte");

    const suffix = selectedStatus ? normalizeStatusKey(selectedStatus).toLowerCase() : "todos";
    XLSX.writeFile(wb, `reporte_${selectedTab || "sheet"}_${suffix}.xlsx`);
  };

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
            <>
              <ExportDropdown
                label={selectedStatus ? statusFilterLabel : "vista"}
                disabled={filteredContacts.length === 0}
                variant="outline"
                onDownload={handleDownloadCurrentView}
                getData={() => ({
                  headers: ["EMAIL", "ESTADO", "NOMBRE", "APELLIDO", "EMPRESA", "WEB", "MAIL1", "MAIL2"],
                  rows: filteredContacts.map(c => [
                    getSheetContactEmail(c),
                    (c._status || "UNKNOWN").replace(/_/g, " "),
                    getSheetContactName(c),
                    (c["Last Name"] || c["APELLIDO"] || c["apellido"] || "").toString().trim(),
                    (c["EMPRESA"] || c["Company"] || c["empresa"] || "").toString().trim(),
                    (c["WEB"] || c["Website"] || c["web"] || "").toString().trim(),
                    (c["MAIL1"] || "").toString().trim(),
                    (c["MAIL2"] || "").toString().trim(),
                  ]),
                })}
              />
              <Button size="sm" variant="default" onClick={handleUpdateBase} disabled={updating}>
                {updating ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                )}
                Actualizar base con reporte
              </Button>
            </>
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
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            <button
              type="button"
              onClick={() => setSelectedStatus(null)}
              className={`rounded-xl border bg-card px-5 py-4 text-left transition-colors ${
                selectedStatus === null ? "border-primary" : "border-border hover:border-primary/40"
              }`}
            >
              <div className="mb-1 flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs font-medium text-muted-foreground">Total</p>
              </div>
              <p className="font-display text-3xl font-bold">{data.total}</p>
            </button>
            {sortedStats.map(([status, count]) => {
              const display = getStatusDisplay(status);
              const pct = data.total > 0 ? Math.round((count / data.total) * 100) : 0;
              const normalized = normalizeStatusKey(status);
              const isActive = selectedStatus === normalized;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setSelectedStatus((prev) => (prev === normalized ? null : normalized))}
                  className={`rounded-xl border bg-card px-5 py-4 text-left transition-colors ${
                    isActive ? "border-primary" : "border-border hover:border-primary/40"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span className={display.text}>{display.icon}</span>
                    <p className="truncate text-xs font-medium text-muted-foreground">{status.replace(/_/g, " ")}</p>
                  </div>
                  <p className={`font-display text-3xl font-bold ${display.text}`}>{count}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{pct}%</p>
                </button>
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
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Mostrando <span className="font-semibold text-foreground">{filteredContacts.length}</span> de {data.total} contactos · filtro: <span className="font-semibold text-foreground">{statusFilterLabel}</span>
              </p>
              {selectedStatus && (
                <Button size="sm" variant="ghost" onClick={() => setSelectedStatus(null)}>
                  Ver todos
                </Button>
              )}
            </div>

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
                    {filteredContacts.map((contact, i) => {
                      const display = getStatusDisplay(contact._status || "UNKNOWN");
                      const email = getSheetContactEmail(contact) || "—";
                      const name = getSheetContactName(contact) || "—";
                      return (
                        <tr key={`${email}-${i}`} className="border-b border-border/50 transition-colors hover:bg-muted/30">
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
                    {filteredContacts.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-sm text-muted-foreground">
                          No hay contactos para este filtro.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Auto-refresh indicator */}
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/60">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            Se actualiza automáticamente cada 30 segundos
          </div>
        </>
      )}
    </div>
  );
};

export default SheetReportPanel;
