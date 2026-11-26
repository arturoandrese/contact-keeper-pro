import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { requireOwner } from '../_shared/ccpGuard.ts'
import { generateResponse } from 'npm:@lovable.dev/ai-gateway'
import {
  norm, companyKey, domainOf, cleanDomain, shortCompany, greetingName, renderTemplate, buildRaw,
  santiagoNow, inWindow, sendsThisTick, matchProtectedCompany, type ProtectedCompany, rankDomains, pickTemplate } from './lib.ts'

const GW = 'https://connector-gateway.lovable.dev/google_mail/gmail/v1'
const GW_BATCH = 'https://connector-gateway.lovable.dev/google_mail/batch/gmail/v1'
const TEST_TO = 'arturo@huau.cl'
const FREE = new Set(['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'live.com', 'icloud.com', 'yahoo.es', 'hotmail.es'])
const SENDABLE = new Set(['nuevo', 'sin_respuesta', 'antiguo'])

class GmailError extends Error { constructor(public status: number, public body: string) { super(`Gmail ${status}: ${body.slice(0, 300)}`) } }

function gwHeaders(extra: Record<string, string> = {}) {
  const lk = Deno.env.get('LOVABLE_API_KEY'), ck = Deno.env.get('GOOGLE_MAIL_API_KEY')
  if (!lk || !ck) throw new GmailError(0, 'Gmail no está conectado en el servidor')
  return { Authorization: `Bearer ${lk}`, 'X-Connection-Api-Key': ck, ...extra }
}
async function gm(path: string, init: RequestInit = {}) {
  const r = await fetch(GW + path, { ...init, headers: gwHeaders((init.headers as Record<string, string>) ?? {}) })
  const t = await r.text()
  if (!r.ok) throw new GmailError(r.status, t)
  return t ? JSON.parse(t) : {}
}
async function gmBatch(paths: string[]): Promise<any[]> {
  const out: any[] = []
  // Small chunks + retry: Gmail rejects >~10 concurrent requests per user with 429.
  for (let i = 0; i < paths.length; i += 10) {
    const chunk = paths.slice(i, i + 10)
    let r: Response | null = null, t = ''
    for (let attempt = 0; attempt < 4; attempt++) {
      const b = 'batch_' + crypto.randomUUID().replace(/-/g, '')
      const body = chunk.map((p, j) => `--${b}\r\nContent-Type: application/http\r\nContent-ID: <i${j}>\r\n\r\nGET /gmail/v1${p}\r\n\r\n`).join('') + `--${b}--`
      r = await fetch(GW_BATCH, { method: 'POST', headers: gwHeaders({ 'Content-Type': `multipart/mixed; boundary=${b}` }), body })
      t = await r.text()
      if (r.ok && !/"code":\s*429/.test(t)) break
      if (r.ok || r.status === 429) { await new Promise((res) => setTimeout(res, 1200 * (attempt + 1))); continue }
      break
    }
    if (!r!.ok) throw new GmailError(r!.status, t)
    const ct = r.headers.get('content-type') ?? ''
    const rb = ct.match(/boundary="?([^";]+)"?/)?.[1]
    if (!ct.includes('multipart/mixed') || !rb) throw new GmailError(502, 'respuesta batch inesperada')
    for (const part of t.split(`--${rb}`)) {
      const h = part.indexOf('HTTP/1.1 ')
      if (h < 0) continue
      const status = Number(part.slice(h + 9, h + 12))
      const sep = part.indexOf('\r\n\r\n', h)
      const json = sep >= 0 ? part.slice(sep + 4).trim() : ''
      if (status === 401 || status === 403) throw new GmailError(status, json)
      if (status >= 200 && status < 300 && json) { try { out.push(JSON.parse(json)) } catch { /* skip */ } }
    }
  }
  return out
}
const META = '?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date&fields=id,threadId,labelIds,snippet,internalDate,payload/headers'
const hv = (m: any, n: string) => m?.payload?.headers?.find((h: any) => h.name.toLowerCase() === n.toLowerCase())?.value ?? ''

async function gmSearch(q: string, max = 10) {
  const d = await gm(`/users/me/messages?maxResults=${max}&q=${encodeURIComponent(q)}`)
  const ids: string[] = (d.messages ?? []).map((m: any) => m.id)
  if (!ids.length) return []
  return (await gmBatch(ids.map((id) => `/users/me/messages/${id}${META}`))).map((m) => ({
    sent: (m.labelIds ?? []).includes('SENT'), from: hv(m, 'From'), to: hv(m, 'To'), subject: hv(m, 'Subject'),
    date: new Date(Number(m.internalDate)).toISOString().slice(0, 10), snippet: (m.snippet ?? '').slice(0, 220),
  }))
}

type Db = SupabaseClient
const log = (db: Db, message: string, level = 'info', data?: unknown) => db.from('autosend_log').insert({ message, level, data: data ?? null })

async function getSender(settings: any) {
  const d = await gm('/users/me/settings/sendAs')
  const s = (d.sendAs ?? []).find((x: any) => x.sendAsEmail?.toLowerCase() === settings.sender_email.toLowerCase())
  if (!s) return { ok: false as const, reason: `El remitente ${settings.sender_email} no existe en Gmail` }
  if (!s.isPrimary && s.verificationStatus !== 'accepted') return { ok: false as const, reason: `El remitente ${settings.sender_email} no está verificado en Gmail` }
  return { ok: true as const, email: s.sendAsEmail as string, name: (s.displayName || settings.sender_name) as string, signature: (s.signature ?? '') as string }
}

async function hmac(email: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(Deno.env.get('AUTOSEND_OPTOUT_SECRET')!), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(email.toLowerCase())))
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 32)
}
const optoutUrl = async (email: string) =>
  `${Deno.env.get('SUPABASE_URL')}/functions/v1/autosend-optout?e=${encodeURIComponent(email.toLowerCase())}&s=${await hmac(email)}`

