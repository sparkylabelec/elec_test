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

alter table public.quiz_sets enable row level security;
alter table public.quiz_set_items enable row level security;

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

create index if not exists quiz_sets_user_created_idx on public.quiz_sets (user_id, created_at desc);
create index if not exists quiz_set_items_set_position_idx on public.quiz_set_items (set_id, position);
