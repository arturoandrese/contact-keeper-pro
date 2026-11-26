// Bases created automatically by agents are named "<AGENT SOURCE> - YYYY-MM-DD"
// (e.g. "AGENTE 007 - 2026-11-26"). Mis bases shows the rest; Agentes shows these.
const AGENT_BASE_RE = /^(AGENTE\s.+?)\s-\s(\d{4}-\d{2}-\d{2})$/i;

export function isAgentBaseName(name: string | null | undefined): boolean {
  return AGENT_BASE_RE.test((name ?? "").trim());
}

/** Date (YYYY-MM-DD) of an agent base, or null if the name is not an agent base. */
export function agentBaseDate(name: string | null | undefined): string | null {
  const m = (name ?? "").trim().match(AGENT_BASE_RE);
  return m ? m[2] : null;
}
