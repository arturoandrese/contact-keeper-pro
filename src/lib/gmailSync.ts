import { supabase } from "@/integrations/supabase/client";

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

type GmailListResponse = {
  messages?: { id: string; threadId: string }[];
  nextPageToken?: string;
};

type GmailThread = {
  id: string;
  messages: GmailMessage[];
};

function getHeader(msg: GmailMessage, name: string): string {
  return msg.payload.headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || "";
}

function decodeBase64Url(data: string): string {
  try {
    const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
    return decodeURIComponent(
      atob(base64)
        .split("")
        .map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
  } catch {
    return "";
  }
}

function getBody(msg: GmailMessage): string {
  if (msg.payload.body?.data) return decodeBase64Url(msg.payload.body.data);
  if (msg.payload.parts) {
    const textPart = msg.payload.parts.find(p => p.mimeType === "text/plain");
    if (textPart?.body?.data) return decodeBase64Url(textPart.body.data);
    const htmlPart = msg.payload.parts.find(p => p.mimeType === "text/html");
    if (htmlPart?.body?.data) {
      const html = decodeBase64Url(htmlPart.body.data);
      return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    }
  }
  return "";
}

function classifyStatus(body: string): string {
  const lower = body.toLowerCase();

  // Auto-reply detection
  const autoPatterns = [
    "fuera de oficina", "out of office", "respuesta automática", "automatic reply",
    "auto-reply", "autoreply", "estoy fuera", "estaré fuera", "no estoy disponible",
    "mensaje automático", "vacaciones"
  ];
  if (autoPatterns.some(p => lower.includes(p))) return "auto_reply";

  // Hot - meeting/strong interest
  const hotPatterns = [
    "reunión", "reunion", "juntarnos", "agendar", "agendemos", "coordinemos",
    "me interesa", "nos interesa", "cuándo podemos", "cuando podemos",
    "hablemos", "conversemos", "cotización", "cotizacion", "presupuesto",
    "propuesta", "envíame", "enviame", "quiero saber más", "me gustaría",
    "agenda", "disponibilidad"
  ];
  if (hotPatterns.some(p => lower.includes(p))) return "hot";

  // Warm - positive reply
  const warmPatterns = [
    "gracias", "interesante", "lo voy a revisar", "lo revisaré", "te contacto",
    "más adelante", "próximo", "siguiente", "puede ser", "dejame ver",
    "lo comparto", "reenvío", "te derivo", "contacta a", "habla con",
    "referir", "derivar"
  ];
  if (warmPatterns.some(p => lower.includes(p))) return "warm";

  // No - declined
  const noPatterns = [
    "no nos interesa", "no estamos interesados", "no gracias", "tenemos equipo",
    "in-house", "inhouse", "equipo interno", "no necesitamos", "no por ahora",
    "no es el momento", "no aplica", "no trabajamos", "ya tenemos proveedor",
    "presupuesto comprometido"
  ];
  if (noPatterns.some(p => lower.includes(p))) return "no_for_now";

  return "no_response";
}

function extractCompanyFromEmail(email: string): string {
  const domain = email.split("@")[1] || "";
  const name = domain.split(".")[0] || "";
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function extractNameFromHeader(from: string): { name: string; email: string } {
  const match = from.match(/^"?([^"<]+)"?\s*<([^>]+)>/);
  if (match) return { name: match[1].trim(), email: match[2].trim().toLowerCase() };
  const emailMatch = from.match(/<([^>]+)>/) || from.match(/([^\s]+@[^\s]+)/);
  const email = emailMatch ? emailMatch[1].trim().toLowerCase() : from.trim().toLowerCase();
  return { name: "", email };
}

export async function connectGmail(): Promise<string | null> {
  const currentOrigin = window.location.origin;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      scopes: "https://www.googleapis.com/auth/gmail.readonly",
      redirectTo: `${currentOrigin}?view=prospects`,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });

  if (error) {
    console.error("OAuth error:", error);
    return null;
  }

  return data.url || null;
}

