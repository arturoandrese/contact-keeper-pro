import { describe, it, expect, vi } from "vitest";
import * as XLSX from "xlsx";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { NATIVE_HEADERS, toNativeRows, buildNativeWorkbook, nativeRowsToTsv } from "@/lib/nativeBaseExport";

const ana = { nombre: "Ana Pierina", apellido: "López", apellido2: "Chivilo", empresa: "CÁMARA CHILENA DE LA CONSTRUCCIÓN", web: "cchc.cl", mail1: "ana.lopez@cchc.cl", mail2: "alopez@cchc.cl", mail3: null, mail4: null };
const sofia = { nombre: "Sofía", apellido: "Robinson", apellido2: null, empresa: "EXTEND COMUNICACIONES", web: "extend.cl", mail1: "sofia.robinson@extend.cl", mail2: null, mail3: null, mail4: null };

describe("native base export", () => {
  it("uses the Mis bases column order", () => {
    expect([...NATIVE_HEADERS]).toEqual(["NOMBRE", "APELLIDO", "APELLIDO2", "EMPRESA", "WEB", "MAIL1", "MAIL2", "MAIL3", "MAIL4"]);
  });
  it("keeps compound first names together and surnames separate", () => {
    const [r] = toNativeRows([ana]);
    expect(Object.keys(r)).toEqual([...NATIVE_HEADERS]);
    expect([r.NOMBRE, r.APELLIDO, r.APELLIDO2]).toEqual(["Ana Pierina", "López", "Chivilo"]);
  });
  it("XLSX keeps the native header row even when the first contact lacks apellido2", () => {
    const { wb } = buildNativeWorkbook(toNativeRows([sofia, ana]));
    const read = XLSX.read(XLSX.write(wb, { type: "array", bookType: "xlsx" }), { type: "array" });
    expect(read.SheetNames).toEqual(["Contactos"]);
    const aoa = XLSX.utils.sheet_to_json<string[]>(read.Sheets.Contactos, { header: 1, defval: "" });
    expect(aoa[0]).toEqual([...NATIVE_HEADERS]);
    expect(aoa[1].slice(0, 3)).toEqual(["Sofía", "Robinson", ""]);
    expect(aoa[2].slice(0, 3)).toEqual(["Ana Pierina", "López", "Chivilo"]);
  });
  it("copy-for-Sheets TSV has native headers and empty cells for missing values", () => {
    const lines = nativeRowsToTsv(toNativeRows([sofia])).split("\n");
    expect(lines[0]).toBe(NATIVE_HEADERS.join("\t"));
    expect(lines[1].split("\t")).toEqual(["Sofía", "Robinson", "", "EXTEND COMUNICACIONES", "extend.cl", "sofia.robinson@extend.cl", "", "", ""]);
  });
});
