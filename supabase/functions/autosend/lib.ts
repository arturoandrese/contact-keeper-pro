// Pure helpers for the autosend system (no I/O) — covered by lib_test.ts.

export const norm = (t: string | null | undefined) =>
  (t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

export const companyKey = (t: string | null | undefined) => norm(t).replace(/ /g, '')

export const domainOf = (email?: string | null) => (email ?? '').toLowerCase().split('@')[1]?.trim() ?? ''

export const cleanDomain = (d?: string | null) =>
  (d ?? '').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '')

const LEGAL = /\b(s\.?\s?a\.?(\s?c\.?)?|spa|s\.?p\.?a\.?|ltda\.?|limitada|e\.?i\.?r\.?l\.?|y cia\.?|& cia\.?|chile)\s*$/i
const PREFIXES = ['empresas ', 'empresa ', 'automotores ', 'automotora ', 'viña ', 'vina ', 'grupo ', 'inversiones ', 'comercial ', 'sociedad ', 'compañía ', 'compania ']

const SMALL = new Set(['y', 'de', 'del', 'la', 'las', 'los', 'el', 'e'])
const smartCase = (s: string) => {
  if (!(s === s.toUpperCase() && /\p{Lu}{2}/u.test(s))) return s
  const words = s.split(' ')
  if (words.length === 1 && s.length <= 4) return s // acronyms like HP, CCU
  return words.map((w, i) => {
    const l = w.toLowerCase()
    if (i > 0 && SMALL.has(l)) return l
    return l.replace(/(^|[\-/])(\p{L})/gu, (_m, a, b) => a + b.toUpperCase())
  }).join(' ')
}

/** Commercial short name: removes only legal suffixes and generic prefixes, never invents abbreviations. */
export function shortCompany(raw: string | null | undefined, overrides: Record<string, string> = {}): string {
  const o = overrides[companyKey(raw)]
  if (o) return o
  let s = (raw ?? '').trim().replace(/\s+/g, ' ').split(/\s+[–—|]\s+/)[0]
  for (let i = 0; i < 3; i++) s = s.replace(/[,.]?\s*$/, '').replace(LEGAL, '').trim()
  const lower = s.toLowerCase()
  for (const p of PREFIXES) {
    if (lower.startsWith(p) && s.length > p.length + 2) { s = s.slice(p.length); break }
  }
  return smartCase(s.replace(/[,.]\s*$/, '').trim())
}

/** Greeting uses the NOMBRE field exactly as stored (compound names stay together). */
export const greetingName = (nombre: string | null | undefined) => smartCase((nombre ?? '').trim().replace(/\s+/g, ' '))

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export interface Rendered { subject: string; html: string; text: string; missing: string[] }

export function renderTemplate(t: { subject: string; body: string }, vars: Record<string, string>, signatureHtml = '', optoutUrl = ''): Rendered {
  const missing: string[] = []
  const fill = (s: string) => s.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => {
    const v = (vars[k] ?? '').trim()
    if (!v) missing.push(k)
    return v
  })
  const subject = fill(t.subject)
  const body = fill(t.body)
  if (/\{\{|\}\}/.test(subject + body)) missing.push('variable mal escrita')
  const linkRe = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g
  const text = body.replace(linkRe, '$1: $2') + (optoutUrl ? `\n\n--\nSi prefieres no recibir más correos: ${optoutUrl}` : '')
  const htmlBody = body.split(/\n/).map((line) => {
    let out = '', last = 0
    for (const m of line.matchAll(linkRe)) {
      out += esc(line.slice(last, m.index)) + `<a href="${esc(m[2])}">${esc(m[1])}</a>`
      last = (m.index ?? 0) + m[0].length
    }
    return out + esc(line.slice(last))
  }).join('<br>')
  const optHtml = optoutUrl ? `<p style="color:#9aa3ab;font-size:11px;margin-top:24px">Si prefieres no recibir más correos, <a style="color:#9aa3ab" href="${esc(optoutUrl)}">avísanos aquí</a>.</p>` : ''
  const html = `<div style="font-family:arial,sans-serif;font-size:14px;color:#222">${htmlBody}<br>${signatureHtml}${optHtml}</div>`
  return { subject, html, text, missing: [...new Set(missing)] }
}

