import { useState, useCallback } from "react";
import { Upload, Loader2, Download, Info, ArrowLeft, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { CleanedContact } from "@/lib/contactCleaner";
import {
  parseEmailLog,
  crossReference,
  exportCrossReferenced,
  hashEmailLog,
  type CrossReferencedContact,
  type ExistingDelivered,
  type EmailLogEntry,
} from "@/lib/crossReference";
import { fetchSheetReport, fetchSheetTabs, type SheetTab } from "@/lib/googleSheets";

interface CrossReferencePanelProps {
  baseId: string;
  baseName: string;
  sheetId?: string;
  onBack: () => void;
}

const CrossReferencePanel = ({ baseId, baseName, sheetId, onBack }: CrossReferencePanelProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<CrossReferencedContact[] | null>(null);
  const [stats, setStats] = useState({ original: 0, filtered: 0, patterns: 0 });

  const runCrossReference = useCallback(
    async (log: EmailLogEntry[]) => {
      setProcessing(true);
      try {
        const { data: dbContacts, error } = await supabase
          .from("contacts")
          .select("*")
          .eq("base_id", baseId);

        if (error || !dbContacts) {
          toast.error("Error cargando contactos de la base");
          setProcessing(false);
          return;
        }

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

        const { data: baseData } = await supabase
          .from("bases")
          .select("crossed, crossed_at")
          .eq("id", baseId)
          .single();

        const allDelivered: ExistingDelivered[] = [];
        let offset = 0;
        while (true) {
          const { data: batch } = await supabase
            .from("delivered_contacts")
            .select("mail, times_contacted, last_contacted_at, status")
            .range(offset, offset + 999);
          if (!batch || batch.length === 0) break;
          allDelivered.push(...batch);
          if (batch.length < 1000) break;
          offset += 1000;
        }

        const { filtered, patterns, delivered } = crossReference(contacts, log, allDelivered);

        if (filtered.length > 0) {
          for (const f of filtered) {
            if (f.EMPRESA_SHORT) {
              await supabase
                .from("contacts")
                .update({ empresa: f.EMPRESA_SHORT })
                .eq("base_id", baseId)
                .eq("mail1", f.MAIL1);
            }
          }
        }

        if (patterns.length > 0) {
          for (let i = 0; i < patterns.length; i += 500) {
            const batch = patterns.slice(i, i + 500).map(p => ({
              domain: p.domain, pattern: p.pattern, example_email: p.example_email, confidence: 1
            }));
            try {
              await supabase
                .from("domain_patterns")
                .upsert(batch, { onConflict: "domain,pattern" });
            } catch {}
          }
        }

        if (delivered.length > 0) {
          const existingMap = new Map<string, { times_contacted: number; last_contacted_at: string }>();
          for (const e of allDelivered) {
            existingMap.set(e.mail, { times_contacted: e.times_contacted, last_contacted_at: e.last_contacted_at });
          }

          const now = new Date().toISOString();
          const isDuplicate = baseData?.crossed === true;

          for (let i = 0; i < delivered.length; i += 500) {
            const batch = delivered.slice(i, i + 500).map((d) => {
              const prev = existingMap.get(d.mail);
              if (isDuplicate && prev) {
                return { ...d, times_contacted: prev.times_contacted, last_contacted_at: prev.last_contacted_at };
              }
              return { ...d, times_contacted: (prev?.times_contacted || 0) + 1, last_contacted_at: now };
            });
            await supabase
              .from("delivered_contacts")
              .upsert(batch as any, { onConflict: "mail" });
          }
        }

        await supabase
          .from("bases")
          .update({ crossed: true, crossed_at: new Date().toISOString() } as any)
          .eq("id", baseId);

        setResults(filtered);
        setStats({ original: contacts.length, filtered: filtered.length, patterns: patterns.length });
        toast.success(`Cruce completado: ${filtered.length} contactos válidos`);
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
      // Fetch tabs and let user pick, or auto-pick last
      const tabs = await fetchSheetTabs(sheetId);
      if (tabs.length === 0) {
        toast.error("No se encontraron pestañas en el Google Sheet");
        setProcessing(false);
        return;
      }

      // Use last tab by default
      const tabName = tabs[tabs.length - 1].title;
      const sheetData = await fetchSheetReport(sheetId, tabName);

      // Convert sheet contacts to EmailLogEntry format
      const log: EmailLogEntry[] = sheetData.contacts.map((c) => ({
        NOMBRE: c["NOMBRE"] || c["First Name"] || c["nombre"] || "",
        APELLIDO: c["APELLIDO"] || c["Last Name"] || c["apellido"] || "",
        EMPRESA: c["EMPRESA"] || c["Company"] || c["empresa"] || "",
        WEB: c["WEB"] || c["Website"] || c["web"] || "",
        MAIL1: c["MAIL1"] || c["Email Address"] || c["email"] || c["mail"] || "",
        MAIL2: c["MAIL2"] || c["email2"] || "",
        status: c._status || "",
      }));

      toast.info(`📊 Cruzando con pestaña "${tabName}" (${log.length} contactos)`);
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
    "NOMBRE", "APELLIDO", "APELLIDO2", "EMPRESA_SHORT", "WEB", "MAIL1",
  ];

  const columnLabels: Record<string, string> = {
    NOMBRE: "NOMBRE",
    APELLIDO: "APELLIDO",
    APELLIDO2: "APELLIDO2",
    EMPRESA_SHORT: "EMPRESA",
    WEB: "WEB",
    MAIL1: "MAIL1",
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
          <p className="text-sm text-muted-foreground mt-1">
            Sube tu reporte de email (XLSX) para filtrar rebotes y ya contactados
          </p>
        </div>
        {results && (
          <Button size="sm" onClick={() => exportCrossReferenced(results)}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Exportar filtrados
          </Button>
        )}
      </div>

      {!results && (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={`relative cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition-all duration-300 ${
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
          <div className="flex flex-col items-center gap-4">
            {processing ? (
              <>
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-lg font-semibold">Procesando cruce…</p>
                <p className="text-sm text-muted-foreground">
                  Verificando contactos previos, cooldown de 15 días…
                </p>
              </>
            ) : (
              <>
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                  <Upload className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <p className="text-lg font-semibold">Arrastra tu reporte de email (XLSX)</p>
                  <p className="text-sm text-muted-foreground">
                    Archivo con columnas: MAIL1, Merge status
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {results && (
        <>
          <div className="flex flex-wrap gap-4">
            {[
              { label: "En la base", value: stats.original },
              { label: "Después del cruce", value: stats.filtered },
              { label: "Eliminados", value: stats.original - stats.filtered },
              { label: "Patrones aprendidos", value: stats.patterns },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border border-border bg-card px-5 py-3">
                <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
                <p className="font-display text-2xl font-bold">{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 flex items-start gap-2">
            <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              Contactos con menos de 15 días desde último contacto fueron excluidos. Si la base ya fue cruzada antes, no se duplicó el contador.
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
