import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

type GmailMessage = {
  id: string;
  threadId: string;
  payload: {
    headers: { name: string; value: string }[];
    body?: { data?: string };
    parts?: { mimeType: string; body?: { data?: string } }[];
  };
  labelIds?: string[];
};

function getHeader(msg: GmailMessage, name: string): string {
  return msg.payload.headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
}

function decodeBase64Url(data: string): string {
  try {
    const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

function getBody(msg: GmailMessage): string {
  if (msg.payload.body?.data) return decodeBase64Url(msg.payload.body.data);
  if (msg.payload.parts) {
    const textPart = msg.payload.parts.find((p) => p.mimeType === "text/plain");
    if (textPart?.body?.data) return decodeBase64Url(textPart.body.data);
    const htmlPart = msg.payload.parts.find((p) => p.mimeType === "text/html");
    if (htmlPart?.body?.data) {
      return decodeBase64Url(htmlPart.body.data).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    }
  }
  return "";
}

function classifyStatus(body: string): string {
  const lower = body.toLowerCase();
  const autoPatterns = [
    "fuera de oficina", "out of office", "respuesta automática", "automatic reply",
    "auto-reply", "autoreply", "estoy fuera", "estaré fuera", "no estoy disponible",
    "mensaje automático", "vacaciones",
  ];
  if (autoPatterns.some((p) => lower.includes(p))) return "auto_reply";

  const hotPatterns = [
    "reunión", "reunion", "juntarnos", "agendar", "agendemos", "coordinemos",
    "me interesa", "nos interesa", "cuándo podemos", "cuando podemos",
    "hablemos", "conversemos", "cotización", "cotizacion", "presupuesto",
    "propuesta", "envíame", "enviame", "quiero saber más", "me gustaría",
    "agenda", "disponibilidad",
  ];
  if (hotPatterns.some((p) => lower.includes(p))) return "hot";

  const warmPatterns = [
    "gracias", "interesante", "lo voy a revisar", "lo revisaré", "te contacto",
    "más adelante", "próximo", "siguiente", "puede ser", "dejame ver",
    "lo comparto", "reenvío", "te derivo", "contacta a", "habla con",
    "referir", "derivar",
  ];
  if (warmPatterns.some((p) => lower.includes(p))) return "warm";

  const noPatterns = [
    "no nos interesa", "no estamos interesados", "no gracias", "tenemos equipo",
    "in-house", "inhouse", "equipo interno", "no necesitamos", "no por ahora",
    "no es el momento", "no aplica", "no trabajamos", "ya tenemos proveedor",
    "presupuesto comprometido",
  ];
  if (noPatterns.some((p) => lower.includes(p))) return "no_for_now";

  return "no_response";
}

function extractNameFromHeader(from: string): { name: string; email: string } {
  const match = from.match(/^"?([^"<]+)"?\s*<([^>]+)>/);
  if (match) return { name: match[1].trim(), email: match[2].trim().toLowerCase() };
  const emailMatch = from.match(/<([^>]+)>/) || from.match(/([^\s]+@[^\s]+)/);
  const email = emailMatch ? emailMatch[1].trim().toLowerCase() : from.trim().toLowerCase();
  return { name: "", email };
}

function extractCompanyFromEmail(email: string): string {
  const domain = email.split("@")[1] || "";
  const name = domain.split(".")[0] || "";
  return name.charAt(0).toUpperCase() + name.slice(1);
}

async function getGmailErrorDetails(res: Response): Promise<string> {
  const text = await res.text();
  if (!text) return "Sin detalles";

  try {
    const parsed = JSON.parse(text);
    return parsed?.error?.message || parsed?.message || text;
  } catch {
    return text;
  }
}

Deno.serve(async (req) => {
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

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !userData?.user) {
      console.error("[gmail-sync] Auth failed:", authError?.message);
      return new Response(JSON.stringify({ error: "Unauthorized", details: authError?.message }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log("[gmail-sync] Authenticated user:", userData.user.id);

    const { gmail_token } = await req.json();
    if (!gmail_token) {
      return new Response(JSON.stringify({ error: "gmail_token is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const result = { created: 0, updated: 0, errors: [] as string[] };

    // 1. Fetch sent emails with multiple smart queries
    const MAX_PAGES = 10;
    const queries = [
      'in:sent subject:"PROYECTO AUDIOVISUAL" newer_than:7d',
      'in:sent subject:"PROYECTO AUDIOVISUAL" is:unread older_than:14d',
      'in:sent subject:"PROYECTO AUDIOVISUAL" label:inbox older_than:60d',
      'in:sent subject:"PROYECTO AUDIOVISUAL"',
    ];

    let allSentMessages: { id: string; threadId: string }[] = [];
    const seenIds = new Set<string>();

    for (const query of queries) {
      let pageToken: string | undefined;
      let page = 0;

      do {
        const url = new URL(`${GMAIL_API}/messages`);
        url.searchParams.set("q", query);
        url.searchParams.set("maxResults", "500");
        if (pageToken) url.searchParams.set("pageToken", pageToken);

        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${gmail_token}` },
        });

        if (!res.ok) {
          const err = await getGmailErrorDetails(res);
          if (page === 0 && query === queries[queries.length - 1]) {
            return new Response(JSON.stringify({ error: `Gmail API error: ${res.status}`, details: err }), {
              status: res.status === 401 ? 401 : 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          result.errors.push(`Query "${query}": ${res.status} - ${err}`);
          break;
        }

        const data = await res.json();
        if (data.messages) {
          for (const m of data.messages) {
            if (!seenIds.has(m.id)) {
              seenIds.add(m.id);
              allSentMessages.push(m);
            }
          }
        }
        pageToken = data.nextPageToken;
        page++;
      } while (pageToken && page < MAX_PAGES);
    }

    if (allSentMessages.length === 0) {
      return new Response(JSON.stringify({ ...result, message: "No emails found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Process threads
    const threadIds = [...new Set(allSentMessages.map((m) => m.threadId))];

    for (let i = 0; i < threadIds.length; i++) {
      const threadId = threadIds[i];

      try {
        const res = await fetch(`${GMAIL_API}/threads/${threadId}?format=full`, {
          headers: { Authorization: `Bearer ${gmail_token}` },
        });

        if (!res.ok) {
          const details = await getGmailErrorDetails(res);
          result.errors.push(`Thread ${threadId}: ${res.status} - ${details}`);
          continue;
        }

        const thread = await res.json();
        const sentMsg = thread.messages?.find((m: GmailMessage) => m.labelIds?.includes("SENT"));
        if (!sentMsg) continue;

        const toHeader = getHeader(sentMsg, "To");
        const { name: toName, email: toEmail } = extractNameFromHeader(toHeader);
        if (!toEmail) continue;

        const replies = (thread.messages || []).filter((m: GmailMessage) => !m.labelIds?.includes("SENT"));
        const hasReply = replies.length > 0;

        let status = "no_response";
        let note = "";
        let lastContactDate = new Date();

        const sentDateStr = getHeader(sentMsg, "Date");
        if (sentDateStr) {
          const parsed = new Date(sentDateStr);
          if (!isNaN(parsed.getTime())) lastContactDate = parsed;
        }

        if (hasReply) {
          const latestReply = replies[replies.length - 1];
          const replyBody = getBody(latestReply);
          status = classifyStatus(replyBody);
          note = replyBody.substring(0, 200).trim();

          const replyDateStr = getHeader(latestReply, "Date");
          if (replyDateStr) {
            const parsed = new Date(replyDateStr);
            if (!isNaN(parsed.getTime())) lastContactDate = parsed;
          }
        }

        const company = extractCompanyFromEmail(toEmail);
        const contactName = toName || toEmail.split("@")[0];

        // Upsert prospect
        const { data: existing } = await supabase
          .from("prospects")
          .select("id, status")
          .eq("email", toEmail)
          .maybeSingle();

        if (existing) {
          const statusPriority: Record<string, number> = { hot: 5, warm: 4, no_for_now: 3, auto_reply: 2, no_response: 1 };
          const currentPriority = statusPriority[existing.status] || 0;
          const newPriority = statusPriority[status] || 0;

          if (newPriority > currentPriority || hasReply) {
            const { error } = await supabase
              .from("prospects")
              .update({ status, note: note || undefined, updated_at: lastContactDate.toISOString() })
              .eq("id", existing.id);
            if (error) result.errors.push(`Update ${toEmail}: ${error.message}`);
            else result.updated++;
          }
        } else {
          const { error } = await supabase
            .from("prospects")
            .insert({ company, contact_name: contactName, email: toEmail, status, note, updated_at: lastContactDate.toISOString() });
          if (error) result.errors.push(`Insert ${toEmail}: ${error.message}`);
          else result.created++;
        }
      } catch (err) {
        result.errors.push(`Thread ${threadId}: ${String(err)}`);
      }

      if (i % 10 === 9) await new Promise((r) => setTimeout(r, 500));
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
