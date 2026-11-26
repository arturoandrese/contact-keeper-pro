import { createClient } from 'npm:@supabase/supabase-js@2'

// Fails closed unless the bearer token belongs to a live PIN session (ccp_sessions).
export async function requireOwner(req: Request, cors: Record<string, string>): Promise<Response | null> {
  const deny = (code: string, s = 401) =>
    new Response(JSON.stringify({ error: 'Acceso requerido', code }), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
  const auth = req.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return deny('auth_required')
  const url = Deno.env.get('SUPABASE_URL')!
  const pub = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!)
  const { data, error } = await pub.auth.getClaims(auth.slice(7))
  const c = data?.claims as Record<string, unknown> | undefined
  if (error || !c?.sub || c.role !== 'authenticated' || !c.session_id) return deny('auth_required')
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const [{ data: s }, { data: st }] = await Promise.all([
    db.from('ccp_sessions').select('user_id,expires_at,revoked_at').eq('session_id', c.session_id as string).maybeSingle(),
    db.from('ccp_pin_state').select('owner_user_id').eq('id', 1).maybeSingle(),
  ])
  if (!s || s.revoked_at || new Date(s.expires_at) <= new Date() || s.user_id !== c.sub || st?.owner_user_id !== c.sub) return deny('session_invalid')
  return null
}
