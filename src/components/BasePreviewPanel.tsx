import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2, GitCompare, Link2, BarChart3, Mail, MailX, MailOpen, MousePointerClick, Send, MessageSquareReply, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import SheetReportPanel from "./SheetReportPanel";
import { fetchSheetTabs, fetchSheetReport, type SheetData } from "@/lib/googleSheets";

interface Contact {
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

interface BasePreviewPanelProps {
  baseId: string;
  baseName: string;
  isCrossed: boolean;
  onBack: () => void;
  onCrossReference: () => void;
}

function extractSheetId(input: string): string {
  const trimmed = input.trim();
  // Full URL: https://docs.google.com/spreadsheets/d/SHEET_ID/edit...
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  // Already just an ID
  return trimmed;
}

const BasePreviewPanel = ({ baseId, baseName, isCrossed, onBack, onCrossReference }: BasePreviewPanelProps) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [sheetInput, setSheetInput] = useState("");
  const [savingSheet, setSavingSheet] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [campaignSummary, setCampaignSummary] = useState<{
    total: number;
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    responded: number;
    notSent: number;
    tabs: number;
  } | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [contactsRes, baseRes] = await Promise.all([
        supabase
          .from("contacts")
          .select("nombre, apellido, apellido2, empresa, web, mail1, mail2, mail3, mail4")
          .eq("base_id", baseId)
          .limit(200),
        supabase
          .from("bases")
          .select("sheet_id")
          .eq("id", baseId)
          .single(),
      ]);

      if (contactsRes.error) {
        toast.error("Error cargando contactos");
      } else {
        setContacts((contactsRes.data as Contact[]) || []);
      }

      if (baseRes.data && (baseRes.data as any).sheet_id) {
        const sid = (baseRes.data as any).sheet_id;
        setSheetId(sid);
        // Fetch campaign summary across all tabs
        fetchCampaignSummary(sid);
      }

