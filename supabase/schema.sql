create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  username text unique,
  full_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists is_admin boolean not null default false;

create table if not exists public.attempts (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null,
  mode text not null check (mode in ('multiple', 'blank')),
  correct boolean not null,
  quality integer not null check (quality between 0 and 5),
  selected_answer text,
  correct_answer text,
  created_at timestamptz not null default now()
);

create table if not exists public.card_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null,
  attempts integer not null default 0,
  correct integer not null default 0,
  wrong integer not null default 0,
  ease_factor numeric not null default 2.5,
  interval_days integer not null default 0,
  repetitions integer not null default 0,
  due_at timestamptz not null default now(),
  last_quality integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

create table if not exists public.saved_cards (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

create table if not exists public.quiz_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  mode text not null check (mode in ('multiple', 'blank', 'mixed')),
  category_filter text not null default 'all',
  formula_only boolean not null default false,
  question_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quiz_set_items (
  set_id uuid not null references public.quiz_sets(id) on delete cascade,
  position integer not null,
  question_id text not null,
  item_mode text not null check (item_mode in ('multiple', 'blank')),
  created_at timestamptz not null default now(),
  primary key (set_id, position)
);

create table if not exists public.quiz_questions (
  id text primary key,
  year integer not null,
  round integer not null default 0,
  date text not null,
  number integer not null,
  category text not null check (category in ('전기회로', '전기기기', '전기설비')),
  question text not null,
  answer text not null,
  explanation text not null default '',
  images text[] not null default '{}',
  variant boolean not null default false,
  source_html text not null default '',
  solution_html text not null default '',
  source_type text not null default 'local',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.attempts enable row level security;
alter table public.card_progress enable row level security;
alter table public.saved_cards enable row level security;
alter table public.quiz_sets enable row level security;
alter table public.quiz_set_items enable row level security;
alter table public.quiz_questions enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_admin = true
  );
$$;

drop policy if exists "profiles read own" on public.profiles;
create policy "profiles read own"
on public.profiles for select
using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own"
on public.profiles for insert
with check (auth.uid() = id);

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "attempts read own" on public.attempts;
create policy "attempts read own"
on public.attempts for select
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "attempts insert own" on public.attempts;
create policy "attempts insert own"
on public.attempts for insert
with check (auth.uid() = user_id);

drop policy if exists "progress read own" on public.card_progress;
create policy "progress read own"
on public.card_progress for select
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "progress upsert own" on public.card_progress;
create policy "progress upsert own"
on public.card_progress for insert
with check (auth.uid() = user_id);

drop policy if exists "progress update own" on public.card_progress;
create policy "progress update own"
on public.card_progress for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "saved cards read own" on public.saved_cards;
create policy "saved cards read own"
on public.saved_cards for select
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "saved cards insert own" on public.saved_cards;
create policy "saved cards insert own"
on public.saved_cards for insert
with check (auth.uid() = user_id);

drop policy if exists "saved cards delete own" on public.saved_cards;
create policy "saved cards delete own"
on public.saved_cards for delete
using (auth.uid() = user_id);

drop policy if exists "quiz sets read own" on public.quiz_sets;
create policy "quiz sets read own"
on public.quiz_sets for select
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "quiz sets insert own" on public.quiz_sets;
create policy "quiz sets insert own"
on public.quiz_sets for insert
with check (auth.uid() = user_id);

drop policy if exists "quiz sets update own" on public.quiz_sets;
create policy "quiz sets update own"
on public.quiz_sets for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "quiz sets delete own" on public.quiz_sets;
create policy "quiz sets delete own"
on public.quiz_sets for delete
using (auth.uid() = user_id);

drop policy if exists "quiz set items read own" on public.quiz_set_items;
create policy "quiz set items read own"
on public.quiz_set_items for select
using (
  exists (
    select 1 from public.quiz_sets
    where quiz_sets.id = quiz_set_items.set_id
      and (quiz_sets.user_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "quiz set items insert own" on public.quiz_set_items;
create policy "quiz set items insert own"
on public.quiz_set_items for insert
with check (
  exists (
    select 1 from public.quiz_sets
    where quiz_sets.id = quiz_set_items.set_id
      and quiz_sets.user_id = auth.uid()
  )
);

drop policy if exists "quiz set items delete own" on public.quiz_set_items;
create policy "quiz set items delete own"
on public.quiz_set_items for delete
using (
  exists (
    select 1 from public.quiz_sets
    where quiz_sets.id = quiz_set_items.set_id
      and quiz_sets.user_id = auth.uid()
  )
);

drop policy if exists "quiz questions public read" on public.quiz_questions;
create policy "quiz questions public read"
on public.quiz_questions for select
using (true);

drop policy if exists "quiz questions service role write" on public.quiz_questions;
create policy "quiz questions service role write"
on public.quiz_questions for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create index if not exists attempts_user_created_idx on public.attempts (user_id, created_at desc);
create index if not exists progress_user_wrong_idx on public.card_progress (user_id, wrong desc);
create index if not exists saved_cards_user_created_idx on public.saved_cards (user_id, created_at desc);
create index if not exists quiz_sets_user_created_idx on public.quiz_sets (user_id, created_at desc);
create index if not exists quiz_set_items_set_position_idx on public.quiz_set_items (set_id, position);
create index if not exists quiz_questions_category_idx on public.quiz_questions (category);
create index if not exists quiz_questions_source_type_idx on public.quiz_questions (source_type);
create index if not exists quiz_questions_date_idx on public.quiz_questions (date);
