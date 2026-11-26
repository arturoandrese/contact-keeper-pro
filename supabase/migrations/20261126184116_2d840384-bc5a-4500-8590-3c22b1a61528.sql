INSERT INTO public.bases (id, name, raw_count, clean_count, created_at)
SELECT 'd88ddd05-f4bc-41af-9fa9-bb44dfb4804b'::uuid, 'AGENTE 007 - 2026-11-26', 20, 18, '2026-11-26 17:31:10.116578+00'
WHERE NOT EXISTS (SELECT 1 FROM public.bases WHERE id = 'd88ddd05-f4bc-41af-9fa9-bb44dfb4804b');

WITH split(pid, n, a1, a2) AS (VALUES
 ('008a1b4c-b541-40cf-b674-ba3f17bd388b'::uuid, 'Francesca', 'Pezzuto', 'Schmidt'),
 ('034cb434-1b77-4916-a86c-a1ef6b81c9f8'::uuid, 'Francisca', 'Muñoz', 'Aballay'),
 ('171c896d-5a89-4457-94cc-b0b866419882'::uuid, 'Agustín', 'Orezzoli', NULL),
 ('1e6fe174-b02a-4de8-8e4b-ef4f083d3b95'::uuid, 'Gabriela', 'Navarro', 'Young'),
 ('29bd87d5-b7d8-4b42-a36c-732629a6ce6f'::uuid, 'Verónica', 'Agass', NULL),
 ('300d5a92-a6b9-4ee0-b1c3-743aefee0db9'::uuid, 'Ana Maria', 'Tagle', 'Subercaseaux'),
 ('4cbac9ae-df16-4005-9b51-4555e813b939'::uuid, 'Eduardo', 'Ramírez', 'Camps'),
 ('5548ec42-5444-4897-b19f-ec2a094fd3a3'::uuid, 'Jose Pedro', 'Hargous', NULL),
 ('56cdcfa3-90e8-4363-99a2-9cb15c8d91d2'::uuid, 'Roberto', 'Guzmán', NULL),
 ('6e252d67-095b-4955-9d74-815935c8cc0f'::uuid, 'Ana', 'Díaz', 'Rojas'),
 ('70f20f4f-da42-419c-b9b5-1058ba6ef91c'::uuid, 'Benjamín', 'Saldivia', 'Jarpa'),
 ('9d848180-2a57-48e5-8977-4ee4e7869745'::uuid, 'Carlos Ignacio', 'Infante', 'Marinovic'),
 ('a024082c-05f8-4947-905a-14358ed222d1'::uuid, 'Ana Pierina', 'López', 'Chivilo'),
 ('af3cc407-e854-4155-81c8-dd85f3505bb0'::uuid, 'Paula', 'Guajardo', 'Perales'),
 ('cab74fac-1f7f-4c5f-a7b6-faae335984a8'::uuid, 'Jacqueline Alejandra', 'Hernandez', 'Montenegro'),
 ('cb9ca0b4-3835-4c34-a6d2-c49f85fea3d2'::uuid, 'Sofía', 'Robinson', NULL),
 ('cedaa6b4-44bf-405b-9aa0-2cf114f5d500'::uuid, 'Camila', 'Salas', 'Ramos'),
 ('e14df46a-1b2f-426f-9df5-3424ea3265b7'::uuid, 'José Antonio', 'Pérez-Cotapos', 'Gálmez')
)
INSERT INTO public.contacts (base_id, nombre, apellido, apellido2, empresa, web, mail1, mail2, created_at)
SELECT 'd88ddd05-f4bc-41af-9fa9-bb44dfb4804b'::uuid, s.n, s.a1, s.a2, upper(p.empresa), p.dominio,
       lower(coalesce(p.correo_verificado, p.correo_probable_1)),
       CASE WHEN lower(p.correo_probable_2) IS DISTINCT FROM lower(coalesce(p.correo_verificado, p.correo_probable_1)) THEN lower(p.correo_probable_2) END,
       '2026-11-26 17:31:10.116578+00'
FROM split s JOIN public.agent_prospects p ON p.id = s.pid
WHERE NOT EXISTS (
  SELECT 1 FROM public.contacts c
  WHERE lower(c.mail1) = lower(coalesce(p.correo_verificado, p.correo_probable_1))
     OR lower(c.mail2) = lower(coalesce(p.correo_verificado, p.correo_probable_1))
);

UPDATE public.agent_prospects SET base_id = 'd88ddd05-f4bc-41af-9fa9-bb44dfb4804b', updated_at = now()
WHERE source = 'AGENTE 007' AND first_seen_date = '2026-11-26' AND base_id IS NULL;

UPDATE public.agent_import_runs SET base_id = 'd88ddd05-f4bc-41af-9fa9-bb44dfb4804b'
WHERE source = 'AGENTE 007' AND run_date = '2026-11-26' AND base_id IS NULL;