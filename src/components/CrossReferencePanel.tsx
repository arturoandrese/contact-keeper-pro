import { useState, useCallback } from "react";
import { Upload, Loader2, Download, Info, ArrowLeft, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import ExportDropdown from "./ExportDropdown";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { CleanedContact } from "@/lib/contactCleaner";
import {
  parseEmailLog,
  crossReference,
  exportCrossReferenced,
  type CrossReferencedContact,
  type EmailLogEntry,
} from "@/lib/crossReference";
import { fetchSheetReport, fetchSheetTabs } from "@/lib/googleSheets";

interface CrossReferencePanelProps {
  baseId: string;
  baseName: string;
  sheetId?: string;
  onBack: () => void;
}

const chunkArray = <T,>(arr: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

const CONTACTS_PAGE_SIZE = 1000;

interface DbContactRow {
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

async function fetchAllContacts(baseId: string): Promise<DbContactRow[]> {
  const all: DbContactRow[] = [];

  for (let from = 0; ; from += CONTACTS_PAGE_SIZE) {
    const to = from + CONTACTS_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("contacts")
      .select("nombre, apellido, apellido2, empresa, web, mail1, mail2, mail3, mail4")
      .eq("base_id", baseId)
      .range(from, to);

    if (error) throw error;
    if (!data || data.length === 0) break;

    all.push(...(data as DbContactRow[]));

    if (data.length < CONTACTS_PAGE_SIZE) break;
  }

  return all;
}

const CrossReferencePanel = ({ baseId, baseName, sheetId, onBack }: CrossReferencePanelProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<CrossReferencedContact[] | null>(null);
  const [stats, setStats] = useState({ original: 0, filtered: 0, patterns: 0, delivered: 0 });

  const runCrossReference = useCallback(
    async (log: EmailLogEntry[]) => {
      setProcessing(true);
      try {
        const [dbContacts, baseResponse, savedPatternsRes] = await Promise.all([
          fetchAllContacts(baseId),
          supabase
            .from("bases")
            .select("crossed, crossed_at")
            .eq("id", baseId)
            .single(),
          supabase
            .from("domain_patterns")
            .select("domain, pattern, example_email"),
        ]);

        if (!dbContacts || dbContacts.length === 0) {
          toast.error("Error cargando contactos de la base");
          setProcessing(false);
          return;
        }

        if (baseResponse.error) {
          console.warn("No se pudo leer estado de cruce previo:", baseResponse.error.message);
        }

        const baseData = baseResponse.data;
        const savedPatterns = (savedPatternsRes.data || []).map((p: any) => ({
          domain: p.domain,
          pattern: p.pattern,
          example_email: p.example_email,
        }));

        const contacts: CleanedContact[] = dbContacts.map((c) => ({
          NOMBRE: c.nombre,
          APELLIDO: c.apellido,
          APELLIDO2: c.apellido2,
          EMPRESA: c.empresa,
          WEB: c.web,
          MAIL1: c.mail1,
          MAIL2: c.mail2,
          MAIL3: c.mail3,
          MAIL4: c.mail4,
        }));

        const { filtered, patterns, delivered } = crossReference(contacts, log, undefined, { onlyBounced: true, savedPatterns });

        if (patterns.length > 0) {
          const uniquePatterns = Array.from(
            new Map(patterns.map((p) => [`${p.domain}|${p.pattern}`, p])).values()
          );

          await Promise.all(
            chunkArray(uniquePatterns, 500).map((batch) =>
              supabase
                .from("domain_patterns")
                .upsert(
                  batch.map((p) => ({
                    domain: p.domain,
                    pattern: p.pattern,
                    example_email: p.example_email,
                    confidence: 1,
                  })),
                  { onConflict: "domain,pattern" }
                )
            )
          );
        }

        if (delivered.length > 0) {
          const deliveredMails = Array.from(new Set(delivered.map((d) => d.mail.toLowerCase())));
          const existingMap = new Map<string, { times_contacted: number; last_contacted_at: string; last_campaign?: string }>();

          const existingResponses = await Promise.all(
            chunkArray(deliveredMails, 300).map((mailChunk) =>
              supabase
                .from("delivered_contacts")
                .select("mail, times_contacted, last_contacted_at, last_campaign")
                .in("mail", mailChunk)
            )
          );

          for (const response of existingResponses) {
            for (const row of response.data || []) {
              existingMap.set((row.mail || "").toLowerCase(), {
                times_contacted: row.times_contacted || 0,
                last_contacted_at: row.last_contacted_at || "",
                last_campaign: (row as any).last_campaign || "",
              });
            }
          }

          const now = new Date().toISOString();
          const campaignKey = sheetId ? `${sheetId}:cross` : `base:${baseId}`;

          const deliveredPayload = delivered.map((d) => {
            const mail = d.mail.toLowerCase();
            const prev = existingMap.get(mail);
            const prevCampaign = prev?.last_campaign || "";
            const isNewCampaign = prevCampaign !== campaignKey;

            return {
              ...d,
              mail,
              times_contacted: isNewCampaign ? (prev?.times_contacted || 0) + 1 : (prev?.times_contacted || 1),
              last_contacted_at: now,
              last_campaign: campaignKey,
            };
          });

          await Promise.all(
            chunkArray(deliveredPayload, 500).map((batch) =>
              supabase
                .from("delivered_contacts")
                .upsert(batch as any, { onConflict: "mail" })
            )
          );
        }

        await supabase
          .from("bases")
          .update({ crossed: true, crossed_at: new Date().toISOString() } as any)
          .eq("id", baseId);

        setResults(filtered);
        setStats({ original: contacts.length, filtered: filtered.length, patterns: patterns.length, delivered: delivered.length });
        toast.success(`Cruce completado: ${filtered.length} rebotados corregidos, ${delivered.length} enviados registrados`);
      } catch (err) {
        toast.error("Error procesando cruce");
        console.error(err);
      }
      setProcessing(false);
    },
    [baseId]
  );

  const processFile = useCallback(
    async (file: File) => {
      const buffer = await file.arrayBuffer();
      const log = parseEmailLog(buffer);
      await runCrossReference(log);
    },
    [runCrossReference]
  );

  const processLiveReport = useCallback(async () => {
    if (!sheetId) return;
    setProcessing(true);
    try {
      const tabs = await fetchSheetTabs(sheetId);
      if (tabs.length === 0) {
        toast.error("No se encontraron pestañas en el Google Sheet");
        setProcessing(false);
        return;
      }

      const tabName = tabs[tabs.length - 1].title;
      const sheetData = await fetchSheetReport(sheetId, tabName);

      const log: EmailLogEntry[] = sheetData.contacts.map((c) => ({
        NOMBRE: c["NOMBRE"] || c["First Name"] || c["nombre"] || "",
        APELLIDO: c["APELLIDO"] || c["Last Name"] || c["apellido"] || "",
        EMPRESA: c["EMPRESA"] || c["Company"] || c["empresa"] || "",
        WEB: c["WEB"] || c["Website"] || c["web"] || "",
        MAIL1: c["MAIL1"] || c["Email Address"] || c["email"] || c["mail"] || "",
        MAIL2: c["MAIL2"] || c["email2"] || "",
        status: c._status || "",
      }));

      toast.info(`📊 Cruzando solo rebotados de "${tabName}" (${log.length} filas)`);
      await runCrossReference(log);
    } catch (err: any) {
      toast.error("Error obteniendo reporte en vivo: " + (err.message || ""));
      console.error(err);
      setProcessing(false);
    }
  }, [sheetId, runCrossReference]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const columns: (keyof CrossReferencedContact)[] = [
    "NOMBRE", "APELLIDO", "EMPRESA_SHORT", "WEB", "MAIL_ORIGINAL", "MAIL1",
  ];

  const columnLabels: Record<string, string> = {
    NOMBRE: "NOMBRE",
    APELLIDO: "APELLIDO",
    EMPRESA_SHORT: "EMPRESA",
    WEB: "WEB",
    MAIL_ORIGINAL: "MAIL ORIGINAL",
    MAIL1: "MAIL CORREGIDO",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={onBack} className="mb-2">
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
            Volver a BBD
          </Button>
          <h2 className="font-display text-2xl font-bold">Cruzar: {baseName}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cruza solo rebotados y propone mail corregido por contacto
          </p>
        </div>
        {results && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => {
              const headers = ["NOMBRE", "APELLIDO", "EMPRESA", "WEB", "MAIL ORIGINAL", "MAIL CORREGIDO"];
              const rows = results.map(r => [r.NOMBRE, r.APELLIDO, r.EMPRESA_SHORT, r.WEB, r.MAIL_ORIGINAL, r.MAIL1].join("\t"));
              const tsv = [headers.join("\t"), ...rows].join("\n");
              navigator.clipboard.writeText(tsv).then(() => {
                toast.success("📋 Copiado. Pega en una pestaña nueva de Google Sheets (Ctrl+V)");
              }).catch(() => toast.error("No se pudo copiar"));
            }}>
              <ClipboardCopy className="mr-1.5 h-3.5 w-3.5" />
              Copiar para Sheets
            </Button>
            <Button size="sm" onClick={() => exportCrossReferenced(results)}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Exportar XLSX
            </Button>
          </div>
        )}
      </div>

      {!results && !processing && (
        <div className="space-y-4">
          {sheetId && (
            <button
              onClick={processLiveReport}
              className="w-full rounded-2xl border-2 border-primary/30 bg-primary/5 p-8 text-center transition-all duration-300 hover:scale-[1.01] hover:border-primary hover:bg-primary/10"
            >
              <div className="flex flex-col items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/20">
                  <BarChart3 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-lg font-semibold">Cruzar con reporte en vivo</p>
                  <p className="text-sm text-muted-foreground">
                    Usa Google Sheets (YAMM) y trae solo rebotados a corregir
                  </p>
                </div>
              </div>
            </button>
          )}

          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            className={`relative cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-300 ${
              isDragging
                ? "border-primary bg-primary/5 scale-[1.02]"
                : "border-border hover:border-primary/50 hover:bg-muted/50"
            }`}
          >
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) processFile(file);
              }}
            />
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                <Upload className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-lg font-semibold">O arrastra tu reporte de email (XLSX)</p>
                <p className="text-sm text-muted-foreground">
                  Archivo con columnas: MAIL1, Merge status
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {processing && !results && (
        <div className="flex flex-col items-center gap-4 py-16">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-lg font-semibold">Procesando cruce…</p>
          <p className="text-sm text-muted-foreground">
            Detectando rebotados y buscando mails alternativos válidos…
          </p>
        </div>
      )}

      {results && (
        <>
          <div className="flex flex-wrap gap-4">
            {[
              { label: "En la base", value: stats.original },
              { label: "Enviados", value: stats.delivered, highlight: true },
              { label: "Rebotados corregidos", value: stats.filtered },
              { label: "Sin corrección", value: stats.original - stats.filtered },
              { label: "Patrones aprendidos", value: stats.patterns },
            ].map((stat) => (
              <div key={stat.label} className={`rounded-xl border px-5 py-3 ${stat.highlight ? "border-primary/50 bg-primary/5" : "border-border bg-card"}`}>
                <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
                <p className={`font-display text-2xl font-bold ${stat.highlight ? "text-primary" : ""}`}>{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-xs text-muted-foreground">
              Este cruce devuelve solo contactos rebotados con un mail alternativo corporativo válido.
            </p>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/60">
                    {columns.map((col) => (
                      <th key={col} className="whitespace-nowrap px-4 py-3 text-left font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {columnLabels[col] || col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.slice(0, 100).map((contact, i) => (
                    <tr key={i} className="border-b border-border/50 transition-colors hover:bg-muted/30">
                      {columns.map((col) => (
                        <td key={col} className="max-w-[200px] truncate whitespace-nowrap px-4 py-2.5 font-mono text-xs">
                          {contact[col] || <span className="text-muted-foreground/40">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {results.length > 100 && (
              <div className="border-t border-border bg-muted/30 px-4 py-2 text-center text-xs text-muted-foreground">
                Mostrando 100 de {results.length} contactos
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default CrossReferencePanel;
