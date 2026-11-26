import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

// Read-only view of agent imports (agent_import_runs + agent_prospects).
// Fails closed: requires a signed-in user whose id is listed in the
// AGENT_VIEWER_USER_IDS secret (server-side allowlist, not user metadata).
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  try {
    const allow = (Deno.env.get('AGENT_VIEWER_USER_IDS') ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    if (!allow.length) return json({ error: 'Acceso no configurado', code: 'access_not_configured' }, 403)
    const auth = req.headers.get('Authorization') ?? ''
    if (!auth.startsWith('Bearer ')) return json({ error: 'Inicia sesión', code: 'auth_required' }, 401)
    const pub = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
    const { data: c, error: ce } = await pub.auth.getClaims(auth.slice(7))
    const sub = (c?.claims?.sub as string | undefined)?.toLowerCase()
    if (ce || !sub || c?.claims?.role !== 'authenticated') return json({ error: 'Inicia sesión', code: 'auth_required' }, 401)
    if (!allow.includes(sub)) return json({ error: 'Usuario no autorizado', code: 'forbidden' }, 403)

    const body = await req.json().catch(() => ({}))
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    if (body.action === 'prospects') {
      const { source, run_date, base_id } = body
      if (typeof source !== 'string' || typeof run_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(run_date))
        return json({ error: 'source y run_date requeridos' }, 400)
      let q = db.from('agent_prospects').select(
        'id,nombre,cargo,empresa,industria,dominio,linkedin_url,correo_verificado,correo_probable_1,correo_probable_2,fuente_patron,estado,relevancia,base_id,first_seen_date',
      ).eq('source', source).eq('first_seen_date', run_date).order('relevancia', { ascending: false, nullsFirst: false }).limit(500)
      if (typeof base_id === 'string') q = q.eq('base_id', base_id)
      const { data, error } = await q
      if (error) throw error
      return json({ prospects: data ?? [] })
    }
    const { data: runs, error } = await db.from('agent_import_runs')
      .select('id,source,run_date,base_id,result,created_at').order('run_date', { ascending: false }).limit(500)
    if (error) throw error
    const ids = [...new Set((runs ?? []).map((r) => r.base_id).filter(Boolean))]
    const names: Record<string, string> = {}
    if (ids.length) {
      const { data: bs } = await db.from('bases').select('id,name').in('id', ids)
      for (const b of bs ?? []) names[b.id] = b.name
    }
    return json({ runs: (runs ?? []).map((r) => ({ ...r, base_name: r.base_id ? names[r.base_id] ?? null : null })) })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'error' }, 500)
  }
})
