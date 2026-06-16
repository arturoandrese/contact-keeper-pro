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
  // Ignore LinkedIn / social media URLs — they're not company websites
  if (/linkedin\.com|facebook\.com|twitter\.com|instagram\.com|tiktok\.com/i.test(d)) return "";
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

const PATTERN_PRIORITY = [
  "initial_last",
  "initial_last_initial2",
  "first.last",
  "first_last",
  "first",
  "last.first",
  "first_last_underscore",
  "first_initial",
] as const;

function generateEmailByPattern(
  pattern: string,
  nombre: string,
  apellido: string,
  apellido2: string,
  domain: string
): string {
  const ni = nombre.charAt(0);
  const ai = apellido.charAt(0);
  switch (pattern) {
    case "first.last": return `${nombre}.${apellido}@${domain}`;
    case "last.first": return `${apellido}.${nombre}@${domain}`;
    case "initial.last": return `${ni}.${apellido}@${domain}`;
    case "initial_last": return `${ni}${apellido}@${domain}`;
    case "initial_last_initial2":
      return apellido2
        ? `${ni}${apellido}${apellido2.charAt(0)}@${domain}`
        : `${ni}${apellido}@${domain}`;
    case "first_last": return `${nombre}${apellido}@${domain}`;
    case "first_last_underscore": return `${nombre}_${apellido}@${domain}`;
    case "first_initial":
    case "first_last_initial":
      return `${nombre}${ai}@${domain}`;
    case "first": return `${nombre}@${domain}`;
    case "last": return `${apellido}@${domain}`;
    default: return `${ni}${apellido}@${domain}`;
  }
}

/**
 * Detecta qué patrón generó un local part, dado el nombre/apellido del contacto.
 * Devuelve null si ninguno coincide.
 */
export function detectPatternFromLocal(
  local: string,
  nombre: string,
  apellido: string,
  apellido2: string
): string | null {
  if (!local || !nombre || !apellido) return null;
  const l = local.toLowerCase();
  const n = nombre.toLowerCase();
  const a = apellido.toLowerCase();
  const a2 = (apellido2 || "").toLowerCase();
  const ni = n.charAt(0);
  const ai = a.charAt(0);
  const a2i = a2.charAt(0);

  if (l === `${n}.${a}`) return "first.last";
  if (l === `${a}.${n}`) return "last.first";
  if (l === `${ni}.${a}`) return "initial.last";
  if (l === `${ni}${a}`) return "initial_last";
  if (a2 && l === `${ni}${a}${a2i}`) return "initial_last_initial2";
  if (l === `${n}${a}`) return "first_last";
  if (l === `${n}_${a}`) return "first_last_underscore";
  if (l === `${n}${ai}`) return "first_initial";
  if (l === n) return "first";
  if (l === a) return "last";
  return null;
}

function inferPatternsFromBouncedLocal(local: string): string[] {
  const l = (local || "").toLowerCase().trim();
  if (!l) return [];
  if (/^[a-z]+\.[a-z]+$/.test(l)) {
    const [left] = l.split(".");
    return left.length === 1 ? ["initial.last"] : ["first.last", "last.first"];
  }
  if (/^[a-z]+_[a-z]+$/.test(l)) return ["first_last_underscore"];
  return [];
}

interface ParsedRowIdentity {
  row: Record<string, string>;
  email1: string;
  nombre: string;
  apellido: string;
  apellido2: string;
  web: string;
  domain: string;
}

function extractRowIdentity(row: Record<string, string>): ParsedRowIdentity {
  const email1 = extractPrimaryCorporateEmail(row);

  const rawFirst = removeAccents(
    getFieldValue(row, ["first_name", "firstname", "nombre", "NOMBRE", "name"])
  );
  const rawLast = removeAccents(
    getFieldValue(row, ["last_name", "lastname", "apellido", "APELLIDO", "surname"])
  );
  const rawSecondLast = removeAccents(
    getFieldValue(row, ["apellido2", "APELLIDO2", "segundo_apellido", "second_last_name", "secondlastname", "mother_last_name"])
  );

  const firstParts = rawFirst.split(/\s+/).filter(Boolean);
  const lastParts = rawLast.split(/\s+/).filter(Boolean);

  const nombre = (firstParts[0] || "").toLowerCase();
  const apellido = (lastParts[0] || "").toLowerCase();
  const apellido2 = ((rawSecondLast.split(/\s+/).filter(Boolean)[0] || lastParts[1] || "")).toLowerCase();

  const web = extractDomain(
    getFieldValue(row, ["company_website", "website", "web", "sitio_web", "web_empresa", "sitio web", "url"])
  );
  const domain = web || (email1 ? email1.split("@")[1] : "") || "";

  return { row, email1, nombre, apellido, apellido2, web, domain };
}

