-- Candidate review decisions + uniqueness guard for shortlist top-ups.
-- Idempotent: safe to paste into Supabase SQL Editor more than once.

alter table candidates
  add column if not exists review_decision text not null default 'undecided';

alter table candidates
  add column if not exists reviewed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'candidates_review_decision_check'
  ) then
    alter table candidates
      add constraint candidates_review_decision_check
      check (review_decision in ('undecided', 'selected', 'waitlist', 'rejected'));
  end if;
end $$;

create unique index if not exists idx_candidates_run_pool_unique
  on candidates(run_id, pool_candidate_id);

create index if not exists idx_candidates_review_decision
  on candidates(run_id, review_decision);

create or replace view candidates_public as
select
  id, run_id, pool_candidate_id, profile_json,
  match_score, match_evidence,
  interest_score, interest_evidence,
  cohort, next_action_draft, rank_within_cohort,
  review_decision, reviewed_at,
  status, created_at, updated_at
from candidates;

grant select on candidates_public to anon;
grant select on candidates_public to authenticated;
