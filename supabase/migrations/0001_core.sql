begin;
create extension if not exists pgcrypto;
create type public.application_status as enum ('saved','preparing','ready','applied','interview','offer','rejected','archived');
create type public.usage_kind as enum ('deep_match','tailored_application','browser_application');

create table public.profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text, location text, confirmed_at timestamptz, version integer not null default 1,
 onboarding_step integer not null default 1 check (onboarding_step between 1 and 7),
 state text not null default 'active' check(state in ('active','deleting')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.candidate_preferences (
 user_id uuid primary key references public.profiles(user_id) on delete cascade,
 roles text[] not null default '{}', occupation_ids text[] not null default '{}',
 locations text[] not null default '{}', work_style text not null default 'any' check(work_style in ('any','remote','hybrid','onsite')),
 employment text[] not null default '{}', minimum_salary integer check(minimum_salary>0),
 excluded_titles text[] not null default '{}', excluded_companies text[] not null default '{}',
 willing_to_relocate boolean not null default false, industries text[] not null default '{}',
 management_preference text, available_from date, languages text[] not null default '{}'
);
create table public.work_experience (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id) on delete cascade,
 title text not null, employer text not null, start_date date, end_date date, is_current boolean not null default false,
 description text, confirmed boolean not null default false, check(end_date is null or start_date is null or end_date>=start_date)
);
create table public.education (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id) on delete cascade,
 institution text not null, qualification text not null, start_date date, end_date date, confirmed boolean not null default false
);
create table public.skills (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id) on delete cascade,
 label text not null, concept_id text, taxonomy_version text, confirmed boolean not null default false,
 unique(user_id,label)
);
create table public.languages (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id) on delete cascade,
 language_code text not null, proficiency text, confirmed boolean not null default false, unique(user_id,language_code)
);
create table public.candidate_facts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id) on delete cascade,
 profile_version integer not null, kind text not null, fact text not null, source_quote text,
 confirmed boolean not null default false, created_at timestamptz not null default now()
);
create table public.documents (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id) on delete cascade,
 bucket text not null default 'candidate-documents', object_key text not null unique,
 mime_type text not null check(mime_type in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
 size_bytes bigint not null check(size_bytes between 1 and 10485760), sha256 text not null,
 scan_state text not null default 'quarantined' check(scan_state in ('quarantined','clean','rejected')),
 created_at timestamptz not null default now(), unique(user_id,id)
);
create table public.cv_versions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id) on delete cascade,
 document_id uuid, profile_version integer not null, content jsonb not null, content_hash text not null,
 reviewed_at timestamptz, created_at timestamptz not null default now(), unique(user_id,id),
 foreign key(user_id,document_id) references public.documents(user_id,id)
);
create table public.companies (id uuid primary key default gen_random_uuid(), name text not null, organization_number text, website text, unique(organization_number));
create table public.job_sources (id text primary key check(id in ('jobsearch','jobadlinks')), base_url text not null, schema_digest text, last_success_at timestamptz, last_error_code text);
insert into public.job_sources(id,base_url) values ('jobsearch','https://jobsearch.api.jobtechdev.se'),('jobadlinks','https://links.api.jobtechdev.se');
create table public.jobs (
 id uuid primary key default gen_random_uuid(), source_id text not null references public.job_sources(id), external_id text not null,
 company_id uuid references public.companies(id), title text not null, employer_label text,
 canonical_url text not null, source_url text not null, location text, municipality_id text, occupation_ids text[] not null default '{}',
 employment_type text, work_style text, salary_min integer, salary_max integer,
 published_at timestamptz not null, deadline timestamptz, removed_at timestamptz,
 description text not null, description_completeness text not null check(description_completeness in ('full','excerpt')),
 fetched_at timestamptz not null default now(), unique(source_id,external_id)
);
create index jobs_recent on public.jobs(published_at desc) where removed_at is null;
create index jobs_occupations on public.jobs using gin(occupation_ids);
create index jobs_location on public.jobs(municipality_id,published_at desc);
create index jobs_canonical on public.jobs(canonical_url);
create table public.job_snapshots(id uuid primary key default gen_random_uuid(),job_id uuid not null references public.jobs(id) on delete cascade,content_hash text not null,description text not null,captured_at timestamptz not null default now(),unique(job_id,content_hash));
create table public.job_matches (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(user_id) on delete cascade,
 job_id uuid not null references public.jobs(id),profile_version integer not null,method_version text not null,
 score smallint check(score between 0 and 100),coverage smallint not null check(coverage between 0 and 100),summary text,
 created_at timestamptz not null default now(),unique(user_id,job_id,profile_version,method_version),unique(user_id,id)
);
create index matches_user_score on public.job_matches(user_id,score desc,created_at desc);
create table public.match_factors (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(user_id) on delete cascade,
 match_id uuid not null,factor_key text not null,value real check(value between 0 and 1),weight smallint not null,
 reason text not null,evidence_ids uuid[] not null default '{}',blocker boolean not null default false,
 foreign key(user_id,match_id) references public.job_matches(user_id,id) on delete cascade,unique(match_id,factor_key)
);
create table public.saved_jobs(user_id uuid not null references public.profiles(user_id) on delete cascade,job_id uuid not null references public.jobs(id),created_at timestamptz not null default now(),primary key(user_id,job_id));
create table public.dismissed_jobs(user_id uuid not null references public.profiles(user_id) on delete cascade,job_id uuid not null references public.jobs(id),created_at timestamptz not null default now(),primary key(user_id,job_id));
create table public.applications (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(user_id) on delete cascade,
 job_id uuid not null references public.jobs(id),status public.application_status not null default 'saved',
 applied_at timestamptz,application_url text,notes text,interview_at timestamptz,follow_up_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(user_id,id),unique(user_id,job_id)
);
create index applications_user_status on public.applications(user_id,status,updated_at desc);
create table public.application_answers(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(user_id) on delete cascade,application_id uuid not null,question text not null,answer text,reviewed_at timestamptz,foreign key(user_id,application_id) references public.applications(user_id,id) on delete cascade);
create table public.application_documents(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(user_id) on delete cascade,application_id uuid not null,cv_version_id uuid not null,kind text not null,foreign key(user_id,application_id) references public.applications(user_id,id) on delete cascade,foreign key(user_id,cv_version_id) references public.cv_versions(user_id,id));
create table public.application_events(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(user_id) on delete cascade,application_id uuid not null,event_type text not null,created_at timestamptz not null default now(),foreign key(user_id,application_id) references public.applications(user_id,id) on delete cascade);
create table public.agent_runs(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(user_id) on delete cascade,application_id uuid,kind text not null,status text not null default 'queued',idempotency_key text not null unique,created_at timestamptz not null default now(),unique(user_id,id),foreign key(user_id,application_id) references public.applications(user_id,id));
create table public.agent_steps(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(user_id) on delete cascade,run_id uuid not null,step_number integer not null,action_type text not null,status text not null,error_code text,created_at timestamptz not null default now(),foreign key(user_id,run_id) references public.agent_runs(user_id,id) on delete cascade,unique(run_id,step_number));
create table public.approval_requests(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(user_id) on delete cascade,application_id uuid not null,payload_hash text not null,expires_at timestamptz not null,approved_at timestamptz,consumed_at timestamptz,foreign key(user_id,application_id) references public.applications(user_id,id) on delete cascade);