function detectBlockedPatternsForPerson(
  local: string,
  nombre: string,
  apellido: string,
  apellido2: string
): string[] {
  const patterns = new Set<string>();
  const direct = detectPatternFromLocal(local, nombre, apellido, apellido2);
  if (direct) patterns.add(direct);

  // Some sources split compound first names as NOMBRE + APELLIDO and put the real
  // surname in APELLIDO2; still treat bounced initials+surname as the same pattern.
  if (apellido2) {
    const usingSecondSurname = detectPatternFromLocal(local, nombre, apellido2, "");
    if (usingSecondSurname) patterns.add(usingSecondSurname);
  }

  for (const inferred of inferPatternsFromBouncedLocal(local)) {
    patterns.add(inferred);
  }

  return Array.from(patterns);
}

export function parseAndClean(
  csvText: string,
  savedPatterns?: DomainPatternEntry[],
  bouncedByDomain?: Map<string, Set<string>>
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
      if (!existing || (p.confirmed && !existing.confirmed)) {
        patternMap.set(p.domain, { pattern: p.pattern, confirmed: p.confirmed === true });
      }
    }
  }

  const parsedRows = parsed.data.map(extractRowIdentity);

  const results: CleanedContact[] = [];

  for (const { row, email1, nombre, apellido, apellido2, web, domain } of parsedRows) {
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

    const hasNameForPattern = Boolean(nombre && apellido);

    let mail1 = email1;
    let mail2 = "";
    let mail3 = "";
    let mail4 = "";
    let isConfirmedPattern = false;

    if (domain && hasNameForPattern) {
      const bouncedLocals = bouncedByDomain?.get(domain) || new Set<string>();

      // Derive blocked patterns from bounces using THIS contact's name
      const blockedPatterns = new Set<string>();
      for (const bouncedLocal of bouncedLocals) {
        for (const pattern of detectBlockedPatternsForPerson(bouncedLocal, nombre, apellido, apellido2)) {
          blockedPatterns.add(pattern);
        }
      }

      const knownEntry = patternMap.get(domain);
      const knownPattern = knownEntry?.pattern;

      // Build ordered list of patterns to try
      const orderedPatterns: string[] = [];
      if (knownPattern && !blockedPatterns.has(knownPattern)) {
        orderedPatterns.push(knownPattern);
      }
      for (const p of PATTERN_PRIORITY) {
        if (!orderedPatterns.includes(p)) orderedPatterns.push(p);
      }

      const candidates: { pattern: string; email: string }[] = [];
      const seenEmails = new Set<string>();
      for (const p of orderedPatterns) {
        if (blockedPatterns.has(p)) continue;
        const email = generateEmailByPattern(p, nombre, apellido, apellido2, domain);
        const local = email.split("@")[0];
        if (bouncedLocals.has(local)) {
          blockedPatterns.add(p);
          continue;
        }
        if (seenEmails.has(email.toLowerCase())) continue;
        seenEmails.add(email.toLowerCase());
        candidates.push({ pattern: p, email });
      }

      // Append provided email1 as fallback if not bounced and not duplicate
      if (email1) {
        const local1 = email1.split("@")[0];
        const providedPattern = detectPatternFromLocal(local1, nombre, apellido, apellido2);
        const providedPatternBlocked = providedPattern ? blockedPatterns.has(providedPattern) : false;
        if (!bouncedLocals.has(local1) && !providedPatternBlocked && !seenEmails.has(email1.toLowerCase())) {
          candidates.push({ pattern: "provided", email: email1 });
          seenEmails.add(email1.toLowerCase());
        }
      }

      mail1 = candidates[0]?.email || "";
      isConfirmedPattern =
        knownEntry?.confirmed === true && candidates[0]?.pattern === knownPattern;

      if (!isConfirmedPattern) {
        mail2 = candidates[1]?.email || "";
        mail3 = candidates[2]?.email || "";
        mail4 = candidates[3]?.email || "";
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
