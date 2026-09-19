begin;
create table public.draft_generation_leases(
 user_id uuid not null references public.profiles(user_id) on delete cascade,
 application_id uuid not null, owner uuid not null,
 expires_at timestamptz not null,
 primary key(user_id,application_id),
 foreign key(user_id,application_id) references public.applications(user_id,id) on delete cascade
);
alter table public.draft_generation_leases enable row level security;
-- Server-only short leases prevent simultaneous provider calls for the same
-- application. Expired reservations need the operational cleanup job.
commit;
