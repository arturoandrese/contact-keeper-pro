import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

// Checks sender domain health: MX, SPF, DKIM, DMARC + DNS blacklists.
// Uses Google DNS-over-HTTPS so no API key is needed.

const DoH = 'https://dns.google/resolve'

async function dnsQuery(name: string, type: string): Promise<any[]> {
  try {
    const res = await fetch(`${DoH}?name=${encodeURIComponent(name)}&type=${type}`)
    if (!res.ok) return []
    const json = await res.json()
    return json.Answer || []
  } catch {
    return []
  }
}

function txtRecords(answers: any[]): string[] {
  return answers
    .filter((a) => a.type === 16)
    .map((a) => (a.data || '').replace(/"/g, ''))
}

const DKIM_SELECTORS = ['google', 'default', 'selector1', 'selector2', 'k1', 'mail', 's1', 's2', 'dkim', '20230601']

const BLACKLISTS = [
  { zone: 'zen.spamhaus.org', name: 'Spamhaus' },
  { zone: 'bl.spamcop.net', name: 'SpamCop' },
  { zone: 'b.barracudacentral.org', name: 'Barracuda' },
  { zone: 'dnsbl.sorbs.net', name: 'SORBS' },
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const email = String(body.email || '').trim().toLowerCase()
    const emailRe = /^[^\s@]+@([a-z0-9.-]+\.[a-z]{2,})$/
    const match = email.match(emailRe)
    if (!match) {
      return new Response(JSON.stringify({ error: 'Correo inválido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const domain = match[1]

    const freeProviders = new Set(['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'live.com', 'icloud.com'])
    if (freeProviders.has(domain)) {
      return new Response(JSON.stringify({
        domain,
        isFreeProvider: true,
        message: 'Es un correo gratuito (Gmail, Outlook, etc.). No se puede configurar SPF/DKIM/DMARC propio: la reputación depende 100% de tu comportamiento de envío.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Run all DNS lookups in parallel
    const [mxAnswers, txtAnswers, dmarcAnswers, ...dkimResults] = await Promise.all([
      dnsQuery(domain, 'MX'),
      dnsQuery(domain, 'TXT'),
      dnsQuery(`_dmarc.${domain}`, 'TXT'),
      ...DKIM_SELECTORS.map((sel) => dnsQuery(`${sel}._domainkey.${domain}`, 'TXT')),
    ])

    // MX
    const mxRecords = mxAnswers.filter((a) => a.type === 15).map((a) => a.data)
    const hasMx = mxRecords.length > 0

    // SPF
    const txts = txtRecords(txtAnswers)
    const spfRecord = txts.find((t) => t.startsWith('v=spf1'))
    const hasSpf = !!spfRecord
    const spfIncludesGoogle = spfRecord ? spfRecord.includes('include:_spf.google.com') : false

    // DMARC
    const dmarcTxts = txtRecords(dmarcAnswers)
    const dmarcRecord = dmarcTxts.find((t) => t.startsWith('v=DMARC1'))
    const hasDmarc = !!dmarcRecord
    const dmarcPolicy = dmarcRecord?.match(/p=([a-z]+)/i)?.[1]?.toLowerCase() || null

    // DKIM
    const dkimFound: string[] = []
    DKIM_SELECTORS.forEach((sel, i) => {
      const txtsFound = txtRecords(dkimResults[i])
      if (txtsFound.some((t) => t.includes('v=DKIM1') || t.includes('k=rsa') || t.includes('p='))) {
        dkimFound.push(sel)
      }
    })
    const hasDkim = dkimFound.length > 0

    // Blacklists: query <reversed-domain-ip>? DNSBLs work on IPs, not domains.
    // Resolve domain A record first, then check the IP against DNSBLs.
    const aAnswers = await dnsQuery(domain, 'A')
    const ips = aAnswers.filter((a) => a.type === 1).map((a) => a.data)
    const blacklistHits: string[] = []
    if (ips.length > 0) {
      const ip = ips[0]
      const reversed = ip.split('.').reverse().join('.')
      const blChecks = await Promise.all(
        BLACKLISTS.map((bl) => dnsQuery(`${reversed}.${bl.zone}`, 'A'))
      )
      BLACKLISTS.forEach((bl, i) => {
        if (blChecks[i].some((a) => a.type === 1 && String(a.data).startsWith('127.'))) {
          blacklistHits.push(bl.name)
        }
      })
    }

    // Score: SPF 25, DKIM 25, DMARC 25 (p=none counts half), MX 15, no blacklist 10
    let score = 0
    if (hasSpf) score += 25
    if (hasDkim) score += 25
    if (hasDmarc) score += dmarcPolicy === 'none' ? 12 : 25
    if (hasMx) score += 15
    if (blacklistHits.length === 0) score += 10

    const checks = [
      {
        key: 'mx',
        ok: hasMx,
        title: 'Servidor de correo (MX)',
        detail: hasMx
          ? `Tu dominio recibe correos correctamente (${mxRecords[0]}).`
          : 'Tu dominio NO tiene servidor de correo configurado. No puedes recibir respuestas.',
      },
      {
        key: 'spf',
        ok: hasSpf,
        title: 'SPF (quién puede enviar por ti)',
        detail: hasSpf
          ? spfIncludesGoogle
            ? 'Bien configurado: autoriza a Google (Gmail/Workspace) a enviar por tu dominio.'
            : `Existe SPF pero no autoriza a Google. Si envías desde Gmail/YAMM, agrégalo: ${spfRecord}`
          : 'FALTA: sin SPF, Gmail y Outlook desconfían de tus correos y los mandan a spam.',
      },
      {
        key: 'dkim',
        ok: hasDkim,
        title: 'DKIM (firma digital)',
        detail: hasDkim
          ? `Activo (selector "${dkimFound[0]}"). Tus correos van firmados.`
          : 'FALTA o no se detectó: sin firma DKIM tus correos tienen más chance de caer en spam. Si usas Google Workspace, actívalo en Admin → Apps → Gmail → Autenticar correo.',
      },
      {
        key: 'dmarc',
        ok: hasDmarc && dmarcPolicy !== 'none',
        title: 'DMARC (política anti-suplantación)',
        detail: hasDmarc
          ? dmarcPolicy === 'none'
            ? 'Existe pero está en modo "solo observar" (p=none). Sube a p=quarantine para más protección y mejor reputación.'
            : `Bien configurado (política ${dmarcPolicy}).`
          : 'FALTA: sin DMARC, Gmail y Yahoo (desde 2024) penalizan los envíos masivos de tu dominio.',
      },
      {
        key: 'blacklist',
        ok: blacklistHits.length === 0,
        title: 'Listas negras de spam',
        detail: blacklistHits.length === 0
          ? 'Tu dominio/IP NO aparece en las principales listas negras.'
          : `ALERTA: apareces en: ${blacklistHits.join(', ')}. Tus correos van directo a spam hasta que pidas la remoción.`,
      },
    ]

    return new Response(JSON.stringify({
      domain,
      isFreeProvider: false,
      score,
      checks,
      spfRecord: spfRecord || null,
      dmarcRecord: dmarcRecord || null,
      dkimSelectors: dkimFound,
      blacklists: blacklistHits,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
