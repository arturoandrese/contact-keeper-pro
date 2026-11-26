import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { requireOwner } from '../_shared/ccpGuard.ts'

// PIN gate for the whole app. The owner account's password is derived from the
// server-only pepper and never leaves this function.
const OWNER_EMAIL = 'ccp-owner@example.com'
const SESSION_DAYS = 30
const enc = new TextEncoder()
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')

async function hmac(key: string, msg: string) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(msg)))
}
async function pinHash(pin: string, salt: string, pepper: string) {
  const k = await crypto.subtle.importKey('raw', enc.encode(await hmac(pepper, pin)), 'PBKDF2', false, ['deriveBits'])
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 150000, hash: 'SHA-256' }, k, 256))
}
function safeEq(a: string, b: string) {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}
function claims(jwt: string): Record<string, unknown> {
  return JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const body = await req.json().catch(() => ({}))

    if (body.action === 'status') {
      const denied = await requireOwner(req, corsHeaders)
      return denied ?? json({ ok: true })
    }

    if (body.action === 'logout') {
      const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
      const { data } = await createClient(url, anonKey).auth.getClaims(token)
      const sid = data?.claims?.session_id as string | undefined
      if (sid) {
        await db.from('ccp_sessions').update({ revoked_at: new Date().toISOString() }).eq('session_id', sid)
        await db.auth.admin.signOut(token, 'local').catch(() => {})
      }
      return json({ ok: true })
    }

    if (body.action !== 'login') return json({ error: 'acción inválida' }, 400)
    const PIN = Deno.env.get('CCP_PIN') ?? ''
    const PEPPER = Deno.env.get('CCP_PIN_PEPPER') ?? ''
    if (!/^\d{4}$/.test(PIN) || PEPPER.length < 32) return json({ error: 'PIN no configurado', code: 'not_configured' }, 503)

    const { data: gate, error: ge } = await db.rpc('ccp_pin_begin')
    if (ge) throw ge
    if (gate.locked) return json({ error: 'Bloqueado', code: 'locked', locked_until: gate.locked_until }, 429)

    const { data: st, error: se } = await db.from('ccp_pin_state').select('*').eq('id', 1).single()
    if (se) throw se
    let { salt, hash } = st as { salt: string | null; hash: string | null }
    const version = await hmac(PEPPER, 'pin-version:' + PIN)
    if (!salt || !hash || st.pin_version !== version) {
      salt = hex(crypto.getRandomValues(new Uint8Array(16)).buffer)
      hash = await pinHash(PIN, salt, PEPPER)
      await db.from('ccp_pin_state').update({ salt, hash, pin_version: version }).eq('id', 1)
    }
    const input = typeof body.pin === 'string' && /^\d{4}$/.test(body.pin) ? body.pin : ''
    const ok = input !== '' && safeEq(await pinHash(input, salt, PEPPER), hash)
    if (!ok) {
      if (gate.attempts_left === 0) return json({ error: 'Bloqueado', code: 'locked' }, 429)
      return json({ error: 'PIN incorrecto', code: 'wrong_pin', attempts_left: gate.attempts_left }, 401)
    }
    await db.rpc('ccp_pin_success')

    const ownerPw = await hmac(PEPPER, 'ccp-owner-password')
    let ownerId = st.owner_user_id as string | null
    if (!ownerId) {
      const { data: cu, error: ce } = await db.auth.admin.createUser({ email: OWNER_EMAIL, password: ownerPw, email_confirm: true })
      if (ce || !cu.user) throw ce ?? new Error('no se pudo crear usuario')
      ownerId = cu.user.id
      await db.from('ccp_pin_state').update({ owner_user_id: ownerId }).eq('id', 1)
    }
    const { data: u } = await db.auth.admin.getUserById(ownerId)
    const pub = createClient(url, anonKey, { auth: { persistSession: false } })
    const { data: v, error: ve } = await pub.auth.signInWithPassword({ email: u.user!.email!, password: ownerPw })
    if (ve || !v.session) throw ve ?? new Error('no se pudo abrir sesión')
    const c = claims(v.session.access_token)
    await db.from('ccp_sessions').insert({
      session_id: c.session_id, user_id: ownerId,
      expires_at: new Date(Date.now() + SESSION_DAYS * 86400000).toISOString(),
    })
    return json({ ok: true, access_token: v.session.access_token, refresh_token: v.session.refresh_token })
  } catch (e) {
    console.error('ccp-auth error', e instanceof Error ? e.message : 'error')
    return json({ error: 'error interno' }, 500)
  }
})
