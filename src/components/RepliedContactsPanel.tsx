import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchSheetTabs, fetchSheetReport } from "@/lib/googleSheets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MessageSquareReply,
  Loader2,
  Download,
  Trash2,
  Search,
  RefreshCw,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import * as XLSX from "xlsx";
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

interface RepliedContact {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  empresa: string;
  cargo: string;
  fecha_respuesta: string;
  imported_at: string;
}

const RepliedContactsPanel = () => {
  const [contacts, setContacts] = useState<RepliedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetId, setSheetId] = useState(() => localStorage.getItem("replied_sheet_id") || "");
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    fetchContacts();
  }, []);

  const fetchContacts = async () => {
    setLoading(true);
    let all: RepliedContact[] = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from("replied_contacts")
        .select("*")
        .order("fecha_respuesta", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) {
        toast.error("Error cargando contactos respondidos");
        break;
      }
      all = all.concat((data as RepliedContact[]) || []);
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }
    setContacts(all);
    setLoading(false);
  };

  const extractSheetId = (input: string): string => {
    const trimmed = input.trim();
    // Full URL: https://docs.google.com/spreadsheets/d/SHEET_ID/edit...
    const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (urlMatch) return urlMatch[1];
    // Already just an ID
    return trimmed;
  };

  const handleImport = async () => {
    const raw = sheetId.trim();
    if (!raw) {
      toast.error("Pega el ID o URL de la hoja de Google Sheets");
      return;
    }
    const id = extractSheetId(raw);
    if (!id) {
      toast.error("No se pudo extraer el ID de la hoja");
      return;
    }
    localStorage.setItem("replied_sheet_id", raw);
    setImporting(true);

    try {
      // Get tabs and use the last one
      const tabs = await fetchSheetTabs(id);
      const lastTab = tabs[tabs.length - 1];
      const report = await fetchSheetReport(id, lastTab?.title);

      if (report.contacts.length === 0) {
        toast.error("No se encontraron contactos en la hoja");
        setImporting(false);
        return;
      }

      // Map columns - be flexible with header names
      const headers = report.headers.map(h => h.toLowerCase().trim());
      const findCol = (keywords: string[]) =>
        headers.findIndex(h => keywords.some(k => h.includes(k)));

      const nameIdx = findCol(["nombre", "first name", "name"]);
      const lastNameIdx = findCol(["apellido", "last name", "surname"]);
      const emailIdx = findCol(["email", "mail", "correo"]);
      const empresaIdx = findCol(["empresa", "company", "compañia"]);
      const cargoIdx = findCol(["cargo", "position", "title", "puesto"]);
      const fechaIdx = findCol(["fecha", "date"]);

      if (emailIdx < 0) {
        toast.error("No se encontró columna de email en la hoja");
        setImporting(false);
        return;
      }

      const rows = report.contacts.map(c => {
        const values = Object.values(c).filter(v => v !== c._status);
        const headerKeys = report.headers;
        return {
          nombre: nameIdx >= 0 ? (c[headerKeys[nameIdx]] || "").trim() : "",
          apellido: lastNameIdx >= 0 ? (c[headerKeys[lastNameIdx]] || "").trim() : "",
          email: (c[headerKeys[emailIdx]] || "").trim().toLowerCase(),
          empresa: empresaIdx >= 0 ? (c[headerKeys[empresaIdx]] || "").trim() : "",
          cargo: cargoIdx >= 0 ? (c[headerKeys[cargoIdx]] || "").trim() : "",
          fecha_respuesta: fechaIdx >= 0 ? parseDate(c[headerKeys[fechaIdx]] || "") : null,
        };
      }).filter(r => r.email && r.email.includes("@"));

      if (rows.length === 0) {
        toast.error("No se encontraron emails válidos");
        setImporting(false);
        return;
      }

      // Upsert in chunks
      let inserted = 0;
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        const { error } = await supabase
          .from("replied_contacts")
          .upsert(chunk, { onConflict: "email" });
        if (error) {
          console.error("Error importing replied contacts:", error);
          toast.error("Error importando contactos");
          break;
        }
        inserted += chunk.length;
      }

      toast.success(`✅ ${inserted} contactos respondidos importados/actualizados`);
      fetchContacts();
    } catch (err: any) {
      toast.error(err.message || "Error accediendo a Google Sheets");
    }
    setImporting(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("replied_contacts").delete().eq("id", id);
    setContacts(prev => prev.filter(c => c.id !== id));
    toast.success("Contacto eliminado");
    setDeleteTarget(null);
  };

  const handleDownload = () => {
    const rows = filtered.map(c => ({
      NOMBRE: c.nombre,
      APELLIDO: c.apellido,
      EMAIL: c.email,
      EMPRESA: c.empresa,
      CARGO: c.cargo,
      FECHA_RESPUESTA: c.fecha_respuesta ? format(new Date(c.fecha_respuesta), "dd/MM/yyyy", { locale: es }) : "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Respondidos");
    XLSX.writeFile(wb, "contactos_respondidos.xlsx");
  };

  const filtered = search.trim()
    ? contacts.filter(c =>
        [c.nombre, c.apellido, c.email, c.empresa].some(f =>
          (f || "").toLowerCase().includes(search.toLowerCase())
        )
      )
    : contacts;

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquareReply className="h-5 w-5 text-primary" />
          <h3 className="font-display text-lg font-bold">Contactos que han respondido</h3>
          <span className="text-xs text-muted-foreground">({contacts.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={fetchContacts} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
          <Button size="sm" variant="outline" onClick={handleDownload} disabled={contacts.length === 0}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Descargar
          </Button>
        </div>
      </div>

      {/* Google Sheet Import */}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            ID de Google Sheet (contactos que respondieron)
          </label>
          <Input
            placeholder="Pega el ID o URL completa de la hoja de Drive"
            value={sheetId}
            onChange={(e) => setSheetId(e.target.value)}
            className="text-sm font-mono"
          />
        </div>
        <Button size="sm" onClick={handleImport} disabled={importing || !sheetId.trim()}>
          {importing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
          Importar
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Columnas esperadas: NOMBRE, APELLIDO, EMAIL, EMPRESA, CARGO, FECHA. Se usa la última pestaña automáticamente.
      </p>

      {/* Search */}
      {contacts.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar contacto respondido..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 text-sm"
          />
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <MessageSquareReply className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">
            {search ? "Sin resultados" : "No hay contactos respondidos importados aún"}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60">
                  {["NOMBRE", "APELLIDO", "EMAIL", "EMPRESA", "CARGO", "FECHA", ""].map(col => (
                    <th key={col} className="whitespace-nowrap px-4 py-3 text-left font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 300).map(c => (
                  <tr key={c.id} className="border-b border-border/50 transition-colors hover:bg-muted/30">
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">{c.nombre || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">{c.apellido || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs font-medium text-primary">{c.email}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted-foreground">{c.empresa || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted-foreground">{c.cargo || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted-foreground">
                      {c.fecha_respuesta ? format(new Date(c.fecha_respuesta), "d MMM yy", { locale: es }) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <button
                        onClick={() => setDeleteTarget(c.id)}
                        className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > 300 && (
            <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground text-center">
              Mostrando 300 de {filtered.length}. Descarga el Excel para ver todos.
            </div>
          )}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar contacto respondido?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

function parseDate(raw: string): string | null {
  if (!raw) return null;
  // Try common formats
  const trimmed = raw.trim();
  // ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  // DD/MM/YYYY or DD-MM-YYYY
  const match = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (match) {
    const [, d, m, y] = match;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

export default RepliedContactsPanel;
