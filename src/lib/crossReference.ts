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

function buildBaseDomainPatternMap(contacts: CleanedContact[]): Map<string, string> {
  const patternCounts = new Map<string, Map<string, number>>();

  for (const contact of contacts) {
    const mails = [contact.MAIL1, contact.MAIL2, contact.MAIL3, contact.MAIL4]
      .map((m) => (m || "").toLowerCase().trim())
      .filter((m) => isValidEmail(m) && !isFreeMail(m));

    for (const mail of mails) {
      const domain = mail.split("@")[1];
      const pattern = detectPattern(mail, contact.NOMBRE, contact.APELLIDO);
      if (!domain || !pattern) continue;

      const byPattern = patternCounts.get(domain) || new Map<string, number>();
      byPattern.set(pattern, (byPattern.get(pattern) || 0) + 1);
      patternCounts.set(domain, byPattern);
    }
  }

  const selected = new Map<string, string>();
  for (const [domain, byPattern] of patternCounts) {
    let bestPattern = "";
    let bestCount = 0;

    for (const [pattern, count] of byPattern) {
      if (count > bestCount) {
        bestPattern = pattern;
        bestCount = count;
      }
    }

    if (bestPattern) selected.set(domain, bestPattern);
  }

  return selected;
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

export interface DeliveredHistoryEntry {
  mail: string;
  nombre: string;
  apellido: string;
}

export interface CrossReferenceOptions {
  onlyBounced?: boolean;
  savedPatterns?: DomainPatternEntry[];
  deliveredHistory?: DeliveredHistoryEntry[];
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
  const baseDomainPatternMap = buildBaseDomainPatternMap(contacts);
  const STATUS_PRIORITY: Record<string, number> = { CLICKEADO: 3, ABIERTO: 2, ENVIADO: 1 };

  // Seed domainPatternMap with saved patterns from DB (lowest priority, will be overridden by campaign data)
  if (options.savedPatterns) {
    for (const sp of options.savedPatterns) {
      if (!domainPatternMap.has(sp.domain)) {
        domainPatternMap.set(sp.domain, { pattern: sp.pattern, status: "SAVED" });
      }
    }
  }

  // Seed patterns from delivered_contacts history (medium priority — above SAVED, below campaign data)
  if (options.deliveredHistory) {
    for (const dh of options.deliveredHistory) {
      const mail = dh.mail.toLowerCase();
      const domain = mail.split("@")[1];
      if (!domain || isFreeMail(mail)) continue;
      const pat = detectPattern(mail, dh.nombre, dh.apellido);
      if (pat) {
        const current = domainPatternMap.get(domain);
        if (!current || current.status === "SAVED") {
          domainPatternMap.set(domain, { pattern: pat, status: "HISTORY" });
        }
      }
    }
  }

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
      // Track delivered using the original attempted email (MAIL1) to avoid
      // contaminating contact-level matching with alternative columns.
      if (mail1) deliveredMails.add(mail1);
      
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
      // Only mark original attempted email as bounced.
      if (mail1) bouncedMails.add(mail1);
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

  // Build set of all emails that appeared in the log (any status)
  const logMails = new Set<string>();
  for (const entry of emailLog) {
    const m = (entry.MAIL1 || "").toLowerCase().trim();
    if (m) logMails.add(m);
  }

  const filtered: CrossReferencedContact[] = [];
  const seenKeys = new Set<string>();

  for (const contact of contacts) {
    const mailCandidates = [contact.MAIL1, contact.MAIL2, contact.MAIL3, contact.MAIL4]
      .map((m) => (m || "").toLowerCase().trim())
      .filter(Boolean);

    const m1 = (contact.MAIL1 || "").toLowerCase().trim();
    const bouncedMatch = mailCandidates.find((m) => bouncedMails.has(m));
    const wasInLog = mailCandidates.some((m) => logMails.has(m));

    // In onlyBounced mode: include bounced OR not-sent contacts
    if (onlyBounced && !bouncedMatch && wasInLog) {
      continue;
    }

    const existing = m1 ? existingMap.get(m1) : undefined;
    if (existing) {
      if (existing.status === "ABIERTO" || existing.status === "CLICKEADO") continue;
      // Cooldown: skip if contacted in last 15 days
      if (existing.last_contacted_at) {
        const lastDate = new Date(existing.last_contacted_at);
        const diffDays = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays < COOLDOWN_DAYS) continue;
      }
    }

    if (m1 && deliveredMails.has(m1) && !existing && !onlyBounced) {
      continue;
    }

    let originalMail = m1;
    let finalMail = m1;
    const isNotSent = !wasInLog && !bouncedMatch;

    if (bouncedMatch) {
      originalMail = bouncedMatch;
      const alternatives = mailCandidates.filter(
        (m) =>
          m !== bouncedMatch &&
          isValidEmail(m) &&
          !bouncedMails.has(m) &&
          !deliveredMails.has(m) &&
          !isFreeMail(m)
      );

      if (alternatives.length > 0) {
        finalMail = alternatives[0];
      } else {
        finalMail = "";
      }
    } else if (isNotSent) {
      // Contact not in log at all — keep original mail but try to generate a better one via pattern
      originalMail = m1;
      finalMail = m1;
    } else if (onlyBounced) {
      continue;
    }

    const web = (contact.WEB || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
    const originalDomain = originalMail.split("@")[1] || "";
    let domain = (finalMail.split("@")[1] || originalDomain || web || "").toLowerCase();

    const getKnownPattern = (d: string): string | null => {
      if (!d) return null;
      const campaignPattern = domainPatternMap.get(d)?.pattern;
      if (campaignPattern) return campaignPattern;
      return baseDomainPatternMap.get(d) || null;
    };

    const shouldGeneratePatternMail =
      !finalMail ||
      !isValidEmail(finalMail) ||
      (onlyBounced && finalMail === originalMail) ||
      isNotSent;

    if (shouldGeneratePatternMail) {
      const bestPattern =
        getKnownPattern(domain) ||
        getKnownPattern(originalDomain) ||
        getKnownPattern(web);

      const targetDomain = domain || originalDomain || web;
      if (bestPattern && targetDomain) {
        const generated = generateEmailFromPattern(bestPattern, contact.NOMBRE, contact.APELLIDO, targetDomain);
        if (
          generated &&
          isValidEmail(generated) &&
          !bouncedMails.has(generated) &&
          !deliveredMails.has(generated) &&
          !isFreeMail(generated)
        ) {
          finalMail = generated;
          domain = generated.split("@")[1] || domain;
        }
      }
    } else if (!onlyBounced) {
      const knownPattern = getKnownPattern(domain);
      if (knownPattern) {
        const generated = generateEmailFromPattern(knownPattern, contact.NOMBRE, contact.APELLIDO, domain);
        if (generated && isValidEmail(generated) && !bouncedMails.has(generated) && !deliveredMails.has(generated)) {
          finalMail = generated;
        }
      }
    }

    // For not-sent contacts, skip if we couldn't improve the email
    if (isNotSent && finalMail === originalMail) continue;
    if (onlyBounced && !isNotSent && finalMail === originalMail) continue;
    if (!isValidEmail(finalMail)) continue;
    if (isFreeMail(finalMail)) continue;

    const empresaShort = extractCompanyFromDomain(web || domain);

    const key = `${contact.NOMBRE}|${contact.APELLIDO}|${originalMail}|${finalMail}`.toLowerCase();
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    filtered.push({
      NOMBRE: contact.NOMBRE,
      APELLIDO: contact.APELLIDO,
      APELLIDO2: contact.APELLIDO2,
      EMPRESA: contact.EMPRESA,
      EMPRESA_SHORT: empresaShort,
      WEB: contact.WEB,
      MAIL_ORIGINAL: originalMail,
      MAIL1: finalMail,
    });
  }

  return { filtered, patterns, delivered };
}

export function exportCrossReferenced(contacts: CrossReferencedContact[]) {
  // Export with clean column names, excluding internal fields
  const exportData = contacts.map(c => ({
    NOMBRE: c.NOMBRE,
    APELLIDO: c.APELLIDO,
    APELLIDO2: c.APELLIDO2,
    EMPRESA: c.EMPRESA_SHORT || c.EMPRESA,
    WEB: c.WEB,
    MAIL_ORIGINAL: c.MAIL_ORIGINAL,
    MAIL_CORREGIDO: c.MAIL1,
  }));
  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Filtrados");
  XLSX.writeFile(wb, "contactos_filtrados.xlsx");
}
