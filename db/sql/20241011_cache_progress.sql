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
drop policy if exists "Users read own topic lesson cache" on public.user_topic_lesson_cache;
drop policy if exists "Users upsert own topic lesson cache" on public.user_topic_lesson_cache;
drop policy if exists "Users update own topic lesson cache" on public.user_topic_lesson_cache;
drop policy if exists "Users delete own topic lesson cache" on public.user_topic_lesson_cache;

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
drop policy if exists "Users read own subject preferences" on public.user_subject_preferences;
drop policy if exists "Users upsert own subject preferences" on public.user_subject_preferences;
drop policy if exists "Users update own subject preferences" on public.user_subject_preferences;
drop policy if exists "Users delete own subject preferences" on public.user_subject_preferences;

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
drop policy if exists "Users read own subject progress" on public.user_subject_progress;
drop policy if exists "Users upsert own subject progress" on public.user_subject_progress;
drop policy if exists "Users update own subject progress" on public.user_subject_progress;
drop policy if exists "Users delete own subject progress" on public.user_subject_progress;

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
  p_delivered_mini_delta integer default null,
  p_delivered_delta jsonb default '{}'::jsonb,
  p_id_append jsonb default '{}'::jsonb,
  p_title_append jsonb default '{}'::jsonb,
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
  v_entry record;
  v_new_total bigint;
  v_existing_ids text[];
  v_new_ids text[];
  v_existing_titles text[];
  v_new_titles text[];
  v_candidate text;
  v_idx integer;
  v_count integer;
  v_len integer;
  max_id_count constant integer := 50;
  max_title_count constant integer := 50;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'apply_user_subject_progress_patch requires auth context';
  end if;

  select *
    into v_result
    from public.user_subject_progress
    where user_id = v_user_id
      and subject = p_subject
    for update;

  if not found then
    insert into public.user_subject_progress (
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
      coalesce(p_delivered_mini, 0),
      '{}'::jsonb,
      '{}'::jsonb,
      '{}'::jsonb,
      '{}'::jsonb,
      '{}'::jsonb
    )
    returning * into v_result;
  end if;

  if p_topic_idx is not null then
    v_result.topic_idx := p_topic_idx;
  end if;

  if p_subtopic_idx is not null then
    v_result.subtopic_idx := p_subtopic_idx;
  end if;

  v_result.delivered_mini := coalesce(v_result.delivered_mini, 0);
  v_result.delivered_by_topic := coalesce(v_result.delivered_by_topic, '{}'::jsonb);
  v_result.delivered_ids_by_topic := coalesce(v_result.delivered_ids_by_topic, '{}'::jsonb);
  v_result.delivered_titles_by_topic := coalesce(v_result.delivered_titles_by_topic, '{}'::jsonb);
  v_result.completion_map := coalesce(v_result.completion_map, '{}'::jsonb);
  v_result.metrics := coalesce(v_result.metrics, '{}'::jsonb);

  if p_delivered_mini_delta is not null then
    v_result.delivered_mini := greatest(0, v_result.delivered_mini + p_delivered_mini_delta);
  end if;

  if p_delivered_mini is not null then
    v_result.delivered_mini := greatest(0, p_delivered_mini);
  end if;

  if jsonb_typeof(coalesce(p_delivered_delta, '{}'::jsonb)) = 'object' then
    for v_entry in
      select key, value
      from jsonb_each(coalesce(p_delivered_delta, '{}'::jsonb))
    loop
      if jsonb_typeof(v_entry.value) <> 'number' then
        continue;
      end if;
      v_new_total := coalesce((v_result.delivered_by_topic ->> v_entry.key)::bigint, 0)
        + ((v_entry.value)::text)::bigint;
      if v_new_total < 0 then
        v_new_total := 0;
      end if;
      v_result.delivered_by_topic := jsonb_set(
        v_result.delivered_by_topic,
        ARRAY[v_entry.key],
        to_jsonb(v_new_total),
        true
      );
    end loop;
    v_result.delivered_by_topic := jsonb_strip_nulls(v_result.delivered_by_topic);
  end if;

  if jsonb_typeof(coalesce(p_id_append, '{}'::jsonb)) = 'object' then
    for v_entry in
      select key, value
      from jsonb_each(coalesce(p_id_append, '{}'::jsonb))
    loop
      if jsonb_typeof(v_entry.value) <> 'array' then
        continue;
      end if;

      select coalesce(array_agg(elem), ARRAY[]::text[])
        into v_existing_ids
        from (
          select btrim(elem.value) as elem
          from jsonb_array_elements_text(coalesce(v_result.delivered_ids_by_topic -> v_entry.key, '[]'::jsonb)) elem
          where btrim(elem.value) <> ''
        ) existing;

      select coalesce(array_agg(elem), ARRAY[]::text[])
        into v_new_ids
        from (
          select btrim(elem.value) as elem
          from jsonb_array_elements_text(v_entry.value) elem
          where btrim(elem.value) <> ''
        ) incoming;

      v_count := array_length(v_new_ids, 1);
      if v_count is null then
        continue;
      end if;

      v_existing_ids := coalesce(v_existing_ids, ARRAY[]::text[]);
      for v_idx in 1..v_count loop
        v_candidate := v_new_ids[v_idx];
        if v_candidate is null or v_candidate = '' then
          continue;
        end if;
        v_existing_ids := array_remove(v_existing_ids, v_candidate);
        v_existing_ids := v_existing_ids || v_candidate;
      end loop;

      v_len := coalesce(array_length(v_existing_ids, 1), 0);
      if v_len > max_id_count then
        v_existing_ids := v_existing_ids[v_len - max_id_count + 1 : v_len];
      end if;

      v_result.delivered_ids_by_topic := jsonb_set(
        v_result.delivered_ids_by_topic,
        ARRAY[v_entry.key],
        to_jsonb(coalesce(v_existing_ids, ARRAY[]::text[])),
        true
      );
    end loop;
    v_result.delivered_ids_by_topic := jsonb_strip_nulls(v_result.delivered_ids_by_topic);
  end if;

  if jsonb_typeof(coalesce(p_title_append, '{}'::jsonb)) = 'object' then
    for v_entry in
      select key, value
      from jsonb_each(coalesce(p_title_append, '{}'::jsonb))
    loop
      if jsonb_typeof(v_entry.value) <> 'array' then
        continue;
      end if;

      select coalesce(array_agg(elem), ARRAY[]::text[])
        into v_existing_titles
        from (
          select btrim(elem.value) as elem
          from jsonb_array_elements_text(coalesce(v_result.delivered_titles_by_topic -> v_entry.key, '[]'::jsonb)) elem
          where btrim(elem.value) <> ''
        ) existing_titles;

      select coalesce(array_agg(elem), ARRAY[]::text[])
        into v_new_titles
        from (
          select btrim(elem.value) as elem
          from jsonb_array_elements_text(v_entry.value) elem
          where btrim(elem.value) <> ''
        ) incoming_titles;

      v_count := array_length(v_new_titles, 1);
      if v_count is null then
        continue;
      end if;

      v_existing_titles := coalesce(v_existing_titles, ARRAY[]::text[]);
      for v_idx in 1..v_count loop
        v_candidate := v_new_titles[v_idx];
        if v_candidate is null or v_candidate = '' then
          continue;
        end if;
        v_existing_titles := array_remove(v_existing_titles, v_candidate);
        v_existing_titles := v_existing_titles || v_candidate;
      end loop;

      v_len := coalesce(array_length(v_existing_titles, 1), 0);
      if v_len > max_title_count then
        v_existing_titles := v_existing_titles[v_len - max_title_count + 1 : v_len];
      end if;

      v_result.delivered_titles_by_topic := jsonb_set(
        v_result.delivered_titles_by_topic,
        ARRAY[v_entry.key],
        to_jsonb(coalesce(v_existing_titles, ARRAY[]::text[])),
        true
      );
    end loop;
    v_result.delivered_titles_by_topic := jsonb_strip_nulls(v_result.delivered_titles_by_topic);
  end if;

  if jsonb_typeof(coalesce(p_completion_patch, '{}'::jsonb)) = 'object' then
    for v_entry in
      select key, value
      from jsonb_each(coalesce(p_completion_patch, '{}'::jsonb))
    loop
      if jsonb_typeof(v_entry.value) not in ('boolean', 'null') then
        continue;
      end if;
      if jsonb_typeof(v_entry.value) = 'null' then
        v_result.completion_map := v_result.completion_map - v_entry.key;
      else
        v_result.completion_map := jsonb_set(
          v_result.completion_map,
          ARRAY[v_entry.key],
          v_entry.value,
          true
        );
      end if;
    end loop;
    v_result.completion_map := jsonb_strip_nulls(v_result.completion_map);
  end if;

  if jsonb_typeof(coalesce(p_metrics, '{}'::jsonb)) = 'object' then
    v_result.metrics := jsonb_strip_nulls(v_result.metrics || coalesce(p_metrics, '{}'::jsonb));
  end if;

  v_result.updated_at := now();

  update public.user_subject_progress
     set topic_idx = v_result.topic_idx,
         subtopic_idx = v_result.subtopic_idx,
         delivered_mini = v_result.delivered_mini,
         delivered_by_topic = v_result.delivered_by_topic,
         delivered_ids_by_topic = v_result.delivered_ids_by_topic,
         delivered_titles_by_topic = v_result.delivered_titles_by_topic,
         completion_map = v_result.completion_map,
         metrics = v_result.metrics,
         updated_at = v_result.updated_at
   where user_id = v_user_id
     and subject = p_subject
   returning * into v_result;

  return v_result;
end;
$$;

grant execute on function public.apply_user_subject_progress_patch(text, integer, integer, integer, integer, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;

drop table if exists public.lesson_cache;

commit;
