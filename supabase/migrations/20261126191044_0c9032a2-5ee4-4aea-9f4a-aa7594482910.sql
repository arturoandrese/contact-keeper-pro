
CREATE TABLE public.autosend_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  status text NOT NULL DEFAULT 'paused',
  daily_limit int NOT NULL DEFAULT 20,
  send_days int[] NOT NULL DEFAULT '{1,2,3,4,5}',
  window_start time NOT NULL DEFAULT '10:00',
  window_end time NOT NULL DEFAULT '12:00',
  interval_minutes int NOT NULL DEFAULT 5,
  sender_email text NOT NULL DEFAULT 'arturo@estudio.huau.cl',
  sender_name text NOT NULL DEFAULT 'Arturo Erlwein',
  recontact_days int NOT NULL DEFAULT 90,
  bounce_stop_threshold int NOT NULL DEFAULT 3,
  include_optout boolean NOT NULL DEFAULT true,
  stop_reason text,
  last_tick_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.autosend_templates (
  kind text PRIMARY KEY,
  subject text NOT NULL,
  body text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.protected_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_comercial text NOT NULL,
  razon_social text,
  dominio text,
  dominios_alt text[] NOT NULL DEFAULT '{}',
  motivo text NOT NULL DEFAULT 'Exclusión manual',
  estado text NOT NULL DEFAULT 'activa',
  nota text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.protected_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  apellidos text,
  empresa text,
  cargo text,
  correos text[] NOT NULL DEFAULT '{}',
  linkedin text,
  motivo text NOT NULL DEFAULT 'Exclusión manual',
  estado text NOT NULL DEFAULT 'activa',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.company_short_names (
  empresa_key text PRIMARY KEY,
  short_name text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.autosend_optouts (
  email text PRIMARY KEY,
  source text NOT NULL DEFAULT 'link',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.autosend_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL UNIQUE,
  base_id uuid,
  nombre text, apellido text, apellido2 text, empresa text, empresa_corta text, web text,
  mail1 text, mail2 text,
  current_email text,
  attempt int NOT NULL DEFAULT 0,
  classification text,
  reason text,
  template_kind text,
  status text NOT NULL DEFAULT 'pendiente',
  analysis jsonb,
  analyzed_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  replied_at timestamptz,
  gmail_message_id text,
  gmail_thread_id text,
  subject text,
  next_action text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX autosend_queue_status_idx ON public.autosend_queue(status);
CREATE TABLE public.autosend_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid REFERENCES public.autosend_queue(id) ON DELETE CASCADE,
  email text NOT NULL,
  sender text NOT NULL,
  subject text,
  template_kind text,
  is_test boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'enviado',
  gmail_message_id text,
  gmail_thread_id text,
  error text,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX autosend_attempts_once ON public.autosend_attempts(queue_id, lower(email)) WHERE queue_id IS NOT NULL;
CREATE TABLE public.autosend_log (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  level text NOT NULL DEFAULT 'info',
  message text NOT NULL,
  data jsonb
);
CREATE TABLE public.autosend_cron_token (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  token uuid NOT NULL DEFAULT gen_random_uuid()
);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['autosend_settings','autosend_templates','protected_companies','protected_contacts','company_short_names','autosend_optouts','autosend_queue','autosend_attempts','autosend_log'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "ccp owner session" ON public.%I FOR ALL TO authenticated USING (private.is_ccp_owner()) WITH CHECK (private.is_ccp_owner())', t);
  END LOOP;
END $$;
GRANT USAGE, SELECT ON SEQUENCE public.autosend_log_id_seq TO authenticated, service_role;
GRANT ALL ON public.autosend_cron_token TO service_role;
ALTER TABLE public.autosend_cron_token ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.autosend_cron_token FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Atomic claim of the next sendable row (prevents duplicate sends across concurrent ticks)
CREATE OR REPLACE FUNCTION public.autosend_claim_next()
RETURNS SETOF public.autosend_queue LANGUAGE sql SET search_path = public AS $$
  UPDATE autosend_queue q SET status = 'enviando', updated_at = now()
  WHERE q.id = (SELECT id FROM autosend_queue WHERE status = 'programado' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
  RETURNING q.*;
$$;
REVOKE ALL ON FUNCTION public.autosend_claim_next() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.autosend_claim_next() TO service_role;

INSERT INTO public.autosend_settings (id) VALUES (1);
INSERT INTO public.autosend_cron_token (id) VALUES (1);
INSERT INTO public.protected_companies (nombre_comercial, razon_social, dominio, dominios_alt, motivo)
VALUES ('Mall Plaza', 'Plaza S.A.', 'mallplaza.cl', '{mallplaza.com}', 'Cliente actual');
INSERT INTO public.autosend_templates (kind, subject, body) VALUES
('presentacion', 'Huau - {{empresa_corta}}',
'Hola, {{nombre}}. ¿Cómo estás? Espero que todo bien.

Te escribo porque creemos que podemos hacer muy buen match con ustedes.

En HUAU hacemos comerciales y animaciones, combinando la producción audiovisual tradicional con las nuevas posibilidades que ofrece la IA.

Te dejo nuestros reels para que veas lo que hacemos:

[REEL AUDIOVISUAL](https://youtu.be/nkEEItWY2vs?si=KJc0w3rEI2FKotJW)
[REEL IA](https://youtu.be/mafXMmQHPQI)

Si les hace sentido, felices de proponer ideas y hacer algo juntos.
¡Que estés muy bien y muchas gracias!

Saludos,'),
('reactivacion', 'Huau - {{empresa_corta}}',
'Hola, {{nombre}}. ¿Cómo estás? Espero que todo bien.

Hace un tiempo estuvimos en contacto y quería retomar la conversación para mostrarte un poco de lo que estamos haciendo actualmente en HUAU.

Estamos combinando la producción audiovisual tradicional con las nuevas posibilidades que ofrece la IA.

Te dejo nuestros reels actualizados:

[REEL AUDIOVISUAL](https://youtu.be/nkEEItWY2vs?si=KJc0w3rEI2FKotJW)
[REEL IA](https://youtu.be/mafXMmQHPQI)

Si tienen algún proyecto dando vueltas, felices de proponer ideas y ver qué podemos hacer juntos.

¡Que estés muy bien!

Saludos,');
