// Prefijos comunes en nombres de empresa (español)
const SPLIT_PREFIXES = [
  "farmacia", "farmacias", "casa", "aguas", "inversiones",
  "constructora", "constructoras", "clinica", "clinicas",
  "hospital", "hospitales", "universidad", "instituto",
  "fundacion", "asociacion", "corporacion", "empresa", "empresas",
  "comercial", "industrial", "servicios", "importadora",
  "exportadora", "distribuidora", "inmobiliaria", "consultora",
  "laboratorio", "laboratorios", "isapre", "mutual",
  "cooperativa", "compania", "sociedad",
  "mall", "super", "hiper", "mini", "mega", "multi",
  "tele", "auto", "agro", "electro", "hidro",
  "banco", "grupo", "club", "red", "centro", "portal",
  "el", "la", "las", "los", "del", "mi", "tu", "su",
];

const SPLIT_SUFFIXES = [
  "chile", "latam", "online", "digital", "net", "web", "app", "pro",
  "group", "global", "partners", "consulting", "solutions", "services",
  "media", "studio", "labs", "tech", "soft", "com",
  "mujer", "hombre", "salud", "vida", "andina", "andino",
  "sur", "norte", "pacifico", "austral", "airline",
];

// Palabras conocidas que aparecen pegadas en dominios
const KNOWN_COMPOUNDS: Record<string, string> = {
  "farmaciasahumada": "FARMACIAS AHUMADA",
  "farmaciaunada": "FARMACIA UNADA",
  "casamujer": "CASA MUJER",
  "walmartchile": "WALMART CHILE",
  "aguasandinas": "AGUAS ANDINAS",
  "inversionesalval": "INVERSIONES ALVAL",
  "empresasiansa": "EMPRESAS IANSA",
  "mallplaza": "MALL PLAZA",
  "santotomas": "SANTO TOMAS",
  "skyairline": "SKY AIRLINE",
  "isapredecodelco": "ISAPRE DE CODELCO",
  "quelenfruit": "QUELEN FRUIT",
  "veltislatam": "VELTIS LATAM",
  "abakopartners": "ABAKO PARTNERS",
  "sobrenosotros": "SOBRE NOSOTROS",
  "lascondes": "LAS CONDES",
  "eldespacho": "EL DESPACHO",
  "uautonoma": "U AUTONOMA",
};

export function splitDomainWord(word: string): string {
  const w = word.toLowerCase();

  // Check known compounds first
  if (KNOWN_COMPOUNDS[w]) return KNOWN_COMPOUNDS[w];

  // Try prefix splitting
  for (const prefix of SPLIT_PREFIXES) {
    if (w.startsWith(prefix) && w.length > prefix.length + 2) {
      const rest = w.slice(prefix.length);
      if (KNOWN_COMPOUNDS[rest]) return `${prefix.toUpperCase()} ${KNOWN_COMPOUNDS[rest]}`;
      return `${prefix.toUpperCase()} ${splitDomainWord(rest).toUpperCase()}`;
    }
  }

  // Try suffix splitting
  for (const suffix of SPLIT_SUFFIXES) {
    if (w.endsWith(suffix) && w.length > suffix.length + 2) {
      const rest = w.slice(0, w.length - suffix.length);
      return `${rest.toUpperCase()} ${suffix.toUpperCase()}`;
    }
  }

  return w.toUpperCase();
}

export function extractCompanyFromDomain(domain: string): string {
  if (!domain) return "";
  const clean = domain.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  const parts = clean.split(".");
  if (parts.length === 0) return domain.toUpperCase();
  const base = parts[0];
  if (!base) return domain.toUpperCase();
  return splitDomainWord(base);
}

export function simplifyCompanyName(name: string): string {
  if (!name || !name.trim()) return name;
  return name.trim().toUpperCase();
}
