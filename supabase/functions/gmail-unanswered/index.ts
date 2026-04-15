import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { accessToken } = await req.json();
    const { accessToken, userEmail } = await req.json();

    if (!accessToken || !userEmail) {
      return new Response(
        JSON.stringify({ error: "accessToken and userEmail are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const headers = { Authorization: `Bearer ${accessToken}` };

    // Search for emails received in last 48h that are in inbox
    const after48h = Math.floor((Date.now() - 48 * 60 * 60 * 1000) / 1000);
    const query = `in:inbox after:${after48h} -from:me -category:promotions -category:social -category:updates`;

    const searchUrl = `${GMAIL_API}/messages?q=${encodeURIComponent(query)}&maxResults=50`;
    const searchRes = await fetch(searchUrl, { headers });

    if (!searchRes.ok) {
      const text = await searchRes.text();
      console.error("Gmail search error:", searchRes.status, text);
      return new Response(
        JSON.stringify({ error: "Gmail API error", status: searchRes.status }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const searchData = await searchRes.json();
    const messageIds: string[] = (searchData.messages || []).map((m: any) => m.id);

    if (messageIds.length === 0) {
      return new Response(
        JSON.stringify({ unanswered: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch each message to check if user has replied
    const unanswered: Array<{
      id: string;
      from: string;
      fromEmail: string;
      subject: string;
      date: string;
      snippet: string;
      threadId: string;
    }> = [];

    for (let i = 0; i < Math.min(messageIds.length, 50); i++) {
      const msgUrl = `${GMAIL_API}/messages/${messageIds[i]}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`;
      const msgRes = await fetch(msgUrl, { headers });
      if (!msgRes.ok) {
        await msgRes.text();
        continue;
      }

      const msg = await msgRes.json();
      const threadId = msg.threadId;

      const threadUrl = `${GMAIL_API}/threads/${threadId}?format=metadata&metadataHeaders=From`;
      const threadRes = await fetch(threadUrl, { headers });
      if (!threadRes.ok) {
        await threadRes.text();
        continue;
      }

      const thread = await threadRes.json();
      const messages = thread.messages || [];

      const msgIndex = messages.findIndex((m: any) => m.id === messageIds[i]);

      let userReplied = false;
      for (let j = msgIndex + 1; j < messages.length; j++) {
        const fromHeader = (messages[j].payload?.headers || []).find(
          (h: any) => h.name.toLowerCase() === "from"
        );
        const fromValue = fromHeader?.value || "";
        if (fromValue.toLowerCase().includes(userEmail.toLowerCase())) {
          userReplied = true;
          break;
        }
      }

      if (!userReplied) {
        const msgHeaders = msg.payload?.headers || [];
        const fromH = msgHeaders.find((h: any) => h.name.toLowerCase() === "from");
        const subjectH = msgHeaders.find((h: any) => h.name.toLowerCase() === "subject");
        const dateH = msgHeaders.find((h: any) => h.name.toLowerCase() === "date");

        const fromRaw = fromH?.value || "";
        const emailMatch = fromRaw.match(/<(.+?)>/);
        const fromEmail = emailMatch ? emailMatch[1] : fromRaw;
        const fromName = fromRaw.replace(/<.+?>/, "").replace(/"/g, "").trim();

        unanswered.push({
          id: msg.id,
          from: fromName || fromEmail,
          fromEmail,
          subject: subjectH?.value || "(sin asunto)",
          date: dateH?.value || "",
          snippet: msg.snippet || "",
          threadId,
        });
      }
    }

    return new Response(
      JSON.stringify({ unanswered }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in gmail-unanswered:", error);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
