DO $do$
DECLARE d text; o text;
  reps text[][] := ARRAY[
    [$q$r_fn text; r_ln text;$q$, $q$r_fn text; r_ln text; r_cn text; r_ca1 text; r_ca2 text;$q$],
    [$q$      r_cargo := nullif(btrim(v_item->>'cargo'), '');$q$, $q$      r_cn := nullif(btrim(v_item->>'nombre_ccp'), '');
      r_ca1 := nullif(btrim(v_item->>'apellido_ccp'), '');
      r_ca2 := nullif(btrim(v_item->>'apellido2_ccp'), '');
      r_cargo := nullif(btrim(v_item->>'cargo'), '');$q$],
    [$q$r_fn := regexp_replace(split_part(coalesce(r_nkey,''), ' ', 1), '[^a-z0-9]', '', 'g');$q$, $q$r_fn := regexp_replace(split_part(coalesce(agent007_norm(r_cn), r_nkey, ''), ' ', 1), '[^a-z0-9]', '', 'g');$q$],
    [$q$r_ln := regexp_replace(split_part(coalesce(r_nkey,''), ' ', 2), '[^a-z0-9]', '', 'g');$q$, $q$r_ln := CASE WHEN r_ca1 IS NOT NULL THEN regexp_replace(coalesce(agent007_norm(r_ca1), ''), '[^a-z0-9]', '', 'g') ELSE regexp_replace(split_part(coalesce(r_nkey,''), ' ', 2), '[^a-z0-9]', '', 'g') END;$q$],
    [$q$IF r_conf >= 2 AND r_nkey !~ '^\S+ \S+ ' THEN$q$, $q$IF r_conf >= 2 AND (r_ca1 IS NOT NULL OR r_nkey !~ '^\S+ \S+ ') THEN$q$],
    [$q$'estado', r_estado, 'relevancia', r_rel, 'historial', r_hist, 'advertencias', to_jsonb(r_warn));$q$, $q$'estado', r_estado, 'relevancia', r_rel, 'historial', r_hist, 'advertencias', to_jsonb(r_warn),
        'nombre_ccp', r_cn, 'apellido_ccp', r_ca1, 'apellido2_ccp', r_ca2);$q$]
  ];
  i int; s int; e int;
BEGIN
  d := pg_get_functiondef('public.agent007_import_prospects(jsonb,boolean,date)'::regprocedure);
  FOR i IN 1..array_length(reps,1) LOOP
    IF position(reps[i][1] in d) = 0 THEN RAISE EXCEPTION 'patch % not found', i; END IF;
    d := replace(d, reps[i][1], reps[i][2]);
  END LOOP;
  s := position('        INSERT INTO contacts (base_id' in d);
  IF s = 0 THEN RAISE EXCEPTION 'insert not found'; END IF;
  e := s + position('      END LOOP;' in substr(d, s)) - 1;
  d := substr(d, 1, s - 1) || $q$        r_mails := array_remove(ARRAY[v_item->>'correo_verificado', v_item->>'correo_probable_1', v_item->>'correo_probable_2'], NULL);
        r_mails := ARRAY(SELECT x FROM unnest(r_mails) WITH ORDINALITY u(x, o) GROUP BY x ORDER BY min(o));
        INSERT INTO contacts (base_id, nombre, apellido, apellido2, empresa, web, mail1, mail2, mail3)
        VALUES (v_base_id, coalesce(v_item->>'nombre_ccp', r_first), coalesce(v_item->>'apellido_ccp', r_last), v_item->>'apellido2_ccp',
          upper(v_item->>'empresa'), nullif(v_item->>'dominio',''), r_mails[1], r_mails[2], r_mails[3]);
$q$ || substr(d, e);
  EXECUTE d;
END $do$;