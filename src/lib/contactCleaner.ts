import Papa from "papaparse";

export interface CleanedContact {
  NOMBRE: string;
  APELLIDO: string;
  APELLIDO2: string;
  EMPRESA: string;
  WEB: string;
  MAIL1: string;
  MAIL2: string;
  MAIL3: string;
  MAIL4: string;
}

// Dominios de email personales / no corporativos
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com",
  "hotmail.com", "hotmail.es", "hotmail.co.uk", "hotmail.fr", "hotmail.de", "hotmail.it",
  "outlook.com", "outlook.es", "outlook.co.uk",
  "live.com", "live.es", "live.co.uk",
  "msn.com",
  "yahoo.com", "yahoo.es", "yahoo.co.uk", "yahoo.fr", "yahoo.de", "yahoo.it", "yahoo.com.mx", "yahoo.com.ar",
  "ymail.com",
  "aol.com",
  "icloud.com", "me.com", "mac.com",
  "protonmail.com", "proton.me",
  "zoho.com",
  "mail.com",
  "gmx.com", "gmx.es", "gmx.de",
  "tutanota.com", "tuta.io",
  "fastmail.com",
  "yandex.com", "yandex.ru",
  "163.com", "126.com", "qq.com",
  "inbox.com",
  "rocketmail.com",
]);

function removeAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function extractDomain(url: string): string {
  if (!url) return "";
  let d = url.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/^www\./, "");
  d = d.split("/")[0].split("?")[0];
  return d;
}

function isValidEmail(email: string): boolean {
  if (!email) return false;
  const parts = email.split("@");
  return parts.length === 2 && parts[1].includes(".");
}

function isCorporateEmail(email: string): boolean {
  if (!email) return false;
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  return !FREE_EMAIL_DOMAINS.has(domain);
}

function normalizeHeaderKey(key: string): string {
  return removeAccents((key || "").toLowerCase()).replace(/[\s._-]/g, "");
}

function getFieldValue(row: Record<string, string>, candidates: string[]): string {
  const wanted = new Set(candidates.map(normalizeHeaderKey));
  for (const [key, value] of Object.entries(row)) {
    if (!value) continue;
    if (wanted.has(normalizeHeaderKey(key))) {
      return String(value).trim();
    }
  }
  return "";
}

function extractPrimaryCorporateEmail(row: Record<string, string>): string {
  const emailFields = new Set(
    [
      "email1", "email", "mail1", "mail", "correo", "correo1", "work_email", "business_email",
      "EMAIL1", "EMAIL", "MAIL1", "MAIL", "CORREO", "CORREO1",
    ].map(normalizeHeaderKey)
  );

  const candidates: string[] = [];
  for (const [key, rawValue] of Object.entries(row)) {
    if (!rawValue) continue;
    if (!emailFields.has(normalizeHeaderKey(key))) continue;

    const value = String(rawValue).trim().toLowerCase();
    const split = value.split(/[\s,;|]+/).filter(Boolean);
    candidates.push(...split);
  }

  for (const candidate of candidates) {
    if (isValidEmail(candidate) && isCorporateEmail(candidate)) {
      return candidate;
    }
  }

  return "";
}

