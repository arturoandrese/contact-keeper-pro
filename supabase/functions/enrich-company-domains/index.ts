import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

interface ReqBody {
  companies: string[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const key = Deno.env.get('LOVABLE_API_KEY');
    if (!key) {
      return new Response(JSON.stringify({ error: 'Missing LOVABLE_API_KEY' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as ReqBody;
    const companies = Array.from(new Set((body.companies || []).map(c => (c || '').trim()).filter(Boolean)));
    if (companies.length === 0) {
      return new Response(JSON.stringify({ mapping: {} }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Batch in chunks of 40 to keep prompts reasonable
    const mapping: Record<string, string> = {};
    const chunkSize = 40;

    for (let i = 0; i < companies.length; i += chunkSize) {
      const chunk = companies.slice(i, i + chunkSize);
      const list = chunk.map((c, idx) => `${idx + 1}. ${c}`).join('\n');

      const prompt = `Eres un experto en empresas chilenas y latinoamericanas. Para cada empresa de la lista, devuelve el dominio web OFICIAL principal (solo el dominio, sin https:// ni www.). Si no estás seguro o la empresa no existe / es muy genérica / es consultora personal, devuelve string vacío "".

Lista:
${list}

Responde ÚNICAMENTE en JSON con esta forma:
{"results":[{"company":"<nombre exacto>","domain":"<dominio o vacío>"}]}`;

      const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
        }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        console.error('AI gateway error', resp.status, text);
        if (resp.status === 429) {
          return new Response(JSON.stringify({ error: 'Rate limit, intenta de nuevo en un momento' }), {
            status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (resp.status === 402) {
          return new Response(JSON.stringify({ error: 'Sin créditos AI. Recarga en Settings → Workspace → Usage' }), {
            status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        continue;
      }

      const data = await resp.json();
      const content = data.choices?.[0]?.message?.content || '{}';
      try {
        const parsed = JSON.parse(content);
        const arr = parsed.results || [];
        for (const r of arr) {
          if (r?.company && typeof r.domain === 'string') {
            const clean = r.domain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].trim();
            if (clean && clean.includes('.')) mapping[r.company] = clean;
          }
        }
      } catch (e) {
        console.error('Parse error', e, content);
      }
    }

    return new Response(JSON.stringify({ mapping }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
