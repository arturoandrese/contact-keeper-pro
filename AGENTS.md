- AGENTE 007 imports go only through RPC public.agent007_import_prospects (service_role only, idempotent per America/Santiago date); its tables agent_prospects/agent_import_runs are never exposed to anon/authenticated — the app has no login, so any public grant would make writes public.

- Agent import UI reads agent tables only through the read-only edge function agent-runs (service role inside); never grant those tables to anon/authenticated.

- Whole-app access is a 4-digit PIN checked only in edge function ccp-auth (salted PBKDF2 + server pepper, 5 tries then 15-min lock in ccp_pin_state) which opens a session for a single server-owned owner user and records it in ccp_sessions (30 days, revocable); every data table's RLS and every edge function (_shared/ccpGuard.ts) require that live session, anon has no grants. Why: the app had no login, so the PIN must be enforced server-side, never by the client screen.
