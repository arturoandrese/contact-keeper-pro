import { supabase } from "@/integrations/supabase/client";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

// --- Token storage helpers ---

interface StoredTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // ms timestamp
}

function getStoredTokens(): StoredTokens | null {
  try {
    const raw = localStorage.getItem("gmail_tokens");
    if (!raw) {
      // Migration: check old single-token storage
      const legacy = localStorage.getItem("gmail_token");
      if (legacy) return { access_token: legacy, refresh_token: "", expires_at: 0 };
      return null;
    }
    return JSON.parse(raw) as StoredTokens;
  } catch {
    return null;
  }
}

function storeTokens(access_token: string, refresh_token: string, expires_in: number) {
  const tokens: StoredTokens = {
    access_token,
    refresh_token,
    expires_at: Date.now() + expires_in * 1000,
  };
  localStorage.setItem("gmail_tokens", JSON.stringify(tokens));
  // Keep legacy key in sync for backward compat
  localStorage.setItem("gmail_token", access_token);
}

function clearTokens() {
  localStorage.removeItem("gmail_tokens");
  localStorage.removeItem("gmail_token");
}

function isTokenExpired(tokens: StoredTokens): boolean {
  // Consider expired 60 seconds early to avoid edge cases
  return Date.now() >= tokens.expires_at - 60_000;
}

async function refreshAccessToken(refresh_token: string): Promise<{ access_token: string; refresh_token: string; expires_in: number } | null> {
  try {
    const { data, error } = await supabase.functions.invoke("refresh-gmail-token", {
      body: { refresh_token },
    });
    if (error || !data?.access_token) {
      console.error("[Gmail] Token refresh failed:", error);
      return null;
    }
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || refresh_token,
      expires_in: data.expires_in || 3600,
    };
  } catch (err) {
    console.error("[Gmail] Token refresh error:", err);
    return null;
  }
}

/**
 * Get a valid Gmail access token, refreshing if expired.
 * Returns null if no token available or refresh fails.
 */
export async function getValidGmailToken(): Promise<string | null> {
  const tokens = getStoredTokens();
  if (!tokens) return null;

  // If not expired, return current token
  if (!isTokenExpired(tokens)) {
    return tokens.access_token;
  }

  // Token is expired — try to refresh
  if (!tokens.refresh_token) {
    console.warn("[Gmail] Token expired but no refresh_token available");
    clearTokens();
    return null;
  }

  console.log("[Gmail] Access token expired, refreshing...");
  const refreshed = await refreshAccessToken(tokens.refresh_token);
  if (!refreshed) {
    console.error("[Gmail] Refresh failed, clearing tokens");
    clearTokens();
    return null;
  }

  storeTokens(refreshed.access_token, refreshed.refresh_token, refreshed.expires_in);
  console.log("[Gmail] Token refreshed successfully");
  return refreshed.access_token;
}

// --- Exported token management ---

export { storeTokens, clearTokens, getStoredTokens };

// --- Types ---

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

// --- Helpers ---

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

  const autoPatterns = [
    "fuera de oficina", "out of office", "respuesta automática", "automatic reply",
    "auto-reply", "autoreply", "estoy fuera", "estaré fuera", "no estoy disponible",
    "mensaje automático", "vacaciones"
  ];
  if (autoPatterns.some(p => lower.includes(p))) return "auto_reply";

  const hotPatterns = [
    "reunión", "reunion", "juntarnos", "agendar", "agendemos", "coordinemos",
    "me interesa", "nos interesa", "cuándo podemos", "cuando podemos",
    "hablemos", "conversemos", "cotización", "cotizacion", "presupuesto",
    "propuesta", "envíame", "enviame", "quiero saber más", "me gustaría",
    "agenda", "disponibilidad"
  ];
  if (hotPatterns.some(p => lower.includes(p))) return "hot";

  const warmPatterns = [
    "gracias", "interesante", "lo voy a revisar", "lo revisaré", "te contacto",
    "más adelante", "próximo", "siguiente", "puede ser", "dejame ver",
    "lo comparto", "reenvío", "te derivo", "contacta a", "habla con",
    "referir", "derivar"
  ];
  if (warmPatterns.some(p => lower.includes(p))) return "warm";

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

// --- OAuth ---

export async function connectGmail(): Promise<string | null> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      scopes: "https://www.googleapis.com/auth/gmail.readonly",
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
      redirectTo: window.location.origin,
    },
  });

  if (error) {
    console.error("OAuth error:", error);
    return null;
  }

  return data.url || null;
}

/**
 * Extract provider tokens from URL hash after OAuth redirect and store them.
 */
