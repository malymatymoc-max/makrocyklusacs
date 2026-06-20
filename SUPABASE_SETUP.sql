create table if not exists public.app_state (
  id text primary key,
  updated_at timestamptz not null default now(),
  state jsonb not null
);

insert into public.app_state (id, state)
values (
  'main',
  '{
    "teams": [],
    "seasons": [],
    "periods": [],
    "goals": [],
    "details": [],
    "sessions": [],
    "selectedTeamId": "",
    "selectedSeasonId": "",
    "selectedPeriodId": "all"
  }'::jsonb
)
on conflict (id) do nothing;

alter table public.app_state enable row level security;

drop policy if exists "public app_state read" on public.app_state;
drop policy if exists "public app_state insert" on public.app_state;
drop policy if exists "public app_state update" on public.app_state;

create policy "public app_state read"
on public.app_state
for select
using (true);

create policy "public app_state insert"
on public.app_state
for insert
with check (true);

create policy "public app_state update"
on public.app_state
for update
using (true)
with check (true);
