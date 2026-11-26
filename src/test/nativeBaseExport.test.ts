import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { NATIVE_HEADERS, toNativeRows } from "@/lib/nativeBaseExport";

describe("native base export", () => {
  it("uses the Mis bases column order", () => {
    expect([...NATIVE_HEADERS]).toEqual(["NOMBRE", "APELLIDO", "APELLIDO2", "EMPRESA", "WEB", "MAIL1", "MAIL2", "MAIL3", "MAIL4"]);
  });
  it("keeps compound first names together and surnames separate", () => {
    const [r] = toNativeRows([{ nombre: "José Antonio", apellido: "Pérez-Cotapos", apellido2: "Gálmez", empresa: "ADELCO", web: "adelco.cl", mail1: "jose.perezcotapos@adelco.cl", mail2: "jperezcotapos@adelco.cl", mail3: null, mail4: null }]);
    expect(Object.keys(r)).toEqual([...NATIVE_HEADERS]);
    expect([r.NOMBRE, r.APELLIDO, r.APELLIDO2]).toEqual(["José Antonio", "Pérez-Cotapos", "Gálmez"]);
  });
});
