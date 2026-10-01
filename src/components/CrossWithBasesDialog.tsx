import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { fetchSheetReport, fetchSheetTabs } from "@/lib/googleSheets";

interface BaseLite {
  id: string;
  name: string;
  clean_count: number;
  sheet_id?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sourceBase: BaseLite | null;
  allBases: BaseLite[];
  onDone: (newCleanCount: number) => void;
}

// Statuses considered "delivered but not engaged"
const SENT_STATUSES = new Set([
  "EMAIL_SENT",
  "EMAIL_DELIVERED",
  "SENT",
  "DELIVERED",
  "MAIL_MERGE_COMPLETE",
]);
const ENGAGED_STATUSES = new Set([
  "EMAIL_OPENED",
  "EMAIL_CLICKED",
  "OPENED",
  "CLICKED",
  "RESPONDED",
]);

const CrossWithBasesDialog = ({ open, onOpenChange, sourceBase, allBases, onDone }: Props) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  // "engaged" = solo excluye los que abrieron/respondieron (los no-abiertos se conservan para reintento)
  // "all"     = excluye TODOS los enviados (hayan abierto o no)
  const [mode, setMode] = useState<"engaged" | "all">("engaged");

  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setMode("engaged");
    }
  }, [open]);

  if (!sourceBase) return null;

  const targets = allBases.filter((b) => b.id !== sourceBase.id && !!b.sheet_id);
  const allSelected = targets.length > 0 && targets.every((b) => selected.has(b.id));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(targets.map((b) => b.id)));
  };

  const run = async () => {
    if (selected.size === 0) {
      toast.error("Selecciona al menos una base");
      return;
    }
    setRunning(true);
    const toastId = toast.loading(`Cruzando "${sourceBase.name}" contra ${selected.size} bases…`);

    try {
      const excludeMails = new Set<string>();
      const excludeNames = new Set<string>();
      const norm = (s: any) =>
        (s || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .toLowerCase().replace(/[^a-z]/g, "").trim();
      const nameKey = (n: any, a: any) => {
        const nn = norm((n || "").toString().split(/\s+/)[0]);
        const aa = norm((a || "").toString().split(/\s+/)[0]);
        return nn.length >= 2 && aa.length >= 2 ? `${nn}|${aa}` : "";
      };
      const pick = (c: any, keys: string[]) => {
        for (const k of keys) if (c[k]) return c[k];
        return "";
      };

      for (const baseId of selected) {
        const tb = allBases.find((b) => b.id === baseId);
        if (!tb?.sheet_id) continue;
        const tabs = await fetchSheetTabs(tb.sheet_id);
        const allTabs = await Promise.all(
          tabs.map((t) => fetchSheetReport(tb.sheet_id!, t.title).catch(() => ({ contacts: [] as any[] })))
        );

        for (const sheet of allTabs) {
          for (const c of sheet.contacts) {
            const status = (c._status || "").toString().replace(/\s+/g, "_").toUpperCase().trim();
            const match = mode === "engaged"
              ? ENGAGED_STATUSES.has(status)
              : SENT_STATUSES.has(status) || ENGAGED_STATUSES.has(status);
            if (!match) continue;

            const rowMails: string[] = [];
            for (const k of ["Email Address", "MAIL_CORREGIDO", "MAIL1", "MAIL2", "MAIL3", "MAIL4", "email", "EMAIL"]) {
              const m = (c[k] || "").toString().toLowerCase().trim();
              if (m.includes("@")) { excludeMails.add(m); rowMails.push(m); }
            }
            const key = nameKey(
              pick(c, ["NOMBRE", "Nombre", "nombre", "First Name"]),
              pick(c, ["APELLIDO", "Apellido", "apellido", "Last Name"])
            );
            for (const k of contextKeys(key, rowMails, pick(c, ["EMPRESA", "Empresa", "empresa", "Company"]), pick(c, ["WEB", "Web", "web"]))) excludeNames.add(k);
          }
        }
      }

      // Extra seguridad: historial de enviados guardado en la app
      if (mode === "all") {
        for (let from = 0; ; from += 1000) {
          const { data, error } = await supabase
            .from("delivered_contacts")
            .select("mail, nombre, apellido, empresa, web")
            .range(from, from + 999);
          if (error) break;
          if (!data || data.length === 0) break;
          for (const d of data as any[]) {
            const m = (d.mail || "").toLowerCase().trim();
            if (m.includes("@")) excludeMails.add(m);
            const key = nameKey(d.nombre, d.apellido);
            for (const k of contextKeys(key, m ? [m] : [], d.empresa, d.web)) excludeNames.add(k);
          }
          if (data.length < 1000) break;
        }
      }

      if (excludeMails.size === 0 && excludeNames.size === 0) {
        toast.success("No se encontraron coincidencias en esas bases 👍", { id: toastId });
        setRunning(false);
        return;
      }

      // 2. Find duplicates in source (por mail, o nombre+apellido con mismo dominio/empresa)
      const duplicateIds: string[] = [];
      let byMail = 0;
      let byName = 0;
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("contacts")
          .select("id, nombre, apellido, empresa, web, mail1, mail2, mail3, mail4")
          .eq("base_id", sourceBase.id)
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        for (const c of data as any[]) {
          const mails = [c.mail1, c.mail2, c.mail3, c.mail4]
            .filter(Boolean)
            .map((m: string) => m.toLowerCase().trim());
          if (mails.some((m) => excludeMails.has(m))) {
            duplicateIds.push(c.id);
            byMail++;
            continue;
          }
          const key = nameKey(c.nombre, c.apellido);
          if (contextKeys(key, mails, c.empresa, c.web).some((k) => excludeNames.has(k))) {
            duplicateIds.push(c.id);
            byName++;
          }
        }
        if (data.length < pageSize) break;
      }

      if (duplicateIds.length === 0) {
        toast.success(`Sin coincidencias (${excludeMails.size} mails y ${excludeNames.size} nombres revisados) 👍`, { id: toastId });
        setRunning(false);
        return;
      }

      // 3. Delete duplicates (replacing the base)
      const batchSize = 500;
      for (let i = 0; i < duplicateIds.length; i += batchSize) {
        const batch = duplicateIds.slice(i, i + batchSize);
        const { error } = await supabase.from("contacts").delete().in("id", batch);
        if (error) throw error;
      }

      const newCount = Math.max(0, (sourceBase.clean_count || 0) - duplicateIds.length);
      await supabase.from("bases").update({ clean_count: newCount }).eq("id", sourceBase.id);

      toast.success(
        `🗑️ ${duplicateIds.length} eliminados de "${sourceBase.name}" (${byMail} por mail, ${byName} por nombre y apellido)`,
        { id: toastId, duration: 8000 }
      );
      onDone(newCount);
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Error: " + (err?.message || "desconocido"), { id: toastId });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Cruzar "{sourceBase.name}" contra otras bases
          </DialogTitle>
          <DialogDescription>
            Selecciona bases ya enviadas. Se eliminarán de esta base los contactos que ya aparecen
            en ellas según el modo elegido.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Qué excluir</p>
          <label className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5 cursor-pointer hover:bg-muted/40">
            <input
              type="radio"
              checked={mode === "engaged"}
              onChange={() => setMode("engaged")}
              disabled={running}
              className="mt-1 accent-primary"
            />
            <div className="flex-1">
              <p className="text-sm font-medium">Solo los que abrieron / respondieron</p>
              <p className="text-xs text-muted-foreground">
                Se conservan los enviados sin apertura para volver a contactarlos.
              </p>
            </div>
          </label>
          <label className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5 cursor-pointer hover:bg-muted/40">
            <input
              type="radio"
              checked={mode === "all"}
              onChange={() => setMode("all")}
              disabled={running}
              className="mt-1 accent-primary"
            />
            <div className="flex-1">
              <p className="text-sm font-medium">Todos los ya enviados</p>
              <p className="text-xs text-muted-foreground">
                Excluye a cualquiera que ya recibió el mail, abriera o no.
              </p>
            </div>
          </label>
        </div>

        {targets.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={toggleAll}
            disabled={running}
          >
            {allSelected ? "Desmarcar todas" : `Seleccionar todas (${targets.length})`}
          </Button>
        )}

        <div className="max-h-72 space-y-1.5 overflow-y-auto py-2">
          {targets.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No hay otras bases con Google Sheet asociado.
            </p>
          ) : (
            targets.map((b) => (
              <label
                key={b.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 cursor-pointer hover:bg-muted/40"
              >
                <Checkbox
                  checked={selected.has(b.id)}
                  onCheckedChange={() => toggle(b.id)}
                  disabled={running}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{b.name}</p>
                  <p className="text-xs text-muted-foreground">{b.clean_count} contactos</p>
                </div>
              </label>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
            Cancelar
          </Button>
          <Button onClick={run} disabled={running || selected.size === 0}>
            {running ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Cruzando…
              </>
            ) : (
              `Cruzar contra ${selected.size} ${selected.size === 1 ? "base" : "bases"}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CrossWithBasesDialog;
