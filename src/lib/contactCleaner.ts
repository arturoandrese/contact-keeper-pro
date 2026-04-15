import Papa from "papaparse";
import { splitDomainWord } from "./companyName";
import { getOverriddenName } from "./companyNameOverrides";

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
  confirmedPattern?: boolean;
}

// Dominios de email personales / no corporativos
export const FREE_EMAIL_DOMAINS = new Set([
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

export function removeAccents(str: string): string {
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
  return removeAccents((key || "").toLowerCase()).replace(/[\s._\-()]/g, "");
}

function getFieldValue(row: Record<string, string>, candidates: string[]): string {
  const wanted = new Set(candidates.map(normalizeHeaderKey));
  for (const [key, value] of Object.entries(row)) {
    if (!value) continue;
    const norm = normalizeHeaderKey(key);
    // Exact match first
    if (wanted.has(norm)) {
      return String(value).trim();
    }
  }
  // Fuzzy: check if any normalized header starts with or contains a candidate
  for (const [key, value] of Object.entries(row)) {
    if (!value) continue;
    const norm = normalizeHeaderKey(key);
    for (const candidate of candidates) {
      const normCandidate = normalizeHeaderKey(candidate);
      if (norm.startsWith(normCandidate) || norm.includes(normCandidate)) {
        return String(value).trim();
      }
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
 * Resultado siempre en MAYÚSCULAS, separando palabras compuestas.
 */
function extractCompanyFromWeb(domain: string): string {
  if (!domain) return "";
  let name = domain
    .replace(/\.(com|org|net|io|co|es|mx|ar|cl|pe|uk|de|fr|it|pt|br|eu|info|biz|app|dev|tech|ai|pro|agency|group|digital|media|studio|solutions|consulting|services|cloud|online|store|shop|site|world|global|int|gov|edu|mil|co\.uk|com\.mx|com\.ar|com\.br|com\.co|com\.pe|com\.es|co\.jp|co\.kr)$/i, "");

  // Separar por guiones, puntos o underscores -> palabras
  const words = name.split(/[-._]+/).filter(Boolean);

  // Aplicar splitDomainWord a cada palabra para separar compuestos, resultado en MAYÚSCULAS
  return words
    .map(w => splitDomainWord(w))
    .join(" ");
}

function dedup(contact: CleanedContact): CleanedContact {
  const keys = ["MAIL1", "MAIL2", "MAIL3", "MAIL4"] as const;
  const seen = new Set<string>();
  const result = { ...contact };
  for (const k of keys) {
    const v = (result[k] as string)?.toLowerCase();
    if (v && seen.has(v)) {
      (result as any)[k] = "";
    } else if (v) {
      seen.add(v);
    }
  }
  return result;
}

export interface DomainPatternEntry {
  domain: string;
  pattern: string;
  example_email: string;
  confirmed?: boolean;
}

function generateEmailByPattern(
  pattern: string,
  nombre: string,
  apellido: string,
  apellido2: string,
  domain: string
): string {
  const initial = nombre.charAt(0);
  switch (pattern) {
    case "first.last":
      return `${nombre}.${apellido}@${domain}`;
    case "initial_last":
      return `${initial}${apellido}@${domain}`;
    case "initial_last_initial2":
      return apellido2
        ? `${initial}${apellido}${apellido2.charAt(0)}@${domain}`
        : `${initial}${apellido}@${domain}`;
    case "first_last":
      return `${nombre}${apellido}@${domain}`;
    case "first":
      return `${nombre}@${domain}`;
    case "last.first":
      return `${apellido}.${nombre}@${domain}`;
    default:
      return `${initial}${apellido}@${domain}`;
  }
}

export function parseAndClean(
  csvText: string,
  savedPatterns?: DomainPatternEntry[]
): CleanedContact[] {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  // Build a map domain -> best pattern (with confirmed flag)
  const patternMap = new Map<string, { pattern: string; confirmed: boolean }>();
  if (savedPatterns) {
    for (const p of savedPatterns) {
      const existing = patternMap.get(p.domain);
      // Confirmed patterns always win; otherwise keep first
      if (!existing || (p.confirmed && !existing.confirmed)) {
        patternMap.set(p.domain, { pattern: p.pattern, confirmed: p.confirmed === true });
      }
    }
  }

  const results: CleanedContact[] = [];

  for (const row of parsed.data) {
    const email1 = extractPrimaryCorporateEmail(row);

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
      getFieldValue(row, ["company_website", "website", "web", "sitio_web", "web_empresa", "sitio web", "url"]) 
    );

    // Skip rows that have neither email nor web+name to generate from
    if (!email1 && !(web && nombre && apellido)) continue;

    let empresa = "";
    const domainForOverride = web || (email1 ? email1.split("@")[1] : "") || "";
    const override = getOverriddenName(domainForOverride);
    if (override) {
      empresa = override;
    } else if (web) {
      empresa = extractCompanyFromWeb(web);
    }

    if (!empresa) {
      const rawCompany = getFieldValue(row, ["company_name", "company", "empresa", "EMPRESA", "organizacion"]);
      empresa = rawCompany.length > 40 ? rawCompany.substring(0, 40).trim() : rawCompany;
      empresa = empresa.toUpperCase();
    }

    const domain = web || (email1 ? email1.split("@")[1] : "") || "";
    const hasNameForPattern = Boolean(nombre && apellido);

    let mail1 = email1;
    let mail2 = "";
    let mail3 = "";
    let mail4 = "";

    let isConfirmedPattern = false;

    if (domain && hasNameForPattern) {
      const knownEntry = patternMap.get(domain);
      const knownPattern = knownEntry?.pattern;
      const initial = nombre.charAt(0);

      if (knownPattern) {
        // Use the learned pattern as MAIL1
        mail1 = generateEmailByPattern(knownPattern, nombre, apellido, apellido2, domain);
        isConfirmedPattern = knownEntry.confirmed;

        if (!knownEntry.confirmed) {
          // Fill alternatives with other patterns only if NOT confirmed
          const alternatives = new Set<string>();
          alternatives.add(`${initial}${apellido}@${domain}`);
          alternatives.add(`${nombre}.${apellido}@${domain}`);
          if (apellido2) alternatives.add(`${initial}${apellido}${apellido2.charAt(0)}@${domain}`);
          if (email1) alternatives.add(email1);
          alternatives.delete(mail1.toLowerCase());
          alternatives.delete(mail1);
          const altArr = Array.from(alternatives).filter(a => a && a !== mail1.toLowerCase());
          mail2 = altArr[0] || "";
          mail3 = altArr[1] || "";
          mail4 = altArr[2] || "";
        }
        // If confirmed: mail2, mail3, mail4 stay empty
      } else {
        // No known pattern: default behavior
        mail1 = `${initial}${apellido}@${domain}`;
        mail2 = `${nombre}.${apellido}@${domain}`;
        mail3 = email1 || "";
        if (apellido2) {
          mail4 = `${initial}${apellido}${apellido2.charAt(0)}@${domain}`;
        } else {
          mail4 = "";
        }
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
      confirmedPattern: isConfirmedPattern || undefined,
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
