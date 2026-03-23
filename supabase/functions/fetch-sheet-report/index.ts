import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate JWT authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const GOOGLE_SHEETS_API_KEY = Deno.env.get("GOOGLE_SHEETS_API_KEY");
    if (!GOOGLE_SHEETS_API_KEY) {
      throw new Error("GOOGLE_SHEETS_API_KEY is not configured");
    }

    const { sheetId, range } = await req.json();
    if (!sheetId) {
      return new Response(
        JSON.stringify({ error: "sheetId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Default range covers typical YAMM report columns
    const sheetRange = range || "A:Z";
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(sheetRange)}?key=${GOOGLE_SHEETS_API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Google Sheets API error [${response.status}]: ${JSON.stringify(data)}`);
    }

    const rows = data.values || [];
    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ headers: [], rows: [], stats: {} }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const headers = rows[0] as string[];
    const dataRows = rows.slice(1);

    // Find the "Merge status" column (YAMM standard)
    const mergeIdx = headers.findIndex(
      (h: string) => h.toLowerCase().includes("merge status") || h.toLowerCase().includes("status")
    );
    const emailIdx = headers.findIndex(
      (h: string) =>
        h.toLowerCase().includes("mail") ||
        h.toLowerCase().includes("email") ||
        h.toLowerCase().includes("correo")
    );

    // Calculate stats from merge status
    const stats: Record<string, number> = {};
    const contacts: Array<Record<string, string>> = [];

    for (const row of dataRows) {
      const status = mergeIdx >= 0 ? (row[mergeIdx] || "UNKNOWN").toString().toUpperCase().trim() : "UNKNOWN";
      stats[status] = (stats[status] || 0) + 1;

      const contact: Record<string, string> = {};
      headers.forEach((h: string, i: number) => {
        contact[h] = row[i] || "";
      });
      contact._status = status;
      contacts.push(contact);
    }

    return new Response(
      JSON.stringify({
        headers,
        total: dataRows.length,
        stats,
        contacts,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error fetching sheet:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
