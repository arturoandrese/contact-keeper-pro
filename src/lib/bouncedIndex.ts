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
  return byDomain;
}
