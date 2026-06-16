Plan de corrección

1. Quitar el filtro que está eliminando personas solo porque ya existen en otra base
- El problema principal está en `src/pages/Index.tsx`: el bloque `filterDuplicates` consulta la tabla `contacts` y elimina cualquier contacto cuyo `MAIL1` ya exista en cualquier base guardada.
- Eso está mal para tu caso: una persona puede estar cargada en otra base pero no enviada, o estar en una base como `16-06-26_09-46_claud_02` y aun así debe volver a salir si no fue enviada/respondida.
- Voy a cambiar ese filtro para que no reduzca la base por existencia en `contacts`. Los filtros válidos seguirán siendo: rebotados, enviados recientes y respondidos recientes.

2. Mantener a la persona y cambiarle el correo si el patrón rebotó
- Si un mail o patrón del dominio ya rebotó, la persona no se elimina.
- Se reordenan `MAIL1-4` para dejar como `MAIL1` una alternativa que no esté en `bounced_emails`.
- Si existe patrón histórico de empresa, se usa, pero nunca si ese patrón está marcado como rebotado para ese dominio.

3. Usar historial de empresa sin bloquear por “base ya cargada”
- Para empresas conocidas, se seguirá aprendiendo desde `domain_patterns`, `delivered_contacts` y `bounced_emails`.
- Si una empresa ya existe en bases anteriores, eso solo servirá para aprender patrón, no para sacar personas de la salida.

4. Ajustar el diálogo de filtros para evitar esta confusión
- Cambiaré el filtro “Excluir duplicados entre bases” para que no venga activado por defecto o lo retiraré del flujo principal de limpieza.
- Así la base adjunta debería volver cercana a sus 1092 filas válidas, descontando solo rebotados sin alternativa, enviados recientes y respondidos reales.

5. Validación con tu Excel
- Probaré localmente el archivo adjunto `prueba-4.xlsx/prueba.xlsx`.
- Verificaré específicamente que Tatiana Riesle salga en el resultado y que no salga con el mail rebotado, sino con una alternativa no rebotada.