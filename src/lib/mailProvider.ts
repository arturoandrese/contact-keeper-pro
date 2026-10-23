// Detecta si el correo de un dominio lo recibe Google (Gmail/Workspace),
// Microsoft (Outlook/365) u otro proveedor, mirando sus registros MX
// vía DNS-over-HTTPS de Google (sin API key).

export type MailProvider = "google" | "microsoft" | "other";

const DoH = "https://dns.google/resolve";

const cache = new Map<string, MailProvider>();

async function fetchMx(domain: string): Promise<string[]> {
  try {
    const res = await fetch(`${DoH}?name=${encodeURIComponent(domain)}&type=MX`);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.Answer || [])
      .filter((a: { type: number }) => a.type === 15)
      .map((a: { data?: string }) => String(a.data || "").toLowerCase());
  } catch {
    return [];
  }
}

export function classifyMx(mxRecords: string[]): MailProvider {
  const joined = mxRecords.join(" ");
  if (!joined) return "other";
  if (
    joined.includes("google.com") ||
    joined.includes("googlemail.com") ||
    joined.includes("aspmx.l.google")
  ) {
    return "google";
  }
  if (
    joined.includes("outlook.com") ||
    joined.includes("mail.protection.outlook") ||
    joined.includes("microsoft.com") ||
    joined.includes("office365")
  ) {
    return "microsoft";
  }
  return "other";
}

export async function detectMailProvider(domain: string): Promise<MailProvider> {
  const d = domain.trim().toLowerCase();
  if (!d) return "other";
  const cached = cache.get(d);
  if (cached) return cached;
  const provider = classifyMx(await fetchMx(d));
  cache.set(d, provider);
  return provider;
}

/**
 * Clasifica todos los dominios únicos de una lista de correos.
 * Devuelve un mapa dominio -> proveedor. Corre en paralelo con límite.
 */
export async function detectProvidersForEmails(
  emails: string[],
  concurrency = 8
): Promise<Map<string, MailProvider>> {
  const domains = Array.from(
    new Set(
      emails
        .map((e) => e.split("@")[1]?.toLowerCase())
        .filter((d): d is string => Boolean(d))
    )
  );

  const result = new Map<string, MailProvider>();
  let index = 0;

  async function worker() {
    while (index < domains.length) {
      const domain = domains[index++];
      result.set(domain, await detectMailProvider(domain));
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, domains.length) }, worker));
  return result;
}