const b64 = (s: string) => btoa(Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join(''))
const hdr = (v: string) => (/^[\x20-\x7E]*$/.test(v) ? v : `=?UTF-8?B?${b64(v)}?=`)

export function buildRaw(o: { fromName: string; fromEmail: string; to: string; subject: string; html: string; text: string; listUnsubscribe?: string }): string {
  const boundary = 'ccp_' + crypto.randomUUID().replace(/-/g, '')
  const lines = [
    `From: ${hdr(o.fromName)} <${o.fromEmail}>`,
    `To: ${o.to}`,
    `Subject: ${hdr(o.subject)}`,
    'MIME-Version: 1.0',
    ...(o.listUnsubscribe ? [`List-Unsubscribe: <${o.listUnsubscribe}>`] : []),
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    b64(o.text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    b64(o.html),
    `--${boundary}--`,
  ]
  return b64(lines.join('\r\n')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Current Chile wall-clock parts. */
export function santiagoNow(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  }).formatToParts(d).map((x) => [x.type, x.value]))
  const dow = ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as Record<string, number>)[p.weekday]
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: (Number(p.hour) % 24) * 60 + Number(p.minute), dow }
}

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0) }

export function inWindow(s: { send_days: number[]; window_start: string; window_end: string }, d = new Date()) {
  const n = santiagoNow(d)
  return s.send_days.includes(n.dow) && n.minutes >= toMin(s.window_start) && n.minutes < toMin(s.window_end)
}

/** How many sends this tick may do so the daily quota spreads across the remaining window. */
export function sendsThisTick(remainingQuota: number, minutesLeft: number, intervalMin: number, tickMin = 15) {
  if (remainingQuota <= 0 || minutesLeft <= 0) return 0
  const ticksLeft = Math.max(1, Math.ceil(minutesLeft / tickMin))
  const byInterval = Math.max(1, Math.floor(tickMin / Math.max(1, intervalMin)))
  return Math.min(remainingQuota, byInterval, Math.ceil(remainingQuota / ticksLeft))
}

export interface ProtectedCompany { id: string; nombre_comercial: string; razon_social: string | null; dominio: string | null; dominios_alt: string[]; motivo: string; estado: string }

export function matchProtectedCompany(list: ProtectedCompany[], empresa: string | null, emails: string[], web?: string | null): ProtectedCompany | null {
  const doms = new Set([...emails.map(domainOf), cleanDomain(web)].filter(Boolean))
  const ek = companyKey(empresa)
  const sk = companyKey(shortCompany(empresa))
  for (const c of list) {
    if (c.estado !== 'activa') continue
    const cd = [c.dominio, ...(c.dominios_alt ?? [])].map(cleanDomain).filter(Boolean)
    if (cd.some((d) => [...doms].some((x) => x === d || x.endsWith('.' + d)))) return c
    const keys = [c.nombre_comercial, c.razon_social].map(companyKey).filter((k) => k.length >= 4)
    if (keys.some((k) => ek === k || sk === k || (ek.length >= 4 && (ek.includes(k) || (k.includes(ek) && ek.length >= 6))))) return c
  }
  return null
}

/** Ranks company domains seen in Gmail headers for a company name search. */
export function rankDomains(headers: string[], name: string, exclude: Set<string>) {
  const key = companyKey(name)
  const count = new Map<string, number>()
  for (const h of headers) for (const m of h.toLowerCase().matchAll(/[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,})/g)) {
    const d = m[1]
    if (exclude.has(d) || [...exclude].some((x) => d.endsWith('.' + x))) continue
    count.set(d, (count.get(d) ?? 0) + 1)
  }
  const tokens = norm(name).split(' ').filter((t) => t.length >= 3)
  const score = (d: string) => {
    const base = companyKey(d.split('.')[0])
    const match = base && (key.includes(base) || base.includes(key) || tokens.some((t) => base.includes(t))) ? 1000 : 0
    return match + (count.get(d) ?? 0)
  }
  return [...count.keys()].sort((a, b) => score(b) - score(a)).slice(0, 5)
    .map((d) => ({ domain: d, hits: count.get(d)!, matches_name: score(d) >= 1000 }))
}
