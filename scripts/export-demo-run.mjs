/**
 * Export the public demo payload used by /runs/demo as a static fallback.
 *
 * Usage:
 *   node --env-file=.env.local scripts/export-demo-run.mjs
 *   node --env-file=.env.local scripts/export-demo-run.mjs <run-id>
 */

import { writeFileSync } from 'fs';
import { pathToFileURL } from 'url';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_OUTPUT_PATH = 'data/demo-run.json';

export async function exportDemoRun({
  runId,
  outputPath = DEFAULT_OUTPUT_PATH,
  supabaseClient,
} = {}) {
  const supabase = supabaseClient ?? createSupabaseClient();
  const run = await loadRun(supabase, runId);
  const candidates = await loadCandidates(supabase, run.id);
  const conversations = await loadConversations(supabase, candidates.map((candidate) => candidate.id));

  const payload = {
    exported_at: new Date().toISOString(),
    source: 'supabase_export',
    run: {
      id: 'demo',
      source_run_id: run.id,
      jd_text: run.jd_text,
      jd_parsed: run.jd_parsed,
      status: run.status,
    },
    candidates: candidates.map((candidate) => ({
      ...candidate,
      run_id: 'demo',
    })),
    conversations,
  };

  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  return {
    outputPath,
    runId: run.id,
    candidateCount: candidates.length,
    conversationCount: Object.values(conversations).reduce((sum, turns) => sum + turns.length, 0),
  };
}

function createSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function loadRun(supabase, runId) {
  const query = supabase
    .from('runs')
    .select('id, jd_text, jd_parsed, status, created_at')
    .order('created_at', { ascending: false })
    .limit(1);

  const { data, error } = runId
    ? await supabase
      .from('runs')
      .select('id, jd_text, jd_parsed, status, created_at')
      .eq('id', runId)
      .single()
    : await query.eq('is_demo', true).eq('status', 'complete').maybeSingle();

  if (error || !data) {
    throw new Error(error?.message ?? 'No demo run found to export');
  }

  return data;
}

async function loadCandidates(supabase, runId) {
  const { data, error } = await supabase
    .from('candidates_public')
    .select(`
      id, run_id, pool_candidate_id, profile_json,
      match_score, match_evidence,
      interest_score, interest_evidence,
      cohort, next_action_draft, rank_within_cohort,
      status, created_at, updated_at
    `)
    .eq('run_id', runId)
    .order('rank_within_cohort', { ascending: true });

  if (error) throw new Error(`Candidate export failed: ${error.message}`);
  if (!data || data.length === 0) throw new Error('Demo run has no public candidates');
  return data;
}

async function loadConversations(supabase, candidateIds) {
  const conversations = Object.fromEntries(candidateIds.map((candidateId) => [candidateId, []]));

  const { data, error } = await supabase
    .from('conversations')
    .select('candidate_id, turn_number, speaker, content')
    .in('candidate_id', candidateIds)
    .order('turn_number', { ascending: true });

  if (error) throw new Error(`Conversation export failed: ${error.message}`);

  for (const turn of data ?? []) {
    conversations[turn.candidate_id].push({
      turn_number: turn.turn_number,
      speaker: turn.speaker,
      content: turn.content,
    });
  }

  return conversations;
}

async function main() {
  const runId = process.argv[2];
  const result = await exportDemoRun({ runId });
  console.log('Demo fallback exported.');
  console.log(`  Source run: ${result.runId}`);
  console.log(`  Candidates: ${result.candidateCount}`);
  console.log(`  Conversation turns: ${result.conversationCount}`);
  console.log(`  Output: ${result.outputPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
