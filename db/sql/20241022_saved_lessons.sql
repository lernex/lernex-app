begin;

-- Table to store full saved lesson data
create table if not exists public.saved_lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id text not null,
  subject text not null,
  topic text,
  title text not null,
  content text not null,
  difficulty text,
  questions jsonb not null default '[]'::jsonb,
  context jsonb,
  knowledge jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, lesson_id)
);

create index if not exists saved_lessons_user_id_idx
  on public.saved_lessons (user_id, created_at desc);

create index if not exists saved_lessons_subject_idx
  on public.saved_lessons (user_id, subject);

alter table public.saved_lessons enable row level security;

drop policy if exists "Users read own saved lessons" on public.saved_lessons;
drop policy if exists "Users insert own saved lessons" on public.saved_lessons;
drop policy if exists "Users delete own saved lessons" on public.saved_lessons;

create policy "Users read own saved lessons"
  on public.saved_lessons
  for select
  using (auth.uid() = user_id);

create policy "Users insert own saved lessons"
  on public.saved_lessons
  for insert
  with check (auth.uid() = user_id);

create policy "Users delete own saved lessons"
  on public.saved_lessons
  for delete
  using (auth.uid() = user_id);

commit;
