-- Uploaded candidate databases.
-- Allows a recruiter to upload/select a talent database per run.
-- Idempotent: safe to paste into Supabase SQL Editor more than once.

create table if not exists talent_databases (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  source_type text not null default 'upload'
    check (source_type in ('seeded','upload','ats','csv','json')),
  candidate_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists talent_database_candidates (
  id uuid primary key default uuid_generate_v4(),
  database_id uuid not null references talent_databases(id) on delete cascade,
  pool_candidate_id text not null,
  profile_json jsonb not null,
  persona_hidden_state jsonb,
  created_at timestamptz not null default now()
);

alter table runs
  add column if not exists talent_database_id uuid references talent_databases(id) on delete set null;

create unique index if not exists idx_talent_database_candidates_unique
  on talent_database_candidates(database_id, pool_candidate_id);

create index if not exists idx_talent_database_candidates_database_id
  on talent_database_candidates(database_id);

create index if not exists idx_runs_talent_database_id
  on runs(talent_database_id);

drop trigger if exists talent_databases_updated on talent_databases;
create trigger talent_databases_updated before update on talent_databases for each row execute function set_updated_at();

alter table talent_databases enable row level security;
alter table talent_database_candidates enable row level security;

drop policy if exists "public read talent databases" on talent_databases;
create policy "public read talent databases" on talent_databases for select using (true);

create or replace view candidates_public as
select
  id, run_id, pool_candidate_id, profile_json,
  match_score, match_evidence,
  interest_score, interest_evidence,
  cohort, next_action_draft, rank_within_cohort,
  review_decision, reviewed_at,
  status, created_at, updated_at
from candidates;

grant select on talent_databases to anon;
grant select on talent_databases to authenticated;
grant select on candidates_public to anon;
grant select on candidates_public to authenticated;
