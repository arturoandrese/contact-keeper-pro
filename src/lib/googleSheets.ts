const GOOGLE_SHEETS_API_KEY = "AIzaSyA-2kvUDWmPgJsVPLBXS35P6ihw_Gh0Tls";

export interface SheetData {
  headers: string[];
  total: number;
  stats: Record<string, number>;
  contacts: Array<Record<string, string>>;
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

export async function fetchSheetReport(sheetId: string, range = "A:Z"): Promise<SheetData> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?key=${GOOGLE_SHEETS_API_KEY}`;

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Google Sheets API error [${response.status}]: ${data.error?.message || JSON.stringify(data)}`);
  }

  const rows = data.values || [];
  if (rows.length === 0) {
    return { headers: [], total: 0, stats: {}, contacts: [] };
  }

  const headers = rows[0] as string[];
  const dataRows = rows.slice(1);

  // Find the "Merge status" column (YAMM standard) - check multiple patterns
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

  console.log("📊 Sheet headers:", headers);
  console.log("📊 Merge status column index:", mergeIdx, mergeIdx >= 0 ? `(${headers[mergeIdx]})` : "(NOT FOUND)");

  const stats: Record<string, number> = {};
  const contacts: Array<Record<string, string>> = [];

  for (const row of dataRows) {
    const rawStatus = mergeIdx >= 0 ? (row[mergeIdx] || "").toString() : "";
    const status = normalizeYammStatus(rawStatus);
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
