

# Plan: Sistema de Agenda con Recordatorios y Apertura de Gmail

## Resumen

Crear un sistema de recordatorios que: (1) almacena tareas agendadas en Supabase, (2) muestra los pendientes de hoy con alerta visual, y (3) al hacer click en un recordatorio del día, abre Gmail con un borrador pre-llenado (destinatario + asunto).

## Cambios

### 1. Nueva tabla `scheduled_reminders` (migración SQL)

```sql
create table public.scheduled_reminders (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  subject text default '',
  note text default '',
  scheduled_date date not null,
  status text not null default 'pending',
  created_at timestamptz default now()
);
alter table public.scheduled_reminders enable row level security;
create policy "Allow all on scheduled_reminders" on public.scheduled_reminders
  for all to public using (true) with check (true);
```

### 2. Nuevo componente `ScheduledRemindersPanel.tsx`

- Formulario: email, asunto/nota, fecha (con calendario).
- Lista de recordatorios ordenada por fecha, los de hoy destacados en amarillo.
- Botón "Enviar email" en cada recordatorio de hoy: abre `https://mail.google.com/mail/?view=cm&to={email}&su={subject}` en nueva pestaña (abre Gmail con borrador listo).
- Botón para marcar como "hecho" y botón para borrar.

### 3. Botón borrar en emails sin responder (`UnansweredEmailsAlert.tsx`)

- Agregar botón X en cada email para descartarlo.
- Guardar IDs descartados en `localStorage` para que no reaparezcan.
- Agregar botón de calendario para agendar seguimiento: pre-llena el formulario de la Agenda con email y asunto.

### 4. Navegación (`Index.tsx`)

- Nuevo view `"reminders"` con botón "Agenda" y icono Calendar en la barra.
- Badge con cantidad de pendientes para hoy.

## Flujo del usuario

1. Ve un email sin responder -> puede descartarlo (X) o agendarlo (icono calendario).
2. En "Agenda", crea recordatorios manuales para cualquier contacto.
3. Cuando llega el día, ve el recordatorio destacado y hace click en "Enviar" -> se abre Gmail con el destinatario y asunto pre-cargados, listo para escribir y enviar.
4. Marca como "hecho" cuando ya respondió.

