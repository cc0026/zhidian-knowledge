-- Run this once in Supabase Dashboard → SQL Editor.
-- All rows are private to the authenticated account that owns them.

create table if not exists public.cards (
  user_id uuid not null references auth.users (id) on delete cascade,
  card_id text not null,
  card jsonb not null check (jsonb_typeof(card) = 'object'),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, card_id)
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  custom_tags jsonb not null default '[]'::jsonb check (jsonb_typeof(custom_tags) = 'array'),
  updated_at timestamptz not null default now()
);

create table if not exists public.review_progress (
  user_id uuid not null,
  card_id text not null,
  due_at timestamptz,
  last_reviewed_at timestamptz,
  interval_days integer not null default 0 check (interval_days >= 0),
  repetitions integer not null default 0 check (repetitions >= 0),
  lapses integer not null default 0 check (lapses >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id),
  constraint review_progress_card_owner_fk
    foreign key (user_id, card_id)
    references public.cards (user_id, card_id)
    on delete cascade
);

create index if not exists cards_user_updated_idx
  on public.cards (user_id, updated_at desc);

create index if not exists review_progress_user_due_idx
  on public.review_progress (user_id, due_at);

alter table public.cards enable row level security;
alter table public.user_settings enable row level security;
alter table public.review_progress enable row level security;

revoke all on public.cards, public.user_settings, public.review_progress from anon;
grant select, insert, update, delete on public.cards, public.user_settings, public.review_progress to authenticated;

drop policy if exists "Users can read their own cards" on public.cards;
create policy "Users can read their own cards"
  on public.cards for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own cards" on public.cards;
create policy "Users can create their own cards"
  on public.cards for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own cards" on public.cards;
create policy "Users can update their own cards"
  on public.cards for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own cards" on public.cards;
create policy "Users can delete their own cards"
  on public.cards for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own settings" on public.user_settings;
create policy "Users can read their own settings"
  on public.user_settings for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own settings" on public.user_settings;
create policy "Users can create their own settings"
  on public.user_settings for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own settings" on public.user_settings;
create policy "Users can update their own settings"
  on public.user_settings for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own settings" on public.user_settings;
create policy "Users can delete their own settings"
  on public.user_settings for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own review progress" on public.review_progress;
create policy "Users can read their own review progress"
  on public.review_progress for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own review progress" on public.review_progress;
create policy "Users can create their own review progress"
  on public.review_progress for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own review progress" on public.review_progress;
create policy "Users can update their own review progress"
  on public.review_progress for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own review progress" on public.review_progress;
create policy "Users can delete their own review progress"
  on public.review_progress for delete to authenticated
  using ((select auth.uid()) = user_id);
