create extension if not exists "uuid-ossp";

-- Runs: one per user submission
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

-- Candidates: 8 per run
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
create index if not exists idx_candidates_review_decision on candidates(run_id, review_decision);

-- Conversations: 8 turns per candidate
create table if not exists conversations (
  id uuid primary key default uuid_generate_v4(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  turn_number int not null,
  speaker text not null check (speaker in ('recruiter','candidate')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_conversations_candidate_id on conversations(candidate_id, turn_number);

-- Observability
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

-- Rate limiting
create table if not exists rate_limits (
  id uuid primary key default uuid_generate_v4(),
  client_ip text not null,
  action text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_rate_limits_lookup on rate_limits(client_ip, action, created_at desc);

-- Auto updated_at
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists runs_updated on runs;
create trigger runs_updated before update on runs for each row execute function set_updated_at();

drop trigger if exists candidates_updated on candidates;
create trigger candidates_updated before update on candidates for each row execute function set_updated_at();
