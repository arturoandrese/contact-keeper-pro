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
    const email1 = (row.email1 || "").trim().toLowerCase();
    if (!isValidEmail(email1)) continue;

    const rawFirst = removeAccents((row.first_name || "").trim());
    const rawLast = removeAccents((row.last_name || "").trim());

    const firstParts = rawFirst.split(/\s+/).filter(Boolean);
    const lastParts = rawLast.split(/\s+/).filter(Boolean);

    const nombre = (firstParts[0] || "").toLowerCase();
    const apellido = (lastParts[0] || "").toLowerCase();
    const apellido2 = lastParts.length > 1 ? lastParts[1].toLowerCase() : "";

    const empresa = (row.company_name || "").trim().toUpperCase();
    const web = extractDomain(row.company_website || "");

    const domain = web;
    let mail1 = "";
    let mail2 = "";
    let mail3 = email1;
    let mail4 = "";

    if (domain) {
      const initial = nombre.charAt(0);
      mail1 = `${initial}${apellido}@${domain}`;
      mail2 = `${nombre}.${apellido}@${domain}`;
      if (apellido2) {
        mail4 = `${initial}${apellido}${apellido2.charAt(0)}@${domain}`;
      } else {
        mail4 = `${initial}${apellido}@${domain}`;
      }
    } else {
      mail1 = email1;
      mail2 = "";
      mail3 = "";
      mail4 = "";
    }

    if (!mail2 && mail3.toLowerCase() === mail1.toLowerCase()) {
      mail3 = "";
    }

    let contact: CleanedContact = {
      NOMBRE: nombre.charAt(0).toUpperCase() + nombre.slice(1),
      APELLIDO: apellido.charAt(0).toUpperCase() + apellido.slice(1),
      APELLIDO2: apellido2 ? apellido2.charAt(0).toUpperCase() + apellido2.slice(1) : "",
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
