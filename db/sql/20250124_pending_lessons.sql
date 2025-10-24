-- Migration: Create user_pending_lessons table for pre-generated lesson caching
-- This table stores lessons that are generated ahead of time but not yet completed
-- Lessons are removed from this table when completed to free up storage

begin;

-- Create the pending lessons table
create table if not exists public.user_pending_lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject text not null,
  topic_label text not null,
  lesson jsonb not null,
  model_speed text not null check (model_speed in ('fast', 'slow')),
  generation_tier text not null check (generation_tier in ('free', 'plus', 'premium')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create indexes for efficient querying
create index if not exists user_pending_lessons_user_subject_idx
  on public.user_pending_lessons (user_id, subject);

create index if not exists user_pending_lessons_position_idx
  on public.user_pending_lessons (user_id, subject, position asc);

create index if not exists user_pending_lessons_created_idx
  on public.user_pending_lessons (user_id, created_at desc);

-- Unique constraint: one lesson per user/subject/position
create unique index if not exists user_pending_lessons_unique_position_idx
  on public.user_pending_lessons (user_id, subject, position);

-- Enable row level security
alter table public.user_pending_lessons enable row level security;

-- Drop existing policies if any
drop policy if exists "Users read own pending lessons" on public.user_pending_lessons;
drop policy if exists "Users insert own pending lessons" on public.user_pending_lessons;
drop policy if exists "Users update own pending lessons" on public.user_pending_lessons;
drop policy if exists "Users delete own pending lessons" on public.user_pending_lessons;

-- Create RLS policies
create policy "Users read own pending lessons"
  on public.user_pending_lessons
  for select
  using (auth.uid() = user_id);

create policy "Users insert own pending lessons"
  on public.user_pending_lessons
  for insert
  with check (auth.uid() = user_id);

create policy "Users update own pending lessons"
  on public.user_pending_lessons
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own pending lessons"
  on public.user_pending_lessons
  for delete
  using (auth.uid() = user_id);

commit;
