CREATE OR REPLACE FUNCTION public.agent007_import_prospects(p_payload jsonb, p_dry_run boolean DEFAULT true, p_run_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  c_source constant text := 'AGENTE 007';
  c_max constant int := 50;
  v_role text := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                          (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), '');
  v_date date := coalesce(p_run_date, (now() AT TIME ZONE 'America/Santiago')::date);
  v_items jsonb; v_item jsonb; v_idx int := 0; v_prev jsonb; v_base_id uuid; v_base_name text;
  v_new jsonb := '[]'::jsonb; v_rep jsonb := '[]'::jsonb; v_inv jsonb := '[]'::jsonb; v_err jsonb := '[]'::jsonb;
  v_seen_li text[] := '{}'; v_seen_mail text[] := '{}';
  v_email_re constant text := '^[a-z0-9._%+''-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$';
  v_states constant text[] := ARRAY['nuevo','por_verificar','verificado','inferido','descartado'];
  r_nombre text; r_cargo text; r_empresa text; r_ind text; r_dom text; r_li text; r_li_norm text;
  r_ver text; r_p1 text; r_p2 text; r_fuente text; r_estado text; r_rel numeric; r_hist jsonb;
  r_mails text[]; r_reasons text[]; r_match text[]; r_master uuid; r_first text; r_last text; m text;
  v_result jsonb;
