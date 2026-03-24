import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Search, Check, X, Pencil, Mail, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { connectGmail, getGoogleToken, extractProviderTokenFromUrl } from "@/lib/gmailSync";

type Prospect = {
  id: string;
  company: string;
  contact_name: string;
  email: string;
  status: string;
  note: string;
  industry: string;
  referred_by: string;
  created_at: string;
  updated_at: string;
};

const STATUSES = [
  { value: "hot", label: "Hot", badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  { value: "warm", label: "Warm", badge: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  { value: "no_for_now", label: "No por ahora", badge: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
  { value: "no_response", label: "Sin respuesta", badge: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  { value: "auto_reply", label: "Auto-reply", badge: "bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400" },
];

const statusBadge = (status: string) => STATUSES.find(s => s.value === status) || STATUSES[3];

function extractErrorMessageFromUnknown(details: unknown): string {
  if (!details) return "";

  if (typeof details === "string") {
    try {
      const parsed = JSON.parse(details);
      return parsed?.error?.message || parsed?.message || details;
    } catch {
      return details;
    }
  }

  if (typeof details === "object") {
    const obj = details as { error?: { message?: string }; message?: string };
    return obj?.error?.message || obj?.message || JSON.stringify(details);
  }

  return String(details);
}

async function getEdgeInvokeErrorMessage(error: any): Promise<string> {
  const fallback = error?.message || "Error desconocido llamando a gmail-sync";
  const response = error?.context;

  if (!(response instanceof Response)) return fallback;

  try {
    const text = await response.text();
    if (!text) return fallback;

    try {
      const parsed = JSON.parse(text);
      const details = extractErrorMessageFromUnknown(parsed?.details);
      return details ? `${parsed?.error || fallback} — ${details}` : parsed?.error || fallback;
    } catch {
      return text;
    }
  } catch {
    return fallback;
  }
}

function getOAuthErrorFromUrl(): string | null {
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  const rawError = searchParams.get("error") || hashParams.get("error");
  const rawDescription = searchParams.get("error_description") || hashParams.get("error_description");

  if (!rawError && !rawDescription) return null;

  const decodedError = rawError ? decodeURIComponent(rawError.replace(/\+/g, " ")) : "OAuth error";
  const decodedDescription = rawDescription ? decodeURIComponent(rawDescription.replace(/\+/g, " ")) : "";

  return decodedDescription ? `${decodedError}: ${decodedDescription}` : decodedError;
}

export default function ProspectsCRM({ onBack }: { onBack: () => void }) {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newProspect, setNewProspect] = useState({ company: "", contact_name: "", email: "", status: "no_response", note: "", industry: "", referred_by: "" });
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState("");
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailTokenStatus, setGmailTokenStatus] = useState("Verificando token de Gmail...");

  useEffect(() => {
    const oauthError = getOAuthErrorFromUrl();
    if (oauthError) {
      setGmailTokenStatus(`✗ Error OAuth: ${oauthError}`);
      toast.error(`Google OAuth falló: ${oauthError}`);
    }

    // Try to extract provider_token directly from URL hash (most reliable)
    const urlToken = extractProviderTokenFromUrl();
    if (urlToken) {
      setGmailConnected(true);
      setGmailTokenStatus("✓ Token Gmail detectado (URL callback)");
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[Gmail] Auth event:", event, "provider_token:", session?.provider_token ? "YES" : "null");
      if (session?.provider_token) {
        localStorage.setItem("gmail_token", session.provider_token);
        setGmailConnected(true);
        setGmailTokenStatus(`✓ Token Gmail detectado (${event})`);
      } else if (event === "SIGNED_OUT") {
        localStorage.removeItem("gmail_token");
        setGmailConnected(false);
        setGmailTokenStatus("✗ Sesión cerrada. Conecta Gmail.");
      }
    });

    // Fallback: check getSession + localStorage
    const checkToken = async () => {
      if (urlToken) return; // already found
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.provider_token) {
        localStorage.setItem("gmail_token", session.provider_token);
        setGmailConnected(true);
        setGmailTokenStatus("✓ Token Gmail detectado (session)");
      } else if (localStorage.getItem("gmail_token")) {
        setGmailConnected(true);
        setGmailTokenStatus("✓ Token Gmail detectado (guardado)");
      } else if (!oauthError) {
        setGmailTokenStatus("✗ Token Gmail no detectado. Conecta Gmail.");
      }
    };
    checkToken();

    return () => subscription.unsubscribe();
  }, []);

  const handleConnectGmail = async () => {
    setGmailTokenStatus("Solicitando permisos de Gmail en Google...");
    const url = await connectGmail();
    if (!url) {
      setGmailTokenStatus("✗ No se pudo iniciar OAuth de Google. Reintenta.");
      toast.error("No se pudo iniciar la conexión con Gmail");
    }
  };

  const handleSyncGmail = async () => {
    // Try multiple sources for the Gmail token
    const localToken = localStorage.getItem("gmail_token");
    let token = localToken;
    let tokenSource = localToken ? "localStorage" : "";

    if (!token) {
      // Fallback: try current session
      const { data: { session } } = await supabase.auth.getSession();
      token = session?.provider_token || null;
      if (token) {
        tokenSource = "session.provider_token";
        localStorage.setItem("gmail_token", token);
        console.log("[Gmail] Token recovered from session");
      }
    }

    if (!token) {
      const fallbackToken = getGoogleToken();
      if (fallbackToken) {
        token = fallbackToken;
        tokenSource = "storage fallback";
        localStorage.setItem("gmail_token", fallbackToken);
        console.log("[Gmail] Token recovered from storage fallback");
      }
    }

    setGmailTokenStatus(token ? `✓ Token Gmail detectado (${tokenSource})` : "✗ Token Gmail no detectado. Conecta Gmail.");

    if (!token) {
      toast.error("Necesitas conectar Gmail primero");
      setSyncProgress("✗ Token no encontrado. Conecta Gmail primero.");
      return;
    }
    console.log("[Gmail] Starting sync, token length:", token.length);
    setSyncing(true);
    setSyncProgress("Sincronizando con Gmail...");
    try {
      const { data, error } = await supabase.functions.invoke("gmail-sync", {
        body: { gmail_token: token },
      });
      console.log("[Gmail] Edge function response:", { data, error });
      if (error) {
        const exactError = await getEdgeInvokeErrorMessage(error);
        throw new Error(exactError);
      }

      if (data?.error) {
        const details = extractErrorMessageFromUnknown(data.details);
        const fullError = details ? `${data.error} — ${details}` : data.error;

        if (fullError.includes("401") || fullError.includes("invalid")) {
          setGmailConnected(false);
          localStorage.removeItem("gmail_token");
          setGmailTokenStatus("✗ Token Gmail expirado o inválido. Reconecta Gmail.");
          setSyncProgress("✗ Token expirado. Reconecta Gmail.");
        } else {
          setSyncProgress(`✗ Error Gmail API: ${fullError}`);
        }
        toast.error(fullError);
        return;
      }

      const { created = 0, updated = 0, errors = [], message = "" } = data || {};

      if (message) {
        setSyncProgress(`⚠ ${message}`);
        toast.warning(message);
      }

      if (errors.length > 0) {
        setSyncProgress(`⚠ ${created} nuevos, ${updated} actualizados, ${errors.length} errores. Detalle: ${errors[0]}`);
        toast.warning(`Sync parcial: ${errors.length} errores`);
      } else {
        setSyncProgress(`✓ ${created + updated} prospectos sincronizados (${created} nuevos, ${updated} actualizados)`);
        toast.success(`${created + updated} prospectos sincronizados`);
      }
      loadProspects();
    } catch (err: any) {
      const msg = err?.message || String(err);
      setSyncProgress(`✗ Error: ${msg}`);
      toast.error(`Error: ${msg}`);
    } finally {
      setSyncing(false);
    }
  };

  const loadProspects = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("prospects").select("*").order("updated_at", { ascending: false });
    if (error) { toast.error("Error cargando prospectos"); console.error(error); }
    else setProspects((data || []) as Prospect[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadProspects(); }, [loadProspects]);

  const filtered = prospects.filter(p => {
    const matchStatus = filterStatus === "all" || p.status === filterStatus;
    const q = search.toLowerCase();
    const matchSearch = !q || p.company.toLowerCase().includes(q) || p.contact_name.toLowerCase().includes(q) || (p.email || "").toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const startEdit = (p: Prospect) => { setEditingId(p.id); setEditNote(p.note || ""); setEditStatus(p.status); };

  const saveEdit = async () => {
    if (!editingId) return;
    const { error } = await supabase.from("prospects").update({ note: editNote, status: editStatus, updated_at: new Date().toISOString() }).eq("id", editingId);
    if (error) toast.error("Error guardando");
    else { toast.success("Actualizado"); loadProspects(); }
    setEditingId(null);
  };

  const addProspect = async () => {
    if (!newProspect.company || !newProspect.contact_name) { toast.error("Empresa y contacto son requeridos"); return; }
    const { error } = await supabase.from("prospects").insert(newProspect);
    if (error) toast.error("Error agregando prospecto");
    else { toast.success("Prospecto agregado"); setNewProspect({ company: "", contact_name: "", email: "", status: "no_response", note: "", industry: "", referred_by: "" }); setShowAdd(false); loadProspects(); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight">Prospects CRM</h2>
            <p className="text-sm text-muted-foreground">{prospects.length} prospectos</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!gmailConnected ? (
            <Button size="sm" variant="outline" onClick={handleConnectGmail}>
              <Mail className="mr-1.5 h-3.5 w-3.5" />
              Conectar Gmail
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={handleSyncGmail} disabled={syncing}>
              {syncing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
              {syncing ? "Sincronizando..." : "Sync Gmail"}
            </Button>
          )}
          <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />{showAdd ? "Cancelar" : "Agregar"}
          </Button>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Input placeholder="Empresa *" value={newProspect.company} onChange={e => setNewProspect(p => ({ ...p, company: e.target.value }))} />
            <Input placeholder="Contacto *" value={newProspect.contact_name} onChange={e => setNewProspect(p => ({ ...p, contact_name: e.target.value }))} />
            <Input placeholder="Email" value={newProspect.email} onChange={e => setNewProspect(p => ({ ...p, email: e.target.value }))} />
            <Select value={newProspect.status} onValueChange={v => setNewProspect(p => ({ ...p, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
            <Input placeholder="Industria" value={newProspect.industry} onChange={e => setNewProspect(p => ({ ...p, industry: e.target.value }))} />
            <Input placeholder="Referido por" value={newProspect.referred_by} onChange={e => setNewProspect(p => ({ ...p, referred_by: e.target.value }))} />
          </div>
          <Input placeholder="Nota" value={newProspect.note} onChange={e => setNewProspect(p => ({ ...p, note: e.target.value }))} />
          <Button size="sm" onClick={addProspect}>Guardar prospecto</Button>
        </div>
      )}

      {/* Sync progress */}
      <div className={`rounded-lg border px-4 py-2 text-xs ${
        gmailTokenStatus.startsWith("✓")
          ? "border-primary/30 bg-primary/5 text-foreground"
          : gmailTokenStatus.startsWith("✗")
            ? "border-destructive/30 bg-destructive/10 text-destructive"
            : "border-border bg-muted/50 text-muted-foreground"
      }`}>
        {gmailTokenStatus}
      </div>

      {syncProgress && (
        <div className={`rounded-lg border px-4 py-3 text-sm flex items-center gap-2 ${
          syncProgress.startsWith("✓") ? "border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" :
          syncProgress.startsWith("✗") ? "border-destructive/30 bg-destructive/10 text-destructive" :
          syncProgress.startsWith("⚠") ? "border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300" :
          "border-border bg-muted/50 text-muted-foreground"
        }`}>
          {syncing && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
          {syncProgress}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar empresa o contacto..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-1.5">
          <Button variant={filterStatus === "all" ? "default" : "outline"} size="sm" onClick={() => setFilterStatus("all")}>Todos</Button>
          {STATUSES.map(s => (
            <Button key={s.value} variant={filterStatus === s.value ? "default" : "outline"} size="sm" onClick={() => setFilterStatus(s.value)}>
              {s.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
          <p className="text-muted-foreground">No se encontraron prospectos.</p>
          <Button size="sm" className="mt-3" onClick={() => setShowAdd(true)}>Agregar el primero</Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Empresa</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Contacto</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Nota</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Fecha</th>
                <th className="px-4 py-3 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(p => {
                const badge = statusBadge(p.status);
                const isEditing = editingId === p.id;
                return (
                  <tr key={p.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{p.company}</td>
                    <td className="px-4 py-3">
                      <div>{p.contact_name}</div>
                      {p.email && <div className="text-xs text-muted-foreground">{p.email}</div>}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <Select value={editStatus} onValueChange={setEditStatus}>
                          <SelectTrigger className="h-7 w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>{STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : (
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.badge}`}>
                          {badge.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      {isEditing ? (
                        <Input value={editNote} onChange={e => setEditNote(e.target.value)} className="h-7 text-xs" />
                      ) : (
                        <span className="text-xs text-muted-foreground line-clamp-2">{p.note || "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                      {new Date(p.updated_at).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "2-digit" })}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={saveEdit}><Check className="h-3.5 w-3.5 text-emerald-600" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(null)}><X className="h-3.5 w-3.5 text-red-500" /></Button>
                        </div>
                      ) : (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
