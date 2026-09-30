# Corregir descarga de rebotados

## Cambios
- Al exportar rebotados, eliminar las columnas `EMAIL` y `ESTADO`; la descarga comenzará en `NOMBRE`.
- Convertir `MAIL1` en el correo nuevo que sí se debe intentar:
  - usar primero `nombre.apellido@dominio`;
  - si ese fue el correo rebotado, usar `inicial.apellido@dominio`.
- Mantener en `MAIL2`, `MAIL3` y `MAIL4` solamente alternativas distintas de `MAIL1` y del correo rebotado.
- Aplicar el mismo orden de columnas y datos tanto al XLSX como a “Copiar para Sheets”.
- Validar con casos del archivo adjunto, incluyendo nombres inválidos, para no generar direcciones defectuosas.

## Resultado esperado
La hoja descargada tendrá: `NOMBRE, APELLIDO, APELLIDO2, EMPRESA, WEB, MAIL1, MAIL2, MAIL3, MAIL4, PESTAÑA`. Ninguna columna mostrará el correo ni el estado que rebotaron.
