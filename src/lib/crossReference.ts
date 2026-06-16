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
  MAIL2: string;
  MAIL3: string;
  confirmedPattern?: boolean;
}

export interface DomainPatternEntry {
  domain: string;
  pattern: string;
  example_email: string;
  confirmed?: boolean;
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

function isNotSentStatus(status: string): boolean {
  const s = normalizeStatus(status);
  return s.includes("NOT_SENT") || s.includes("NO_SENT") || s.includes("NO_ENVIAD") || s === "" || s === "ERROR";
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
  if (!n || !a) return null;
  const ni = n[0];
  const ai = a[0];

  // Order matters: more specific first
  if (local === `${n}.${a}`) return "first.last";
  if (local === `${a}.${n}`) return "last.first";
  if (local === `${ni}.${a}`) return "initial.last";
  if (local === `${n}_${a}`) return "first_last_underscore";
  if (local === `${n}${a}`) return "first_last";
  if (local === `${n}${ai}`) return "first_initial";
  if (local === `${ni}${a}`) return "initial_last";
  if (local.startsWith(`${ni}${a}`) && local.length === ni.length + a.length + 1) return "initial_last_initial2";
  if (local === n) return "first";
  if (local === a) return "last";
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

export interface ParseEmailLogResult {
  entries: EmailLogEntry[];
  error?: string;
}

export function parseEmailLog(fileContent: ArrayBuffer): ParseEmailLogResult {
  const wb = XLSX.read(fileContent, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws);

  if (rows.length === 0) {
    return { entries: [], error: "El archivo está vacío" };
  }

  // Validate required columns
  const headers = Object.keys(rows[0]).map(h => h.trim().toUpperCase());
  const hasEmail = headers.some(h => ["MAIL1", "EMAIL1", "EMAIL", "MAIL", "EMAIL ADDRESS"].includes(h));
  const hasStatus = headers.some(h => ["MERGE STATUS", "STATUS", "MERGE_STATUS"].includes(h));

  const missing: string[] = [];
  if (!hasEmail) missing.push("MAIL1 o EMAIL");
  if (!hasStatus) missing.push("Merge status o STATUS");

  if (missing.length > 0) {
    return { entries: [], error: `Columnas faltantes: ${missing.join(", ")}. Columnas encontradas: ${headers.slice(0, 8).join(", ")}` };
  }
  
  const entries = rows.map((row) => {
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
      MAIL1: getName(["MAIL1", "email1", "Email", "email", "Email Address"]),
      MAIL2: getName(["MAIL2", "email2"]),
      status: getName(["Merge status", "Status", "merge_status", "status"]),
    };
  });

  return { entries };
}

export interface ExistingDelivered {
  mail: string;
  times_contacted: number;
  last_contacted_at: string;
  status: string;
}

export interface DeliveredHistoryEntry {
  mail: string;
  nombre: string;
  apellido: string;
}

export interface CrossReferenceOptions {
  onlyBounced?: boolean;
  savedPatterns?: DomainPatternEntry[];
  deliveredHistory?: DeliveredHistoryEntry[];
  cooldownDays?: number;
  globalBouncedMails?: string[];
}

export interface CrossReferenceStats {
  totalBase: number;
  excludedDelivered: number;
  excludedCooldown: number;
  excludedBounceNoAlt: number;
  readyToSend: number;
}

function generateEmailFromPattern(pattern: string, nombre: string, apellido: string, domain: string): string | null {
  if (!nombre || !apellido || !domain) return null;
  const n = nombre.toLowerCase();
  const a = apellido.toLowerCase();
  if (!n || !a) return null;
  const ni = n[0];
  const ai = a[0];
  switch (pattern) {
    case "first.last": return `${n}.${a}@${domain}`;
    case "last.first": return `${a}.${n}@${domain}`;
    case "initial.last": return `${ni}.${a}@${domain}`;
    case "first_last": return `${n}${a}@${domain}`;
    case "first_last_underscore": return `${n}_${a}@${domain}`;
    case "first_initial": return `${n}${ai}@${domain}`;
    case "initial_last": return `${ni}${a}@${domain}`;
    case "first_last_initial": return `${n}${ai}@${domain}`;
    case "first": return `${n}@${domain}`;
    case "last": return `${a}@${domain}`;
    default: return null;
  }
}

export function crossReference(
  contacts: CleanedContact[],
  emailLog: EmailLogEntry[],
  existingDelivered?: ExistingDelivered[],
  options: CrossReferenceOptions = {}
): { filtered: CrossReferencedContact[]; patterns: DomainPatternEntry[]; delivered: DeliveredContactEntry[]; stats: CrossReferenceStats } {
  const onlyBounced = options.onlyBounced === true;
  const cooldownDays = options.cooldownDays ?? 15;
  const deliveredMails = new Set<string>();
  const bouncedMails = new Set<string>();
  const notSentMails = new Set<string>();
  const patterns: DomainPatternEntry[] = [];
  const delivered: DeliveredContactEntry[] = [];
  const seenDelivered = new Set<string>();

  // Stats tracking
  let excludedDelivered = 0;
  let excludedCooldown = 0;
  let excludedBounceNoAlt = 0;

  const existingMap = new Map<string, ExistingDelivered>();
  const domainPatternMap = new Map<string, { pattern: string; status: string; confirmed: boolean }>();
  const baseDomainPatternMap = buildBaseDomainPatternMap(contacts);
  const STATUS_PRIORITY: Record<string, number> = { CLICKEADO: 3, ABIERTO: 2, ENVIADO: 1 };

  // Track success/failure counts per (domain, pattern) to skip bounce-prone patterns
  const domainPatternStats = new Map<string, Map<string, { success: number; fail: number }>>();
  const bumpStat = (domain: string, pattern: string, kind: "success" | "fail") => {
    if (!domain || !pattern) return;
    let byPattern = domainPatternStats.get(domain);
    if (!byPattern) {
      byPattern = new Map();
      domainPatternStats.set(domain, byPattern);
    }
    const cur = byPattern.get(pattern) || { success: 0, fail: 0 };
    cur[kind]++;
    byPattern.set(pattern, cur);
  };
  const isPatternBlocked = (domain: string, pattern: string): boolean => {
    const stats = domainPatternStats.get(domain)?.get(pattern);
    if (!stats) return false;
    return stats.fail > 0 && stats.fail >= stats.success;
  };

  // Seed domainPatternMap with saved patterns from DB
  if (options.savedPatterns) {
    for (const sp of options.savedPatterns) {
      if (!domainPatternMap.has(sp.domain)) {
        domainPatternMap.set(sp.domain, {
          pattern: sp.pattern,
          status: "SAVED",
          confirmed: sp.confirmed === true,
        });
      }
    }
  }

  // Seed patterns from delivered_contacts history
  if (options.deliveredHistory) {
    for (const dh of options.deliveredHistory) {
      const mail = dh.mail.toLowerCase();
      const domain = mail.split("@")[1];
      if (!domain || isFreeMail(mail)) continue;
      const pat = detectPattern(mail, dh.nombre, dh.apellido);
      if (pat) {
        const current = domainPatternMap.get(domain);
        if (!current || current.status === "SAVED") {
          domainPatternMap.set(domain, { pattern: pat, status: "HISTORY", confirmed: false });
        }
      }
    }
  }

  if (existingDelivered) {
    for (const e of existingDelivered) {
      existingMap.set(e.mail.toLowerCase(), e);
    }
  }

  for (const entry of emailLog) {
    const mail1 = (entry.MAIL1 || "").toLowerCase();
    const mail2 = (entry.MAIL2 || "").toLowerCase();
    const status = entry.status;

    if (isDelivered(status)) {
      if (mail1) deliveredMails.add(mail1);
      
      const successMail = mail1 || mail2;
      if (successMail && !isFreeMail(successMail)) {
        const domain = successMail.split("@")[1];
        const pat = detectPattern(successMail, entry.NOMBRE, entry.APELLIDO);
        if (domain && pat) {
          bumpStat(domain, pat, "success");
          const classified = classifyStatus(status) || "ENVIADO";
          const isConfirmed = classified === "ABIERTO" || classified === "CLICKEADO";
          patterns.push({ domain, pattern: pat, example_email: successMail, confirmed: isConfirmed });
          
          const current = domainPatternMap.get(domain);
          const priority = STATUS_PRIORITY[classified] || 0;
          if (!current || priority > (STATUS_PRIORITY[current.status] || 0)) {
            domainPatternMap.set(domain, { pattern: pat, status: classified, confirmed: isConfirmed });
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
      // Learn which pattern bounced so we can avoid it for new contacts in this domain
      const bouncedMail = mail1 || mail2;
      if (bouncedMail && !isFreeMail(bouncedMail)) {
        const domain = bouncedMail.split("@")[1];
        const pat = detectPattern(bouncedMail, entry.NOMBRE, entry.APELLIDO);
        if (domain && pat) bumpStat(domain, pat, "fail");
      }
    }

    if (isNotSentStatus(status)) {
      if (mail1) notSentMails.add(mail1);
    }
  }

  // Build patterns from existingDelivered
  if (existingDelivered) {
    for (const e of existingDelivered) {
      const domain = e.mail.split("@")[1]?.toLowerCase();
      if (!domain || isFreeMail(e.mail)) continue;
      const deliveredEntry = delivered.find(d => d.mail === e.mail.toLowerCase());
      if (deliveredEntry) {
        const pat = detectPattern(e.mail, deliveredEntry.nombre, deliveredEntry.apellido);
        if (pat) {
          const current = domainPatternMap.get(domain);
          const priority = STATUS_PRIORITY[e.status] || 0;
          const isConfirmed = e.status === "ABIERTO" || e.status === "CLICKEADO";
          if (!current || priority > (STATUS_PRIORITY[current.status] || 0)) {
            domainPatternMap.set(domain, { pattern: pat, status: e.status, confirmed: isConfirmed });
          }
        }
      }
    }
  }

  // Build name-based lookup for bounced/not-sent
  const nameStatusMap = new Map<string, { status: "bounced" | "not_sent"; mail: string }>();
  for (const entry of emailLog) {
    const mail = (entry.MAIL1 || "").toLowerCase().trim();
    const status = entry.status;
    const nameKey = `${(entry.NOMBRE || "").trim().toLowerCase()}|${(entry.APELLIDO || "").trim().toLowerCase()}`;
    if (!nameKey || nameKey === "|") continue;
    if (isBounced(status)) {
      nameStatusMap.set(nameKey, { status: "bounced", mail });
    } else if (isNotSentStatus(status)) {
      nameStatusMap.set(nameKey, { status: "not_sent", mail });
    }
  }

  // Merge global bounces (from bounced_emails table) into bouncedMails set,
  // BUT skip any mail that also appears as delivered (it was sent successfully on another sheet)
  if (options.globalBouncedMails) {
    for (const m of options.globalBouncedMails) {
      const mail = (m || "").toLowerCase().trim();
      if (!mail) continue;
      if (deliveredMails.has(mail)) continue; // already counted as delivered → don't blacklist
      bouncedMails.add(mail);
    }
  }

  const filtered: CrossReferencedContact[] = [];
  const seenKeys = new Set<string>();

  for (const contact of contacts) {
    const mailCandidates = [contact.MAIL1, contact.MAIL2, contact.MAIL3, contact.MAIL4]
      .map((m) => (m || "").toLowerCase().trim())
      .filter(Boolean);

    const m1 = (contact.MAIL1 || "").toLowerCase().trim();
    const bouncedMatch = mailCandidates.find((m) => bouncedMails.has(m));
    const notSentMatch = mailCandidates.find((m) => notSentMails.has(m));

    // Always check name-based matching (not just as fallback)
    // This catches cases where the sent email was generated by pattern and doesn't exist in MAIL1-4
    const contactNameKey = `${(contact.NOMBRE || "").trim().toLowerCase()}|${(contact.APELLIDO || "").trim().toLowerCase()}`;
    const nameMatch = (contactNameKey && contactNameKey !== "|") ? nameStatusMap.get(contactNameKey) : undefined;
    const isBouncedByName = nameMatch?.status === "bounced";
    const isNotSentByName = nameMatch?.status === "not_sent";

    const effectiveBounced = !!bouncedMatch || isBouncedByName;
    const effectiveNotSent = !!notSentMatch || isNotSentByName;

    if (onlyBounced && !effectiveBounced && !effectiveNotSent) {
      continue;
    }

    const existing = m1 ? existingMap.get(m1) : undefined;
    if (existing) {
      if (existing.status === "ABIERTO" || existing.status === "CLICKEADO") {
        excludedDelivered++;
        continue;
      }
      if (existing.last_contacted_at) {
        const lastDate = new Date(existing.last_contacted_at);
        const diffDays = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays < cooldownDays) {
          excludedCooldown++;
          continue;
        }
      }
    }

    // DEDUP: Check ALL mail candidates against deliveredMails, not just MAIL1
    if (!onlyBounced && !existing) {
      const anyDelivered = mailCandidates.some(m => deliveredMails.has(m));
      if (anyDelivered) {
        excludedDelivered++;
        continue;
      }
    }

    let originalMail = m1;
    let finalMail = m1;
    const isNotSent = effectiveNotSent && !effectiveBounced;

    if (effectiveBounced) {
      originalMail = bouncedMatch || nameMatch?.mail || m1;
      // Also add the bounced mail from sheet to the exclusion set (it may not be in MAIL1-4)
      const bouncedSheetMail = nameMatch?.mail || "";
      const alternatives = mailCandidates.filter(
        (m) =>
          m !== originalMail &&
          m !== bouncedSheetMail &&
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
      originalMail = m1;
      finalMail = m1;
    } else if (onlyBounced) {
      continue;
    }

    const web = (contact.WEB || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
    const originalDomain = originalMail.split("@")[1] || "";
    let domain = (finalMail.split("@")[1] || originalDomain || web || "").toLowerCase();

    const getKnownPattern = (d: string): { pattern: string; confirmed: boolean } | null => {
      if (!d) return null;
      const campaignPattern = domainPatternMap.get(d);
      if (campaignPattern && !isPatternBlocked(d, campaignPattern.pattern)) {
        return { pattern: campaignPattern.pattern, confirmed: campaignPattern.confirmed };
      }
      const basePattern = baseDomainPatternMap.get(d);
      if (basePattern && !isPatternBlocked(d, basePattern)) {
        return { pattern: basePattern, confirmed: false };
      }
      return null;
    };

    const shouldGeneratePatternMail =
      !finalMail ||
      !isValidEmail(finalMail) ||
      (onlyBounced && finalMail === originalMail) ||
      isNotSent;

    let usedConfirmedPattern = false;

    if (shouldGeneratePatternMail) {
      const bestPatternInfo =
        getKnownPattern(domain) ||
        getKnownPattern(originalDomain) ||
        getKnownPattern(web);

      const targetDomain = domain || originalDomain || web;
      if (bestPatternInfo && targetDomain) {
        const generated = generateEmailFromPattern(bestPatternInfo.pattern, contact.NOMBRE, contact.APELLIDO, targetDomain);
        if (
          generated &&
          isValidEmail(generated) &&
          !bouncedMails.has(generated) &&
          !deliveredMails.has(generated) &&
          !isFreeMail(generated)
        ) {
          finalMail = generated;
          domain = generated.split("@")[1] || domain;
          usedConfirmedPattern = bestPatternInfo.confirmed;
        }
      }
    } else if (!onlyBounced) {
      const knownPatternInfo = getKnownPattern(domain);
      if (knownPatternInfo) {
        const generated = generateEmailFromPattern(knownPatternInfo.pattern, contact.NOMBRE, contact.APELLIDO, domain);
        if (generated && isValidEmail(generated) && !bouncedMails.has(generated) && !deliveredMails.has(generated)) {
          finalMail = generated;
          usedConfirmedPattern = knownPatternInfo.confirmed;
        }
      }
    }

    if (!isNotSent && onlyBounced && finalMail === originalMail) {
      excludedBounceNoAlt++;
      continue;
    }
    if (!isValidEmail(finalMail)) {
      excludedBounceNoAlt++;
      continue;
    }
    if (!isNotSent && isFreeMail(finalMail)) continue;

    const empresaShort = extractCompanyFromDomain(web || domain);

    const key = `${contact.NOMBRE}|${contact.APELLIDO}|${originalMail}|${finalMail}`.toLowerCase();
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    // Build alternative emails (MAIL2, MAIL3)
    // If confirmed pattern → skip alternatives to protect sender reputation
    let altMails: string[] = [];

    if (!usedConfirmedPattern) {
      const usedMails = new Set([finalMail.toLowerCase(), originalMail.toLowerCase()]);

      // First: remaining manual alternatives from the contact
      for (const m of mailCandidates) {
        if (altMails.length >= 2) break;
        if (usedMails.has(m) || bouncedMails.has(m) || deliveredMails.has(m)) continue;
        if (!isValidEmail(m) || isFreeMail(m)) continue;
        altMails.push(m);
        usedMails.add(m);
      }

      // Second: generate from other known patterns
      if (altMails.length < 2) {
        const targetDomain = domain || originalDomain || web;
        if (targetDomain) {
          const allPatterns = ["first.last", "initial_last", "initial.last", "last.first", "first", "first_last_initial"];
          const knownP = getKnownPattern(targetDomain);
          const usedPattern = knownP?.pattern || "";
          for (const pat of allPatterns) {
            if (altMails.length >= 2) break;
            if (pat === usedPattern) continue;
            const gen = generateEmailFromPattern(pat, contact.NOMBRE, contact.APELLIDO, targetDomain);
            if (gen && isValidEmail(gen) && !usedMails.has(gen.toLowerCase()) && !bouncedMails.has(gen) && !deliveredMails.has(gen) && !isFreeMail(gen)) {
              altMails.push(gen);
              usedMails.add(gen.toLowerCase());
            }
          }
        }
      }
    }

    filtered.push({
      NOMBRE: contact.NOMBRE,
      APELLIDO: contact.APELLIDO,
      APELLIDO2: contact.APELLIDO2,
      EMPRESA: contact.EMPRESA,
      EMPRESA_SHORT: empresaShort,
      WEB: contact.WEB,
      MAIL_ORIGINAL: originalMail,
      MAIL1: finalMail,
      MAIL2: altMails[0] || "",
      MAIL3: altMails[1] || "",
      confirmedPattern: usedConfirmedPattern,
    });
  }

  const stats: CrossReferenceStats = {
    totalBase: contacts.length,
    excludedDelivered,
    excludedCooldown,
    excludedBounceNoAlt,
    readyToSend: filtered.length,
  };

  return { filtered, patterns, delivered, stats };
}

export function exportCrossReferenced(contacts: CrossReferencedContact[]) {
  const exportData = contacts.map(c => ({
    NOMBRE: c.NOMBRE,
    APELLIDO: c.APELLIDO,
    APELLIDO2: c.APELLIDO2,
    EMPRESA: c.EMPRESA_SHORT || c.EMPRESA,
    WEB: c.WEB,
    MAIL1: c.MAIL1,
    MAIL2: c.MAIL2,
    MAIL3: c.MAIL3,
  }));
  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Filtrados");
  XLSX.writeFile(wb, "contactos_filtrados.xlsx");
}