async function loadCtx(db: Db) {
  const [{ data: settings }, { data: tpls }, { data: pcs }, { data: pps }, { data: ovs }] = await Promise.all([
    db.from('autosend_settings').select('*').eq('id', 1).single(),
    db.from('autosend_templates').select('*'),
    db.from('protected_companies').select('*'),
    db.from('protected_contacts').select('*'),
    db.from('company_short_names').select('*'),
  ])
  const overrides: Record<string, string> = {}
  for (const o of ovs ?? []) overrides[o.empresa_key] = o.short_name
  const templates: Record<string, any> = {}
  for (const t of tpls ?? []) templates[t.kind] = t
  return { settings, templates, companies: (pcs ?? []) as ProtectedCompany[], people: pps ?? [], overrides }
}
type Ctx = Awaited<ReturnType<typeof loadCtx>>

const AI_SYSTEM = 'Eres analista comercial de HUAU, productora audiovisual chilena. Clasifica la relación comercial con un prospecto usando SOLO los hechos entregados (correos de Gmail, CRM, envíos previos). Categorías: nuevo (sin relación previa), sin_respuesta (se le escribió y nunca respondió), antiguo (hubo conversación que no prosperó y no hay negociación activa), negociacion_activa (cotizaciones, reuniones, propuestas o presupuestos pendientes o recientes), cliente_actual (proyectos realizados o relación vigente con la persona o su empresa), estrategico, no_contactar (pidió no recibir correos), dudoso (información insuficiente o contradictoria). Una respuesta de cortesía ("gracias, lo reviso") NO es negociación: analiza si la conversación avanzó o quedó abandonada. Si la empresa es cliente aunque la persona sea nueva, usa cliente_actual. Responde en JSON, en español, motivo breve y concreto.'

async function classifyAI(facts: unknown) {
  const res = await generateResponse({
    model: 'openai/gpt-6-astra',
    instructions: AI_SYSTEM,
    input: [{ role: 'user', content: JSON.stringify(facts) }],
    text: { format: { type: 'json_schema', name: 'clasificacion', strict: true, schema: {
      type: 'object', additionalProperties: false, required: ['categoria', 'confianza', 'motivo', 'sugerir_proteger_empresa'],
      properties: {
        categoria: { type: 'string', enum: ['nuevo', 'sin_respuesta', 'antiguo', 'negociacion_activa', 'cliente_actual', 'estrategico', 'no_contactar', 'dudoso'] },
        confianza: { type: 'number' }, motivo: { type: 'string' }, sugerir_proteger_empresa: { type: 'boolean' },
      } } } },
  // deno-lint-ignore no-explicit-any
  } as any)
  // deno-lint-ignore no-explicit-any
  const r = res as any
  const txt: string = r.output_text ?? r.output?.flatMap((o: any) => o.content ?? []).find((c: any) => c.type === 'output_text')?.text ?? ''
  if (!txt) throw new Error('IA sin respuesta estructurada')
  return JSON.parse(txt) as { categoria: string; confianza: number; motivo: string; sugerir_proteger_empresa?: boolean }
}

const daysAgo = (iso?: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / 86400000 : Infinity)

