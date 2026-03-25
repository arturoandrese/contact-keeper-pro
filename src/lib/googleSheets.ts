import { supabase } from "@/integrations/supabase/client";

export interface SheetData {
  headers: string[];
  total: number;
  stats: Record<string, number>;
  contacts: Array<Record<string, string>>;
}

export interface SheetTab {
  title: string;
  index: number;
  rowCount: number;
}

export async function fetchSheetTabs(sheetId: string): Promise<SheetTab[]> {
  const { data, error } = await supabase.functions.invoke("fetch-sheet-report", {
    body: { sheetId, action: "tabs" },
  });

  if (error) {
    throw new Error("Error fetching sheet tabs");
  }

  return data.tabs || [];
}

function normalizeYammStatus(rawStatus: string): string {
  const raw = rawStatus.toUpperCase().trim();
  const normalized = raw.replace(/\s+/g, "_");

  if (!normalized) return "EMAIL_NOT_SENT";
  if (normalized.includes("BOUNC") || normalized.includes("REBOT")) return "EMAIL_BOUNCED";
  if (normalized.includes("CLICK") || normalized.includes("CLIC")) return "EMAIL_CLICKED";
  if (normalized.includes("OPEN") || normalized.includes("ABIERT")) return "EMAIL_OPENED";
  if (normalized.includes("DELIVER")) return "EMAIL_DELIVERED";
  if (normalized.includes("NOT_SENT") || normalized.includes("NO_ENVIAD")) return "EMAIL_NOT_SENT";
  if (normalized.includes("MAIL_MERGE_COMPLETE") || normalized.includes("MERGE_COMPLETE")) return "MAIL_MERGE_COMPLETE";
  if (normalized.includes("SENT") || normalized.includes("ENVIAD")) return "EMAIL_SENT";

  return "UNKNOWN";
}

export async function fetchSheetReport(sheetId: string, sheetName?: string): Promise<SheetData> {
  const range = sheetName ? `'${sheetName}'!A:Z` : "A:Z";

  const { data, error } = await supabase.functions.invoke("fetch-sheet-report", {
    body: { sheetId, range, action: "report" },
  });

  if (error) {
    throw new Error("Error fetching sheet report");
  }

  const rows = data.values || [];
  if (rows.length === 0) {
    return { headers: [], total: 0, stats: {}, contacts: [] };
  }

  const headers = rows[0] as string[];
  const dataRows = rows.slice(1);

  const mergeIdx = headers.findIndex((h: string) => {
    const lower = h.toLowerCase().trim();
    return (
      lower === "merge status" ||
      lower === "status" ||
      lower === "estado" ||
      lower.includes("merge status") ||
      lower.includes("mail merge") ||
      lower.includes("yamm") ||
      lower.includes("status")
    );
  });

  const stats: Record<string, number> = {};
  const contacts: Array<Record<string, string>> = [];

  for (const row of dataRows) {
    const rawStatus = mergeIdx >= 0 && mergeIdx < row.length ? (row[mergeIdx] || "").toString() : "";
    const status = rawStatus.trim() ? normalizeYammStatus(rawStatus) : "EMAIL_NOT_SENT";
    stats[status] = (stats[status] || 0) + 1;

    const contact: Record<string, string> = {};
    headers.forEach((h: string, i: number) => {
      contact[h] = row[i] || "";
    });

    contact._status = status;
    contacts.push(contact);
  }

  return { headers, total: dataRows.length, stats, contacts };
}
