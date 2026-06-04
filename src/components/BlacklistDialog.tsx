import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Ban, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone?: () => void;
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

const BlacklistDialog = ({ open, onOpenChange, onDone }: Props) => {
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);

  const run = async () => {
    const matches = (text.match(EMAIL_RE) || []).map((m) => m.toLowerCase().trim());
    const emails = Array.from(new Set(matches));
    if (emails.length === 0) {
      toast.error("No se encontraron emails válidos");
      return;
    }

    setRunning(true);
    const toastId = toast.loading(`Agregando ${emails.length} mails a la blacklist…`);

    try {
      // 1. Insert into bounced_emails (idempotent — ignore duplicates)
      const rows = emails.map((mail) => ({
        mail,
        domain: mail.split("@")[1] || null,
      }));
      // upsert based on mail uniqueness; if no unique index, just insert and swallow errors
      await supabase.from("bounced_emails").upsert(rows as any, { onConflict: "mail", ignoreDuplicates: true } as any);

      // 2. Sweep all contacts and remove blacklisted mails
      const blacklisted = new Set(emails);
      const pageSize = 1000;
      let scanned = 0;
      let contactsDeleted = 0;
      let mailsCleared = 0;
      const baseTouched = new Map<string, number>(); // base_id -> deletions count

      // Build a query that matches any contact where any of the 4 mail columns is in the list
      // Supabase doesn't support OR with .in() across columns nicely → fetch in pages filtered by domain set
      const domains = Array.from(new Set(emails.map((m) => m.split("@")[1]).filter(Boolean)));

      for (let from = 0; ; from += pageSize) {
        let q = supabase
          .from("contacts")
          .select("id, base_id, mail1, mail2, mail3, mail4")
          .range(from, from + pageSize - 1);

        // Pre-filter by domain to reduce volume when possible
        if (domains.length > 0 && domains.length <= 50) {
          const orParts = domains
            .flatMap((d) => [
              `mail1.ilike.%@${d}`,
              `mail2.ilike.%@${d}`,
              `mail3.ilike.%@${d}`,
              `mail4.ilike.%@${d}`,
            ])
            .join(",");
          q = q.or(orParts);
        }

        const { data, error } = await q;
        if (error) throw error;
        if (!data || data.length === 0) break;
        scanned += data.length;

        const toDelete: string[] = [];
        const toUpdate: Array<{ id: string; patch: Record<string, null> }> = [];

        for (const c of data as any[]) {
          const slots = ["mail1", "mail2", "mail3", "mail4"] as const;
          const patch: Record<string, null> = {};
          const remaining: string[] = [];
          for (const s of slots) {
            const v = (c[s] || "").toString().toLowerCase().trim();
            if (!v) continue;
            if (blacklisted.has(v)) {
              patch[s] = null;
              mailsCleared++;
            } else {
              remaining.push(v);
            }
          }
          if (Object.keys(patch).length === 0) continue;
          if (remaining.length === 0) {
            toDelete.push(c.id);
            baseTouched.set(c.base_id, (baseTouched.get(c.base_id) || 0) + 1);
          } else {
            toUpdate.push({ id: c.id, patch });
          }
        }

        // Delete in batches
        for (let i = 0; i < toDelete.length; i += 500) {
          const batch = toDelete.slice(i, i + 500);
          const { error: delErr } = await supabase.from("contacts").delete().in("id", batch);
          if (delErr) throw delErr;
          contactsDeleted += batch.length;
        }
        // Updates one by one (different patches)
        for (const u of toUpdate) {
          await supabase.from("contacts").update(u.patch as any).eq("id", u.id);
        }

        if (data.length < pageSize) break;
      }

      // 3. Recompute clean_count for affected bases
      for (const [baseId, delta] of baseTouched.entries()) {
        const { data: b } = await supabase
          .from("bases")
          .select("clean_count")
          .eq("id", baseId)
          .maybeSingle();
        if (b) {
          await supabase
            .from("bases")
            .update({ clean_count: Math.max(0, (b.clean_count || 0) - delta) })
            .eq("id", baseId);
        }
      }

      toast.success(
        `🚫 Blacklist: ${emails.length} mails agregados · ${contactsDeleted} contactos eliminados · ${mailsCleared} mails removidos`,
        { id: toastId }
      );
      setText("");
      onOpenChange(false);
      onDone?.();
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
            <Ban className="h-5 w-5" />
            Lista Negra
          </DialogTitle>
          <DialogDescription>
            Pega uno o más mails (separados por coma, espacio o salto de línea). Se agregarán a la
            blacklist y se eliminarán automáticamente de TODAS las bases.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="juan@empresa.cl, maria@otra.com&#10;pedro@dominio.cl"
          rows={8}
          disabled={running}
          className="font-mono text-sm"
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
            Cancelar
          </Button>
          <Button
            onClick={run}
            disabled={running || !text.trim()}
            className="bg-black text-white hover:bg-black/80"
          >
            {running ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Procesando…
              </>
            ) : (
              <>
                <Ban className="mr-2 h-4 w-4" />
                Agregar y limpiar bases
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BlacklistDialog;