function capitalize(value: string): string {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Extrae nombre de empresa desde un dominio web.
 * Maneja nombres compuestos separados por guiones o puntos.
 * Ej: "mi-empresa.com" -> "Mi Empresa"
 *     "grupo-acme-corp.es" -> "Grupo Acme Corp"
 *     "johnsmith.io" -> "Johnsmith"
 */
function extractCompanyFromWeb(domain: string): string {
  if (!domain) return "";
  // Quitar TLD (.com, .es, .co.uk, etc.)
  let name = domain
    .replace(/\.(com|org|net|io|co|es|mx|ar|cl|pe|uk|de|fr|it|pt|br|eu|info|biz|app|dev|tech|ai|pro|agency|group|digital|media|studio|solutions|consulting|services|cloud|online|store|shop|site|world|global|int|gov|edu|mil|co\.uk|com\.mx|com\.ar|com\.br|com\.co|com\.pe|com\.es|co\.jp|co\.kr)$/i, "");

  // Separar por guiones, puntos o underscores -> palabras
  const words = name.split(/[-._]+/).filter(Boolean);

  // Capitalizar cada palabra
  return words
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function dedup(contact: CleanedContact): CleanedContact {
  const keys: (keyof CleanedContact)[] = ["MAIL1", "MAIL2", "MAIL3", "MAIL4"];
  const seen = new Set<string>();
  const result = { ...contact };
  for (const k of keys) {
    const v = result[k]?.toLowerCase();
    if (v && seen.has(v)) {
      result[k] = "";
    } else if (v) {
      seen.add(v);
    }
  }
  return result;
}

export function parseAndClean(csvText: string): CleanedContact[] {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const results: CleanedContact[] = [];

  for (const row of parsed.data) {
    const email1 = extractPrimaryCorporateEmail(row);
    if (!email1) continue;

    const rawFirst = removeAccents(
      getFieldValue(row, ["first_name", "firstname", "nombre", "NOMBRE", "name"])
    );
    const rawLast = removeAccents(
      getFieldValue(row, ["last_name", "lastname", "apellido", "APELLIDO", "surname"])
    );

    const firstParts = rawFirst.split(/\s+/).filter(Boolean);
    const lastParts = rawLast.split(/\s+/).filter(Boolean);

    const nombre = (firstParts[0] || "").toLowerCase();
    const apellido = (lastParts[0] || "").toLowerCase();
    const apellido2 = lastParts.length > 1 ? lastParts[1].toLowerCase() : "";

    const web = extractDomain(
      getFieldValue(row, ["company_website", "website", "web", "sitio_web", "url"]) 
    );

    let empresa = "";
    if (web) {
      empresa = extractCompanyFromWeb(web);
    }

    if (!empresa) {
      const rawCompany = getFieldValue(row, ["company_name", "company", "empresa", "EMPRESA", "organizacion"]);
      empresa = rawCompany.length > 40 ? rawCompany.substring(0, 40).trim() : rawCompany;
      empresa = empresa.toUpperCase();
    }

    const domain = web || email1.split("@")[1] || "";
    const hasNameForPattern = Boolean(nombre && apellido);

    let mail1 = email1;
    let mail2 = "";
    let mail3 = "";
    let mail4 = "";

    if (domain && hasNameForPattern) {
      const initial = nombre.charAt(0);
      mail1 = `${initial}${apellido}@${domain}`;
      mail2 = `${nombre}.${apellido}@${domain}`;
      mail3 = email1;
      if (apellido2) {
        mail4 = `${initial}${apellido}${apellido2.charAt(0)}@${domain}`;
      } else {
        mail4 = `${initial}${apellido}@${domain}`;
      }
    }

    if (mail2 && mail2.toLowerCase() === mail1.toLowerCase()) mail2 = "";
    if (mail3 && mail3.toLowerCase() === mail1.toLowerCase()) mail3 = "";
    if (mail4 && mail4.toLowerCase() === mail1.toLowerCase()) mail4 = "";
    if (mail4 && mail2 && mail4.toLowerCase() === mail2.toLowerCase()) mail4 = "";

    let contact: CleanedContact = {
      NOMBRE: capitalize(nombre),
      APELLIDO: capitalize(apellido),
      APELLIDO2: capitalize(apellido2),
      EMPRESA: empresa,
      WEB: web,
      MAIL1: mail1,
      MAIL2: mail2,
      MAIL3: mail3,
      MAIL4: mail4,
    };

    contact = dedup(contact);
    results.push(contact);
  }


  const seen = new Set<string>();
  const unique: CleanedContact[] = [];
  for (const c of results) {
    const key = JSON.stringify(c);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(c);
    }
  }

  return unique;
}
