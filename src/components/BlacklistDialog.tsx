import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Ban, Loader2, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone?: () => void;
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

interface BouncedRow {
  mail: string;
  domain: string | null;
  bounced_at: string | null;
}

const BlacklistDialog = ({ open, onOpenChange, onDone }: Props) => {
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState("add");
  const [list, setList] = useState<BouncedRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [search, setSearch] = useState("");

  const fetchList = async () => {
    setLoadingList(true);
    const { data, error } = await supabase
      .from("bounced_emails")
      .select("mail, domain, bounced_at")
      .order("bounced_at", { ascending: false })
      .limit(5000);
    if (error) {
      toast.error("Error cargando lista: " + error.message);
    } else {
      setList((data as BouncedRow[]) || []);
    }
    setLoadingList(false);
  };

  useEffect(() => {
    if (open && tab === "view") fetchList();
  }, [open, tab]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return list;
    return list.filter((r) => r.mail.toLowerCase().includes(q));
  }, [list, search]);

  const removeOne = async (mail: string) => {
    const { error } = await supabase.from("bounced_emails").delete().eq("mail", mail);
    if (error) {
      toast.error("Error: " + error.message);
      return;
    }
    setList((prev) => prev.filter((r) => r.mail !== mail));
    toast.success(`Removido de la blacklist: ${mail}`);
  };

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
      const rows = emails.map((mail) => ({
        mail,
        domain: mail.split("@")[1] || null,
      }));
      await supabase
        .from("bounced_emails")
        .upsert(rows as any, { onConflict: "mail", ignoreDuplicates: true } as any);

      const blacklisted = new Set(emails);
      const pageSize = 1000;
      let contactsDeleted = 0;
      let mailsCleared = 0;
      const baseTouched = new Map<string, number>();

      const domains = Array.from(new Set(emails.map((m) => m.split("@")[1]).filter(Boolean)));

      for (let from = 0; ; from += pageSize) {
        let q = supabase
          .from("contacts")
          .select("id, base_id, mail1, mail2, mail3, mail4")
          .range(from, from + pageSize - 1);

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

        for (let i = 0; i < toDelete.length; i += 500) {
          const batch = toDelete.slice(i, i + 500);
          const { error: delErr } = await supabase.from("contacts").delete().in("id", batch);
          if (delErr) throw delErr;
          contactsDeleted += batch.length;
        }
        for (const u of toUpdate) {
          await supabase.from("contacts").update(u.patch as any).eq("id", u.id);
        }

        if (data.length < pageSize) break;
      }

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
      onDone?.();
      // Refresh list if user switches to view tab
      if (tab === "view") fetchList();
    } catch (err: any) {
      toast.error("Error: " + (err?.message || "desconocido"), { id: toastId });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5" />
            Lista Negra
          </DialogTitle>
          <DialogDescription>
            Los mails en la lista negra se eliminan de TODAS las bases actuales y nunca se incluirán
            en bases futuras (se filtran al subir / cruzar).
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="add">Agregar</TabsTrigger>
            <TabsTrigger value="view">Ver lista ({list.length || "…"})</TabsTrigger>
          </TabsList>

          <TabsContent value="add" className="space-y-3">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="juan@empresa.cl, maria@otra.com&#10;pedro@dominio.cl"
              rows={8}
              disabled={running}
              className="font-mono text-sm"
            />
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={running}
              >
                Cerrar
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
          </TabsContent>

          <TabsContent value="view" className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar mail o dominio…"
                className="pl-8"
              />
            </div>

            <div className="border rounded-md max-h-[400px] overflow-y-auto">
              {loadingList ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                  Cargando…
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  {list.length === 0 ? "No hay mails en la blacklist" : "Sin resultados"}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-2 font-medium">Mail</th>
                      <th className="text-left p-2 font-medium w-32">Agregado</th>
                      <th className="w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 500).map((r) => (
                      <tr key={r.mail} className="border-t hover:bg-muted/30">
                        <td className="p-2 font-mono text-xs">{r.mail}</td>
                        <td className="p-2 text-xs text-muted-foreground">
                          {r.bounced_at
                            ? new Date(r.bounced_at).toLocaleDateString("es-CL")
                            : "—"}
                        </td>
                        <td className="p-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => removeOne(r.mail)}
                            title="Quitar de blacklist"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {filtered.length > 500 && (
              <p className="text-xs text-muted-foreground text-center">
                Mostrando 500 de {filtered.length}. Usa el buscador para filtrar.
              </p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cerrar
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default BlacklistDialog;
