import * as XLSX from "xlsx";
import type { CleanedContact } from "./contactCleaner";
import { extractCompanyFromDomain } from "./companyName";

export interface EmailLogEntry {
  NOMBRE: string;
  APELLIDO: string;
  EMPRESA: string;
  WEB: string;
  MAIL1: string;
  MAIL2: string;
  status: string;
}

export interface DeliveredContactEntry {
  nombre: string;
  apellido: string;
  empresa: string;
  empresa_short: string;
  web: string;
  mail: string;
  status: string;
}

export interface CrossReferencedContact {
  NOMBRE: string;
  APELLIDO: string;
  APELLIDO2: string;
  EMPRESA: string;
  EMPRESA_SHORT: string;
  WEB: string;
  MAIL_ORIGINAL: string;
  MAIL1: string;
}

export interface DomainPatternEntry {
  domain: string;
  pattern: string;
  example_email: string;
}

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.es", "hotmail.cl",
  "outlook.com", "outlook.es", "outlook.cl", "live.com", "live.cl",
  "yahoo.com", "yahoo.es", "yahoo.cl", "yahoo.com.ar",
  "icloud.com", "me.com", "mac.com", "aol.com",
  "protonmail.com", "proton.me", "zoho.com",
  "mail.com", "gmx.com", "yandex.com",
]);

function isFreeMail(email: string): boolean {
  if (!email) return false;
  const domain = email.split("@")[1]?.toLowerCase();
  return !!domain && FREE_EMAIL_DOMAINS.has(domain);
}

function normalizeStatus(status: string): string {
  return (status || "").trim().toUpperCase().replace(/\s+/g, "_");
}

function classifyStatus(status: string): "ABIERTO" | "CLICKEADO" | "ENVIADO" | null {
  const s = normalizeStatus(status);
  // Exclude NOT_SENT / NO_ENVIADO before checking SENT
  if (s.includes("NOT_SENT") || s.includes("NO_SENT") || s.includes("NO_ENVIAD")) return null;
  if (s.includes("CLICK") || s.includes("RESPOND")) return "CLICKEADO";
  if (s.includes("OPEN")) return "ABIERTO";
  if (s.includes("SENT") || s.includes("DELIVER")) return "ENVIADO";
  return null;
}

function isDelivered(status: string): boolean {
  return classifyStatus(status) !== null;
}

function isBounced(status: string): boolean {
  return normalizeStatus(status).includes("BOUNCE");
}

function isValidEmail(email: string): boolean {
  if (!email) return false;
  const parts = email.split("@");
  return parts.length === 2 && parts[1].includes(".");
}

function detectPattern(email: string, nombre: string, apellido: string): string | null {
  if (!email || !nombre || !apellido) return null;
  const local = email.split("@")[0]?.toLowerCase();
  if (!local) return null;
  const n = nombre.toLowerCase();
  const a = apellido.toLowerCase();
  
  if (local === `${n}.${a}`) return "first.last";
  if (local === `${n[0]}${a}`) return "initial_last";
  if (local.startsWith(`${n[0]}${a}`) && local.length === n[0].length + a.length + 1) return "initial_last_initial2";
  return null;
}

export function hashEmailLog(entries: EmailLogEntry[]): string {
  const mails = entries.map(e => (e.MAIL1 || "").toLowerCase()).sort();
  const str = mails.join("|");
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash.toString(36);
}

export function parseEmailLog(fileContent: ArrayBuffer): EmailLogEntry[] {
  const wb = XLSX.read(fileContent, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws);
  
  return rows.map((row) => {
    const getName = (keys: string[]) => {
      for (const k of keys) {
        const found = Object.keys(row).find((rk) => rk.trim().toUpperCase() === k.toUpperCase());
        if (found && row[found]) return row[found].toString().trim();
      }
      return "";
    };
    
    return {
      NOMBRE: getName(["NOMBRE", "first_name", "First Name"]),
      APELLIDO: getName(["APELLIDO", "last_name", "Last Name"]),
      EMPRESA: getName(["EMPRESA", "company_name", "Company"]),
      WEB: getName(["WEB", "company_website", "Website"]),
      MAIL1: getName(["MAIL1", "email1", "Email", "email"]),
      MAIL2: getName(["MAIL2", "email2"]),
      status: getName(["Merge status", "Status", "merge_status", "status"]),
    };
  });
}

