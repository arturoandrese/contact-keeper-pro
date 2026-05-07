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

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
            const mail = (c["Email Address"] || c["MAIL_CORREGIDO"] || c["MAIL1"] || c["email"] || "")
              .toString().toLowerCase().trim();
            if (!mail || !mail.includes("@")) continue;

            if (mode === "engaged") {
              if (ENGAGED_STATUSES.has(status)) excludeMails.add(mail);
            } else {
              if (SENT_STATUSES.has(status) || ENGAGED_STATUSES.has(status)) excludeMails.add(mail);
            }
          }
        }
      }

      if (excludeMails.size === 0) {
        toast.success("No se encontraron coincidencias en esas bases 👍", { id: toastId });
        setRunning(false);
        return;
      }

      // 2. Find duplicates in source
      const duplicateIds: string[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("contacts")
          .select("id, mail1, mail2, mail3, mail4")
          .eq("base_id", sourceBase.id)
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        for (const c of data as any[]) {
          const mails = [c.mail1, c.mail2, c.mail3, c.mail4]
            .filter(Boolean)
            .map((m: string) => m.toLowerCase().trim());
          if (mails.some((m) => excludeMails.has(m))) duplicateIds.push(c.id);
        }
        if (data.length < pageSize) break;
      }

      if (duplicateIds.length === 0) {
        toast.success(`Sin coincidencias (${excludeMails.size} mails revisados) 👍`, { id: toastId });
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
        `🗑️ ${duplicateIds.length} contactos ya contactados eliminados de "${sourceBase.name}"`,
        { id: toastId }
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

        <label className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 cursor-pointer">
          <Checkbox
            checked={strict}
            onCheckedChange={(v) => setStrict(!!v)}
            disabled={running}
            className="mt-0.5"
          />
          <div className="flex-1">
            <p className="text-sm font-medium">Modo estricto: excluir TODOS los ya enviados</p>
            <p className="text-xs text-muted-foreground">
              {strict
                ? "Se eliminará a cualquiera que ya recibió el mail, hayan abierto o no."
                : "Por defecto solo elimina los enviados sin apertura (los que abrieron se conservan)."}
            </p>
          </div>
        </label>

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
