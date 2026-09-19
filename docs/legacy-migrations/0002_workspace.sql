begin;
create table public.search_runs(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(user_id) on delete cascade,retrieved integer not null,retained integer not null,source_status jsonb not null,created_at timestamptz not null default now());
create index search_runs_user_recent on public.search_runs(user_id,created_at desc);
alter table public.search_runs enable row level security;
create policy own_read on public.search_runs for select to authenticated using(user_id=(select auth.uid()));
create table public.api_rate_limits(key text primary key,count integer not null,expires_at timestamptz not null);
alter table public.api_rate_limits enable row level security;
create unique index one_cv_per_application on public.application_documents(user_id,application_id,kind);
create index candidate_facts_version on public.candidate_facts(user_id,profile_version);
-- Server writes are transactional; anonymous and direct authenticated API writes
-- cannot change profile confirmation, generated documents or application status.
commit;
