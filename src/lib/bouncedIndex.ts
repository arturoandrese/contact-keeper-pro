import { supabase } from "@/integrations/supabase/client";

/**
 * Loads every bounce in `bounced_emails` and groups locals by domain.
 * Domain is derived from the `mail` itself (not from the `domain` column)
 * so we never miss bounces whose domain field is null/mismatched.
 *
 * Result: Map<domain, Set<local>>  e.g. "falabella.com" -> {"tatiana.riesle", ...}
 */
export async function loadAllBouncedByDomain(): Promise<Map<string, Set<string>>> {
  const byDomain = new Map<string, Set<string>>();
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("bounced_emails")
      .select("mail")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data as any[]) {
      const mail = (row.mail || "").toLowerCase().trim();
      const [local, dom] = mail.split("@");
      if (!local || !dom) continue;
      if (!byDomain.has(dom)) byDomain.set(dom, new Set());
      byDomain.get(dom)!.add(local);
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return mergeSiblingDomains(byDomain);
}

const MULTI_TLDS = ["com.ar","com.br","com.mx","com.pe","com.co","co.uk","com.au","co.cl","gob.cl","com.cl"];
const GENERIC_ROOTS = new Set(["gmail","hotmail","outlook","yahoo","live","icloud","msn","aol","protonmail"]);

/** "agrosuper.cl" / "agrosuper.com" / "mail.agrosuper.com.ar" -> "agrosuper" */
export function domainRoot(domain: string): string {
  const d = domain.toLowerCase().trim();
  let parts = d.split(".");
  const multi = MULTI_TLDS.find((t) => d.endsWith("." + t));
  parts = parts.slice(0, parts.length - (multi ? 2 : 1));
  return parts[parts.length - 1] || d;
}

/**
 * Sibling domains of the same company (agrosuper.cl <-> agrosuper.com) share
 * their bounced locals, so a person who bounced on one never gets reused on the other.
 */
export function mergeSiblingDomains(byDomain: Map<string, Set<string>>): Map<string, Set<string>> {
  const byRoot = new Map<string, string[]>();
  for (const dom of byDomain.keys()) {
    const root = domainRoot(dom);
    if (!root || root.length < 3 || GENERIC_ROOTS.has(root)) continue;
    if (!byRoot.has(root)) byRoot.set(root, []);
    byRoot.get(root)!.push(dom);
  }
  const out = new Map<string, Set<string>>();
  for (const [dom, locals] of byDomain) out.set(dom, new Set(locals));
  for (const doms of byRoot.values()) {
    if (doms.length < 2) continue;
    const union = new Set<string>();
    for (const d of doms) for (const l of byDomain.get(d)!) union.add(l);
    for (const d of doms) out.set(d, new Set(union));
  }
  // Common siblings not yet seen: register .cl/.com twins so lookups by either hit.
  for (const [root, doms] of byRoot) {
    const union = out.get(doms[0])!;
    for (const twin of [`${root}.cl`, `${root}.com`]) if (!out.has(twin)) out.set(twin, new Set(union));
  }
  return out;
}
