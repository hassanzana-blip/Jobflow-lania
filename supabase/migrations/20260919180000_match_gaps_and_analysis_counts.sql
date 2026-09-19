begin;
set local search_path=jobbflow,pg_temp;

-- Deep analysis needs two things to survive a page reload: what the analysis
-- said was missing, and how much of a search was actually analysed. Without
-- them the candidate sees scores on one visit and bare results on the next,
-- with no way to tell which jobs were looked at closely.
--
-- Additive only; the public schema is untouched.

-- What the analysis could not establish from the ad. Kept beside the score
-- because a gap is part of the answer, not an error: "lön framgår inte" is a
-- fact about the advert and must not be guessed at later.
alter table jobbflow.job_matches
 add column gaps jsonb not null default '[]';

alter table jobbflow.search_runs
 add column analysed integer not null default 0 check(analysed >= 0),
 -- How many of the retained ads the allowance stopped us from analysing, so
 -- the UI can say so plainly rather than looking broken.
 add column analysis_skipped integer not null default 0 check(analysis_skipped >= 0);

commit;
