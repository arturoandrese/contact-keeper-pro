import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { copyTextToClipboard } from "@/lib/copyToClipboard";

// Native "Mis bases" export format. Single source of truth for every base export.
export const NATIVE_HEADERS = ["NOMBRE", "APELLIDO", "APELLIDO2", "EMPRESA", "WEB", "MAIL1", "MAIL2", "MAIL3", "MAIL4"] as const;
export type NativeRow = Record<(typeof NATIVE_HEADERS)[number], string>;
export interface BaseContactRow { nombre: string | null; apellido: string | null; apellido2: string | null; empresa: string | null; web: string | null; mail1: string | null; mail2: string | null; mail3: string | null; mail4: string | null }

export async function fetchBaseContacts(baseId: string): Promise<BaseContactRow[]> {
  const all: BaseContactRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from("contacts")
      .select("nombre, apellido, apellido2, empresa, web, mail1, mail2, mail3, mail4")
      .eq("base_id", baseId).range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as BaseContactRow[]));
    if (data.length < pageSize) break;
  }
  return all;
}

export const toNativeRows = (data: BaseContactRow[]): NativeRow[] => data.map((c) => ({
  NOMBRE: c.nombre as string, APELLIDO: c.apellido as string, APELLIDO2: c.apellido2 as string,
  EMPRESA: c.empresa as string, WEB: c.web as string, MAIL1: c.mail1 as string, MAIL2: c.mail2 as string, MAIL3: c.mail3 as string, MAIL4: c.mail4 as string,
}));

/** Native TSV used by "Copiar para Sheets". */
export const nativeRowsToTsv = (rows: NativeRow[]) =>
  [NATIVE_HEADERS.join("\t"), ...rows.map(r => NATIVE_HEADERS.map(h => r[h] ?? "").join("\t"))].join("\n");

/** Native workbook: one sheet "Contactos", columns pinned to NATIVE_HEADERS. */
export function buildNativeWorkbook(rows: NativeRow[]) {
  const ws = XLSX.utils.json_to_sheet(rows, { header: [...NATIVE_HEADERS] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Contactos");
  return { wb, ws };
}

export async function exportNativeRows(baseName: string, rows: NativeRow[], mode: "xlsx" | "csv" | "copy") {
  if (mode === "copy") {
    await copyTextToClipboard(nativeRowsToTsv(rows));
    return;
  }
  const { wb, ws } = buildNativeWorkbook(rows);
  if (mode === "csv") {
    const csv = XLSX.utils.sheet_to_csv(ws);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${baseName}_limpia.csv`; a.click();
    URL.revokeObjectURL(url);
    return;
  }
  XLSX.writeFile(wb, `${baseName}_limpia.xlsx`);
}
