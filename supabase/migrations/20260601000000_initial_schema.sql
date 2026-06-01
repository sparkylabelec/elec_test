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

alter table public.profiles enable row level security;
alter table public.attempts enable row level security;
alter table public.card_progress enable row level security;
alter table public.saved_cards enable row level security;

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

create index if not exists attempts_user_created_idx on public.attempts (user_id, created_at desc);
create index if not exists progress_user_wrong_idx on public.card_progress (user_id, wrong desc);
create index if not exists saved_cards_user_created_idx on public.saved_cards (user_id, created_at desc);
