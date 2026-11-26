- AGENTE 007 imports go only through RPC public.agent007_import_prospects (service_role only, idempotent per America/Santiago date); its tables agent_prospects/agent_import_runs are never exposed to anon/authenticated — the app has no login, so any public grant would make writes public.

- Agent import UI reads agent tables only through the read-only edge function agent-runs (service role inside); never grant those tables to anon/authenticated.

- agent-runs fails closed: requires a signed-in user whose id is in the AGENT_VIEWER_USER_IDS secret (server allowlist, never user metadata); agent bases/contacts are hidden from anon/authenticated via restrictive RLS using private.is_agent_base. Why: the app has no login, so agent data must never be reachable through public routes.