BEGIN
  IF v_role IN ('anon','authenticated') THEN
    RAISE EXCEPTION 'agent007: acceso denegado para rol %', v_role USING ERRCODE = '42501';
  END IF;
  v_items := CASE WHEN jsonb_typeof(p_payload) = 'array' THEN p_payload ELSE p_payload -> 'contacts' END;
  IF v_items IS NULL OR jsonb_typeof(v_items) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'payload debe ser un arreglo o {"contacts":[...]}');
  END IF;
  IF jsonb_array_length(v_items) > c_max THEN
    RETURN jsonb_build_object('ok', false, 'error', format('máximo %s contactos por lote, recibidos %s', c_max, jsonb_array_length(v_items)), 'recibidos', jsonb_array_length(v_items));
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(c_source || v_date::text));
  SELECT result INTO v_prev FROM agent_import_runs WHERE source = c_source AND run_date = v_date;
  IF v_prev IS NOT NULL THEN
    RETURN v_prev || jsonb_build_object('idempotent_replay', true, 'dry_run', p_dry_run,
      'nota', 'Ya existe una importación de AGENTE 007 para esta fecha; no se escribió nada.');
  END IF;
  v_base_name := c_source || ' - ' || to_char(v_date, 'YYYY-MM-DD');

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_idx := v_idx + 1;
    BEGIN
      IF jsonb_typeof(v_item) <> 'object' THEN
        v_inv := v_inv || jsonb_build_object('index', v_idx, 'motivos', jsonb_build_array('no es objeto'));
        CONTINUE;
      END IF;
      r_reasons := '{}'; r_match := '{}'; r_master := NULL;
      r_nombre := nullif(btrim(v_item->>'nombre'), '');
      r_cargo := nullif(btrim(v_item->>'cargo'), '');
      r_empresa := nullif(btrim(v_item->>'empresa'), '');
      r_ind := nullif(btrim(v_item->>'industria'), '');
      r_dom := lower(nullif(btrim(v_item->>'dominio'), ''));
      r_dom := regexp_replace(regexp_replace(coalesce(r_dom,''), '^https?://(www\.)?', ''), '[/?#].*$', '');
      r_dom := nullif(regexp_replace(r_dom, '^www\.', ''), '');
      r_li := nullif(btrim(v_item->>'linkedin'), '');
      r_li_norm := NULL;
      IF r_li IS NOT NULL THEN
        r_li_norm := regexp_replace(lower(r_li), '^https?://', '');
        r_li_norm := regexp_replace(r_li_norm, '^[a-z]{2,3}\.linkedin\.com', 'linkedin.com');
        r_li_norm := regexp_replace(r_li_norm, '^www\.', '');
        r_li_norm := regexp_replace(r_li_norm, '[?#].*$', '');
        r_li_norm := regexp_replace(r_li_norm, '/+$', '');
        IF r_li_norm !~ '^linkedin\.com/in/[^/]+$' THEN
          r_reasons := r_reasons || 'linkedin inválido (se espera linkedin.com/in/...)'::text;
        END IF;
      END IF;
      r_ver := lower(nullif(btrim(v_item->>'correo_verificado'), ''));
      r_p1 := lower(nullif(btrim(v_item->>'correo_probable_1'), ''));
      r_p2 := lower(nullif(btrim(v_item->>'correo_probable_2'), ''));
      r_fuente := nullif(btrim(v_item->>'fuente_patron'), '');
      r_estado := lower(coalesce(nullif(btrim(v_item->>'estado'), ''), CASE WHEN r_ver IS NOT NULL THEN 'verificado' ELSE 'por_verificar' END));
      r_hist := CASE WHEN jsonb_typeof(v_item->'historial') = 'array' THEN v_item->'historial'
                     WHEN v_item ? 'historial' AND v_item->>'historial' IS NOT NULL THEN jsonb_build_array(v_item->'historial')
                     ELSE '[]'::jsonb END;
      r_rel := NULL;
      IF nullif(btrim(v_item->>'relevancia'), '') IS NOT NULL THEN
        IF (v_item->>'relevancia') ~ '^\s*-?\d+(\.\d+)?\s*$' THEN r_rel := (v_item->>'relevancia')::numeric;
        ELSE r_reasons := r_reasons || 'relevancia no numérica'::text; END IF;
      END IF;
      IF r_nombre IS NULL THEN r_reasons := r_reasons || 'falta nombre'::text; END IF;
      IF r_empresa IS NULL THEN r_reasons := r_reasons || 'falta empresa'::text; END IF;
      IF r_li_norm IS NULL AND r_ver IS NULL AND r_p1 IS NULL AND r_p2 IS NULL THEN
        r_reasons := r_reasons || 'se necesita linkedin o algún correo'::text;
      END IF;
      IF r_ver IS NOT NULL AND r_ver !~ v_email_re THEN r_reasons := r_reasons || 'correo_verificado mal formado'::text; END IF;
      IF r_p1 IS NOT NULL AND r_p1 !~ v_email_re THEN r_reasons := r_reasons || 'correo_probable_1 mal formado'::text; END IF;
      IF r_p2 IS NOT NULL AND r_p2 !~ v_email_re THEN r_reasons := r_reasons || 'correo_probable_2 mal formado'::text; END IF;
      IF NOT (r_estado = ANY (v_states)) THEN r_reasons := r_reasons || ('estado no permitido: ' || r_estado); END IF;
      IF r_estado = 'verificado' AND r_ver IS NULL THEN r_reasons := r_reasons || 'estado verificado sin correo_verificado'::text; END IF;
      IF r_ver IS NOT NULL AND r_estado <> 'verificado' THEN r_reasons := r_reasons || 'correo_verificado requiere estado verificado'::text; END IF;
      r_mails := array_remove(ARRAY[r_ver, r_p1, r_p2], NULL);
      IF array_length(r_reasons, 1) IS NULL THEN
        FOREACH m IN ARRAY r_mails LOOP
          IF EXISTS (SELECT 1 FROM bounced_emails WHERE lower(mail) = m) THEN
            r_reasons := r_reasons || ('en lista negra / rebotado: ' || m);
          END IF;
        END LOOP;
      END IF;
      IF array_length(r_reasons, 1) IS NOT NULL THEN
        v_inv := v_inv || jsonb_build_object('index', v_idx, 'nombre', r_nombre, 'empresa', r_empresa, 'motivos', to_jsonb(r_reasons));
        CONTINUE;
      END IF;
      IF r_li_norm IS NOT NULL AND r_li_norm = ANY (v_seen_li) THEN r_match := r_match || 'repetido en el mismo lote (linkedin)'::text; END IF;
      IF r_mails && v_seen_mail THEN r_match := r_match || 'repetido en el mismo lote (correo)'::text; END IF;
      SELECT id INTO r_master FROM agent_prospects
        WHERE (r_li_norm IS NOT NULL AND linkedin_norm = r_li_norm)
           OR lower(correo_verificado) = ANY (r_mails) OR lower(correo_probable_1) = ANY (r_mails) OR lower(correo_probable_2) = ANY (r_mails)
        LIMIT 1;
      IF r_master IS NOT NULL THEN r_match := r_match || 'ya existe en maestro AGENTE 007'::text; END IF;
      IF EXISTS (SELECT 1 FROM delivered_contacts WHERE lower(mail) = ANY (r_mails)) THEN r_match := r_match || 'ya enviado (campañas)'::text; END IF;
      IF EXISTS (SELECT 1 FROM contacts WHERE lower(mail1) = ANY (r_mails) OR lower(mail2) = ANY (r_mails) OR lower(mail3) = ANY (r_mails) OR lower(mail4) = ANY (r_mails)) THEN
        r_match := r_match || 'ya está en una base histórica'::text;
      END IF;
      IF r_li_norm IS NOT NULL THEN v_seen_li := v_seen_li || r_li_norm; END IF;
      v_seen_mail := v_seen_mail || r_mails;
      IF array_length(r_match, 1) IS NOT NULL THEN
        v_rep := v_rep || jsonb_build_object('index', v_idx, 'nombre', r_nombre, 'empresa', r_empresa, 'linkedin', r_li_norm,
                   'coincidencias', to_jsonb(r_match), 'master_id', r_master);
        IF NOT p_dry_run AND r_master IS NOT NULL THEN
          UPDATE agent_prospects SET
            historial = historial || jsonb_build_array(jsonb_build_object('fecha', v_date, 'fuente', c_source, 'evento', 'reaparece', 'cargo', r_cargo, 'empresa', r_empresa)) || r_hist,
            updated_at = now()
          WHERE id = r_master;
        END IF;
        CONTINUE;
      END IF;
      v_new := v_new || jsonb_build_object('index', v_idx, 'nombre', r_nombre, 'cargo', r_cargo, 'empresa', r_empresa, 'industria', r_ind,
        'dominio', coalesce(r_dom, split_part(coalesce(r_ver, r_p1, r_p2, ''), '@', 2)), 'linkedin_url', r_li, 'linkedin_norm', r_li_norm,
        'correo_verificado', r_ver, 'correo_probable_1', r_p1, 'correo_probable_2', r_p2, 'fuente_patron', r_fuente,
        'estado', r_estado, 'relevancia', r_rel, 'historial', r_hist);
    EXCEPTION WHEN OTHERS THEN
      v_err := v_err || jsonb_build_object('index', v_idx, 'error', SQLERRM);
    END;
  END LOOP;

  IF NOT p_dry_run THEN
    IF jsonb_array_length(v_new) > 0 THEN
      INSERT INTO bases (name, raw_count, clean_count) VALUES (v_base_name, jsonb_array_length(v_items), jsonb_array_length(v_new)) RETURNING id INTO v_base_id;
      FOR v_item IN SELECT * FROM jsonb_array_elements(v_new) LOOP
        r_first := split_part(v_item->>'nombre', ' ', 1);
        r_last := nullif(btrim(substr(v_item->>'nombre', length(r_first) + 1)), '');
        INSERT INTO agent_prospects (source, first_seen_date, nombre, cargo, empresa, industria, dominio, linkedin_url, linkedin_norm,
          correo_verificado, correo_probable_1, correo_probable_2, fuente_patron, estado, relevancia, historial, base_id)
        VALUES (c_source, v_date, v_item->>'nombre', v_item->>'cargo', v_item->>'empresa', v_item->>'industria', nullif(v_item->>'dominio',''),
          v_item->>'linkedin_url', v_item->>'linkedin_norm', v_item->>'correo_verificado', v_item->>'correo_probable_1', v_item->>'correo_probable_2',
          v_item->>'fuente_patron', v_item->>'estado', (v_item->>'relevancia')::numeric,
          jsonb_build_array(jsonb_build_object('fecha', v_date, 'fuente', c_source, 'evento', 'importado', 'base', v_base_name)) || (v_item->'historial'),
          v_base_id);
        INSERT INTO contacts (base_id, nombre, apellido, empresa, web, mail1, mail2)
        VALUES (v_base_id, r_first, r_last, upper(v_item->>'empresa'), nullif(v_item->>'dominio',''),
          coalesce(v_item->>'correo_verificado', v_item->>'correo_probable_1', v_item->>'correo_probable_2'),
          CASE WHEN v_item->>'correo_verificado' IS NOT NULL THEN NULL
               WHEN v_item->>'correo_probable_1' IS NOT NULL THEN v_item->>'correo_probable_2' END);
      END LOOP;
    END IF;
  END IF;

  v_result := jsonb_build_object(
    'ok', true, 'source', c_source, 'run_date', v_date, 'dry_run', p_dry_run, 'idempotent_replay', false,
    'base_name', CASE WHEN jsonb_array_length(v_new) > 0 THEN v_base_name END, 'base_id', v_base_id,
    'recibidos', jsonb_array_length(v_items), 'nuevos', jsonb_array_length(v_new), 'repetidos', jsonb_array_length(v_rep),
    'invalidos', jsonb_array_length(v_inv), 'errores', jsonb_array_length(v_err),
    'detalle', jsonb_build_object('nuevos', (SELECT coalesce(jsonb_agg(jsonb_build_object('index', e->'index', 'nombre', e->'nombre', 'empresa', e->'empresa')), '[]'::jsonb) FROM jsonb_array_elements(v_new) e),
                                  'repetidos', v_rep, 'invalidos', v_inv, 'errores', v_err));
  IF NOT p_dry_run THEN
    INSERT INTO agent_import_runs (source, run_date, base_id, result) VALUES (c_source, v_date, v_base_id, v_result);
  END IF;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.agent007_import_prospects(jsonb, boolean, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent007_import_prospects(jsonb, boolean, date) TO service_role;
CREATE INDEX IF NOT EXISTS agent_prospects_base_id_idx ON public.agent_prospects(base_id);
CREATE INDEX IF NOT EXISTS agent_import_runs_base_id_idx ON public.agent_import_runs(base_id);