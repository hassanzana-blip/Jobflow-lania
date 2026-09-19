begin;
set local search_path=jobbflow,pg_temp;

-- CV upload, isolated parsing and the review a candidate must complete before
-- anything extracted from their document counts as a fact.
--
-- Additive only: no existing column changes meaning, and the public schema is
-- untouched.

alter table jobbflow.documents
 add column original_name text,
 add column parse_state text not null default 'pending'
  check(parse_state in ('pending','parsed','failed')),
 -- Which named failure, when parse_state is 'failed'. Mirrors ParseFailure in
 -- src/core/document-parse.ts; a document is never left simply "broken".
 add column parse_reason text
  check(parse_reason is null or parse_reason in
   ('ENCRYPTED','NO_TEXT_LAYER','CORRUPT','UNSAFE_ARCHIVE','TIMEOUT','PARSER_FAILED')),
 add column page_count integer check(page_count is null or page_count > 0),
 add column text_chars integer check(text_chars is null or text_chars >= 0),
 add column text_truncated boolean not null default false,
 add constraint documents_failed_has_reason
  check((parse_state='failed') = (parse_reason is not null));

-- One row per parsed document: what the model proposed, still unconfirmed.
-- The document's full text is deliberately NOT stored — only the quotes that
-- back a proposed fact, so a candidate's CV does not accumulate in the
-- database beyond what the evidence needs.
create table jobbflow.document_extractions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references jobbflow.profiles(user_id) on delete cascade,
 document_id uuid not null,
 profile_version integer not null,
 proposed_name text, proposed_location text,
 facts jsonb not null default '[]',
 unknowns jsonb not null default '[]',
 -- A fact is "grounded" when its quote was found in the document text. The
 -- count is kept so the review can say how much had to be taken on trust.
 grounded_count integer not null default 0 check(grounded_count >= 0),
 ungrounded_count integer not null default 0 check(ungrounded_count >= 0),
 confirmed_at timestamptz,
 created_at timestamptz not null default now(),
 unique(user_id,id),
 foreign key(user_id,document_id) references jobbflow.documents(user_id,id) on delete cascade
);
create index document_extractions_pending
 on jobbflow.document_extractions(user_id,created_at desc) where confirmed_at is null;

-- Provenance for a confirmed fact: which upload it came from, and whether its
-- quote was verified against that document rather than taken from the model.
alter table jobbflow.candidate_facts
 add column source_document_id uuid,
 add column grounded boolean not null default false,
 add constraint candidate_facts_document
  foreign key(user_id,source_document_id) references jobbflow.documents(user_id,id) on delete set null;

alter table jobbflow.document_extractions enable row level security;
-- Read-only for the candidate. Extractions are written by the server after an
-- isolated parse, and confirmation goes through the profile endpoint, so a
-- direct client write could otherwise mark unverified text as confirmed.
create policy own_read on jobbflow.document_extractions
 for select to authenticated using (user_id = (select auth.uid()));

grant select on jobbflow.document_extractions to authenticated;
grant all on jobbflow.document_extractions to service_role;
commit;