export interface ExistingDelivered {
  mail: string;
  times_contacted: number;
  last_contacted_at: string;
  status: string;
}

const COOLDOWN_DAYS = 15;

export interface CrossReferenceOptions {
  onlyBounced?: boolean;
}

function generateEmailFromPattern(pattern: string, nombre: string, apellido: string, domain: string): string | null {
  if (!nombre || !apellido || !domain) return null;
  const n = nombre.toLowerCase();
  const a = apellido.toLowerCase();
  switch (pattern) {
    case "first.last": return `${n}.${a}@${domain}`;
    case "initial_last": return `${n[0]}${a}@${domain}`;
    case "initial.last": return `${n[0]}.${a}@${domain}`;
    case "last.first": return `${a}.${n}@${domain}`;
    case "first": return `${n}@${domain}`;
    case "first_last_initial": return `${n}${a[0]}@${domain}`;
    default: return null;
  }
}

export function crossReference(
  contacts: CleanedContact[],
  emailLog: EmailLogEntry[],
  existingDelivered?: ExistingDelivered[],
  options: CrossReferenceOptions = {}
): { filtered: CrossReferencedContact[]; patterns: DomainPatternEntry[]; delivered: DeliveredContactEntry[] } {
  const onlyBounced = options.onlyBounced === true;
  const deliveredMails = new Set<string>();
  const bouncedMails = new Set<string>();
  const patterns: DomainPatternEntry[] = [];
  const delivered: DeliveredContactEntry[] = [];
  const seenDelivered = new Set<string>();

  const existingMap = new Map<string, ExistingDelivered>();
  // Build domain→pattern map from existing delivered (prioritize CLICKEADO > ABIERTO > ENVIADO)
  const domainPatternMap = new Map<string, { pattern: string; status: string }>();
  const STATUS_PRIORITY: Record<string, number> = { CLICKEADO: 3, ABIERTO: 2, ENVIADO: 1 };

  if (existingDelivered) {
    for (const e of existingDelivered) {
      existingMap.set(e.mail.toLowerCase(), e);
      // Detect pattern from existing delivered emails
      const domain = e.mail.split("@")[1]?.toLowerCase();
      if (domain && !isFreeMail(e.mail)) {
        const nameParts = (e.mail.split("@")[0] || "").toLowerCase();
        // We'll store domain→status for priority, actual pattern detection happens below
        const current = domainPatternMap.get(domain);
        const priority = STATUS_PRIORITY[e.status] || 0;
        if (!current || priority > (STATUS_PRIORITY[current.status] || 0)) {
          // We need nombre/apellido to detect pattern - skip for now, will use emailLog patterns
        }
      }
    }
  }

  for (const entry of emailLog) {
    const mail1 = (entry.MAIL1 || "").toLowerCase();
    const mail2 = (entry.MAIL2 || "").toLowerCase();
    const status = entry.status;

    if (isDelivered(status)) {
      if (mail1) deliveredMails.add(mail1);
      if (mail2) deliveredMails.add(mail2);
      
      const successMail = mail1 || mail2;
      if (successMail && !isFreeMail(successMail)) {
        const domain = successMail.split("@")[1];
        const pat = detectPattern(successMail, entry.NOMBRE, entry.APELLIDO);
        if (domain && pat) {
          patterns.push({ domain, pattern: pat, example_email: successMail });
          // Track best pattern per domain
          const classified = classifyStatus(status) || "ENVIADO";
          const current = domainPatternMap.get(domain);
          const priority = STATUS_PRIORITY[classified] || 0;
          if (!current || priority > (STATUS_PRIORITY[current.status] || 0)) {
            domainPatternMap.set(domain, { pattern: pat, status: classified });
          }
        }
        
        const classified = classifyStatus(status) || "ENVIADO";
        
        if (!seenDelivered.has(successMail)) {
          seenDelivered.add(successMail);
          const web = (entry.WEB || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
          const domainForName = web || domain || "";
          delivered.push({
            nombre: entry.NOMBRE,
            apellido: entry.APELLIDO,
            empresa: (entry.EMPRESA || "").trim().toUpperCase(),
            empresa_short: extractCompanyFromDomain(domainForName),
            web,
            mail: successMail,
            status: classified,
          });
        }
      }
    }

    if (isBounced(status)) {
      if (mail1) bouncedMails.add(mail1);
      if (mail2) bouncedMails.add(mail2);
    }
  }

  // Also build patterns from existingDelivered using nombre/apellido
  if (existingDelivered) {
    for (const e of existingDelivered) {
      const domain = e.mail.split("@")[1]?.toLowerCase();
      if (!domain || isFreeMail(e.mail)) continue;
      // Find a delivered entry with matching mail to get nombre/apellido
      const deliveredEntry = delivered.find(d => d.mail === e.mail.toLowerCase());
      if (deliveredEntry) {
        const pat = detectPattern(e.mail, deliveredEntry.nombre, deliveredEntry.apellido);
        if (pat) {
          const current = domainPatternMap.get(domain);
          const priority = STATUS_PRIORITY[e.status] || 0;
          if (!current || priority > (STATUS_PRIORITY[current.status] || 0)) {
            domainPatternMap.set(domain, { pattern: pat, status: e.status });
          }
        }
      }
    }
  }

  const filtered: CrossReferencedContact[] = [];
  const seenKeys = new Set<string>();

  for (const contact of contacts) {
    const m1 = (contact.MAIL1 || "").toLowerCase();

    if (onlyBounced && !bouncedMails.has(m1)) {
      continue;
    }

    const existing = existingMap.get(m1);
    if (existing) {
      if (existing.status === "ABIERTO" || existing.status === "CLICKEADO") continue;
    }

    if (deliveredMails.has(m1) && !existing && !onlyBounced) {
      continue;
    }

    let finalMail = m1;
    if (bouncedMails.has(m1)) {
      const alternatives = [contact.MAIL2, contact.MAIL3, contact.MAIL4]
        .map((m) => (m || "").toLowerCase())
        .filter((m) => isValidEmail(m) && !bouncedMails.has(m) && !deliveredMails.has(m) && !isFreeMail(m));

      if (alternatives.length === 0) continue;
      finalMail = alternatives[0];
    } else if (onlyBounced) {
      continue;
    }

    if (!isValidEmail(finalMail)) continue;
    if (isFreeMail(finalMail)) continue;

    const domain = finalMail.split("@")[1] || "";
    const web = (contact.WEB || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
    const empresaShort = extractCompanyFromDomain(web || domain);

    // Only use pattern generation if we DON'T already have a valid alternative
    // and ONLY when NOT in onlyBounced mode (pattern emails may also bounce)
    if (!onlyBounced) {
      const knownPattern = domainPatternMap.get(domain);
      if (knownPattern) {
        const generated = generateEmailFromPattern(knownPattern.pattern, contact.NOMBRE, contact.APELLIDO, domain);
        if (generated && isValidEmail(generated) && !bouncedMails.has(generated) && !deliveredMails.has(generated)) {
          finalMail = generated;
        }
      }
    }

    const key = `${contact.NOMBRE}|${contact.APELLIDO}|${finalMail}`.toLowerCase();
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    filtered.push({
      NOMBRE: contact.NOMBRE,
      APELLIDO: contact.APELLIDO,
      APELLIDO2: contact.APELLIDO2,
      EMPRESA: contact.EMPRESA,
      EMPRESA_SHORT: empresaShort,
      WEB: contact.WEB,
      MAIL_ORIGINAL: m1,
      MAIL1: finalMail,
    });
  }

  return { filtered, patterns, delivered };
}

export function exportCrossReferenced(contacts: CrossReferencedContact[]) {
  const ws = XLSX.utils.json_to_sheet(contacts);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Filtrados");
  XLSX.writeFile(wb, "contactos_filtrados.xlsx");
}
