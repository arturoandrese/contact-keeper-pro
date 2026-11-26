import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type ChangeEvent } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Play, Pause, Square, RefreshCw, Send, Trash2, Check, Eye, Search } from "lucide-react";
import { toast } from "sonner";
import { db, autosend, STATUS_LABEL, CLASS_LABEL, COMPANY_REASONS } from "@/lib/autosend";
import ProtectContactButton from "./ProtectContactDialog";
import SenderHealthPanel from "@/components/SenderHealthPanel";

/* eslint-disable @typescript-eslint/no-explicit-any */
const DAYS = [[1, "Lun"], [2, "Mar"], [3, "Mié"], [4, "Jue"], [5, "Vie"], [6, "Sáb"], [7, "Dom"]] as const;
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" }) : "—");
const chileDate = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Santiago" });

const Stat = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="rounded-xl border border-border bg-card px-4 py-3">
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <p className="font-display text-2xl font-bold">{value}</p>
  </div>
);

const statusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" =>
  s === "enviado" || s === "respondido" ? "default" : s === "rebotado" || s === "error" || s === "no_contactar" ? "destructive" : s === "programado" ? "secondary" : "outline";

const AutosendPanel = ({ onBack }: { onBack: () => void }) => {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<any>(null);
  const [queue, setQueue] = useState<any[]>([]);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [people, setPeople] = useState<any[]>([]);
  const [templates, setTemplates] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [sender, setSender] = useState<any>(null);

  const load = useCallback(async () => {
    const [s, q, a, l, c, p, t] = await Promise.all([
      db.from("autosend_settings").select("*").eq("id", 1).maybeSingle(),
      db.from("autosend_queue").select("*").order("updated_at", { ascending: false }).limit(1000),
      db.from("autosend_attempts").select("*").order("sent_at", { ascending: false }).limit(1000),
      db.from("autosend_log").select("*").order("at", { ascending: false }).limit(60),
      db.from("protected_companies").select("*").order("created_at", { ascending: false }),
      db.from("protected_contacts").select("*").order("created_at", { ascending: false }),
      db.from("autosend_templates").select("*"),
    ]);
    setSettings(s.data); setQueue(q.data ?? []); setAttempts(a.data ?? []); setLogs(l.data ?? []);
    setCompanies(c.data ?? []); setPeople(p.data ?? []);
    setTemplates(Object.fromEntries((t.data ?? []).map((x: any) => [x.kind, x])));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); load(); }
  };

  const [sendingNow, setSendingNow] = useState<{ sent: number } | null>(null);
  const cancelSend = useRef(false);
  const sendNow = async () => {
    const c = await autosend<any>("send_now_count").catch((e) => { toast.error(e.message); return null; });
    if (!c) return;
    if (!c.programados) return toast.info("No hay contactos listos para enviar en la cola");
    if (!c.quota_left) return toast.error("Ya se alcanzó el máximo de correos de hoy");
    const n = Math.min(c.programados, c.quota_left);
    if (!confirm(`Se enviarán ${n} correos ahora mismo (de ${c.programados} listos; máximo diario restante ${c.quota_left}). Antes de cada uno se revisan otra vez todas las exclusiones. ¿Enviar?`)) return;
    cancelSend.current = false;
    let total = 0;
    setSendingNow({ sent: 0 });
    try {
      for (;;) {
        const r = await autosend<any>("send_now");
        if (!r.ok) { toast.error(r.reason); break; }
        total += r.sent; setSendingNow({ sent: total });
        if (r.done || cancelSend.current || (!r.sent && !r.remaining)) { if (r.reason) toast.info(r.reason); break; }
      }
      toast.success(`Enviados ahora: ${total}`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setSendingNow(null); load(); }
  };

  const setStatus = (status: string) => run("status", async () => {
    if (status === "active") {
      const v = await autosend<any>("verify_sender");
      if (!v.ok) throw new Error(v.reason ?? "Remitente no autorizado");
    }
    const { error } = await db.from("autosend_settings").update({ status, stop_reason: null, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) throw error;
    await db.from("autosend_log").insert({ message: `Envío automático ${status === "active" ? "activado" : status === "paused" ? "pausado" : "detenido"} por el propietario` });
    toast.success(status === "active" ? "Envío automático activo" : status === "paused" ? "Envío pausado" : "Envío detenido");
  });

  const today = chileDate(new Date());
  const month = today.slice(0, 7);
  const real = attempts.filter((a) => !a.is_test);
  const stats = useMemo(() => ({
    analyzedToday: queue.filter((q) => q.analyzed_at && chileDate(new Date(q.analyzed_at)) === today).length,
    nuevos: queue.filter((q) => q.classification === "nuevo").length,
    pendientes: queue.filter((q) => q.status === "programado" || q.status === "pendiente").length,
    hoy: real.filter((a) => chileDate(new Date(a.sent_at)) === today).length,
    mes: real.filter((a) => chileDate(new Date(a.sent_at)).startsWith(month)).length,
    respuestas: queue.filter((q) => q.status === "respondido").length,
    rebotes: real.filter((a) => a.status === "rebotado").length,
    excluidosHist: queue.filter((q) => q.status === "excluido_historial").length,
  }), [queue, real, today, month]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!settings) return <p className="text-muted-foreground">No se pudo cargar la configuración.</p>;

  const st = settings.status as string;
  const nextSend = (() => {
    if (st !== "active") return "Sin envíos (" + (st === "paused" ? "pausado" : "detenido") + ")";
    if (!queue.some((q) => q.status === "programado")) return "Cola vacía";
    return `Próximo día hábil ${String(settings.window_start).slice(0, 5)}–${String(settings.window_end).slice(0, 5)}`;
  })();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold">Mi correo</h2>
          <p className="text-sm text-muted-foreground">Envío automático desde {settings.sender_name} &lt;{settings.sender_email}&gt;</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={st === "active" ? "default" : st === "paused" ? "secondary" : "destructive"}>
            {st === "active" ? "Activo" : st === "paused" ? "Pausado" : "Detenido"}
          </Badge>
          <Button size="sm" variant="outline" onClick={onBack}>Volver</Button>
        </div>
      </div>
      {settings.stop_reason && <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">⚠️ {settings.stop_reason}</p>}

      <Tabs defaultValue="resumen">
        <TabsList className="flex h-auto flex-wrap">
          {[["resumen", "Resumen"], ["envio", "Envío automático"], ["plantillas", "Plantillas"], ["cola", "Cola de envíos"], ["historial", "Historial"], ["empresas", "Empresas protegidas"], ["contactos", "Contactos protegidos"], ["config", "Configuración"], ["salud", "Salud del remitente"]].map(([v, l]) => (
            <TabsTrigger key={v} value={v}>{l}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="resumen" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Analizados hoy" value={stats.analyzedToday} />
            <Stat label="Contactos nuevos" value={stats.nuevos} />
            <Stat label="Correos pendientes" value={stats.pendientes} />
            <Stat label="Enviados hoy" value={`${stats.hoy}/${settings.daily_limit}`} />
            <Stat label="Enviados este mes" value={stats.mes} />
            <Stat label="Respuestas" value={stats.respuestas} />
            <Stat label="Rebotes" value={stats.rebotes} />
            <Stat label="Excluidos por historial" value={stats.excluidosHist} />
            <Stat label="Empresas protegidas" value={companies.filter((c) => c.estado === "activa").length} />
            <Stat label="Contactos protegidos" value={people.filter((c) => c.estado === "activa").length} />
            <div className="col-span-2 rounded-xl border border-border bg-card px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">Próximo envío programado</p>
              <p className="font-display text-lg font-bold">{nextSend}</p>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="mb-2 font-semibold">Actividad del sistema</p>
            <div className="max-h-72 space-y-1 overflow-auto text-sm">
              {logs.length === 0 && <p className="text-muted-foreground">Sin actividad aún.</p>}
              {logs.map((l) => (
                <p key={l.id} className={l.level === "error" ? "text-destructive" : ""}><span className="text-muted-foreground">{fmt(l.at)}</span> · {l.message}</p>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="envio" className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <p className="text-sm text-muted-foreground">Interruptor general. Pausado: analiza pero no envía. Detenido: no hace nada.</p>
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy === "status" || st === "active"} onClick={() => setStatus("active")}><Play className="mr-1.5 h-4 w-4" />Activar</Button>
              <Button variant="secondary" disabled={busy === "status" || st === "paused"} onClick={() => setStatus("paused")}><Pause className="mr-1.5 h-4 w-4" />Pausar</Button>
              <Button variant="destructive" disabled={busy === "status" || st === "stopped"} onClick={() => setStatus("stopped")}><Square className="mr-1.5 h-4 w-4" />Detener</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
              {sendingNow ? (
                <>
                  <Button disabled><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Enviando… {sendingNow.sent} enviados</Button>
                  <Button variant="outline" onClick={() => { cancelSend.current = true; toast.info("Se detendrá después del correo en curso"); }}>Parar</Button>
                </>
              ) : (
                <Button disabled={!!busy || st === "stopped"} onClick={sendNow}><Send className="mr-1.5 h-4 w-4" />Enviar ahora</Button>
              )}
              <p className="text-xs text-muted-foreground">Envía ya los contactos listos en la Cola, aunque esté fuera de horario o pausado. Respeta el máximo diario y todas las exclusiones. Mantén esta pantalla abierta mientras envía.</p>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <Button variant="outline" disabled={!!busy} onClick={() => run("verify", async () => { const v = await autosend<any>("verify_sender"); setSender(v); v.ok ? toast.success("Remitente autorizado en Gmail") : toast.error(v.reason); })}>
                {busy === "verify" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}Verificar remitente
              </Button>
              <Button variant="outline" disabled={!!busy} onClick={() => run("analyze", async () => { const r = await autosend<any>("analyze"); toast.success(`Analizados ${r.analyzed} (nuevos en cola: ${r.enqueued}). No se envió nada.`); })}>
                {busy === "analyze" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Search className="mr-1.5 h-4 w-4" />}Analizar contactos de Agentes
              </Button>
              <Button variant="outline" disabled={!!busy} onClick={() => run("test", async () => { const r = await autosend<any>("test_send"); toast.success(`Prueba enviada a ${r.to}${r.in_sent ? " · visible en Enviados" : ""}`); })}>
                {busy === "test" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}Enviarme una prueba
              </Button>
            </div>
            {sender && (
              <div className="text-sm">
                {sender.ok ? <p>✅ {sender.name} &lt;{sender.email}&gt; · firma {sender.has_signature ? "encontrada" : "no encontrada"}{sender.has_logo ? " con logo" : ""}</p> : <p className="text-destructive">❌ {sender.reason}</p>}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="plantillas"><TemplatesEditor templates={templates} queue={queue} onSaved={load} /></TabsContent>
        <TabsContent value="cola"><QueueTable rows={queue.filter((q) => ["pendiente", "programado", "enviando", "revision", "error"].includes(q.status))} onChange={load} /></TabsContent>
        <TabsContent value="historial"><QueueTable rows={queue} history attempts={attempts} onChange={load} /></TabsContent>
        <TabsContent value="empresas"><CompaniesTable rows={companies} onChange={load} /></TabsContent>
        <TabsContent value="contactos"><PeopleTable rows={people} onChange={load} /></TabsContent>
        <TabsContent value="config"><SettingsForm settings={settings} onSaved={load} /></TabsContent>
        <TabsContent value="salud"><SenderHealthPanel onBack={onBack} /></TabsContent>
      </Tabs>
    </div>
  );
};

function TemplatesEditor({ templates, queue, onSaved }: { templates: Record<string, any>; queue: any[]; onSaved: () => void }) {
  const [kind, setKind] = useState("presentacion");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [label, setLabel] = useState("");
  const [terms, setTerms] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [sample, setSample] = useState<string>("");
  const isGeneral = kind === "presentacion" || kind === "reactivacion";
  const list = Object.values(templates).sort((a: any, b: any) => (a.kind.startsWith("c_") ? 1 : 0) - (b.kind.startsWith("c_") ? 1 : 0) || String(a.label ?? a.kind).localeCompare(String(b.label ?? b.kind)));
  useEffect(() => { const t = templates[kind]; if (t) { setSubject(t.subject); setBody(t.body); setLabel(t.label ?? ""); setTerms((t.match_terms ?? []).join(", ")); setPreview(null); } }, [kind, templates]);
  const createClient = async () => {
    const base = templates[kind]?.base_kind ?? "presentacion";
    const src = templates[base];
    const id = "c_" + crypto.randomUUID().slice(0, 8);
    const { error } = await db.from("autosend_templates").insert({ kind: id, base_kind: base, label: "Nueva plantilla de cliente", match_terms: [], subject: src?.subject ?? "", body: src?.body ?? "" });
    if (error) return toast.error(error.message);
    toast.success("Plantilla creada: ponle nombre y clientes"); onSaved(); setKind(id);
  };
  const remove = async () => {
    if (isGeneral || !confirm("¿Borrar esta plantilla de cliente?")) return;
    const { error } = await db.from("autosend_templates").delete().eq("kind", kind);
    if (error) return toast.error(error.message);
    setKind("presentacion"); onSaved();
  };
  const doPreview = async () => {
    try { setPreview(await autosend("preview", { kind, subject, body, queue_id: sample || undefined })); } catch (e) { toast.error((e as Error).message); }
  };
  const save = async () => {
    const { error } = await db.from("autosend_templates").update({ subject, body, ...(isGeneral ? {} : { label: label.trim() || "Plantilla de cliente", match_terms: terms.split(/[,\n]/).map((x) => x.trim()).filter(Boolean) }), updated_at: new Date().toISOString() }).eq("kind", kind);
    if (error) return toast.error(error.message);
    toast.success("Plantilla guardada"); onSaved();
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex gap-2">
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
            <SelectContent>{list.map((t: any) => <SelectItem key={t.kind} value={t.kind}>{t.label ?? t.kind}{t.kind.startsWith("c_") ? ` · ${t.base_kind === "reactivacion" ? "Reactivación" : "Presentación"}` : ""}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" onClick={createClient}>+ Plantilla de cliente</Button>
          {!isGeneral && <Button variant="ghost" size="icon" onClick={remove} aria-label="Borrar plantilla"><Trash2 className="h-4 w-4" /></Button>}
        </div>
        {isGeneral ? <p className="text-xs text-muted-foreground">Plantilla general: se usa cuando ninguna plantilla de cliente coincide.</p> : (
          <div className="space-y-2 rounded-md border border-border p-3">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nombre de la plantilla (ej. Bancos)" />
            <Select value={templates[kind]?.base_kind ?? "presentacion"} onValueChange={async (v) => { await db.from("autosend_templates").update({ base_kind: v }).eq("kind", kind); onSaved(); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="presentacion">Para contactos nuevos (presentación)</SelectItem><SelectItem value="reactivacion">Para reactivar (sin respuesta / antiguos)</SelectItem></SelectContent>
            </Select>
            <Textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={2} placeholder="Clientes: empresas o dominios separados por coma (ej. Larrain Vial, bci.cl, Falabella)" />
          </div>
        )}
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Asunto" />
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={18} className="font-mono text-xs" />
        <p className="text-xs text-muted-foreground">Variables: {"{{nombre}}"}, {"{{empresa_corta}}"}. Enlaces: [texto](https://...). La firma de Gmail se agrega sola.</p>
        <div className="flex flex-wrap gap-2">
          <Select value={sample} onValueChange={setSample}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Contacto de ejemplo (Eduardo · Forus)" /></SelectTrigger>
            <SelectContent>{queue.slice(0, 50).map((q) => <SelectItem key={q.id} value={q.id}>{q.nombre} · {q.empresa_corta ?? q.empresa}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" onClick={doPreview}><Eye className="mr-1.5 h-4 w-4" />Vista previa</Button>
          <Button onClick={save}>Guardar</Button>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        {!preview ? <p className="text-sm text-muted-foreground">Pulsa «Vista previa» para ver el correo personalizado con la firma.</p> : (
          <div className="space-y-2 text-sm">
            <p><b>De:</b> {preview.from ?? "—"}</p>
            <p><b>Asunto:</b> {preview.subject}</p>
            {preview.missing?.length > 0 && <p className="text-destructive">Faltan variables: {preview.missing.join(", ")} — no se enviaría.</p>}
            <iframe title="vista previa" className="h-[480px] w-full rounded-md border border-border bg-background" sandbox="" srcDoc={preview.html} />
          </div>
        )}
      </div>
    </div>
  );
}

function QueueTable({ rows, history, attempts = [], onChange }: { rows: any[]; history?: boolean; attempts?: any[]; onChange: () => void }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState<string | null>(null);
  const list = rows.filter((r) => (status === "all" || r.status === status) && (!q || `${r.nombre} ${r.apellido} ${r.empresa} ${r.current_email}`.toLowerCase().includes(q.toLowerCase())));
  const saveShort = async (r: any, v: string) => {
    const key = (r.empresa ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!key || !v.trim()) return;
    await db.from("company_short_names").upsert({ empresa_key: key, short_name: v.trim(), updated_at: new Date().toISOString() });
    await db.from("autosend_queue").update({ empresa_corta: v.trim(), status: r.status === "programado" || r.status === "revision" ? "pendiente" : r.status }).eq("empresa", r.empresa).in("status", ["pendiente", "programado", "revision"]);
    toast.success(`Nombre corto guardado: ${v.trim()}`); onChange();
  };
  const reanalyze = async (id: string) => { try { await autosend("reanalyze", { queue_id: id }); toast.success("Reanalizado"); onChange(); } catch (e) { toast.error((e as Error).message); } };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input className="w-64" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todos los estados</SelectItem>{Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
        </Select>
        <Button size="sm" variant="ghost" onClick={onChange}><RefreshCw className="h-4 w-4" /></Button>
        <span className="self-center text-sm text-muted-foreground">{list.length} contactos</span>
      </div>
      <div className="overflow-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="p-2">Nombre</th><th className="p-2">Empresa corta</th><th className="p-2">Correo</th><th className="p-2">Clasificación</th><th className="p-2">Estado</th><th className="p-2">{history ? "Enviado" : "Plantilla"}</th><th className="p-2"></th></tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <Fragment key={r.id}>
                <tr className="cursor-pointer border-t border-border hover:bg-muted/30" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <td className="p-2">{r.nombre} {r.apellido}</td>
                  <td className="p-2" onClick={(e) => e.stopPropagation()}>
                    <Input className="h-7 w-44" defaultValue={r.empresa_corta ?? ""} title={r.empresa} onBlur={(e) => e.target.value !== (r.empresa_corta ?? "") && saveShort(r, e.target.value)} />
                  </td>
                  <td className="p-2">{r.current_email}{r.attempt > 1 && <Badge variant="outline" className="ml-1">MAIL2</Badge>}</td>
                  <td className="p-2">{CLASS_LABEL[r.classification] ?? "—"}</td>
                  <td className="p-2"><Badge variant={statusVariant(r.status)}>{STATUS_LABEL[r.status] ?? r.status}</Badge></td>
                  <td className="p-2">{history ? fmt(r.sent_at) : r.template_kind ?? "—"}</td>
                  <td className="p-2"><ProtectContactButton size="icon" prefill={{ nombre: r.nombre, apellidos: [r.apellido, r.apellido2].filter(Boolean).join(" "), empresa: r.empresa, correos: [r.mail1, r.mail2] }} /></td>
                </tr>
                {open === r.id && (
                  <tr className="bg-muted/20"><td colSpan={7} className="space-y-1 p-3 text-xs">
                    <p><b>Motivo:</b> {r.reason ?? "—"}</p>
                    <p><b>Próxima acción:</b> {r.next_action ?? "—"} · <b>Analizado:</b> {fmt(r.analyzed_at)} · <b>Asunto:</b> {r.subject ?? "—"}</p>
                    {r.analysis && <p className="text-muted-foreground">Gmail persona: {r.analysis.gmail_persona} · Gmail empresa: {r.analysis.gmail_empresa} · CRM: {r.analysis.crm} · campañas: {r.analysis.campañas} · último contacto: {r.analysis.ultimo_contacto ?? "—"}</p>}
                    {history && attempts.filter((a) => a.queue_id === r.id).map((a) => (
                      <p key={a.id}>Intento {fmt(a.sent_at)} → {a.email} desde {a.sender} · {a.status}{a.gmail_thread_id ? ` · hilo ${a.gmail_thread_id}` : ""}{a.error ? ` · ${a.error}` : ""}</p>
                    ))}
                    {!["enviado", "enviando", "respondido"].includes(r.status) && <Button size="sm" variant="outline" onClick={() => reanalyze(r.id)}>Reanalizar</Button>}
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CompaniesTable({ rows, onChange }: { rows: any[]; onChange: () => void }) {
  const empty = { nombre_comercial: "", razon_social: "", dominio: "", dominios_alt: "", motivo: "Cliente actual" };
  const [f, setF] = useState<any>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [finding, setFinding] = useState(false);
  const [found, setFound] = useState<{ domain: string; hits: number; matches_name: boolean }[] | null>(null);
  const findDomain = async () => {
    if (!f.nombre_comercial.trim()) return toast.error("Escribe primero el nombre comercial");
    setFinding(true); setFound(null);
    try {
      const r: any = await autosend("find_domain", { name: f.nombre_comercial });
      setFound(r.domains ?? []);
      const best = (r.domains ?? []).find((d: any) => d.matches_name) ?? r.domains?.[0];
      if (best && !f.dominio) setF((x: any) => ({ ...x, dominio: best.domain }));
      if (!r.domains?.length) toast.info("No encontré correos con esa empresa en tu Gmail");
    } catch (e: any) { toast.error(String(e.message ?? e)); } finally { setFinding(false); }
  };
  const pickDomain = (d: string) => {
    if (!f.dominio) return setF({ ...f, dominio: d });
    if (f.dominio === d) return;
    const alt = String(f.dominios_alt).split(/[,\s]+/).filter(Boolean);
    if (!alt.includes(d)) setF({ ...f, dominios_alt: [...alt, d].join(", ") });
  };
  const save = async () => {
    if (!f.nombre_comercial.trim()) return toast.error("Falta el nombre comercial");
    const row = { ...f, dominio: f.dominio.trim().toLowerCase() || null, dominios_alt: String(f.dominios_alt).split(/[,\s]+/).map((d: string) => d.trim().toLowerCase()).filter(Boolean) };
    const { error } = editing ? await db.from("protected_companies").update(row).eq("id", editing) : await db.from("protected_companies").insert({ ...row, estado: "activa" });
    if (error) return toast.error(error.message);
    setF(empty); setEditing(null); toast.success("Empresa guardada"); onChange();
  };
  const list = rows.filter((r) => (filter === "all" || r.estado === filter) && (!q || `${r.nombre_comercial} ${r.razon_social} ${r.dominio}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="space-y-3">
      <div className="grid gap-2 rounded-xl border border-border bg-card p-3 md:grid-cols-6">
        <div className="flex gap-1">
          <Input placeholder="Nombre comercial" value={f.nombre_comercial} onChange={(e) => setF({ ...f, nombre_comercial: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") findDomain(); }} />
          <Button size="icon" variant="outline" title="Buscar dominio en mi Gmail" onClick={findDomain} disabled={finding}>{finding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}</Button>
        </div>
        <Input placeholder="Razón social" value={f.razon_social ?? ""} onChange={(e) => setF({ ...f, razon_social: e.target.value })} />
        <Input placeholder="Dominio principal" value={f.dominio ?? ""} onChange={(e) => setF({ ...f, dominio: e.target.value })} />
        <Input placeholder="Dominios alternativos" value={f.dominios_alt} onChange={(e) => setF({ ...f, dominios_alt: e.target.value })} />
        <Select value={f.motivo} onValueChange={(v) => setF({ ...f, motivo: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{COMPANY_REASONS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <Button onClick={save}>{editing ? "Guardar cambios" : "Agregar"}</Button>
        {found && found.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 md:col-span-6">
            <span className="text-xs text-muted-foreground">Encontrado en tu Gmail (clic para usar):</span>
            {found.map((d) => <Button key={d.domain} size="sm" variant={d.matches_name ? "default" : "outline"} onClick={() => pickDomain(d.domain)}>{d.domain} · {d.hits}</Button>)}
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <Input className="w-64" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todas</SelectItem><SelectItem value="activa">Activas</SelectItem><SelectItem value="sugerida">Sugeridas</SelectItem><SelectItem value="inactiva">Inactivas</SelectItem></SelectContent>
        </Select>
      </div>
      <div className="overflow-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className="p-2">Nombre comercial</th><th className="p-2">Razón social</th><th className="p-2">Dominio</th><th className="p-2">Alternativos</th><th className="p-2">Motivo</th><th className="p-2">Fecha</th><th className="p-2">Estado</th><th className="p-2">Acciones</th></tr></thead>
          <tbody>{list.map((r) => (
            <tr key={r.id} className="border-t border-border">
              <td className="p-2 font-medium">{r.nombre_comercial}</td><td className="p-2">{r.razon_social}</td><td className="p-2">{r.dominio}</td><td className="p-2">{(r.dominios_alt ?? []).join(", ")}</td>
              <td className="p-2" title={r.nota ?? ""}>{r.motivo}</td><td className="p-2">{fmt(r.created_at)}</td>
              <td className="p-2"><Badge variant={r.estado === "activa" ? "default" : "outline"}>{r.estado}</Badge></td>
              <td className="flex gap-1 p-2">
                {r.estado === "sugerida" && <Button size="sm" onClick={async () => { await db.from("protected_companies").update({ estado: "activa" }).eq("id", r.id); onChange(); }}>Aprobar</Button>}
                <Button size="sm" variant="ghost" onClick={() => { setEditing(r.id); setF({ ...r, dominio: r.dominio ?? "", dominios_alt: (r.dominios_alt ?? []).join(", ") }); }}>Editar</Button>
                <Button size="icon" variant="ghost" onClick={async () => { if (confirm(`¿Quitar ${r.nombre_comercial} de la lista?`)) { await db.from("protected_companies").delete().eq("id", r.id); onChange(); } }}><Trash2 className="h-4 w-4" /></Button>
              </td>
            </tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}

function PeopleTable({ rows, onChange }: { rows: any[]; onChange: () => void }) {
  const [q, setQ] = useState("");
  const list = rows.filter((r) => !q || `${r.nombre} ${r.apellidos} ${r.empresa} ${(r.correos ?? []).join(" ")}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-3">
      <div className="flex gap-2"><Input className="w-64" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} /><ProtectContactButton prefill={{}} /></div>
      <div className="overflow-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className="p-2">Nombre</th><th className="p-2">Apellidos</th><th className="p-2">Empresa</th><th className="p-2">Cargo</th><th className="p-2">Correos</th><th className="p-2">LinkedIn</th><th className="p-2">Motivo</th><th className="p-2">Fecha</th><th className="p-2">Estado</th><th className="p-2"></th></tr></thead>
          <tbody>{list.map((r) => (
            <tr key={r.id} className="border-t border-border">
              <td className="p-2">{r.nombre}</td><td className="p-2">{r.apellidos}</td><td className="p-2">{r.empresa}</td><td className="p-2">{r.cargo}</td>
              <td className="p-2">{(r.correos ?? []).join(", ")}</td><td className="p-2">{r.linkedin}</td><td className="p-2">{r.motivo}</td><td className="p-2">{fmt(r.created_at)}</td>
              <td className="p-2">
                <Switch checked={r.estado === "activa"} onCheckedChange={async (v) => { await db.from("protected_contacts").update({ estado: v ? "activa" : "inactiva" }).eq("id", r.id); onChange(); }} />
              </td>
              <td className="p-2"><Button size="icon" variant="ghost" onClick={async () => { if (confirm("¿Quitar protección?")) { await db.from("protected_contacts").delete().eq("id", r.id); onChange(); } }}><Trash2 className="h-4 w-4" /></Button></td>
            </tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}

function SenderPicker({ current, name, onSaved }: { current: string; name: string; onSaved: () => void }) {
  const [list, setList] = useState<{ email: string; name: string; primary: boolean }[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { autosend("list_senders").then((r: any) => setList(r.senders ?? [])).catch((e) => { toast.error(String(e.message ?? e)); setList([]); }); }, []);
  const pick = async (email: string) => {
    if (email === current) return;
    setBusy(true);
    try { await autosend("set_sender", { email }); toast.success(`Ahora se envía desde ${email}`); onSaved(); }
    catch (e: any) { toast.error(String(e.message ?? e)); } finally { setBusy(false); }
  };
  return (
    <div>
      <Label>Enviar desde</Label>
      {list === null ? <p className="mt-1 text-sm text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" />Buscando correos autorizados en Gmail…</p> : (
        <Select value={current} onValueChange={pick} disabled={busy}>
          <SelectTrigger className="mt-1"><SelectValue placeholder={`${name} <${current}>`} /></SelectTrigger>
          <SelectContent>
            {!list.some((x) => x.email.toLowerCase() === current.toLowerCase()) && <SelectItem value={current}>{name} &lt;{current}&gt;</SelectItem>}
            {list.map((x) => <SelectItem key={x.email} value={x.email}>{(x.name || name)} &lt;{x.email}&gt;{x.primary ? " (principal)" : ""}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

function SettingsForm({ settings, onSaved }: { settings: any; onSaved: () => void }) {
  const [f, setF] = useState<any>({ ...settings, window_start: String(settings.window_start).slice(0, 5), window_end: String(settings.window_end).slice(0, 5) });
  const num = (k: string) => (e: ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: Math.max(0, Number(e.target.value) || 0) });
  const save = async () => {
    if (f.window_end <= f.window_start) return toast.error("El horario de término debe ser posterior al inicio");
    if (f.daily_limit < 1 || f.daily_limit > 200) return toast.error("Máximo diario entre 1 y 200");
    const { error } = await db.from("autosend_settings").update({
      daily_limit: f.daily_limit, send_days: f.send_days, window_start: f.window_start, window_end: f.window_end, interval_minutes: Math.max(1, f.interval_minutes),
      recontact_days: f.recontact_days, bounce_stop_threshold: Math.max(1, f.bounce_stop_threshold), include_optout: f.include_optout, updated_at: new Date().toISOString(),
    }).eq("id", 1);
    if (error) return toast.error(error.message);
    toast.success("Configuración guardada"); onSaved();
  };
  return (
    <div className="max-w-2xl space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Máximo de correos diarios</Label><Input type="number" value={f.daily_limit} onChange={num("daily_limit")} /></div>
        <div><Label>Minutos entre envíos</Label><Input type="number" value={f.interval_minutes} onChange={num("interval_minutes")} /></div>
        <div><Label>Desde (hora de Chile)</Label><Input type="time" value={f.window_start} onChange={(e) => setF({ ...f, window_start: e.target.value })} /></div>
        <div><Label>Hasta</Label><Input type="time" value={f.window_end} onChange={(e) => setF({ ...f, window_end: e.target.value })} /></div>
        <div><Label>Días mínimos para recontactar</Label><Input type="number" value={f.recontact_days} onChange={num("recontact_days")} /></div>
        <div><Label>Pausar si hay N rebotes en el día</Label><Input type="number" value={f.bounce_stop_threshold} onChange={num("bounce_stop_threshold")} /></div>
      </div>
      <div>
        <Label>Días de envío</Label>
        <div className="mt-1 flex gap-1">{DAYS.map(([d, l]) => (
          <Button key={d} size="sm" variant={f.send_days.includes(d) ? "default" : "outline"} onClick={() => setF({ ...f, send_days: f.send_days.includes(d) ? f.send_days.filter((x: number) => x !== d) : [...f.send_days, d].sort() })}>{l}</Button>
        ))}</div>
      </div>
      <SenderPicker current={f.sender_email} name={f.sender_name} onSaved={onSaved} />
      <div className="flex items-center gap-2"><Switch checked={f.include_optout} onCheckedChange={(v) => setF({ ...f, include_optout: v })} /><Label>Incluir enlace pequeño para pedir no recibir más correos</Label></div>
      <p className="text-xs text-muted-foreground">Plantillas de presentación y reactivación: se editan en «Plantillas». La revisión automática corre cada 15 minutos de lunes a viernes por la mañana.</p>
      <Button onClick={save}>Guardar configuración</Button>
    </div>
  );
}

export default AutosendPanel;
