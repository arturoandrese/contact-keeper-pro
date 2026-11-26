import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Bot, ExternalLink, RefreshCw } from "lucide-react";
import * as XLSX from "xlsx";
import ExportDropdown from "./ExportDropdown";

interface RunResult {
  recibidos?: number; nuevos?: number; repetidos?: number; invalidos?: number; errores?: number;
  detalle?: { repetidos?: { nombre?: string; empresa?: string; coincidencias?: string[] }[]; invalidos?: { nombre?: string; empresa?: string; motivos?: string[] }[]; errores?: { index: number; error: string }[] };
}
interface Run { id: string; source: string; run_date: string; base_id: string | null; base_name: string | null; result: RunResult; created_at: string }
interface Prospect {
  id: string; nombre: string; cargo: string | null; empresa: string; industria: string | null; dominio: string | null;
  linkedin_url: string | null; correo_verificado: string | null; correo_probable_1: string | null; correo_probable_2: string | null;
  fuente_patron: string | null; estado: string; relevancia: number | null;
}

const HEADERS = ["NOMBRE", "CARGO", "EMPRESA", "INDUSTRIA", "LINKEDIN", "CORREO", "TIPO CORREO", "CORREO PROBABLE 2", "FUENTE PATRÓN", "ESTADO", "RELEVANCIA"];
const correo = (p: Prospect) => p.correo_verificado || p.correo_probable_1 || p.correo_probable_2 || "";
// Only a correo_verificado counts as verified; everything else is inferred.
const tipo = (p: Prospect) => (p.correo_verificado ? "verificado" : correo(p) ? "inferido" : "");
const toRow = (p: Prospect) => [p.nombre, p.cargo ?? "", p.empresa, p.industria ?? "", p.linkedin_url ?? "", correo(p), tipo(p),
  p.correo_verificado ? "" : p.correo_probable_1 ? p.correo_probable_2 ?? "" : "", p.fuente_patron ?? "", p.estado, p.relevancia?.toString() ?? ""];

interface Props { onSelectBase: (baseId: string, baseName: string, crossed: boolean) => void }

