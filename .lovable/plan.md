# CCP — Envío automático inteligente (Mi correo)

Sistema que toma los contactos del Agente 007, decide quién puede recibir correo, lo personaliza y lo envía solo, de lunes a viernes de 10:00 a 12:00 (hora de Chile), máximo 20 al día, desde Arturo Erlwein <arturo@estudio.huau.cl>. **Parte pausado.** Se activa solo cuando tú lo enciendas.

## Fases (se entregan en este orden, cada una probada antes de seguir)

**Fase 1: Conexión Gmail en el servidor**
- Gmail queda conectado al servidor con el conector oficial de Gmail en Lovable (cuenta arturo@huau.cl). Así sigue funcionando con el computador apagado y la llave nunca llega al navegador.
- El sistema revisa que el alias arturo@estudio.huau.cl esté autorizado y lee su firma (con logo) desde Gmail. Si el alias falta, no envía. Nunca usa otro remitente.
- Permisos: leer, enviar y leer la configuración del alias. Nada más.

**Fase 2: Datos y reglas (sin enviar nada)**
- Tablas nuevas, todas cerradas con el PIN: configuración, plantillas, empresas protegidas, contactos protegidos, cola, historial de envíos, registro de actividad y nombres cortos de empresa (se reutiliza `company_industries` si sirve).
- Mall Plaza entra de entrada como empresa protegida (dominios mallplaza.cl / mallplaza.com).
- Plantillas de presentación y de reactivación con el texto exacto que enviaste, los reels como enlaces de texto, y la firma al final.
- Nombre de saludo = campo NOMBRE de CCP tal cual ("Juan José", "María Ignacia", "Eduardo"). Empresa corta = corrección manual guardada, si no la limpieza existente de CCP. Si falta alguna variable, el contacto queda "Pendiente de revisión" y no se envía.

**Fase 3: Análisis comercial antes de enviar**
Para cada contacto se revisan, en este orden y el primer bloqueo gana:
1. Empresas protegidas (nombre, razón social, dominio y variantes), con prioridad absoluta.
2. Contactos protegidos (correo, LinkedIn, nombre y apellido).
3. Lista negra, rebotes y "no contactar".
4. CRM, enviados, respondidos y bases históricas (solo lectura).
5. Gmail: búsqueda de conversaciones con su correo y con su dominio, desde todos los remitentes de la cuenta. Solo se leen asunto, fecha y un fragmento corto. Nada de conversaciones completas.
6. Clasificación con IA (Lovable AI): Nuevo, Sin respuesta, Antiguo, Negociación activa, Cliente actual, Estratégico, No contactar o Dudoso. Una respuesta de cortesía no cuenta como negociación.
- Envía: Nuevo (presentación); Sin respuesta y Antiguo (reactivación, después de 90 días).
- Bloquea: los demás. Dudoso queda en revisión.
- Cada decisión guarda su motivo, visible en pantalla.
- Si Gmail o la IA fallan, no se envía.
- Sugiere empresas para proteger según Gmail y CRM. Solo las agrega si tú lo apruebas.

**Fase 4: Cola y envío automático**
- Tarea programada en el servidor que revisa cada 15 minutos y solo actúa dentro del horario: lunes a viernes, 10:00 a 12:00 de Chile. Son 96 revisiones al día, con costo mínimo. Fuera del horario no hace nada.
- Correos espaciados según el intervalo que configures. El tope diario cuenta todo, también los reintentos a MAIL2.
- Justo antes de cada envío se vuelven a revisar todas las exclusiones. Cada contacto se envía una sola vez (protección contra duplicados y bloqueo de concurrencia).
- MAIL2 solo se usa si MAIL1 rebota por dirección inexistente y pasa todas las revisiones de nuevo. Nunca a los dos a la vez.
- Los correos quedan en Enviados. Las respuestas, los rebotes y las peticiones de "no contactar" se detectan y actualizan el historial, el CRM (solo sube de estado, como ahora) y cancelan seguimientos pendientes.
- Freno automático ante errores de acceso a Gmail, límites de Gmail o demasiados rebotes (más de 3 en el día). En ese caso pasa a "Pausado".
- Lo que no alcance a enviarse hoy queda para el siguiente día hábil.

**Fase 5: Pantallas en "Mi correo"** (mismo estilo de CCP)
Resumen (panel con las cifras pedidas, próximo envío y actividad), Envío automático (interruptor Activo/Pausado/Detenido), Plantillas (edición y vista previa con un contacto real), Cola, Historial (con motivo y estado), Empresas protegidas, Contactos protegidos y Configuración. Botón "Proteger" en CRM, BBD y Agentes.

**Fase 6: Pruebas y publicación**
- Análisis en seco del lote real del 26-11 (sin enviar).
- Mall Plaza queda excluido, las negociaciones activas quedan bloqueadas y los nombres compuestos y cortos se ven bien.
- Un solo correo de prueba a arturo@huau.cl. Verificamos juntos que llegó a Enviados y que la firma está bien.
- Prueba de tope diario, duplicados y pausa.
- Publicación como V2.0.0 con el envío **pausado**.

## Qué necesito de ti durante el trabajo
- Aprobar la conexión de Gmail en la tarjeta que aparecerá (cuenta arturo@huau.cl).
- Confirmar el correo de prueba cuando llegue.

## Detalles técnicos
- Gmail mediante el conector de Gmail de Lovable (gateway): `users/me/settings/sendAs` para el alias y la firma, `messages/send` con MIME HTML y cabecera From del alias, búsquedas por lotes. Se reemplaza el token del navegador solo para el envío automático. La sincronización manual actual no cambia.
- Funciones nuevas: `autosend-analyze`, `autosend-tick` (llamada por pg_cron cada 15 min, ventana revisada con la zona America/Santiago), `autosend-admin` (pantallas, con `requireOwner`) y `autosend-optout`. El enlace para pedir no contactar va firmado con HMAC (secreto generado).
- Tablas con RLS `private.is_ccp_owner()` y sin permisos para anon. Claim de la cola con `FOR UPDATE SKIP LOCKED` y clave única (contact, campaign) para la idempotencia.
- IA: Lovable AI Gateway desde la función del servidor, con salida estructurada (categoría, confianza y motivo).
- No se tocan bases históricas, la seguridad del PIN ni el importador del 007.
