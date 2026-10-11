-- ============================================================================
-- easypeasylogo.com — Supabase schema (reference + migration-safe)
-- ----------------------------------------------------------------------------
-- Run in: Supabase Dashboard → SQL Editor (or `supabase db push`).
-- All statements are idempotent: safe to run on an EXISTING database.
--
-- NEW in this migration:
--   * project_chat_state  — replaces Upstash Redis (summary + abuse counter)
--   * stripe_events       — idempotent Stripe webhook processing
--   * generation_jobs     — kie.ai job tracking (poll + finalize guard)
--   * Storage bucket `generations` (public read) — replaces Cloudinary
--   * invoice.paid / invoice.payment_failed handled by the API
-- ============================================================================

-- ============================================================================
-- 1. PROJECTS
-- ============================================================================
create table if not exists public.projects (
  project_id        uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users (id) on delete cascade,
  name              text not null default 'First Brand Design',
  is_system_default boolean not null default false,
  generation_status text not null default 'idle',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.projects add column if not exists is_system_default boolean not null default false;
alter table public.projects add column if not exists generation_status text not null default 'idle';
alter table public.projects add column if not exists updated_at timestamptz not null default now();

create index if not exists projects_user_id_idx on public.projects (user_id);

-- ============================================================================
-- 2. LOGO GALLERY
-- ============================================================================
create table if not exists public.logo_gallery (
  logo_id        bigint generated always as identity primary key,
  user_id        uuid references auth.users (id) on delete cascade,
  project_id     uuid,
  concept_1_title text,
  concept_1_url  text,
  concept_2_title text,
  concept_2_url  text,
  response_text  text,
  created_at     timestamptz not null default now()
);

alter table public.logo_gallery add column if not exists response_text text;

create index if not exists logo_gallery_user_id_idx on public.logo_gallery (user_id);
create index if not exists logo_gallery_project_id_idx on public.logo_gallery (project_id);

-- ============================================================================
-- 3. CHAT MESSAGES (logged-in users)
-- ============================================================================
create table if not exists public.chat_messages (
  chat_message_id bigint generated always as identity primary key,
  project_id      uuid not null,
  sender          text not null,           -- 'user' | 'designer'
  content         text not null,
  created_at      timestamptz not null default now()
);

create index if not exists chat_messages_project_id_idx on public.chat_messages (project_id, created_at);

-- ============================================================================
-- 4. GUEST SESSIONS + GUEST MESSAGES
-- ============================================================================
create table if not exists public.guest_sessions (
  guest_session_id text primary key,
  created_at       timestamptz not null default now()
);

create table if not exists public.guest_messages (
  guest_message_id bigint generated always as identity primary key,
  guest_session_id text not null,
  sender           text not null,          -- 'user' | 'designer'
  content          text not null,
  created_at       timestamptz not null default now()
);

create index if not exists guest_messages_session_idx on public.guest_messages (guest_session_id, created_at);

-- ============================================================================
-- 5. CREDITS + SUBSCRIPTIONS
-- ============================================================================
create table if not exists public.user_credits (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  balance       integer not null default 0,
  has_purchased boolean not null default false,
  updated_at    timestamptz not null default now()
);

alter table public.user_credits add column if not exists has_purchased boolean not null default false;
alter table public.user_credits add column if not exists updated_at timestamptz not null default now();

create table if not exists public.user_subscriptions (
  user_id               uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id    text,
  stripe_subscription_id text unique,
  subscription_status   text not null default 'inactive',  -- active | past_due | canceled | incomplete | trialing
  cancel_at_period_end  boolean not null default false,
  cancel_at             timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.user_subscriptions add column if not exists cancel_at_period_end boolean not null default false;
alter table public.user_subscriptions add column if not exists cancel_at timestamptz;
alter table public.user_subscriptions add column if not exists updated_at timestamptz not null default now();

-- ============================================================================
-- 6. NEWSLETTER
-- ============================================================================
create table if not exists public.newsletter_subscribers (
  id         bigint generated always as identity primary key,
  email      text not null unique,
  source     text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 7. NEW: PROJECT CHAT STATE (replaces Upstash Redis)
--    summary = Agent 1 JSON summary · abuse_count = abuse counter
-- ============================================================================
create table if not exists public.project_chat_state (
  project_id  uuid primary key,
  summary     jsonb not null default '{}'::jsonb,
  abuse_count integer not null default 0,
  seed_urls   jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================================
-- 8. NEW: STRIPE EVENTS (idempotent webhook processing)
-- ============================================================================
create table if not exists public.stripe_events (
  id           bigint generated always as identity primary key,
  event_id     text not null unique,
  event_type   text not null,
  processed_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index if not exists stripe_events_event_id_idx on public.stripe_events (event_id);

-- ============================================================================
-- 9. NEW: GENERATION JOBS (kie.ai task tracking + finalize guard)
--    status flow: queued → running → done → finalized · failed
-- ============================================================================
create table if not exists public.generation_jobs (
  id            bigint generated always as identity primary key,
  project_id    uuid not null,
  user_id       uuid,
  concept_index integer not null default 0,
  scene_title   text,
  kie_task_id   text,
  status        text not null default 'queued',
  payload       jsonb,
  result_url    text,
  raw_urls      jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists generation_jobs_project_status_idx on public.generation_jobs (project_id, status);

-- ============================================================================
-- 10. RPC: INCREMENT CREDITS (security definer — used by Stripe webhook)
-- ============================================================================
create or replace function public.increment_credits(uid uuid, amount integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if uid is null or amount is null or amount <= 0 then
    return;
  end if;

  insert into public.user_credits (user_id, balance)
  values (uid, amount)
  on conflict (user_id)
  do update set
    balance       = public.user_credits.balance + amount,
    has_purchased = true,
    updated_at    = now();
end;
$$;

-- ============================================================================
-- 11. ROW LEVEL SECURITY
-- ============================================================================
alter table public.projects              enable row level security;
alter table public.logo_gallery          enable row level security;
alter table public.chat_messages         enable row level security;
alter table public.guest_sessions        enable row level security;
alter table public.guest_messages        enable row level security;
alter table public.user_credits          enable row level security;
alter table public.user_subscriptions    enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.project_chat_state    enable row level security;
alter table public.stripe_events         enable row level security;
alter table public.generation_jobs       enable row level security;

-- projects: owner-only access
create policy if not exists projects_select_own on public.projects
  for select using (auth.uid() = user_id);
create policy if not exists projects_insert_own on public.projects
  for insert with check (auth.uid() = user_id);
create policy if not exists projects_update_own on public.projects
  for update using (auth.uid() = user_id);
create policy if not exists projects_delete_own on public.projects
  for delete using (auth.uid() = user_id);

-- logo_gallery: owner-only access
create policy if not exists logo_select_own on public.logo_gallery
  for select using (auth.uid() = user_id);
create policy if not exists logo_insert_own on public.logo_gallery
  for insert with check (auth.uid() = user_id);
create policy if not exists logo_delete_own on public.logo_gallery
  for delete using (auth.uid() = user_id);

-- chat_messages: access through an owned project
create policy if not exists chat_select_own on public.chat_messages
  for select using (
    exists (
      select 1 from public.projects p
      where p.project_id = public.chat_messages.project_id
        and p.user_id = auth.uid()
    )
  );
create policy if not exists chat_insert_own on public.chat_messages
  for insert with check (
    exists (
      select 1 from public.projects p
      where p.project_id = public.chat_messages.project_id
        and p.user_id = auth.uid()
    )
  );

-- guest tables: anon users may create/read by session id
create policy if not exists guest_sessions_anon_insert on public.guest_sessions
  for insert to anon with check (true);
create policy if not exists guest_sessions_anon_select on public.guest_sessions
  for select to anon using (true);

create policy if not exists guest_messages_anon_insert on public.guest_messages
  for insert to anon with check (true);
create policy if not exists guest_messages_anon_select on public.guest_messages
  for select to anon using (true);

-- user_credits: owner-only
create policy if not exists credits_select_own on public.user_credits
  for select using (auth.uid() = user_id);
create policy if not exists credits_insert_own on public.user_credits
  for insert with check (auth.uid() = user_id);
create policy if not exists credits_update_own on public.user_credits
  for update using (auth.uid() = user_id);

-- user_subscriptions: owner-only
create policy if not exists subs_select_own on public.user_subscriptions
  for select using (auth.uid() = user_id);
create policy if not exists subs_insert_own on public.user_subscriptions
  for insert with check (auth.uid() = user_id);
create policy if not exists subs_update_own on public.user_subscriptions
  for update using (auth.uid() = user_id);

-- newsletter: anon may subscribe
create policy if not exists newsletter_anon_insert on public.newsletter_subscribers
  for insert to anon with check (true);

-- internal tables: NO client policies (service-role only)
-- project_chat_state / stripe_events / generation_jobs are only accessed
-- through the API with the service-role key. RLS is enabled with no policies
-- so the anon/authenticated clients can never touch them.

-- ============================================================================
-- 12. REALTIME (generation_status → completed)
-- ============================================================================
do $$
begin
  alter publication supabase_realtime add table public.projects;
exception
  when duplicate_object then null;
end $$;

-- ============================================================================
-- 13. STORAGE BUCKET: generations (replaces Cloudinary)
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('generations', 'generations', true)
on conflict (id) do update set public = true;

-- Public read access for generated images.
create policy if not exists generations_public_read on storage.objects
  for select
  using (bucket_id = 'generations');

-- Frontend attachment uploads: guests (anon) and logged-in users may upload
-- reference images into the public bucket before generation.
create policy if not exists generations_anon_insert on storage.objects
  for insert to anon
  with check (bucket_id = 'generations');

create policy if not exists generations_auth_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'generations');

-- (Server-side writes use the service-role key, which bypasses RLS.)
