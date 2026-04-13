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

    const body = await req.json();
    const { sheetId, tabTitle, sheetIndex, googleAccessToken } = body;

    if (!sheetId || tabTitle === undefined || sheetIndex === undefined) {
      return new Response(
        JSON.stringify({ error: "sheetId, tabTitle, and sheetIndex are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!googleAccessToken) {
      return new Response(
        JSON.stringify({ error: "No Google access token provided. Please reconnect Google." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const newTitle = tabTitle.startsWith("CCP_") ? tabTitle : `CCP_${tabTitle}`;

    const batchBody = {
      requests: [
        {
          updateSheetProperties: {
            properties: {
              sheetId: sheetIndex,
              title: newTitle,
              tabColorStyle: {
                rgbColor: { red: 0.13, green: 0.55, blue: 0.33, alpha: 1 },
              },
            },
            fields: "title,tabColorStyle",
          },
        },
      ],
    };

    const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}:batchUpdate`;
    const response = await fetch(sheetsUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${googleAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(batchBody),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("Google Sheets batchUpdate error:", JSON.stringify(result));
      return new Response(
        JSON.stringify({ error: "Failed to mark sheet", details: result.error?.message || "" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, newTitle }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in mark-sheet-ccp:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
