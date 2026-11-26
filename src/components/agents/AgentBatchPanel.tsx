import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { db, STATUS_LABEL } from "@/lib/autosend";
import { fetchBaseContacts, toNativeRows, exportNativeRows, type BaseContactRow } from "@/lib/nativeBaseExport";

interface QueueRow { mail1: string | null; status: string; sent_at: string | null; replied_at: string | null; reason: string | null }
interface Props { baseId: string; baseName: string; onBack: () => void }

const fmt = (d: string | null) => d ? new Date(d).toLocaleString("es-CL", { timeZone: "America/Santiago", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
const tone: Record<string, string> = { enviado: "bg-primary/10 text-primary", respondido: "bg-accent text-accent-foreground", rebotado: "bg-destructive/10 text-destructive", programado: "bg-secondary text-secondary-foreground" };

const AgentBatchPanel = ({ baseId, baseName, onBack }: Props) => {
  const [contacts, setContacts] = useState<BaseContactRow[]>([]);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [c, q] = await Promise.all([
        fetchBaseContacts(baseId),
        db.from("autosend_queue").select("mail1,status,sent_at,replied_at,reason").eq("base_id", baseId),
      ]);
      setContacts(c); setQueue(q.data ?? []); setLoading(false);
    })();
  }, [baseId]);

  const byMail = new Map(queue.map((q) => [(q.mail1 ?? "").toLowerCase(), q]));
  const count = (f: (s: string) => boolean) => queue.filter((q) => f(q.status)).length;
  const lastSent = queue.map((q) => q.sent_at).filter(Boolean).sort().pop() ?? null;
  const stats = [
    { label: "Importados", value: contacts.length },
    { label: "En cola", value: count((s) => s === "programado" || s === "pendiente" || s === "revision") },
    { label: "Enviados", value: count((s) => ["enviado", "respondido", "rebotado"].includes(s)), sub: lastSent ? `Último: ${fmt(lastSent)}` : "" },
    { label: "Respondieron", value: count((s) => s === "respondido") },
    { label: "Rebotaron", value: count((s) => s === "rebotado") },
    { label: "Excluidos", value: count((s) => s.startsWith("excluido") || s === "no_contactar") },
  ];

  const statusText = (q?: QueueRow) => {
    if (!q) return "Sin analizar";
    const label = STATUS_LABEL[q.status] ?? q.status;
    if (q.status === "respondido") return `${label} ${fmt(q.replied_at)}`;
    if (q.sent_at) return `${label} ${fmt(q.sent_at)}`;
    return label;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <h2 className="font-display text-2xl font-bold">{baseName}</h2>
            <p className="text-sm text-muted-foreground">Resultados de este lote (envío automático por Gmail)</p>
          </div>
        </div>
        <div className="flex gap-2">
          {(["xlsx", "csv"] as const).map((m) => (
            <Button key={m} variant="outline" size="sm" disabled={!contacts.length} onClick={() => exportNativeRows(baseName, toNativeRows(contacts), m)}>
              <Download className="mr-1.5 h-3.5 w-3.5" />{m.toUpperCase()}
            </Button>
          ))}
        </div>
      </div>

      {loading ? <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="font-display text-2xl font-bold">{s.value}</p>
                {s.sub && <p className="text-[11px] text-muted-foreground mt-1">{s.sub}</p>}
              </div>
            ))}
          </div>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>{["#", "NOMBRE", "APELLIDO", "APELLIDO2", "EMPRESA", "MAIL1", "ESTADO"].map((h) => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {contacts.map((c, i) => {
                  const q = byMail.get((c.mail1 ?? "").toLowerCase());
                  return (
                    <tr key={i} className="border-t border-border">
                      <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2">{c.nombre}</td>
                      <td className="px-3 py-2">{c.apellido}</td>
                      <td className="px-3 py-2">{c.apellido2}</td>
                      <td className="px-3 py-2">{c.empresa}</td>
                      <td className="px-3 py-2">{c.mail1}</td>
                      <td className="px-3 py-2">
                        <span title={q?.reason ?? ""} className={`rounded-full px-2 py-0.5 text-xs ${tone[q?.status ?? ""] ?? "bg-muted text-muted-foreground"}`}>{statusText(q)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};
export default AgentBatchPanel;