const AgentsPanel = ({ onSelectBase }: Props) => {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [sel, setSel] = useState<Run | null>(null);
  const [prospects, setProspects] = useState<Prospect[] | null>(null);

  const load = async () => {
    setRuns(null); setError(null); setDenied(null);
    const { data, error } = await supabase.functions.invoke("agent-runs", { body: { action: "runs" } });
    if (error || data?.error) {
      let body: { error?: string; code?: string } | null = data ?? null;
      try { body = await (error as { context?: Response })?.context?.json(); } catch { /* ignore */ }
      if (body?.code) { setDenied(body.code); setRuns([]); return; }
      setError(error?.message || data.error); setRuns([]); return;
    }
    setRuns(data.runs ?? []);
  };
  useEffect(() => { load(); }, []);

  const sources = useMemo(() => [...new Set((runs ?? []).map(r => r.source))], [runs]);
  const active = source ?? sources[0] ?? null;
  const shown = (runs ?? []).filter(r => r.source === active);

  const openRun = async (r: Run) => {
    setSel(r); setProspects(null);
    const { data, error } = await supabase.functions.invoke("agent-runs", { body: { action: "prospects", source: r.source, run_date: r.run_date, base_id: r.base_id } });
    setProspects(error || data?.error ? [] : data.prospects ?? []);
  };

  const exportXlsx = () => {
    if (!sel || !prospects) return;
    const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...prospects.map(toRow)]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Prospectos");
    XLSX.writeFile(wb, `${sel.source} - ${sel.run_date}.xlsx`);
  };

  if (runs === null) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  if (denied) return (
    <div className="rounded-lg border border-dashed p-10 text-center space-y-2">
      <h2 className="font-display text-xl font-bold">Acceso requerido</h2>
      <p className="text-sm text-muted-foreground">
        {denied === "access_not_configured" ? "Los datos de agentes están protegidos y aún no hay un usuario autorizado configurado."
          : denied === "forbidden" ? "Tu usuario no está autorizado para ver los datos de agentes."
          : "Debes iniciar sesión con el usuario autorizado para ver los datos de agentes."}
      </p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold">Agentes</h2>
          <p className="text-sm text-muted-foreground mt-1">Importaciones automáticas por agente y día. Solo lectura: aquí no se envían correos.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Actualizar</Button>
      </div>
      {error && <p className="text-sm text-destructive">No se pudo cargar: {error}</p>}
      {sources.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {sources.map(s => (
            <Button key={s} size="sm" variant={s === active ? "default" : "outline"} onClick={() => { setSource(s); setSel(null); }}>
              <Bot className="mr-1.5 h-3.5 w-3.5" />{s}
            </Button>
          ))}
        </div>
      )}
      {!error && shown.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Todavía no hay importaciones de agentes. Cuando AGENTE 007 importe su primer lote, aparecerá aquí.
        </div>
      )}
      {shown.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="p-2">Fecha</th><th className="p-2">Recibidos</th><th className="p-2">Nuevos</th><th className="p-2">Repetidos</th><th className="p-2">Inválidos</th><th className="p-2">Errores</th><th className="p-2">Base</th></tr>
            </thead>
            <tbody>
              {shown.map(r => (
                <tr key={r.id} onClick={() => openRun(r)} className={`cursor-pointer border-t hover:bg-muted/40 ${sel?.id === r.id ? "bg-muted/60" : ""}`}>
                  <td className="p-2 font-medium">{r.run_date}</td>
                  <td className="p-2">{r.result.recibidos ?? 0}</td>
                  <td className="p-2">{r.result.nuevos ?? 0}</td>
                  <td className="p-2">{r.result.repetidos ?? 0}</td>
                  <td className="p-2">{r.result.invalidos ?? 0}</td>
                  <td className="p-2">{r.result.errores ?? 0}</td>
                  <td className="p-2">
                    {r.base_id ? (
                      <Button size="sm" variant="ghost" onClick={e => { e.stopPropagation(); onSelectBase(r.base_id!, r.base_name ?? `${r.source} - ${r.run_date}`, false); }}>
                        <ExternalLink className="mr-1 h-3.5 w-3.5" />{r.base_name ?? "Abrir base"}
                      </Button>
                    ) : <span className="text-muted-foreground">Sin nuevos</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {sel && (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold">{sel.source} — {sel.run_date}</h3>
            <ExportDropdown label="Exportar" onDownload={exportXlsx} disabled={!prospects?.length}
              getData={() => ({ headers: HEADERS, rows: (prospects ?? []).map(toRow) })} />
          </div>
          {prospects === null ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> :
            prospects.length === 0 ? <p className="text-sm text-muted-foreground">Este día no hubo contactos nuevos.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="p-2">Nombre</th><th className="p-2">Cargo</th><th className="p-2">Empresa</th><th className="p-2">Industria</th><th className="p-2">LinkedIn</th><th className="p-2">Correo</th><th className="p-2">Fuente patrón</th><th className="p-2">Estado</th></tr>
                </thead>
                <tbody>
                  {prospects.map(p => (
                    <tr key={p.id} className="border-t">
                      <td className="p-2 font-medium">{p.nombre}</td>
                      <td className="p-2">{p.cargo}</td>
                      <td className="p-2">{p.empresa}</td>
                      <td className="p-2">{p.industria}</td>
                      <td className="p-2">{p.linkedin_url && <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary underline">Perfil</a>}</td>
                      <td className="p-2">{correo(p)} {tipo(p) && <Badge variant={tipo(p) === "verificado" ? "default" : "secondary"} className="ml-1">{tipo(p)}</Badge>}</td>
                      <td className="p-2">{p.fuente_patron}</td>
                      <td className="p-2">{p.estado}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(sel.result.detalle?.repetidos?.length || sel.result.detalle?.invalidos?.length || sel.result.detalle?.errores?.length) ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Ver repetidos, inválidos y errores</summary>
              <ul className="mt-2 space-y-1">
                {sel.result.detalle?.repetidos?.map((d, i) => <li key={`r${i}`}>🔁 {d.nombre} ({d.empresa}): {d.coincidencias?.join(", ")}</li>)}
                {sel.result.detalle?.invalidos?.map((d, i) => <li key={`i${i}`}>⛔ {d.nombre ?? "—"} ({d.empresa ?? "—"}): {d.motivos?.join(", ")}</li>)}
                {sel.result.detalle?.errores?.map((d, i) => <li key={`e${i}`}>⚠️ #{d.index}: {d.error}</li>)}
              </ul>
            </details>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default AgentsPanel;
