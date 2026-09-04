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

alter table public.quiz_questions enable row level security;

drop policy if exists "quiz questions public read" on public.quiz_questions;
create policy "quiz questions public read"
on public.quiz_questions for select
using (true);

drop policy if exists "quiz questions service role write" on public.quiz_questions;
create policy "quiz questions service role write"
on public.quiz_questions for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create index if not exists quiz_questions_category_idx on public.quiz_questions (category);
create index if not exists quiz_questions_source_type_idx on public.quiz_questions (source_type);
create index if not exists quiz_questions_date_idx on public.quiz_questions (date);
