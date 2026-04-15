import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Trash2, CheckCircle2, Circle, Loader2, Pencil, Check, X, MailCheck, ChevronDown, GripVertical } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [dragSourceId, setDragSourceId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [deduping, setDeduping] = useState(false);

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

  const handleDeleteClick = (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTarget({ id, name });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    setDeleteTarget(null);
    await supabase.from("contacts").delete().eq("base_id", id);
    const { error } = await supabase.from("bases").delete().eq("id", id);
    if (error) {
      toast.error("Error eliminando base");
    } else {
      setBases((prev) => prev.filter((b) => b.id !== id));
      toast.success("Base eliminada");
    }
  };

  const getCrossedData = async (base: Base): Promise<string[][] | null> => {
    if (!base.sheet_id) { toast.error("Sin Google Sheet asociado"); return null; }
    const tabs = await fetchSheetTabs(base.sheet_id);
    if (tabs.length === 0) { toast.error("Sin pestañas"); return null; }
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

    const rows: string[][] = [];
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
      rows.push([b.nombre, b.apellido, b.apellido2, b.empresa, b.web, corrected]);
    }

    if (rows.length === 0) {
      const fallbackRows: string[][] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const to = from + pageSize - 1;
        const { data, error } = await supabase
          .from("contacts")
          .select("nombre, apellido, apellido2, empresa, web, mail1")
          .eq("base_id", base.id)
          .range(from, to);

        if (error) throw error;
        if (!data || data.length === 0) break;

        for (const c of data as Array<any>) {
          fallbackRows.push([
            c.nombre || "",
            c.apellido || "",
            c.apellido2 || "",
            c.empresa || "",
            c.web || "",
            c.mail1 || "",
          ]);
        }

        if (data.length < pageSize) break;
      }

      if (fallbackRows.length === 0) {
        toast.error("No hay contactos para exportar en esta base");
        return null;
      }

      toast.info("No hubo correcciones: exportando base con MAIL1 actual");
      return fallbackRows;
    }

    return rows;
  };

  const handleCrossedAction = async (base: Base, mode: "xlsx" | "copy", e: React.MouseEvent) => {
    e.stopPropagation();
    setExporting(base.id);
    try {
      const rows = await getCrossedData(base);
      if (!rows) return;
      const headers = ["NOMBRE", "APELLIDO", "APELLIDO2", "EMPRESA", "WEB", "MAIL_CORREGIDO"];
      if (mode === "copy") {
        const tsv = [headers.join("\t"), ...rows.map(r => r.join("\t"))].join("\n");
        await navigator.clipboard.writeText(tsv);
        toast.success(`📋 ${rows.length} contactos copiados — pega en Google Sheets`);
      } else {
        const data = rows.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Cruzada");
        XLSX.writeFile(wb, `${base.name}_cruzada.xlsx`);
        toast.success(`${rows.length} contactos descargados`);
      }
    } catch (err: any) {
      toast.error("Error: " + (err?.message || "desconocido"));
    } finally {
      setExporting(null);
    }
  };

  const handleGoodEmailsAction = async (base: Base, mode: "xlsx" | "copy", e: React.MouseEvent) => {
    e.stopPropagation();
    if (!base.sheet_id) { toast.error("Sin Google Sheet asociado"); return; }
    setExporting(base.id);
    try {
      const tabs = await fetchSheetTabs(base.sheet_id);
      if (tabs.length === 0) { toast.error("Sin pestañas"); return; }

      const GOOD_EXACT = new Set(["EMAIL_SENT", "EMAIL_DELIVERED", "EMAIL_OPENED", "EMAIL_CLICKED", "SENT", "DELIVERED", "OPENED", "CLICKED", "MAIL_MERGE_COMPLETE", "RESPONDED"]);

      const allSheetData = await Promise.all(
        tabs.map((tab) => fetchSheetReport(base.sheet_id!, tab.title))
      );

      const seenEmails = new Set<string>();
      const allGoodContacts: Array<{ contact: Record<string, string>; tabIndex: number }> = [];

      for (let ti = 0; ti < allSheetData.length; ti++) {
        for (const c of allSheetData[ti].contacts) {
          const raw = (c._status || "").toString().replace(/\s+/g, "_").toUpperCase().trim();
          if (!GOOD_EXACT.has(raw)) continue;
          const mail = (c["Email Address"] || c["MAIL_CORREGIDO"] || c["MAIL1"] || c["email"] || "").toString().toLowerCase().trim();
          if (!mail || !mail.includes("@") || seenEmails.has(mail)) continue;
          seenEmails.add(mail);
          allGoodContacts.push({ contact: c, tabIndex: ti });
        }
      }

      if (allGoodContacts.length === 0) { toast.error("No hay mails buenos en esta base"); return; }

      const rows = allGoodContacts.map(({ contact: c, tabIndex }) => ({
        NOMBRE: (c["NOMBRE"] || c["First Name"] || "").toString().trim(),
        APELLIDO: (c["APELLIDO"] || c["Last Name"] || "").toString().trim(),
        EMPRESA: (c["EMPRESA"] || c["Company"] || "").toString().trim(),
        WEB: (c["WEB"] || c["Website"] || "").toString().trim(),
        MAIL: (c["Email Address"] || c["MAIL_CORREGIDO"] || c["MAIL1"] || c["email"] || "").toString().toLowerCase().trim(),
        MAIL2: (c["MAIL2"] || "").toString().trim(),
        ESTADO: (c._status || "").toString().trim(),
        PESTAÑA: tabs[tabIndex]?.title || "",
      }));

      if (mode === "copy") {
        const headers = ["NOMBRE", "APELLIDO", "EMPRESA", "WEB", "MAIL", "MAIL2", "ESTADO", "PESTAÑA"];
        const tsv = [headers.join("\t"), ...rows.map(r => Object.values(r).join("\t"))].join("\n");
        await navigator.clipboard.writeText(tsv);
        toast.success(`📋 ${rows.length} mails buenos copiados`);
      } else {
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Mails Buenos");
        XLSX.writeFile(wb, `${base.name}_mails_buenos.xlsx`);
        toast.success(`${rows.length} mails buenos descargados`);
      }
    } catch (err: any) {
      toast.error("Error: " + (err?.message || "desconocido"));
    } finally {
      setExporting(null);
    }
  };

  const handleCleanAction = async (base: Base, mode: "xlsx" | "csv" | "copy", e: React.MouseEvent) => {
    e.stopPropagation();
    setExporting(base.id);
    try {
      const fetchAllBaseContacts = async () => {
        const all: Array<{
          nombre: string; apellido: string; apellido2: string;
          empresa: string; web: string; mail1: string; mail2: string; mail3: string; mail4: string;
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
      if (!data || data.length === 0) { toast.error("No hay contactos para descargar"); return; }

      const rows = data.map((c) => ({
        NOMBRE: c.nombre, APELLIDO: c.apellido, APELLIDO2: c.apellido2,
        EMPRESA: c.empresa, WEB: c.web, MAIL1: c.mail1, MAIL2: c.mail2, MAIL3: c.mail3, MAIL4: c.mail4,
      }));

      if (mode === "copy") {
        const headers = ["NOMBRE", "APELLIDO", "APELLIDO2", "EMPRESA", "WEB", "MAIL1", "MAIL2", "MAIL3", "MAIL4"];
        const tsv = [headers.join("\t"), ...rows.map(r => Object.values(r).join("\t"))].join("\n");
        await navigator.clipboard.writeText(tsv);
        toast.success(`📋 ${rows.length} contactos copiados`);
      } else {
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Contactos");
        if (mode === "csv") {
          const csv = XLSX.utils.sheet_to_csv(ws);
          const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = `${base.name}_limpia.csv`; a.click();
          URL.revokeObjectURL(url);
        } else {
          XLSX.writeFile(wb, `${base.name}_limpia.xlsx`);
        }
        toast.success(`${rows.length} contactos descargados`);
      }
    } catch (error: any) {
      toast.error("Error exportando: " + (error?.message || "desconocido"));
    } finally {
      setExporting(null);
    }
  };

  // --- Drag & Drop base-to-base dedup ---
  const handleDragStart = useCallback((baseId: string) => {
    setDragSourceId(baseId);
  }, []);

  const [dragOverAll, setDragOverAll] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent, baseId: string) => {
    e.preventDefault();
    if (baseId !== dragSourceId) setDragOverId(baseId);
  }, [dragSourceId]);

  const handleDragLeave = useCallback(() => {
    setDragOverId(null);
  }, []);

  const handleDropAll = useCallback(async () => {
    const sourceId = dragSourceId;
    setDragSourceId(null);
    setDragOverAll(false);
    if (!sourceId) return;

    const sourceBase = bases.find(b => b.id === sourceId);
    if (!sourceBase) return;

    const otherBases = bases.filter(b => b.id !== sourceId);
    if (otherBases.length === 0) { toast.info("No hay otras bases contra las que deduplicar"); return; }

    setDeduping(true);
    const toastId = toast.loading(`Deduplicando "${sourceBase.name}" contra ${otherBases.length} bases…`);

    try {
      // 1. Collect all emails from ALL other bases
      const allEmails = new Set<string>();
      const pageSize = 1000;
      for (const other of otherBases) {
        for (let from = 0; ; from += pageSize) {
          const { data, error } = await supabase
            .from("contacts")
            .select("mail1, mail2, mail3, mail4")
            .eq("base_id", other.id)
            .range(from, from + pageSize - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          for (const c of data as any[]) {
            [c.mail1, c.mail2, c.mail3, c.mail4].forEach((m: string) => {
              if (m) allEmails.add(m.toLowerCase().trim());
            });
          }
          if (data.length < pageSize) break;
        }
      }

      // 2. Find duplicates in source
      const duplicateIds: string[] = [];
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("contacts")
          .select("id, mail1, mail2, mail3, mail4")
          .eq("base_id", sourceId)
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        for (const c of data as any[]) {
          const mails = [c.mail1, c.mail2, c.mail3, c.mail4].filter(Boolean).map((m: string) => m.toLowerCase().trim());
          if (mails.some(m => allEmails.has(m))) {
            duplicateIds.push(c.id);
          }
        }
        if (data.length < pageSize) break;
      }

      if (duplicateIds.length === 0) {
        toast.success("No hay duplicados contra ninguna base 👍", { id: toastId });
        setDeduping(false);
        return;
      }

      // 3. Delete in batches
      const batchSize = 500;
      for (let i = 0; i < duplicateIds.length; i += batchSize) {
        const batch = duplicateIds.slice(i, i + batchSize);
        const { error } = await supabase.from("contacts").delete().in("id", batch);
        if (error) throw error;
      }

      // 4. Update clean_count
      const newCount = (sourceBase.clean_count || 0) - duplicateIds.length;
      await supabase.from("bases").update({ clean_count: Math.max(0, newCount) }).eq("id", sourceId);
      setBases(prev => prev.map(b => b.id === sourceId ? { ...b, clean_count: Math.max(0, newCount) } : b));

      toast.success(`🗑️ ${duplicateIds.length} duplicados eliminados de "${sourceBase.name}" (contra ${otherBases.length} bases)`, { id: toastId });
    } catch (err: any) {
      toast.error("Error deduplicando: " + (err?.message || "desconocido"), { id: toastId });
    } finally {
      setDeduping(false);
    }
  }, [dragSourceId, bases]);

  const handleDrop = useCallback(async (targetBaseId: string) => {
    const sourceId = dragSourceId;
    setDragSourceId(null);
    setDragOverId(null);
    if (!sourceId || sourceId === targetBaseId) return;

    const sourceBase = bases.find(b => b.id === sourceId);
    const targetBase = bases.find(b => b.id === targetBaseId);
    if (!sourceBase || !targetBase) return;

    setDeduping(true);
    const toastId = toast.loading(`Deduplicando "${sourceBase.name}" contra "${targetBase.name}"…`);

    try {
      // 1. Fetch all emails from target base
      const targetEmails = new Set<string>();
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("contacts")
          .select("mail1, mail2, mail3, mail4")
          .eq("base_id", targetBaseId)
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        for (const c of data as any[]) {
          [c.mail1, c.mail2, c.mail3, c.mail4].forEach((m: string) => {
            if (m) targetEmails.add(m.toLowerCase().trim());
          });
        }
        if (data.length < pageSize) break;
      }

      // 2. Fetch source contacts and find duplicates
      const duplicateIds: string[] = [];
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("contacts")
          .select("id, mail1, mail2, mail3, mail4")
          .eq("base_id", sourceId)
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        for (const c of data as any[]) {
          const mails = [c.mail1, c.mail2, c.mail3, c.mail4].filter(Boolean).map((m: string) => m.toLowerCase().trim());
          if (mails.some(m => targetEmails.has(m))) {
            duplicateIds.push(c.id);
          }
        }
        if (data.length < pageSize) break;
      }

      if (duplicateIds.length === 0) {
        toast.success("No hay duplicados entre ambas bases 👍", { id: toastId });
        setDeduping(false);
        return;
      }

      // 3. Delete duplicates in batches
      const batchSize = 500;
      for (let i = 0; i < duplicateIds.length; i += batchSize) {
        const batch = duplicateIds.slice(i, i + batchSize);
        const { error } = await supabase.from("contacts").delete().in("id", batch);
        if (error) throw error;
      }

      // 4. Update clean_count
      const newCount = (sourceBase.clean_count || 0) - duplicateIds.length;
      await supabase.from("bases").update({ clean_count: Math.max(0, newCount) }).eq("id", sourceId);
      setBases(prev => prev.map(b => b.id === sourceId ? { ...b, clean_count: Math.max(0, newCount) } : b));

      toast.success(`🗑️ ${duplicateIds.length} contactos duplicados eliminados de "${sourceBase.name}"`, { id: toastId });
    } catch (err: any) {
      toast.error("Error deduplicando: " + (err?.message || "desconocido"), { id: toastId });
    } finally {
      setDeduping(false);
    }
  }, [dragSourceId, bases]);

  const handleDragEnd = useCallback(() => {
    setDragSourceId(null);
    setDragOverId(null);
  }, []);

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
          {dragSourceId && (
            <div className="space-y-2">
              <div className="text-xs text-primary font-medium text-center py-2 px-4 rounded-lg bg-primary/5 border border-primary/20 animate-pulse">
                ⇄ Suelta sobre otra base para deduplicar, o sobre "TODAS" para deduplicar contra todas
              </div>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOverAll(true); }}
                onDragLeave={() => setDragOverAll(false)}
                onDrop={() => handleDropAll()}
                className={`flex items-center justify-center gap-2 rounded-xl border-2 border-dashed py-4 text-sm font-bold transition-all cursor-pointer
                  ${dragOverAll
                    ? "border-primary bg-primary/10 text-primary scale-[1.02] shadow-lg"
                    : "border-muted-foreground/30 text-muted-foreground hover:border-primary/50"
                  }`}
              >
                🔄 TODAS — Deduplicar contra todas las bases
              </div>
            </div>
          )}
          {bases.map((base) => (
            <div
              key={base.id}
              draggable={!editingId && !deduping}
              onDragStart={() => handleDragStart(base.id)}
              onDragOver={(e) => handleDragOver(e, base.id)}
              onDragLeave={handleDragLeave}
              onDrop={() => handleDrop(base.id)}
              onDragEnd={handleDragEnd}
              onClick={() => editingId !== base.id && !deduping && onSelectBase(base.id, base.name, base.crossed)}
              className={`flex items-center justify-between rounded-xl border bg-card px-5 py-4 cursor-pointer transition-all hover:shadow-md
                ${dragOverId === base.id && dragSourceId !== base.id
                  ? "border-primary border-2 bg-primary/5 shadow-lg scale-[1.01]"
                  : dragSourceId === base.id
                    ? "opacity-50 border-dashed border-muted-foreground"
                    : "border-border hover:border-primary/30"
                }`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <GripVertical className="h-4 w-4 text-muted-foreground/30 shrink-0 cursor-grab active:cursor-grabbing" />
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
              <div className="flex items-center gap-1.5 flex-wrap justify-end ml-4" onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" disabled={exporting === base.id} className="text-xs">
                      {exporting === base.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}
                      Base limpia
                      <ChevronDown className="ml-1 h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={(e) => handleCleanAction(base, "xlsx", e as any)}>Descargar XLSX</DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => handleCleanAction(base, "csv", e as any)}>Descargar CSV</DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => handleCleanAction(base, "copy", e as any)}>Copiar para Sheets</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {base.crossed && base.sheet_id && (
                  <>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="secondary" size="sm" disabled={exporting === base.id} className="text-xs">
                          {exporting === base.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <MailCheck className="mr-1 h-3.5 w-3.5" />}
                          Mails buenos
                          <ChevronDown className="ml-1 h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => handleGoodEmailsAction(base, "xlsx", e as any)}>Descargar XLSX</DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => handleGoodEmailsAction(base, "copy", e as any)}>Copiar para Sheets</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" disabled={exporting === base.id} className="text-xs">
                          {exporting === base.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}
                          Cruzada
                          <ChevronDown className="ml-1 h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => handleCrossedAction(base, "xlsx", e as any)}>Descargar XLSX</DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => handleCrossedAction(base, "copy", e as any)}>Copiar para Sheets</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={(e) => handleDeleteClick(base.id, base.name, e)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta base?</AlertDialogTitle>
            <AlertDialogDescription>
              Estás a punto de eliminar <strong>"{deleteTarget?.name}"</strong>. Esta acción no se puede deshacer y se perderán todos los contactos asociados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default BBDPanel;
