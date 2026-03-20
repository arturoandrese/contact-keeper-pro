create table public.prospects (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  contact_name text not null,
  email text,
  status text not null default 'no_response' check (status in ('hot','warm','no_for_now','no_response','auto_reply')),
  note text default '',
  industry text,
  referred_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.prospects enable row level security;

create policy "Allow all access to prospects" on public.prospects
  for all to anon, authenticated
  using (true)
  with check (true);
