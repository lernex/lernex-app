begin;

create extension if not exists "vector";

create table if not exists public.user_topic_lesson_cache (
  user_id uuid not null references auth.users (id) on delete cascade,
  subject text not null,
  topic_label text not null,
  lessons jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, subject, topic_label)
);

create index if not exists user_topic_lesson_cache_updated_idx
  on public.user_topic_lesson_cache (user_id, updated_at desc);

alter table public.user_topic_lesson_cache enable row level security;

drop policy if exists "Users manage own topic lesson cache" on public.user_topic_lesson_cache;

create policy "Users read own topic lesson cache"
  on public.user_topic_lesson_cache
  for select
  using (auth.uid() = user_id);

create policy "Users upsert own topic lesson cache"
  on public.user_topic_lesson_cache
  for insert
  with check (auth.uid() = user_id);

create policy "Users update own topic lesson cache"
  on public.user_topic_lesson_cache
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own topic lesson cache"
  on public.user_topic_lesson_cache
  for delete
  using (auth.uid() = user_id);

create table if not exists public.user_subject_preferences (
  user_id uuid not null references auth.users (id) on delete cascade,
  subject text not null,
  liked_ids text[] not null default array[]::text[],
  disliked_ids text[] not null default array[]::text[],
  saved_ids text[] not null default array[]::text[],
  tone_tags text[] not null default array[]::text[],
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, subject)
);

create index if not exists user_subject_preferences_updated_idx
  on public.user_subject_preferences (user_id, updated_at desc);

alter table public.user_subject_preferences enable row level security;

drop policy if exists "Users manage own subject preferences" on public.user_subject_preferences;

create policy "Users read own subject preferences"
  on public.user_subject_preferences
  for select
  using (auth.uid() = user_id);

create policy "Users upsert own subject preferences"
  on public.user_subject_preferences
  for insert
  with check (auth.uid() = user_id);

create policy "Users update own subject preferences"
  on public.user_subject_preferences
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own subject preferences"
  on public.user_subject_preferences
  for delete
  using (auth.uid() = user_id);

create table if not exists public.user_subject_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  subject text not null,
  topic_idx integer,
  subtopic_idx integer,
  delivered_mini integer,
  delivered_by_topic jsonb not null default '{}'::jsonb,
  delivered_ids_by_topic jsonb not null default '{}'::jsonb,
  delivered_titles_by_topic jsonb not null default '{}'::jsonb,
  completion_map jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, subject)
);

create index if not exists user_subject_progress_updated_idx
  on public.user_subject_progress (user_id, updated_at desc);

alter table public.user_subject_progress enable row level security;

drop policy if exists "Users manage own subject progress" on public.user_subject_progress;

create policy "Users read own subject progress"
  on public.user_subject_progress
  for select
  using (auth.uid() = user_id);

create policy "Users upsert own subject progress"
  on public.user_subject_progress
  for insert
  with check (auth.uid() = user_id);

create policy "Users update own subject progress"
  on public.user_subject_progress
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own subject progress"
  on public.user_subject_progress
  for delete
  using (auth.uid() = user_id);

create table if not exists public.course_outline_cache (
  subject text not null,
  course text not null,
  outline jsonb not null,
  embedding vector(1536),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (subject, course)
);

create index if not exists course_outline_cache_updated_idx
  on public.course_outline_cache (updated_at desc);

alter table public.course_outline_cache enable row level security;

drop policy if exists "Service role manages course outlines" on public.course_outline_cache;
drop policy if exists "Authenticated read course outlines" on public.course_outline_cache;

create policy "Authenticated read course outlines"
  on public.course_outline_cache
  for select
  using (auth.role() = 'authenticated' or auth.role() = 'service_role');

create policy "Service role manages course outlines"
  on public.course_outline_cache
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create or replace function public.apply_user_subject_progress_patch(
  p_subject text,
  p_topic_idx integer default null,
  p_subtopic_idx integer default null,
  p_delivered_mini integer default null,
  p_delivered_patch jsonb default '{}'::jsonb,
  p_id_patch jsonb default '{}'::jsonb,
  p_title_patch jsonb default '{}'::jsonb,
  p_completion_patch jsonb default '{}'::jsonb,
  p_metrics jsonb default '{}'::jsonb
)
returns public.user_subject_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_result public.user_subject_progress%rowtype;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'apply_user_subject_progress_patch requires auth context';
  end if;

  insert into public.user_subject_progress as usp (
    user_id,
    subject,
    topic_idx,
    subtopic_idx,
    delivered_mini,
    delivered_by_topic,
    delivered_ids_by_topic,
    delivered_titles_by_topic,
    completion_map,
    metrics
  )
  values (
    v_user_id,
    p_subject,
    p_topic_idx,
    p_subtopic_idx,
    p_delivered_mini,
    coalesce(nullif(p_delivered_patch, '{}'::jsonb), '{}'::jsonb),
    coalesce(nullif(p_id_patch, '{}'::jsonb), '{}'::jsonb),
    coalesce(nullif(p_title_patch, '{}'::jsonb), '{}'::jsonb),
    coalesce(nullif(p_completion_patch, '{}'::jsonb), '{}'::jsonb),
    coalesce(nullif(p_metrics, '{}'::jsonb), '{}'::jsonb)
  )
  on conflict (user_id, subject)
  do update set
    topic_idx = coalesce(excluded.topic_idx, usp.topic_idx),
    subtopic_idx = coalesce(excluded.subtopic_idx, usp.subtopic_idx),
    delivered_mini = coalesce(excluded.delivered_mini, usp.delivered_mini),
    delivered_by_topic = case
      when coalesce(p_delivered_patch, '{}'::jsonb) = '{}'::jsonb then usp.delivered_by_topic
      else jsonb_strip_nulls(usp.delivered_by_topic || coalesce(p_delivered_patch, '{}'::jsonb))
    end,
    delivered_ids_by_topic = case
      when coalesce(p_id_patch, '{}'::jsonb) = '{}'::jsonb then usp.delivered_ids_by_topic
      else jsonb_strip_nulls(usp.delivered_ids_by_topic || coalesce(p_id_patch, '{}'::jsonb))
    end,
    delivered_titles_by_topic = case
      when coalesce(p_title_patch, '{}'::jsonb) = '{}'::jsonb then usp.delivered_titles_by_topic
      else jsonb_strip_nulls(usp.delivered_titles_by_topic || coalesce(p_title_patch, '{}'::jsonb))
    end,
    completion_map = case
      when coalesce(p_completion_patch, '{}'::jsonb) = '{}'::jsonb then usp.completion_map
      else jsonb_strip_nulls(usp.completion_map || coalesce(p_completion_patch, '{}'::jsonb))
    end,
    metrics = case
      when coalesce(p_metrics, '{}'::jsonb) = '{}'::jsonb then usp.metrics
      else jsonb_strip_nulls(usp.metrics || coalesce(p_metrics, '{}'::jsonb))
    end,
    updated_at = now()
  returning * into v_result;

  return v_result;
end;
$$;

grant execute on function public.apply_user_subject_progress_patch(text, integer, integer, integer, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;

commit;
