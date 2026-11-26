import { supabase } from "@/integrations/supabase/client";

// Captured at module load, before the auth client consumes the OAuth hash.
export const INITIAL_HASH = typeof window !== "undefined" ? window.location.hash : "";
const SAVED = "ccp_pin_session_backup";

/** Before Gmail's Google OAuth replaces the session, keep the PIN session to restore after the redirect. */
export async function backupPinSession() {
  const { data } = await supabase.auth.getSession();
  if (data.session) localStorage.setItem(SAVED, JSON.stringify({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }));
}

export async function restorePinSessionAfterOAuth(): Promise<void> {
  const raw = localStorage.getItem(SAVED);
  if (!raw || !INITIAL_HASH.includes("provider_token")) return;
  localStorage.removeItem(SAVED);
  await supabase.auth.getSession(); // wait for the Google session to be processed
  try { await supabase.auth.setSession(JSON.parse(raw)); } catch { /* falls back to PIN screen */ }
  history.replaceState(null, "", window.location.pathname + window.location.search);
}

export async function checkPinSession(): Promise<"ok" | "denied"> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return "denied";
  const { data: r, error } = await supabase.functions.invoke("ccp-auth", { body: { action: "status" } });
  return !error && r?.ok ? "ok" : "denied";
}

export async function logoutPin() {
  await supabase.functions.invoke("ccp-auth", { body: { action: "logout" } }).catch(() => {});
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
}
