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