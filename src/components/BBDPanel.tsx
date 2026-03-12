import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Trash2, CheckCircle2, Circle, Loader2, Pencil, Check, X, ClipboardCopy } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import * as XLSX from "xlsx";
import { fetchSheetReport, fetchSheetTabs } from "@/lib/googleSheets";
import { extractCompanyFromDomain } from "@/lib/companyName";

interface Base {
  id: string;
  name: string;
  raw_count: number;
  clean_count: number;
  crossed: boolean;
  crossed_at: string | null;
  created_at: string;
  sheet_id?: string | null;
}

interface BBDPanelProps {
  onSelectBase: (baseId: string, baseName: string, crossed: boolean) => void;
}

const BBDPanel = ({ onSelectBase }: BBDPanelProps) => {
  const [bases, setBases] = useState<Base[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchBases = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("bases")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching bases:", error);
      toast.error("Error cargando bases: " + error.message);
    } else {
      setBases((data as Base[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchBases();
  }, []);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const startRename = (base: Base, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(base.id);
    setEditName(base.name);
  };

  const confirmRename = async (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (!editingId || !editName.trim()) return;
    const { error } = await supabase
      .from("bases")
      .update({ name: editName.trim() })
      .eq("id", editingId);

    if (error) {
      toast.error("Error renombrando base");
    } else {
      setBases((prev) =>
        prev.map((b) => (b.id === editingId ? { ...b, name: editName.trim() } : b))
      );
      toast.success("Base renombrada");
    }
    setEditingId(null);
  };

  const cancelRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await supabase.from("contacts").delete().eq("base_id", id);
    const { error } = await supabase.from("bases").delete().eq("id", id);
    if (error) {
      toast.error("Error eliminando base");
    } else {
      setBases((prev) => prev.filter((b) => b.id !== id));
      toast.success("Base eliminada");
    }
  };

  const handleCopyCrossed = async (base: Base, e: React.MouseEvent) => {
    e.stopPropagation();
    setExporting(base.id);
    try {
      if (!base.sheet_id) { toast.error("Sin Google Sheet asociado"); return; }
      const tabs = await fetchSheetTabs(base.sheet_id);
      if (tabs.length === 0) { toast.error("Sin pestañas"); return; }
      const tabName = tabs[tabs.length - 1].title;
      const sheetData = await fetchSheetReport(base.sheet_id, tabName);

      const domainPatterns = new Map<string, Map<string, number>>();
      const bouncedEntries: Array<{ nombre: string; apellido: string; apellido2: string; empresa: string; web: string; mail1: string; mail2: string }> = [];

      for (const c of sheetData.contacts) {
        const nombre = (c["NOMBRE"] || "").toString().trim();
        const apellido = (c["APELLIDO"] || "").toString().trim();
        const apellido2 = (c["APELLIDO2"] || "").toString().trim();
        const web = (c["WEB"] || "").toString().trim();
        const rawEmpresa = (c["EMPRESA"] || "").toString().trim();
        const empresa = web ? extractCompanyFromDomain(web) || rawEmpresa.toUpperCase() : rawEmpresa.toUpperCase();
        const mail1 = (c["MAIL1"] || "").toString().toLowerCase().trim();
        const mail2 = (c["MAIL2"] || "").toString().toLowerCase().trim();
        const status = ((c._status || "").toString().trim().toUpperCase());

        if (status.includes("BOUNCE")) {
          bouncedEntries.push({ nombre, apellido, apellido2, empresa, web, mail1, mail2 });
        } else if (mail1 && mail1.includes("@")) {
          const domain = mail1.split("@")[1];
          if (domain && !["gmail.com","hotmail.com","outlook.com","yahoo.com"].includes(domain)) {
            const local = mail1.split("@")[0];
            const n = nombre.toLowerCase(); const a = apellido.toLowerCase();
            let pat = "";
            if (local === `${n}.${a}`) pat = "first.last";
            else if (local === `${n[0]}${a}`) pat = "initial_last";
            if (pat) { const m = domainPatterns.get(domain) || new Map(); m.set(pat, (m.get(pat) || 0) + 1); domainPatterns.set(domain, m); }
          }
        }
      }

      const bestPatterns = new Map<string, string>();
      for (const [domain, pats] of domainPatterns) {
        let best = ""; let bestCount = 0;
        for (const [p, c] of pats) { if (c > bestCount) { best = p; bestCount = c; } }
        if (best) bestPatterns.set(domain, best);
      }

      const tsvRows = ["NOMBRE\tAPELLIDO\tAPELLIDO2\tEMPRESA\tWEB\tMAIL_CORREGIDO"];
      for (const b of bouncedEntries) {
        const domain = b.mail1.split("@")[1] || b.web?.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "") || "";
        if (!domain) continue;
        let corrected = "";
        if (b.mail2 && b.mail2.includes("@") && !["gmail.com","hotmail.com","outlook.com","yahoo.com"].includes(b.mail2.split("@")[1])) corrected = b.mail2;
        if (!corrected) {
          const pat = bestPatterns.get(domain);
          if (pat && b.nombre && b.apellido) {
            const n = b.nombre.toLowerCase(); const a = b.apellido.toLowerCase();
            if (pat === "first.last") corrected = `${n}.${a}@${domain}`;
            else if (pat === "initial_last") corrected = `${n[0]}${a}@${domain}`;
          }
        }
        if (!corrected || corrected === b.mail1) continue;
        tsvRows.push(`${b.nombre}\t${b.apellido}\t${b.apellido2}\t${b.empresa}\t${b.web}\t${corrected}`);
      }

      if (tsvRows.length <= 1) { toast.error("No hay correcciones para copiar"); return; }
      await navigator.clipboard.writeText(tsvRows.join("\n"));
      toast.success(`${tsvRows.length - 1} contactos copiados — pega en Google Sheets con Ctrl+V`);
    } catch (err: any) {
      toast.error("Error: " + (err?.message || "desconocido"));
    } finally {
      setExporting(null);
    }
  };

  const doDownload = async (base: Base, type: "clean" | "crossed", fmt: "xlsx" | "csv", e: React.MouseEvent) => {
    e.stopPropagation();
    setExporting(base.id);
    try {
      const fetchAllBaseContacts = async () => {
        const all: Array<{
          nombre: string;
          apellido: string;
          apellido2: string;
          empresa: string;
          web: string;
          mail1: string;
          mail2: string;
          mail3: string;
          mail4: string;
        }> = [];

        const pageSize = 1000;
        for (let from = 0; ; from += pageSize) {
          const to = from + pageSize - 1;
          const { data, error } = await supabase
            .from("contacts")
            .select("nombre, apellido, apellido2, empresa, web, mail1, mail2, mail3, mail4")
            .eq("base_id", base.id)
            .range(from, to);

          if (error) throw error;
          if (!data || data.length === 0) break;

          all.push(...(data as any[]));

          if (data.length < pageSize) break;
        }

        return all;
      };

      const data = await fetchAllBaseContacts();
      if (!data || data.length === 0) {
        toast.error("No hay contactos para descargar");
        return;
      }

      
      let rows: Record<string, string>[];

      if (type === "crossed") {
        if (!base.sheet_id) {
          toast.error("Esta base no tiene Google Sheet asociado para recalcular el cruce");
          return;
        }

        const tabs = await fetchSheetTabs(base.sheet_id);
        if (tabs.length === 0) {
          toast.error("No se encontraron pestañas en el Google Sheet");
          return;
        }

        const tabName = tabs[tabs.length - 1].title;
        const sheetData = await fetchSheetReport(base.sheet_id, tabName);
        
        // Build pattern map from delivered emails in the sheet
        const domainPatterns = new Map<string, Map<string, number>>();
        const bouncedEntries: Array<{
          nombre: string; apellido: string; apellido2: string;
          empresa: string; web: string; mail1: string; mail2: string;
        }> = [];

        for (const c of sheetData.contacts) {
          const nombre = (c["NOMBRE"] || c["First Name"] || "").toString().trim();
          const apellido = (c["APELLIDO"] || c["Last Name"] || "").toString().trim();
          const apellido2 = (c["APELLIDO2"] || "").toString().trim();
          const web = (c["WEB"] || c["Website"] || "").toString().trim();
          const rawEmpresa = (c["EMPRESA"] || c["Company"] || "").toString().trim();
          const empresa = web ? extractCompanyFromDomain(web) || rawEmpresa.toUpperCase() : rawEmpresa.toUpperCase();
          const mail1 = (c["MAIL1"] || c["Email Address"] || "").toString().toLowerCase().trim();
          const mail2 = (c["MAIL2"] || "").toString().toLowerCase().trim();
          const status = ((c._status || "").toString().trim().toUpperCase());

          if (status.includes("BOUNCE")) {
            bouncedEntries.push({ nombre, apellido, apellido2, empresa, web, mail1, mail2 });
          } else if (mail1 && mail1.includes("@")) {
            // Learn pattern from delivered emails
            const domain = mail1.split("@")[1];
            if (domain && !["gmail.com","hotmail.com","outlook.com","yahoo.com"].includes(domain)) {
              const local = mail1.split("@")[0];
              const n = nombre.toLowerCase();
              const a = apellido.toLowerCase();
              let pat = "";
              if (local === `${n}.${a}`) pat = "first.last";
              else if (local === `${n[0]}${a}`) pat = "initial_last";
              if (pat) {
                const m = domainPatterns.get(domain) || new Map<string, number>();
                m.set(pat, (m.get(pat) || 0) + 1);
                domainPatterns.set(domain, m);
              }
            }
          }
        }

        // Pick best pattern per domain
        const bestPatterns = new Map<string, string>();
        for (const [domain, pats] of domainPatterns) {
          let best = ""; let bestCount = 0;
          for (const [p, c] of pats) { if (c > bestCount) { best = p; bestCount = c; } }
          if (best) bestPatterns.set(domain, best);
        }

        // Generate corrections for bounced
        rows = [];
        for (const b of bouncedEntries) {
          const domain = b.mail1.split("@")[1] || b.web?.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "") || "";
          if (!domain) continue;

          // Try MAIL2 if corporate
          let corrected = "";
          if (b.mail2 && b.mail2.includes("@") && !["gmail.com","hotmail.com","outlook.com","yahoo.com"].includes(b.mail2.split("@")[1])) {
            corrected = b.mail2;
          }

          // If no valid MAIL2, generate from pattern
          if (!corrected) {
            const pat = bestPatterns.get(domain);
            if (pat && b.nombre && b.apellido) {
              const n = b.nombre.toLowerCase();
              const a = b.apellido.toLowerCase();
              if (pat === "first.last") corrected = `${n}.${a}@${domain}`;
              else if (pat === "initial_last") corrected = `${n[0]}${a}@${domain}`;
            }
          }

          if (!corrected || corrected === b.mail1) continue;

          rows.push({
            NOMBRE: b.nombre,
            APELLIDO: b.apellido,
            APELLIDO2: b.apellido2,
            EMPRESA: b.empresa,
            WEB: b.web,
            MAIL_CORREGIDO: corrected,
          });
        }

        if (rows.length === 0) {
          toast.error("No se generaron correcciones en esta base cruzada");
          return;
        }

        toast.success(`Descarga cruzada lista: ${rows.length} bounced con mail corregido`);
      } else {
        rows = data.map((c) => ({
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
      }

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Contactos");
      const suffix = type === "crossed" ? "_cruzada" : "_limpia";

      if (fmt === "csv") {
        const csv = XLSX.utils.sheet_to_csv(ws);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${base.name}${suffix}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        XLSX.writeFile(wb, `${base.name}${suffix}.xlsx`);
      }
    } catch (error: any) {
      console.error("Error exportando base:", error);
      toast.error("Error exportando base: " + (error?.message || "desconocido"));
    } finally {
      setExporting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold">BBD — Bases de Datos</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Tus bases subidas. Pincha una para verla o cruzarla.
        </p>
      </div>

      {bases.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <p className="font-semibold">Sin bases aún</p>
          <p className="text-sm text-muted-foreground mt-1">
            Sube un CSV o Excel desde la pantalla principal para empezar.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {bases.map((base) => (
            <div
              key={base.id}
              onClick={() => editingId !== base.id && onSelectBase(base.id, base.name, base.crossed)}
              className="flex items-center justify-between rounded-xl border border-border bg-card px-5 py-4 cursor-pointer transition-all hover:shadow-md hover:border-primary/30"
            >
              <div className="flex items-center gap-4 min-w-0 flex-1">
                {base.crossed ? (
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground/40 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  {editingId === base.id ? (
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <Input
                        ref={inputRef}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") confirmRename(e);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="h-8 text-sm font-semibold"
                      />
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-primary" onClick={confirmRename}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={cancelRename}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="font-display font-semibold truncate">{base.name}</p>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={(e) => startRename(base, e)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-muted-foreground">
                      {base.clean_count} contactos
                    </span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(base.created_at), "d MMM yyyy", { locale: es })}
                    </span>
                    {base.crossed && (
                      <>
                        <span className="text-xs text-muted-foreground">·</span>
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-xs font-medium text-primary cursor-help">✓ Cruzada</span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs space-y-1">
                              <p><strong>Creada:</strong> {format(new Date(base.created_at), "d MMM yyyy, HH:mm", { locale: es })}</p>
                              {base.crossed_at && (
                                <p><strong>Cruzada:</strong> {format(new Date(base.crossed_at), "d MMM yyyy, HH:mm", { locale: es })}</p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap justify-end ml-4">
                <Button variant="outline" size="sm" onClick={(e) => doDownload(base, "clean", "xlsx", e)} disabled={exporting === base.id} className="text-xs">
                  {exporting === base.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}
                  XLSX
                </Button>
                <Button variant="outline" size="sm" onClick={(e) => doDownload(base, "clean", "csv", e)} disabled={exporting === base.id} className="text-xs">
                  {exporting === base.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}
                  CSV
                </Button>
                {base.crossed && (
                  <>
                    <Button variant="outline" size="sm" onClick={(e) => doDownload(base, "crossed", "xlsx", e)} disabled={exporting === base.id} className="text-xs">
                      {exporting === base.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}
                      Cruzada
                    </Button>
                    <Button variant="outline" size="sm" onClick={(e) => handleCopyCrossed(base, e)} disabled={exporting === base.id} className="text-xs">
                      {exporting === base.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <ClipboardCopy className="mr-1 h-3.5 w-3.5" />}
                      Pegar
                    </Button>
                  </>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={(e) => handleDelete(base.id, e)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BBDPanel;