create table public.entitlements(plan text not null,kind public.usage_kind not null,monthly_limit integer not null check(monthly_limit>=0),primary key(plan,kind));
insert into public.entitlements values ('free','deep_match',25),('free','tailored_application',2),('free','browser_application',0),('plus','deep_match',250),('plus','tailored_application',20),('plus','browser_application',0),('pro','deep_match',1000),('pro','tailored_application',60),('pro','browser_application',30),('agent','deep_match',2500),('agent','tailored_application',150),('agent','browser_application',100);
create table public.subscriptions(user_id uuid primary key references public.profiles(user_id) on delete cascade,plan text not null default 'free' check(plan in ('free','plus','pro','agent')),stripe_customer_id text unique,stripe_subscription_id text unique,status text not null default 'free',period_start timestamptz,period_end timestamptz,cancel_at_period_end boolean not null default false,updated_at timestamptz not null default now());
create table public.usage_events(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(user_id) on delete cascade,kind public.usage_kind not null,operation_id uuid not null,period_start timestamptz not null,state text not null check(state in ('reserved','settled','released')),created_at timestamptz not null default now(),unique(user_id,kind,operation_id));
create index usage_period on public.usage_events(user_id,period_start,kind,state);
create table public.stripe_events(id text primary key,type text not null,state text not null default 'pending',created_at timestamptz not null default now(),processed_at timestamptz,error_code text);
create table public.notification_settings(user_id uuid primary key references public.profiles(user_id) on delete cascade,new_matches boolean not null default false,interview_reminders boolean not null default true,frequency text not null default 'daily',timezone text not null default 'Europe/Stockholm');
create table public.notifications(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(user_id) on delete cascade,kind text not null,deduplication_key text not null unique,status text not null default 'pending',scheduled_at timestamptz not null default now(),sent_at timestamptz);
create table public.model_usage(id uuid primary key default gen_random_uuid(),operation text not null,model text not null,input_tokens integer not null,cached_tokens integer not null,output_tokens integer not null,latency_ms integer not null,success boolean not null,estimated_usd numeric(12,8) not null,created_at timestamptz not null default now());
create table public.audit_events(id uuid primary key default gen_random_uuid(),actor_id uuid,action text not null,target_type text not null,target_id uuid,reason text,created_at timestamptz not null default now());
create table public.admin_roles(user_id uuid primary key references auth.users(id) on delete cascade,role text not null check(role in ('support','operations','security')));
create table public.deletion_requests(id uuid primary key default gen_random_uuid(),user_id uuid not null unique,state text not null default 'requested',requested_at timestamptz not null default now(),completed_at timestamptz,error_code text);

