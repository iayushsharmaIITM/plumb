-- ============================================================
-- Plumb — combined migration (paste into Supabase SQL Editor)
-- Running 001 + 002 + 003 + 004 + 005 in order. Idempotent — safe to re-run.
-- ============================================================

create extension if not exists "uuid-ossp";

-- ============ 001 initial schema ============

create table if not exists runs (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  jd_text text not null,
  recruiter_brief text,
  jd_parsed jsonb,
  status text not null default 'pending'
    check (status in ('pending','parsing','reranking','simulating','scoring','drafting','complete','failed')),
  last_stage_at timestamptz,
  error_message text,
  is_demo boolean not null default false,
  client_ip text
);

create index if not exists idx_runs_status on runs(status);
create index if not exists idx_runs_created_at on runs(created_at desc);
create index if not exists idx_runs_client_ip on runs(client_ip, created_at);

create table if not exists candidates (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null references runs(id) on delete cascade,
  pool_candidate_id text not null,
  profile_json jsonb not null,
  persona_hidden_state jsonb,
  match_score int,
  match_evidence jsonb,
  interest_score int,
  interest_evidence jsonb,
  cohort text check (cohort in ('recommended','stretch','nurture','pass')),
  next_action_draft text,
  rank_within_cohort int,
  review_decision text not null default 'undecided'
    check (review_decision in ('undecided','selected','waitlist','rejected')),
  reviewed_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending','simulating','scoring','drafting','complete','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_candidates_run_id on candidates(run_id);
create index if not exists idx_candidates_status on candidates(status);
create unique index if not exists idx_candidates_run_pool_unique on candidates(run_id, pool_candidate_id);

alter table candidates
  add column if not exists review_decision text;

update candidates
set review_decision = 'undecided'
where review_decision is null;

alter table candidates
  alter column review_decision set default 'undecided';

alter table candidates
  alter column review_decision set not null;

alter table candidates
  add column if not exists reviewed_at timestamptz;

create index if not exists idx_candidates_review_decision on candidates(run_id, review_decision);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'candidates_review_decision_check'
  ) then
    alter table candidates
      add constraint candidates_review_decision_check
      check (review_decision in ('undecided','selected','waitlist','rejected'));
  end if;
end $$;

create table if not exists conversations (
  id uuid primary key default uuid_generate_v4(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  turn_number int not null,
  speaker text not null check (speaker in ('recruiter','candidate')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_conversations_candidate_id on conversations(candidate_id, turn_number);

create table if not exists api_calls (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid references runs(id) on delete cascade,
  candidate_id uuid references candidates(id) on delete cascade,
  stage text not null,
  model text not null,
  latency_ms int,
  input_tokens int,
  output_tokens int,
  success boolean not null,
  error text,
  retry_count int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_api_calls_run_id on api_calls(run_id, created_at);
create index if not exists idx_api_calls_success on api_calls(success, created_at);

create table if not exists rate_limits (
  id uuid primary key default uuid_generate_v4(),
  client_ip text not null,
  action text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_rate_limits_lookup on rate_limits(client_ip, action, created_at desc);

create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists runs_updated on runs;
create trigger runs_updated before update on runs for each row execute function set_updated_at();

drop trigger if exists candidates_updated on candidates;
create trigger candidates_updated before update on candidates for each row execute function set_updated_at();

-- ============ 002 RLS ============

alter table runs enable row level security;
alter table candidates enable row level security;
alter table conversations enable row level security;
alter table api_calls enable row level security;
alter table rate_limits enable row level security;

drop policy if exists "public read runs" on runs;
create policy "public read runs" on runs for select using (true);

drop policy if exists "public read conversations" on conversations;
create policy "public read conversations" on conversations for select using (true);

-- ============ 003 public view + realtime ============

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

-- ============ 005 talent databases ============

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

grant select on talent_databases to anon;
grant select on talent_databases to authenticated;
