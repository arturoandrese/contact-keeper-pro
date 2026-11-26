import { createClient } from 'npm:@supabase/supabase-js@2'

// Public one-click "no contactar" link. Only accepts an HMAC-signed address; reveals nothing.
async function hmac(email: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(Deno.env.get('AUTOSEND_OPTOUT_SECRET')!), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(email.toLowerCase())))
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 32)
}
const page = (msg: string, status = 200) => new Response(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>HUAU</title><body style="font-family:arial;max-width:480px;margin:80px auto;color:#2a3b47;text-align:center"><p>${msg}</p></body>`,
  { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })

Deno.serve(async (req) => {
  const u = new URL(req.url)
  const e = (u.searchParams.get('e') ?? '').toLowerCase().trim()
  const s = u.searchParams.get('s') ?? ''
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) || e.length > 254 || s !== (await hmac(e))) return page('Enlace no válido.', 400)
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  await db.from('autosend_optouts').upsert({ email: e, source: 'link' }, { onConflict: 'email', ignoreDuplicates: true })
  await db.from('autosend_queue').update({ status: 'no_contactar', reason: 'Pidió no recibir correos (enlace)', next_action: 'No contactar' }).or(`mail1.eq.${e},mail2.eq.${e}`)
  await db.from('autosend_log').insert({ message: `Solicitud de no contacto: ${e}` })
  return page('Listo. No volverás a recibir correos comerciales de HUAU. Gracias.')
})
