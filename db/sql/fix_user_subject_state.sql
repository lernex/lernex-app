-- Migration to create user_subject_state table with RLS policies
-- This table was previously missing from the SQL migrations

begin;

-- Create the table if it doesn't exist
create table if not exists public.user_subject_state (
  user_id uuid not null references auth.users (id) on delete cascade,
  subject text not null,
  course text not null,
  mastery numeric,
  difficulty text not null default 'intro' check (difficulty in ('intro', 'easy', 'medium', 'hard')),
  next_topic text,
  path jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, subject)
);

-- Create index for better query performance
create index if not exists user_subject_state_updated_idx
  on public.user_subject_state (user_id, updated_at desc);

-- Enable row level security
alter table public.user_subject_state enable row level security;

-- Drop existing policies if they exist (cleanup)
drop policy if exists "Users manage own subject state" on public.user_subject_state;
drop policy if exists "Users read own subject state" on public.user_subject_state;
drop policy if exists "Users insert own subject state" on public.user_subject_state;
drop policy if exists "Users update own subject state" on public.user_subject_state;
drop policy if exists "Users delete own subject state" on public.user_subject_state;

-- Create RLS policies
create policy "Users read own subject state"
  on public.user_subject_state
  for select
  using (auth.uid() = user_id);

create policy "Users insert own subject state"
  on public.user_subject_state
  for insert
  with check (auth.uid() = user_id);

create policy "Users update own subject state"
  on public.user_subject_state
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own subject state"
  on public.user_subject_state
  for delete
  using (auth.uid() = user_id);

commit;
