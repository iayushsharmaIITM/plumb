alter table runs enable row level security;
alter table candidates enable row level security;
alter table conversations enable row level security;
alter table api_calls enable row level security;
alter table rate_limits enable row level security;

drop policy if exists "public read runs" on runs;
create policy "public read runs" on runs for select using (true);

drop policy if exists "public read conversations" on conversations;
create policy "public read conversations" on conversations for select using (true);

-- Candidates: no direct policy; clients use candidates_public view
-- api_calls and rate_limits: no public access
