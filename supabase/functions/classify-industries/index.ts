import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const INDUSTRIES = [
  'Banca y Finanzas', 'Seguros', 'Retail y Consumo', 'Salud y Farmacéutica', 'Educación',
  'Minería y Energía', 'Tecnología y Telecomunicaciones', 'Construcción e Inmobiliaria',
  'Alimentos y Bebidas', 'Agro y Forestal', 'Transporte y Logística', 'Gobierno y Sector Público',
  'Medios, Publicidad y Marketing', 'Servicios Profesionales y Consultoría', 'Industria y Manufactura',
  'Automotriz', 'Turismo y Entretención', 'ONG y Fundaciones', 'Otros',
];

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const key = Deno.env.get('LOVABLE_API_KEY');
    if (!key) return json({ error: 'Missing LOVABLE_API_KEY' }, 500);
    const body = await req.json().catch(() => ({}));
    const items: { name: string; domain?: string }[] = Array.isArray(body?.companies) ? body.companies : [];
    const clean = items
      .filter((c) => c && typeof c.name === 'string' && c.name.trim())
      .slice(0, 80)
      .map((c) => ({ name: c.name.trim().slice(0, 120), domain: String(c.domain || '').slice(0, 100) }));
    if (clean.length === 0) return json({ mapping: {} });

    const list = clean.map((c, i) => `${i + 1}. ${c.name}${c.domain ? ` (${c.domain})` : ''}`).join('\n');
    const prompt = `Clasifica cada empresa (mayormente chilenas) en UNA industria de esta lista exacta: ${INDUSTRIES.join(', ')}. Usa el dominio como pista. Si no sabes, usa "Otros". Devuelve json.\n\nEmpresas:\n${list}`;

    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-6-astra',
        reasoning_effort: 'low',
        messages: [{ role: 'user', content: prompt }],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'industries',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['results'],
              properties: {
                results: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['company', 'industry'],
                    properties: { company: { type: 'string' }, industry: { type: 'string', enum: INDUSTRIES } },
                  },
                },
              },
            },
          },
        },
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error('AI error', resp.status, text);
      if (resp.status === 429) return json({ error: 'Límite de uso, intenta en un momento' }, 429);
      if (resp.status === 402) return json({ error: 'Sin créditos de IA. Recarga en Settings → Plans & credits' }, 402);
      return json({ error: 'Error de IA' }, resp.status);
    }
    const data = await resp.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
    const mapping: Record<string, string> = {};
    for (const r of parsed.results || []) if (r?.company && r?.industry) mapping[r.company] = r.industry;
    return json({ mapping });
  } catch (err) {
    console.error(err);
    return json({ error: String(err) }, 500);
  }
});
