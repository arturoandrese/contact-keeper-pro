import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";

// Autosend tables are not in generated types yet; RLS still requires the PIN session.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = supabase as any;

export async function autosend<T = Record<string, unknown>>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("autosend", { body: { action, ...body } });
  if (error) {
    let msg = error.message;
    if (error instanceof FunctionsHttpError) {
      try { msg = (await error.context.json()).error ?? msg; } catch { /* keep */ }
    }
    throw new Error(msg);
  }
  return data as T;
}

export const STATUS_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  programado: "Programado",
  enviando: "Enviando",
  enviado: "Enviado",
  respondido: "Respondido",
  rebotado: "Rebotado",
  excluido_proteccion: "Excluido por protección comercial",
  excluido_historial: "Excluido por historial",
  no_contactar: "No contactar",
  revision: "Pendiente de revisión",
  error: "Error de envío",
};

export const CLASS_LABEL: Record<string, string> = {
  nuevo: "Contacto nuevo",
  sin_respuesta: "Sin respuesta",
  antiguo: "Contacto antiguo",
  negociacion_activa: "Negociación activa",
  cliente_actual: "Cliente actual",
  estrategico: "Contacto estratégico",
  no_contactar: "No contactar",
  dudoso: "Relación dudosa",
  protegido: "Protegido",
};

export const COMPANY_REASONS = ["Cliente actual", "Cliente histórico", "Negociación activa", "Empresa estratégica", "Contacto gestionado personalmente", "Exclusión manual"];