      setLoading(false);
    };
    fetchData();
  }, [baseId]);

  const fetchCampaignSummary = async (sid: string) => {
    setLoadingSummary(true);
    try {
      const tabs = await fetchSheetTabs(sid);
      if (tabs.length === 0) { setLoadingSummary(false); return; }

      const allData = await Promise.all(tabs.map(t => fetchSheetReport(sid, t.title)));

      let total = 0, sent = 0, delivered = 0, opened = 0, clicked = 0, bounced = 0, responded = 0, notSent = 0;

      for (const sheet of allData) {
        total += sheet.total;
        for (const [status, count] of Object.entries(sheet.stats)) {
          const s = status.toUpperCase();
          if (s.includes("BOUNCE")) bounced += count;
          else if (s.includes("CLICK")) clicked += count;
          else if (s.includes("OPEN")) opened += count;
          else if (s.includes("DELIVER")) delivered += count;
          else if (s.includes("RESPOND")) responded += count;
          else if (s.includes("NOT_SENT") || s.includes("NO_ENVIAD")) notSent += count;
          else if (s.includes("SENT") || s.includes("ENVIAD") || s.includes("MERGE_COMPLETE")) sent += count;
          else notSent += count;
        }
      }

      setCampaignSummary({ total, sent, delivered, opened, clicked, bounced, responded, notSent, tabs: tabs.length });
    } catch (err: any) {
      console.error("Error fetching campaign summary:", err);
    }
    setLoadingSummary(false);
  };
  const handleLinkSheet = async () => {
    const id = extractSheetId(sheetInput);
    if (!id) {
      toast.error("Pega un link válido de Google Sheets");
      return;
    }
    setSavingSheet(true);
    const { error } = await supabase
      .from("bases")
      .update({ sheet_id: id } as any)
      .eq("id", baseId);

    if (error) {
      toast.error("Error guardando Sheet ID. ¿Agregaste la columna sheet_id a la tabla bases?");
    } else {
      setSheetId(id);
      toast.success("Google Sheet vinculado correctamente");
    }
    setSavingSheet(false);
  };

  if (showReport && sheetId) {
    return (
      <SheetReportPanel
        baseId={baseId}
        baseName={baseName}
        sheetId={sheetId}
        onBack={() => setShowReport(false)}
      />
    );
  }

  const columns = ["NOMBRE", "APELLIDO", "APELLIDO2", "EMPRESA", "WEB", "MAIL1", "MAIL2", "MAIL3", "MAIL4"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={onBack} className="mb-2">
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
            Volver a BBD
          </Button>
          <h2 className="font-display text-2xl font-bold">{baseName}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {contacts.length} contactos{isCrossed ? " — ✓ Cruzada" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {sheetId && (
            <Button size="sm" variant="default" onClick={() => setShowReport(true)}>
              <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
              Ver reporte en vivo
            </Button>
          )}
          {!isCrossed && (
            <Button size="sm" variant="outline" onClick={onCrossReference}>
              <GitCompare className="mr-1.5 h-3.5 w-3.5" />
              Cruzar con reporte
            </Button>
          )}
        </div>
      </div>

      {/* Sheet linking */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Link2 className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Google Sheet (YAMM)</h3>
        </div>
        {sheetId ? (
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-muted-foreground truncate flex-1">
              ID: {sheetId}
            </span>
            <Button size="sm" variant="ghost" onClick={() => { setSheetId(null); setSheetInput(""); }}>
              Cambiar
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              placeholder="Pega el link de Google Sheets aquí..."
              value={sheetInput}
              onChange={(e) => setSheetInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLinkSheet()}
              className="text-sm"
            />
            <Button size="sm" onClick={handleLinkSheet} disabled={!sheetInput.trim() || savingSheet}>
              {savingSheet ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Vincular"}
            </Button>
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-2">
          Vincula la hoja de YAMM para ver métricas de envío en tiempo real. La hoja debe ser pública o accesible con la API Key.
        </p>
      </div>

      {/* Campaign Summary */}
      {sheetId && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Resumen de campaña</h3>
            {loadingSummary && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>
          {campaignSummary ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-2xl font-bold font-mono">{campaignSummary.total}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Total contactos</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <Send className="h-3.5 w-3.5 text-blue-500" />
                    <p className="text-2xl font-bold font-mono text-blue-600">{campaignSummary.sent}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Enviados
                    {campaignSummary.total > 0 && (
                      <span className="ml-1 text-blue-600 font-medium">
                        ({Math.round((campaignSummary.sent / campaignSummary.total) * 100)}%)
                      </span>
                    )}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <MailOpen className="h-3.5 w-3.5 text-emerald-500" />
                    <p className="text-2xl font-bold font-mono text-emerald-600">{campaignSummary.opened}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Abiertos
                    {campaignSummary.total > 0 && (
                      <span className="ml-1 text-emerald-600 font-medium">
                        ({Math.round((campaignSummary.opened / campaignSummary.total) * 100)}%)
                      </span>
                    )}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <MousePointerClick className="h-3.5 w-3.5 text-violet-500" />
                    <p className="text-2xl font-bold font-mono text-violet-600">{campaignSummary.clicked}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Clicks
                    {campaignSummary.total > 0 && (
                      <span className="ml-1 text-violet-600 font-medium">
                        ({Math.round((campaignSummary.clicked / campaignSummary.total) * 100)}%)
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <MailX className="h-3.5 w-3.5 text-destructive" />
                    <p className="text-2xl font-bold font-mono text-destructive">{campaignSummary.bounced}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Rebotados
                    {campaignSummary.total > 0 && (
                      <span className="ml-1 text-destructive font-medium">
                        ({Math.round((campaignSummary.bounced / campaignSummary.total) * 100)}%)
                      </span>
                    )}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <MessageSquareReply className="h-3.5 w-3.5 text-amber-500" />
                    <p className="text-2xl font-bold font-mono text-amber-600">{campaignSummary.responded}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Respondidos
                    {campaignSummary.total > 0 && (
                      <span className="ml-1 text-amber-600 font-medium">
                        ({Math.round((campaignSummary.responded / campaignSummary.total) * 100)}%)
                      </span>
                    )}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-2xl font-bold font-mono">{campaignSummary.notSent}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    No enviados
                    {campaignSummary.total > 0 && (
                      <span className="ml-1 font-medium">
                        ({Math.round((campaignSummary.notSent / campaignSummary.total) * 100)}%)
                      </span>
                    )}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-2xl font-bold font-mono">{campaignSummary.tabs}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Pestañas</p>
                </div>
              </div>
              {campaignSummary.total > 0 && (
                <div className="mt-3 h-3 rounded-full bg-muted overflow-hidden flex">
                  {campaignSummary.clicked > 0 && <div className="bg-violet-500 h-full" style={{ width: `${(campaignSummary.clicked / campaignSummary.total) * 100}%` }} />}
                  {campaignSummary.opened > 0 && <div className="bg-emerald-500 h-full" style={{ width: `${(campaignSummary.opened / campaignSummary.total) * 100}%` }} />}
                  {campaignSummary.responded > 0 && <div className="bg-amber-500 h-full" style={{ width: `${(campaignSummary.responded / campaignSummary.total) * 100}%` }} />}
                  {campaignSummary.sent > 0 && <div className="bg-blue-500 h-full" style={{ width: `${(campaignSummary.sent / campaignSummary.total) * 100}%` }} />}
                  {campaignSummary.bounced > 0 && <div className="bg-destructive h-full" style={{ width: `${(campaignSummary.bounced / campaignSummary.total) * 100}%` }} />}
                  {campaignSummary.notSent > 0 && <div className="bg-muted-foreground/30 h-full" style={{ width: `${(campaignSummary.notSent / campaignSummary.total) * 100}%` }} />}
                </div>
              )}
            </>
          ) : !loadingSummary ? (
            <p className="text-xs text-muted-foreground">No se pudo cargar el resumen.</p>
          ) : null}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60">
                  {columns.map((col) => (
                    <th key={col} className="whitespace-nowrap px-4 py-3 text-left font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contacts.map((c, i) => (
                  <tr key={i} className="border-b border-border/50 transition-colors hover:bg-muted/30">
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">{c.nombre || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">{c.apellido || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">{c.apellido2 || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">{c.empresa || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted-foreground">{c.web || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs font-medium text-primary">{c.mail1 || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">{c.mail2 || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">{c.mail3 || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">{c.mail4 || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {contacts.length >= 200 && (
            <div className="border-t border-border bg-muted/30 px-4 py-2 text-center text-xs text-muted-foreground">
              Mostrando primeros 200 contactos
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BasePreviewPanel;