-- All user-owned tables are private by default. Client writes are granted only
-- for explicitly editable data, never billing, generated evidence, or approvals.
do $$ declare t text; begin
 foreach t in array array['profiles','candidate_preferences','work_experience','education','skills','languages','candidate_facts','documents','cv_versions','job_matches','match_factors','saved_jobs','dismissed_jobs','applications','application_answers','application_documents','application_events','agent_runs','agent_steps','approval_requests','subscriptions','usage_events','notification_settings','notifications'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy own_read on public.%I for select to authenticated using (user_id = (select auth.uid()))',t);
 end loop;
 foreach t in array array['candidate_preferences','work_experience','education','skills','languages','saved_jobs','dismissed_jobs','notification_settings'] loop
  execute format('create policy own_write on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',t);
 end loop;
 foreach t in array array['companies','jobs','job_sources','job_snapshots','entitlements','stripe_events','model_usage','audit_events','admin_roles','deletion_requests'] loop
  execute format('alter table public.%I enable row level security',t);
 end loop;
end $$;
create policy active_jobs_read on public.jobs for select to authenticated using(removed_at is null);
create policy companies_read on public.companies for select to authenticated using(true);
create policy plans_read on public.entitlements for select to authenticated using(true);

create or replace function public.reserve_usage(p_user uuid,p_kind public.usage_kind,p_operation uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare selected_plan text:='free'; start_at timestamptz; limit_value integer; used integer; existing_id uuid; existing_state text; sub public.subscriptions; result uuid;
begin
 if not exists(select 1 from profiles where user_id=p_user and state='active') then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select id,state into existing_id,existing_state from usage_events where user_id=p_user and kind=p_kind and operation_id=p_operation;
 if existing_id is not null then
  if existing_state='released' then raise exception 'OPERATION_RELEASED'; end if;
  return existing_id;
 end if;
 select * into sub from subscriptions where user_id=p_user;
 start_at:=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
 if sub.status='active' and sub.period_start<=now() and sub.period_end>now() then selected_plan:=sub.plan;start_at:=sub.period_start;end if;
 select monthly_limit into limit_value from entitlements where plan=selected_plan and kind=p_kind;
 if limit_value is null then raise exception 'ENTITLEMENT_MISSING';end if;
 select count(*) into used from usage_events where user_id=p_user and kind=p_kind and period_start=start_at and state in ('reserved','settled');
 if used>=limit_value then raise exception 'QUOTA_EXCEEDED';end if;
 insert into usage_events(user_id,kind,operation_id,period_start,state) values(p_user,p_kind,p_operation,start_at,'reserved') returning id into result;
 return result;
end $$;
revoke all on function public.reserve_usage(uuid,public.usage_kind,uuid) from public,anon,authenticated;
grant execute on function public.reserve_usage(uuid,public.usage_kind,uuid) to service_role;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$ begin
 insert into profiles(user_id) values(new.id); insert into candidate_preferences(user_id) values(new.id);insert into subscriptions(user_id) values(new.id);insert into notification_settings(user_id) values(new.id);return new;end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('candidate-documents','candidate-documents',false,10485760,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']) on conflict(id) do nothing;
-- No client upload/read policies: authenticated server checks ownership and scan
-- state before issuing a short-lived URL. Service role never enters the client.
commit;
