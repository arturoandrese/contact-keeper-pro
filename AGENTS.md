- AGENTE 007 imports go only through RPC public.agent007_import_prospects (service_role only, idempotent per America/Santiago date); its tables agent_prospects/agent_import_runs are never exposed to anon/authenticated — the app has no login, so any public grant would make writes public.

- Agent import UI reads agent tables only through the read-only edge function agent-runs (service role inside); never grant those tables to anon/authenticated.