export function extractProviderTokenFromUrl(): string | null {
  const hash = window.location.hash;
  if (!hash) return null;
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const accessToken = params.get("provider_token");
  const refreshToken = params.get("provider_refresh_token") || "";
  const expiresIn = parseInt(params.get("expires_in") || "3600", 10);

  if (accessToken) {
    console.log("[Gmail] provider_token found in URL hash, refresh_token:", refreshToken ? "YES" : "NO");
    storeTokens(accessToken, refreshToken, expiresIn);
  }
  return accessToken;
}

export function getGoogleToken(): string | null {
  const tokens = getStoredTokens();
  return tokens?.access_token || null;
}

export function isGmailConnected(): boolean {
  return getStoredTokens() !== null;
}

export function disconnectGmail() {
  clearTokens();
}

// --- Gmail fetch with auto-retry on 401 ---

async function gmailFetch(url: string, token: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  
  if (res.status === 401) {
    // Try refreshing the token once
    const tokens = getStoredTokens();
    if (tokens?.refresh_token) {
      console.log("[Gmail] Got 401, attempting token refresh...");
      const refreshed = await refreshAccessToken(tokens.refresh_token);
      if (refreshed) {
        storeTokens(refreshed.access_token, refreshed.refresh_token, refreshed.expires_in);
        // Retry with new token
        return fetch(url, {
          headers: { Authorization: `Bearer ${refreshed.access_token}` },
        });
      }
    }
  }
  
  return res;
}

// --- Sync ---

export async function syncGmail(token: string, onProgress?: (msg: string) => void): Promise<{
  created: number;
  updated: number;
  errors: string[];
}> {
  const result = { created: 0, updated: 0, errors: [] as string[] };

  const MAX_PAGES = 10;
  const queries = [
    'in:sent subject:"PROYECTO AUDIOVISUAL" newer_than:7d',
    'in:sent subject:"PROYECTO AUDIOVISUAL" is:unread older_than:14d',
    'in:sent subject:"PROYECTO AUDIOVISUAL" label:inbox older_than:60d',
    'in:sent subject:"PROYECTO AUDIOVISUAL"',
  ];

  // Use the latest valid token
  let currentToken = token;

  let allSentMessages: { id: string; threadId: string }[] = [];
  const seenIds = new Set<string>();

  for (const query of queries) {
    onProgress?.(`Buscando: ${query}...`);
    let pageToken: string | undefined;
    let page = 0;

    do {
      const url = new URL(`${GMAIL_API}/messages`);
      url.searchParams.set("q", query);
      url.searchParams.set("maxResults", "500");
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const res = await gmailFetch(url.toString(), currentToken);

      if (!res.ok) {
        if (res.status === 401) {
          result.errors.push("Token expirado y no se pudo renovar. Reconecta Gmail.");
          return result;
        }
        const err = await res.text();
        result.errors.push(`Error buscando emails (${query}): ${res.status}`);
        console.error("Gmail search error:", err);
        break;
      }

      // Update currentToken in case it was refreshed by gmailFetch
      const freshTokens = getStoredTokens();
      if (freshTokens) currentToken = freshTokens.access_token;

      const data: GmailListResponse = await res.json();
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
    onProgress?.("No se encontraron emails enviados con ese asunto.");
    return result;
  }

  onProgress?.(`Encontrados ${allSentMessages.length} emails. Analizando hilos...`);

  const threadIds = [...new Set(allSentMessages.map(m => m.threadId))];

  for (let i = 0; i < threadIds.length; i++) {
    const threadId = threadIds[i];
    onProgress?.(`Procesando hilo ${i + 1}/${threadIds.length}...`);

    try {
      const res = await gmailFetch(`${GMAIL_API}/threads/${threadId}?format=full`, currentToken);

      if (!res.ok) {
        if (res.status === 401) {
          result.errors.push("Token expirado durante procesamiento.");
          return result;
        }
        result.errors.push(`Error leyendo hilo ${threadId}`);
        continue;
      }

      // Update token in case refreshed
      const freshTokens = getStoredTokens();
      if (freshTokens) currentToken = freshTokens.access_token;

      const thread: GmailThread = await res.json();

      const sentMsg = thread.messages.find(m => m.labelIds?.includes("SENT"));
      if (!sentMsg) continue;

      const toHeader = getHeader(sentMsg, "To");
      const { name: toName, email: toEmail } = extractNameFromHeader(toHeader);

      if (!toEmail) continue;

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

    if (i % 10 === 9) await new Promise(r => setTimeout(r, 500));
  }

  return result;
}
