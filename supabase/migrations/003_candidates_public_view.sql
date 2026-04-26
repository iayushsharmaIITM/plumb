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

-- Realtime publication (idempotent guards)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'runs'
  ) then
    alter publication supabase_realtime add table runs;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'candidates'
  ) then
    alter publication supabase_realtime add table candidates;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table conversations;
  end if;
end $$;
