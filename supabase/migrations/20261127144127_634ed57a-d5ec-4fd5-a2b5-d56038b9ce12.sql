ALTER TABLE public.autosend_templates ADD COLUMN IF NOT EXISTS match_cargos text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.autosend_queue ADD COLUMN IF NOT EXISTS cargo text;
INSERT INTO public.autosend_templates (kind, base_kind, label, match_terms, match_cargos, subject, body) VALUES
('c_comunicaciones_internas','presentacion','Comunicaciones internas','{}',
 '{comunicaciones internas,comunicación interna,comunicacion interna,cultura,clima,employer branding,experiencia del colaborador,engagement}',
 'Huau - {{empresa_corta}}',
'Hola {{nombre}}, ¿cómo estás? Espero que todo bien.
Te escribo porque creo que en HUAU podemos hacer un buen match con ustedes. Trabajamos como partner audiovisual: hacemos comerciales, videos, animación y también piezas para comunicaciones internas, como campañas de cultura, lanzamientos, bajadas estratégicas o contenidos para equipos. Hoy incorporamos IA al proceso para lograr resultados de alto nivel cuidando bastante el presupuesto.
Te dejo nuestros reels para que puedas ver rápido lo que hacemos:

REEL AUDIOVISUAL
REEL IA

Si les hace sentido, felices de proponer ideas para algún proyecto que tengan en carpeta.
Que estés muy bien y gracias!')
ON CONFLICT (kind) DO NOTHING;