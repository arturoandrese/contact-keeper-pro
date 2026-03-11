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
    const email1 = (row.email1 || row.Email || row.EMAIL || row.email || "").trim().toLowerCase();
    if (!isValidEmail(email1)) continue;

    // Filtrar emails no corporativos
    if (!isCorporateEmail(email1)) continue;

    const rawFirst = removeAccents((row.first_name || row.First_Name || row.FirstName || row.nombre || "").trim());
    const rawLast = removeAccents((row.last_name || row.Last_Name || row.LastName || row.apellido || "").trim());

    const firstParts = rawFirst.split(/\s+/).filter(Boolean);
    const lastParts = rawLast.split(/\s+/).filter(Boolean);

    const nombre = (firstParts[0] || "").toLowerCase();
    const apellido = (lastParts[0] || "").toLowerCase();
    const apellido2 = lastParts.length > 1 ? lastParts[1].toLowerCase() : "";

    const web = extractDomain(row.company_website || row.Company_Website || row.website || row.Web || row.WEB || "");
    
    // Empresa: preferir extraer de la web para nombre limpio
    let empresa = "";
    if (web) {
      empresa = extractCompanyFromWeb(web);
    }
    // Si no hay web, usar company_name pero limpiarlo
    if (!empresa) {
      const rawCompany = (row.company_name || row.Company_Name || row.company || row.empresa || row.EMPRESA || "").trim();
      // Limitar largo y limpiar
      empresa = rawCompany.length > 40 ? rawCompany.substring(0, 40).trim() : rawCompany;
      empresa = empresa.toUpperCase();
    }

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
