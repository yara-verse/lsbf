-- LSBF Advisor: one row of saved app data per signed-in student.
-- Run this once in Supabase: SQL Editor → New query → paste → Run.

create table if not exists public.advisor_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.advisor_state enable row level security;

drop policy if exists "Read own state"   on public.advisor_state;
drop policy if exists "Insert own state" on public.advisor_state;
drop policy if exists "Update own state" on public.advisor_state;
drop policy if exists "Delete own state" on public.advisor_state;

create policy "Read own state"   on public.advisor_state for select using (auth.uid() = user_id);
create policy "Insert own state" on public.advisor_state for insert with check (auth.uid() = user_id);
create policy "Update own state" on public.advisor_state for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Delete own state" on public.advisor_state for delete using (auth.uid() = user_id);