/** Full pre-send analysis. Returns the queue patch; never sends. Fails closed (revision) on any Gmail/AI error. */
async function analyze(db: Db, ctx: Ctx, row: any) {
  const email = (row.current_email ?? row.mail1 ?? '').toLowerCase().trim()
  const emails = [row.mail1, row.mail2].filter(Boolean).map((e: string) => e.toLowerCase())
  const empresa_corta = shortCompany(row.empresa, ctx.overrides)
  const base = { empresa_corta, analyzed_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  const done = (status: string, classification: string, reason: string, extra: Record<string, unknown> = {}) =>
    ({ ...base, status, classification, reason, ...extra })
  if (!email) return done('revision', 'dudoso', 'Sin correo MAIL1')

  // 1. protected companies (absolute priority)
  const pc = matchProtectedCompany(ctx.companies, row.empresa, emails, row.web)
  if (pc) return done('excluido_proteccion', 'protegido', `Empresa protegida: ${pc.nombre_comercial} (${pc.motivo})`)
  // 2. protected contacts
  const nk = norm(`${row.nombre ?? ''} ${row.apellido ?? ''}`)
  const pp = ctx.people.find((p: any) => p.estado === 'activa' && (
    (p.correos ?? []).some((c: string) => emails.includes(c.toLowerCase())) ||
    (nk.length > 4 && norm(`${p.nombre} ${p.apellidos ?? ''}`).startsWith(nk) && (!p.empresa || companyKey(p.empresa) === companyKey(row.empresa)))))
  if (pp) return done('excluido_proteccion', 'protegido', `Contacto protegido: ${pp.nombre} ${pp.apellidos ?? ''} (${pp.motivo})`)
  // 3. opt-outs and blacklist
  const [{ data: oo }, { data: bl }] = await Promise.all([
    db.from('autosend_optouts').select('email').in('email', emails),
    db.from('bounced_emails').select('mail').in('mail', emails),
  ])
  if (oo?.length) return done('no_contactar', 'no_contactar', 'Pidió no recibir correos')
  if (bl?.some((b: any) => b.mail.toLowerCase() === email)) return done('excluido_historial', 'no_contactar', `En lista negra / rebotado: ${email}`)

  // 4. CCP history
  const [{ data: crm }, { data: dlv }, { data: rep }, { data: prevAtt }] = await Promise.all([
    db.from('prospects').select('status,note,updated_at').in('email', emails),
    db.from('delivered_contacts').select('mail,status,times_contacted,last_contacted_at,last_campaign').in('mail', emails),
    db.from('replied_contacts').select('email,fecha_respuesta').in('email', emails),
    db.from('autosend_attempts').select('email,sent_at,status').eq('is_test', false).in('email', emails).neq('queue_id', row.id),
  ])
  if (prevAtt?.length) return done('excluido_historial', 'sin_respuesta', 'Ya se le envió un correo automático por otra fila (duplicado evitado)')
  if (crm?.some((c: any) => c.status === 'hot')) return done('excluido_historial', 'negociacion_activa', 'CRM marca interés alto (hot): gestión personal')

  // 5. Gmail (all senders on the account), metadata + short snippets only
  const dom = cleanDomain(domainOf(email))
  const person = await gmSearch(`(from:${email} OR to:${email} ${row.mail2 ? `OR from:${row.mail2} OR to:${row.mail2}` : ''}) newer_than:5y`, 10)
  const company = dom && !FREE.has(dom) ? await gmSearch(`(from:@${dom} OR to:@${dom}) newer_than:3y -from:mailer-daemon`, 12) : []
  const companyInbound = company.filter((m) => !m.sent)
  const personInbound = person.filter((m) => !m.sent && !/mailer-daemon|postmaster/i.test(m.from))
  const lastContact = [...(dlv ?? []).map((d: any) => d.last_contacted_at), ...person.map((m) => m.date)].filter(Boolean).sort().pop() ?? null

  let cat: string, motivo: string, conf = 1, suggest = false
  const anySignal = person.length || companyInbound.length || crm?.length || rep?.length
  if (!anySignal && !dlv?.length) { cat = 'nuevo'; motivo = 'Sin historial en Gmail, CRM ni campañas' }
  else if (!personInbound.length && !companyInbound.length && !rep?.length && !(crm ?? []).some((c: any) => c.status !== 'no_response')) {
    cat = 'sin_respuesta'; motivo = `Se le escribió antes (último contacto ${lastContact ?? 'desconocido'}) y nunca respondió`
  } else {
    const ai = await classifyAI({
      prospecto: { nombre: `${row.nombre ?? ''} ${row.apellido ?? ''}`.trim(), empresa: row.empresa, correo: email },
      crm: crm ?? [], campañas: dlv ?? [], respondidos: rep ?? [],
      gmail_persona: person, gmail_empresa: company, hoy: santiagoNow().date,
    })
    cat = ai.categoria; motivo = ai.motivo; conf = ai.confianza; suggest = !!ai.sugerir_proteger_empresa
  }
  const analysis = { categoria: cat, confianza: conf, gmail_persona: person.length, gmail_empresa: company.length, empresa_respondio: companyInbound.length, crm: crm?.length ?? 0, campañas: dlv?.length ?? 0, ultimo_contacto: lastContact, sugerir_proteger_empresa: suggest }
  if (suggest && row.empresa && !ctx.companies.some((c) => companyKey(c.nombre_comercial) === companyKey(empresa_corta))) {
    await db.from('protected_companies').insert({ nombre_comercial: empresa_corta, razon_social: row.empresa, dominio: dom || null, motivo: 'Cliente histórico', estado: 'sugerida', nota: motivo })
    ctx.companies.push({ id: '', nombre_comercial: empresa_corta, razon_social: row.empresa, dominio: dom, dominios_alt: [], motivo: '', estado: 'sugerida' })
  }
  if (cat === 'no_contactar') return done('no_contactar', cat, motivo, { analysis })
  if (cat === 'dudoso' || (SENDABLE.has(cat) && conf < 0.5)) return done('revision', cat, motivo, { analysis })
  if (!SENDABLE.has(cat)) return done('excluido_historial', cat, motivo, { analysis, next_action: 'Gestión personal' })
  if (cat !== 'nuevo' && daysAgo(lastContact) < ctx.settings.recontact_days) {
    const when = new Date(new Date(lastContact!).getTime() + ctx.settings.recontact_days * 86400000).toISOString().slice(0, 10)
    return done('excluido_historial', cat, `${motivo}. Contactado hace menos de ${ctx.settings.recontact_days} días`, { analysis: { ...analysis, recheck_after: when }, next_action: `Reactivar desde ${when}` })
  }
  let kind = cat === 'nuevo' ? 'presentacion' : 'reactivacion'
  kind = pickTemplate(Object.values(ctx.templates), kind, [row.empresa, empresa_corta], [row.mail1, row.mail2, row.web])
  const r = renderTemplate(ctx.templates[kind], { nombre: greetingName(row.nombre), empresa_corta })
  if (r.missing.length) return done('revision', cat, `Faltan datos para la plantilla: ${r.missing.join(', ')}`, { analysis })
  return done('programado', cat, motivo, { analysis, template_kind: kind, subject: r.subject, next_action: 'Envío en el próximo horario' })
}

async function enqueueAgentContacts(db: Db, baseId?: string) {
  let baseIds: string[]
  if (baseId) baseIds = [baseId]
  else {
    const { data } = await db.from('bases').select('id').ilike('name', 'AGENTE % - ____-__-__')
    baseIds = (data ?? []).map((b: any) => b.id)
  }
  if (!baseIds.length) return 0
  const { data: cs } = await db.from('contacts').select('id,base_id,nombre,apellido,apellido2,empresa,web,mail1,mail2').in('base_id', baseIds).limit(5000)
  if (!cs?.length) return 0
  const { data: ex } = await db.from('autosend_queue').select('contact_id').in('contact_id', cs.map((c: any) => c.id))
  const have = new Set((ex ?? []).map((e: any) => e.contact_id))
  const rows = cs.filter((c: any) => !have.has(c.id)).map((c: any) => ({
    contact_id: c.id, base_id: c.base_id, nombre: c.nombre, apellido: c.apellido, apellido2: c.apellido2, empresa: c.empresa, web: c.web,
    mail1: c.mail1?.toLowerCase() ?? null, mail2: c.mail2 && c.mail2.toLowerCase() !== c.mail1?.toLowerCase() ? c.mail2.toLowerCase() : null,
    current_email: c.mail1?.toLowerCase() ?? null,
  }))
  if (rows.length) await db.from('autosend_queue').upsert(rows, { onConflict: 'contact_id', ignoreDuplicates: true })
  return rows.length
}

async function analyzePending(db: Db, ctx: Ctx, limit: number, baseId?: string) {
  let q = db.from('autosend_queue').select('*').eq('status', 'pendiente').order('created_at').limit(limit)
  if (baseId) q = q.eq('base_id', baseId)
  const { data: rows } = await q
  const today = santiagoNow().date
  const { data: rechecks } = baseId ? { data: [] } : await db.from('autosend_queue').select('*').eq('status', 'excluido_historial').lte('analysis->>recheck_after', today).limit(5)
  let n = 0
  for (const row of [...(rows ?? []), ...(rechecks ?? [])]) {
    try { await db.from('autosend_queue').update(await analyze(db, ctx, row)).eq('id', row.id); n++ }
    catch (e) {
      await db.from('autosend_queue').update({ status: 'revision', reason: `No se pudo analizar (no se envía): ${(e as Error).message.slice(0, 200)}`, analyzed_at: new Date().toISOString() }).eq('id', row.id)
      await log(db, `Análisis falló para ${row.current_email}`, 'error', { error: String(e) })
      if (e instanceof GmailError && [0, 401, 403, 429].includes(e.status)) throw e
    }
  }
  return n
}

async function pause(db: Db, reason: string) {
  await db.from('autosend_settings').update({ status: 'paused', stop_reason: reason, updated_at: new Date().toISOString() }).eq('id', 1)
  await log(db, `Envío automático pausado: ${reason}`, 'error')
}

const BOUNCE_PERM = /address not found|no existe|does not exist|user unknown|unknown user|no such user|mailbox unavailable|recipient address rejected|5\.1\.1|550/i
const OPTOUT_RE = /no me (escriban|envíen|envien|contacten)|no deseo recibir|dar(me)? de baja|unsubscribe|no contactar|sáquenme|saquenme|remover de (su|la) lista/i

async function trackResults(db: Db, ctx: Ctx) {
  const since = new Date(Date.now() - 21 * 86400000).toISOString()
  const { data: atts } = await db.from('autosend_attempts').select('*').eq('status', 'enviado').eq('is_test', false).gte('sent_at', since).not('gmail_thread_id', 'is', null)
  if (!atts?.length) return
  const threads = await gmBatch(atts.map((a: any) => `/users/me/threads/${a.gmail_thread_id}?format=metadata&metadataHeaders=From&fields=id,messages(id,labelIds,snippet,internalDate,payload/headers)`))
  const byId = new Map(threads.map((t: any) => [t.id, t]))
  for (const a of atts) {
    const t = byId.get(a.gmail_thread_id)
    const after = (t?.messages ?? []).filter((m: any) => m.id !== a.gmail_message_id && !(m.labelIds ?? []).includes('SENT') && Number(m.internalDate) >= new Date(a.sent_at).getTime() - 60000)
    const bounce = after.find((m: any) => /mailer-daemon|postmaster|mail delivery/i.test(hv(m, 'From')))
    const reply = after.find((m: any) => !/mailer-daemon|postmaster|mail delivery/i.test(hv(m, 'From')))
    const { data: q } = await db.from('autosend_queue').select('*').eq('id', a.queue_id).single()
    if (bounce) {
      const permanent = BOUNCE_PERM.test(bounce.snippet ?? '')
      await db.from('autosend_attempts').update({ status: 'rebotado', error: (bounce.snippet ?? '').slice(0, 200) }).eq('id', a.id)
      await db.from('bounced_emails').upsert({ mail: a.email.toLowerCase(), domain: domainOf(a.email) }, { onConflict: 'mail', ignoreDuplicates: true })
      await db.from('delivered_contacts').update({ status: 'EMAIL_BOUNCED' }).eq('mail', a.email.toLowerCase())
      await log(db, `Rebote de ${a.email}${permanent ? ' (dirección inexistente)' : ''}`, 'warn')
      if (q && permanent && q.attempt === 1 && q.mail2 && q.mail2 !== a.email) {
        const row = { ...q, current_email: q.mail2 }
        const patch = await analyze(db, ctx, row).catch((e) => ({ status: 'revision', reason: `MAIL2 no verificado: ${e}` }))
        await db.from('autosend_queue').update({ ...patch, current_email: q.mail2, next_action: patch.status === 'programado' ? 'Reintento con MAIL2' : (patch as any).next_action }).eq('id', q.id)
      } else if (q) await db.from('autosend_queue').update({ status: 'rebotado', reason: 'Rebote: ' + (bounce.snippet ?? '').slice(0, 150), updated_at: new Date().toISOString() }).eq('id', q.id)
    } else if (reply) {
      const optout = OPTOUT_RE.test(reply.snippet ?? '')
      await db.from('autosend_attempts').update({ status: 'respondido' }).eq('id', a.id)
      if (optout) await db.from('autosend_optouts').upsert({ email: a.email.toLowerCase(), source: 'respuesta' }, { onConflict: 'email', ignoreDuplicates: true })
      if (q) await db.from('autosend_queue').update({ status: optout ? 'no_contactar' : 'respondido', replied_at: new Date(Number(reply.internalDate)).toISOString(), reason: 'Respuesta: ' + (reply.snippet ?? '').slice(0, 180), next_action: optout ? 'No contactar' : 'Clasificar respuesta y seguir personalmente', updated_at: new Date().toISOString() }).eq('id', q.id)
      const { data: pr } = await db.from('prospects').select('id,status').eq('email', a.email.toLowerCase()).maybeSingle()
      const pri: Record<string, number> = { hot: 5, warm: 4, no_for_now: 3, auto_reply: 2, no_response: 1 }
      const ns = optout ? 'no_for_now' : 'warm'
      if (!pr) await db.from('prospects').insert({ email: a.email.toLowerCase(), company: q?.empresa_corta ?? '', contact_name: `${q?.nombre ?? ''} ${q?.apellido ?? ''}`.trim(), status: ns, note: (reply.snippet ?? '').slice(0, 200), referred_by: 'Envío automático' })
      else if ((pri[ns] ?? 0) > (pri[pr.status] ?? 0)) await db.from('prospects').update({ status: ns, note: (reply.snippet ?? '').slice(0, 200), updated_at: new Date().toISOString() }).eq('id', pr.id)
      await log(db, `Respuesta de ${a.email}`, 'info')
    } else if (daysAgo(a.sent_at) >= 2 && q && !q.delivered_at) {
      await db.from('autosend_queue').update({ delivered_at: new Date().toISOString() }).eq('id', q.id)
    }
  }
  const today = santiagoNow().date
  const { data: bToday } = await db.from('autosend_attempts').select('id,sent_at').eq('status', 'rebotado').gte('sent_at', new Date(Date.now() - 2 * 86400000).toISOString())
  const n = (bToday ?? []).filter((b: any) => santiagoNow(new Date(b.sent_at)).date === today).length
  if (n >= ctx.settings.bounce_stop_threshold && ctx.settings.status === 'active') await pause(db, `${n} rebotes hoy (límite ${ctx.settings.bounce_stop_threshold})`)
}

async function sentToday(db: Db) {
  const { data } = await db.from('autosend_attempts').select('sent_at').eq('is_test', false).gte('sent_at', new Date(Date.now() - 86400000 * 1.5).toISOString())
  const d = santiagoNow().date
  return (data ?? []).filter((a: any) => santiagoNow(new Date(a.sent_at)).date === d).length
}

async function sendOne(db: Db, ctx: Ctx, sender: any, row: any) {
  const email = row.current_email
  const { error: dupErr, data: att } = await db.from('autosend_attempts').insert({ queue_id: row.id, email, sender: sender.email, subject: row.subject, template_kind: row.template_kind, status: 'enviando' }).select().single()
  if (dupErr) { await db.from('autosend_queue').update({ status: 'excluido_historial', reason: 'Duplicado evitado: ya hubo un intento a esta dirección' }).eq('id', row.id); return false }
  try {
    const url = ctx.settings.include_optout ? await optoutUrl(email) : ''
    const r = renderTemplate(ctx.templates[row.template_kind], { nombre: greetingName(row.nombre), empresa_corta: row.empresa_corta }, sender.signature, url)
    if (r.missing.length) throw new Error('Variables sin completar: ' + r.missing.join(', '))
    const raw = buildRaw({ fromName: sender.name, fromEmail: sender.email, to: email, subject: r.subject, html: r.html, text: r.text, listUnsubscribe: url || undefined })
    const res = await gm('/users/me/messages/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ raw }) })
    const now = new Date().toISOString()
    await db.from('autosend_attempts').update({ status: 'enviado', gmail_message_id: res.id, gmail_thread_id: res.threadId, subject: r.subject }).eq('id', att.id)
    await db.from('autosend_queue').update({ status: 'enviado', sent_at: now, gmail_message_id: res.id, gmail_thread_id: res.threadId, subject: r.subject, attempt: row.attempt + 1, next_action: 'Esperar respuesta', updated_at: now }).eq('id', row.id)
    const { data: d } = await db.from('delivered_contacts').select('id,times_contacted').eq('mail', email).maybeSingle()
    if (d) await db.from('delivered_contacts').update({ times_contacted: (d.times_contacted ?? 0) + 1, last_contacted_at: now, last_campaign: 'AUTO CCP', status: 'ENVIADO' }).eq('id', d.id)
    else await db.from('delivered_contacts').insert({ mail: email, nombre: row.nombre, apellido: row.apellido, empresa: row.empresa, empresa_short: row.empresa_corta, web: row.web, status: 'ENVIADO', last_campaign: 'AUTO CCP' })
    await log(db, `Enviado a ${email} (${row.template_kind})`)
    return true
  } catch (e) {
    await db.from('autosend_attempts').update({ status: 'error', error: String(e).slice(0, 300) }).eq('id', att.id)
    await db.from('autosend_queue').update({ status: 'error', reason: 'Error de envío: ' + String(e).slice(0, 200) }).eq('id', row.id)
    throw e
  }
}

/** Manual "send now": ignores the time window and the on/off switch, but keeps every exclusion and the daily limit. */
async function sendNow(db: Db, max = 4) {
  const ctx = await loadCtx(db)
  const s = ctx.settings
  if (s.status === 'stopped') return { ok: false, reason: 'El envío está Detenido. Cámbialo a Pausado o Activo para enviar.' }
  const out: Record<string, unknown> = { ok: true, sent: 0 }
  try {
    const sender = await getSender(s)
    if (!sender.ok) return { ok: false, reason: sender.reason }
    const quota = s.daily_limit - (await sentToday(db))
    out.quota_left = quota
    if (quota <= 0) return { ...out, done: true, reason: `Ya se alcanzó el máximo de ${s.daily_limit} correos de hoy` }
    const k = Math.min(max, quota)
    let sent = 0
    for (let i = 0; i < k; i++) {
      const { data: claimed } = await db.rpc('autosend_claim_next')
      const row = claimed?.[0]
      if (!row) break
      const patch = await analyze(db, ctx, row)
      await db.from('autosend_queue').update(patch).eq('id', row.id)
      if (patch.status !== 'programado') continue
      if (await sendOne(db, ctx, sender, { ...row, ...patch })) sent++
      if (i < k - 1) await new Promise((r) => setTimeout(r, 8000 + Math.random() * 7000))
    }
    out.sent = sent
    out.quota_left = quota - sent
    const { count } = await db.from('autosend_queue').select('id', { count: 'exact', head: true }).eq('status', 'programado')
    out.remaining = count ?? 0
    out.done = !count || quota - sent <= 0
    if (sent) await log(db, `Envío manual «Enviar ahora»: ${sent} correos`)
  } catch (e) {
    if (e instanceof GmailError && [0, 401, 403, 429].includes(e.status)) await pause(db, `Gmail rechazó la operación (${e.status})`)
    await db.from('autosend_queue').update({ status: 'programado' }).eq('status', 'enviando')
    return { ok: false, reason: String(e).slice(0, 300) }
  }
  return out
}

async function tick(db: Db, opts: { force?: boolean } = {}) {
  const ctx = await loadCtx(db)
  const s = ctx.settings
  await db.from('autosend_settings').update({ last_tick_at: new Date().toISOString() }).eq('id', 1)
  if (s.status === 'stopped') return { skipped: 'detenido' }
  const out: Record<string, unknown> = {}
  try {
    await trackResults(db, ctx)
    if (s.status !== 'active' && !opts.force) return { ...out, skipped: 'pausado' }
    out.enqueued = await enqueueAgentContacts(db)
    out.analyzed = await analyzePending(db, ctx, 8)
    if (s.status !== 'active') return { ...out, skipped: 'pausado (sin envíos)' }
    if (!inWindow(s)) return { ...out, skipped: 'fuera de horario' }
    const sender = await getSender(s)
    if (!sender.ok) { await pause(db, sender.reason); return { ...out, paused: sender.reason } }
    const n = santiagoNow(), [eh, em] = String(s.window_end).split(':').map(Number)
    const quota = s.daily_limit - (await sentToday(db))
    const k = sendsThisTick(quota, eh * 60 + em - n.minutes, s.interval_minutes)
    let sent = 0
    for (let i = 0; i < k; i++) {
      const { data: claimed } = await db.rpc('autosend_claim_next')
      const row = claimed?.[0]
      if (!row) break
      const patch = await analyze(db, ctx, row) // re-check every exclusion right before sending
      if (patch.status !== 'programado') { await db.from('autosend_queue').update(patch).eq('id', row.id); continue }
      await db.from('autosend_queue').update(patch).eq('id', row.id)
      if (await sendOne(db, ctx, sender, { ...row, ...patch })) sent++
      if (i < k - 1) await new Promise((r) => setTimeout(r, 20000 + Math.random() * 25000))
    }
    out.sent = sent
  } catch (e) {
    if (e instanceof GmailError && [0, 401, 403, 429].includes(e.status)) await pause(db, `Gmail rechazó la operación (${e.status})`)
    else await log(db, 'Error en ciclo automático', 'error', { error: String(e) })
    await db.from('autosend_queue').update({ status: 'programado' }).eq('status', 'enviando')
    out.error = String(e).slice(0, 300)
  }
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  try {
    const body = await req.json().catch(() => ({}))
    const cronTok = req.headers.get('x-cron-token')
    if (cronTok) {
      const { data } = await db.from('autosend_cron_token').select('token').eq('id', 1).single()
      if (!data || data.token !== cronTok) return json({ error: 'forbidden' }, 403)
      if (!body.action) return json(await tick(db))
    } else {
      const denied = await requireOwner(req, corsHeaders)
      if (denied) return denied
    }
    const ctx = await loadCtx(db)
    switch (body.action) {
      case 'find_domain': {
        const name = String(body.name ?? '').trim().slice(0, 80)
        if (name.length < 2) return json({ error: 'Escribe el nombre de la empresa' }, 400)
        const msgs = await gmSearch(`"${name.replace(/"/g, '')}" newer_than:5y -from:mailer-daemon`, 40)
        const exclude = new Set([...FREE, 'huau.cl', 'estudio.huau.cl', 'google.com', 'linkedin.com'])
        return json({ ok: true, found: msgs.length, domains: rankDomains(msgs.flatMap((m) => [m.from, m.to]), name, exclude) })
      }
      case 'list_senders': {
        const d = await gm('/users/me/settings/sendAs')
        const list = (d.sendAs ?? []).filter((x: any) => x.isPrimary || x.verificationStatus === 'accepted')
          .map((x: any) => ({ email: x.sendAsEmail, name: x.displayName || '', primary: !!x.isPrimary }))
        return json({ ok: true, senders: list, current: ctx.settings.sender_email })
      }
      case 'set_sender': {
        const email = String(body.email ?? '').trim().toLowerCase()
        const d = await gm('/users/me/settings/sendAs')
        const s = (d.sendAs ?? []).find((x: any) => x.sendAsEmail?.toLowerCase() === email && (x.isPrimary || x.verificationStatus === 'accepted'))
        if (!s) return json({ error: 'Ese correo no está autorizado en Gmail' }, 400)
        await db.from('autosend_settings').update({ sender_email: s.sendAsEmail, sender_name: s.displayName || ctx.settings.sender_name, updated_at: new Date().toISOString() }).eq('id', 1)
        await log(db, `Remitente cambiado a ${s.sendAsEmail}`)
        return json({ ok: true, email: s.sendAsEmail })
      }
      case 'verify_sender': {
        const s = await getSender(ctx.settings)
        return json(s.ok ? { ok: true, email: s.email, name: s.name, has_signature: !!s.signature, has_logo: /<img/i.test(s.signature), signature_html: s.signature } : s)
      }
      case 'analyze': {
        const base_id = typeof body.base_id === 'string' ? body.base_id : undefined
        const enq = await enqueueAgentContacts(db, base_id)
        let total = 0
        for (let i = 0; i < 8; i++) { const n = await analyzePending(db, ctx, 10, base_id); total += n; if (n < 10) break }
        return json({ ok: true, enqueued: enq, analyzed: total })
      }
      case 'reanalyze': {
        if (typeof body.queue_id !== 'string') return json({ error: 'queue_id requerido' }, 400)
        const { data: row } = await db.from('autosend_queue').select('*').eq('id', body.queue_id).single()
        if (!row || ['enviado', 'enviando', 'respondido'].includes(row.status)) return json({ error: 'No se puede reanalizar' }, 400)
        const patch = await analyze(db, ctx, row)
        await db.from('autosend_queue').update(patch).eq('id', row.id)
        return json({ ok: true, ...patch })
      }
      case 'preview': {
        const kind = typeof body.kind === 'string' && ctx.templates[body.kind] ? body.kind : 'presentacion'
        const tpl = { subject: String(body.subject ?? ctx.templates[kind].subject), body: String(body.body ?? ctx.templates[kind].body) }
        let vars = { nombre: 'Eduardo', empresa_corta: 'Forus' }
        if (typeof body.queue_id === 'string') {
          const { data: q } = await db.from('autosend_queue').select('nombre,empresa,empresa_corta').eq('id', body.queue_id).single()
          if (q) vars = { nombre: greetingName(q.nombre), empresa_corta: q.empresa_corta ?? shortCompany(q.empresa, ctx.overrides) }
        }
        const s = await getSender(ctx.settings).catch(() => null)
        const r = renderTemplate(tpl, vars, s && s.ok ? s.signature : '', ctx.settings.include_optout ? '#' : '')
        return json({ ...r, from: s && s.ok ? `${s.name} <${s.email}>` : null })
      }
      case 'test_send': {
        const { data: recent } = await db.from('autosend_attempts').select('id').eq('is_test', true).gte('sent_at', new Date(Date.now() - 10 * 60000).toISOString())
        if (recent?.length) return json({ error: 'Ya se envió una prueba hace menos de 10 minutos' }, 429)
        const s = await getSender(ctx.settings)
        if (!s.ok) return json({ error: s.reason }, 400)
        const kind = body.kind === 'reactivacion' ? 'reactivacion' : 'presentacion'
        const url = ctx.settings.include_optout ? await optoutUrl(TEST_TO) : ''
        const r = renderTemplate(ctx.templates[kind], { nombre: 'Arturo', empresa_corta: 'Huau' }, s.signature, url)
        const raw = buildRaw({ fromName: s.name, fromEmail: s.email, to: TEST_TO, subject: '[PRUEBA CCP] ' + r.subject, html: r.html, text: r.text, listUnsubscribe: url || undefined })
        const res = await gm('/users/me/messages/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ raw }) })
        await db.from('autosend_attempts').insert({ email: TEST_TO, sender: s.email, subject: '[PRUEBA CCP] ' + r.subject, template_kind: kind, is_test: true, gmail_message_id: res.id, gmail_thread_id: res.threadId })
        await log(db, `Correo de prueba enviado a ${TEST_TO}`)
        const sentMsg = await gm(`/users/me/messages/${res.id}?format=metadata&metadataHeaders=From`)
        return json({ ok: true, to: TEST_TO, in_sent: (sentMsg.labelIds ?? []).includes('SENT'), from: hv(sentMsg, 'From') })
      }
      case 'send_now':
        return json(await sendNow(db))
      case 'send_now_count': {
        const { count } = await db.from('autosend_queue').select('id', { count: 'exact', head: true }).eq('status', 'programado')
        const left = ctx.settings.daily_limit - (await sentToday(db))
        return json({ ok: true, programados: count ?? 0, quota_left: Math.max(0, left) })
      }
      case 'tick_now':
        return json(await tick(db))
      default:
        return json({ error: 'acción desconocida' }, 400)
    }
  } catch (e) {
    console.error('autosend error', e)
    const st = e instanceof GmailError && e.status >= 400 ? e.status : 500
    return json({ error: e instanceof Error ? e.message : 'error' }, st)
  }
})