export function getGoogleToken(): string | null {
  const session = JSON.parse(localStorage.getItem("sb-vomjhgjzzicuqnkyukps-auth-token") || "null");
  return session?.provider_token || null;
}

export async function syncGmail(token: string, onProgress?: (msg: string) => void): Promise<{
  created: number;
  updated: number;
  errors: string[];
}> {
  const result = { created: 0, updated: 0, errors: [] as string[] };

  onProgress?.("Buscando emails enviados con 'PROYECTO AUDIOVISUAL'...");

  // 1. Fetch sent emails matching subject
  let allSentMessages: { id: string; threadId: string }[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${GMAIL_API}/messages`);
    url.searchParams.set("q", "in:sent subject:\"PROYECTO AUDIOVISUAL\"");
    url.searchParams.set("maxResults", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.text();
      result.errors.push(`Error buscando emails: ${res.status}`);
      console.error("Gmail search error:", err);
      return result;
    }

    const data: GmailListResponse = await res.json();
    if (data.messages) allSentMessages.push(...data.messages);
    pageToken = data.nextPageToken;
  } while (pageToken);

  if (allSentMessages.length === 0) {
    onProgress?.("No se encontraron emails enviados con ese asunto.");
    return result;
  }

  onProgress?.(`Encontrados ${allSentMessages.length} emails. Analizando hilos...`);

  // 2. Get unique thread IDs
  const threadIds = [...new Set(allSentMessages.map(m => m.threadId))];

  // 3. Fetch each thread and analyze replies
  for (let i = 0; i < threadIds.length; i++) {
    const threadId = threadIds[i];
    onProgress?.(`Procesando hilo ${i + 1}/${threadIds.length}...`);

    try {
      const res = await fetch(`${GMAIL_API}/threads/${threadId}?format=full`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        result.errors.push(`Error leyendo hilo ${threadId}`);
        continue;
      }

      const thread: GmailThread = await res.json();

      // Find the original sent message
      const sentMsg = thread.messages.find(m => m.labelIds?.includes("SENT"));
      if (!sentMsg) continue;

      const toHeader = getHeader(sentMsg, "To");
      const { name: toName, email: toEmail } = extractNameFromHeader(toHeader);

      if (!toEmail) continue;

      // Find replies (messages NOT sent by us)
      const replies = thread.messages.filter(m => !m.labelIds?.includes("SENT"));
      const hasReply = replies.length > 0;

      let status = "no_response";
      let note = "";
      let lastContactDate = new Date(parseInt(sentMsg.payload.headers.find(h => h.name === "Date")?.value || "") || Date.now());

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

      // 4. Upsert into prospects
      const { data: existing } = await supabase
        .from("prospects")
        .select("id, status")
        .eq("email", toEmail)
        .maybeSingle();

      if (existing) {
        // Only update if new status is "better" or has reply
        const statusPriority: Record<string, number> = { hot: 5, warm: 4, no_for_now: 3, auto_reply: 2, no_response: 1 };
        const currentPriority = statusPriority[existing.status] || 0;
        const newPriority = statusPriority[status] || 0;

        if (newPriority > currentPriority || hasReply) {
          const { error } = await supabase
            .from("prospects")
            .update({
              status,
              note: note || undefined,
              updated_at: lastContactDate.toISOString(),
            })
            .eq("id", existing.id);
          if (error) result.errors.push(`Error actualizando ${toEmail}`);
          else result.updated++;
        }
      } else {
        const { error } = await supabase
          .from("prospects")
          .insert({
            company,
            contact_name: contactName,
            email: toEmail,
            status,
            note,
            updated_at: lastContactDate.toISOString(),
          });
        if (error) result.errors.push(`Error creando ${toEmail}`);
        else result.created++;
      }
    } catch (err) {
      result.errors.push(`Error procesando hilo ${threadId}`);
      console.error(err);
    }

    // Rate limiting - small delay between thread fetches
    if (i % 10 === 9) await new Promise(r => setTimeout(r, 500));
  }

  return result;
}
