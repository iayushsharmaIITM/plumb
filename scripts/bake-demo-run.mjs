/**
 * Bake Demo Run — runs the full pipeline once against the meta-JD,
 * marks the resulting run as is_demo=true, and logs results.
 *
 * Usage: node --env-file=.env.local scripts/bake-demo-run.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { exportDemoRun } from './export-demo-run.mjs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing Supabase env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function postStage(url) {
  const res = await fetch(`${APP_URL}${url}`, { method: 'POST' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${url} failed: ${res.status} ${text.slice(0, 300)}`);
  }
  return res.json();
}

async function main() {
  const { readFileSync } = await import('fs');
  const metaJd = readFileSync('data/meta-jd.md', 'utf-8');

  console.log('Creating demo run...');
  const { data: run, error: runErr } = await supabase
    .from('runs')
    .insert({
      jd_text: metaJd,
      recruiter_brief: null,
      status: 'pending',
      is_demo: true,
      client_ip: 'bake-script',
    })
    .select('id')
    .single();

  if (runErr || !run) {
    console.error('Failed to create run:', runErr);
    process.exit(1);
  }

  const runId = run.id;
  console.log(`Run created: ${runId}`);

  try {
    console.log('Stage 1/5: Parsing JD...');
    await postStage(`/api/runs/${runId}/parse`);

    console.log('Stage 2/5: Re-ranking candidates...');
    const { candidate_ids } = await postStage(`/api/runs/${runId}/rerank`);
    console.log(`  Selected ${candidate_ids.length} candidates`);

    console.log('Stage 3/5: Simulating conversations...');
    await Promise.all(
      candidate_ids.map((cid) => postStage(`/api/runs/${runId}/candidates/${cid}/simulate`))
    );

    console.log('Stage 4/5: Scoring interest...');
    await Promise.all(
      candidate_ids.map((cid) => postStage(`/api/runs/${runId}/candidates/${cid}/score`))
    );

    console.log('Stage 5/5: Drafting next actions...');
    await Promise.all(
      candidate_ids.map((cid) => postStage(`/api/runs/${runId}/candidates/${cid}/draft`))
    );

    // Mark complete
    await supabase.from('runs').update({ status: 'complete' }).eq('id', runId);

    // Print results
    const { data: candidates } = await supabase
      .from('candidates')
      .select('pool_candidate_id, match_score, interest_score, cohort, rank_within_cohort')
      .eq('run_id', runId)
      .order('cohort')
      .order('rank_within_cohort');

    console.log('\n=== DEMO RUN RESULTS ===');
    console.log(`Run ID: ${runId}`);
    console.log(`URL: ${APP_URL}/runs/demo\n`);

    for (const c of candidates ?? []) {
      console.log(
        `  ${c.cohort?.toUpperCase().padEnd(12)} ${String(c.match_score).padStart(3)} match / ${String(c.interest_score).padStart(3)} interest — ${c.pool_candidate_id}`
      );
    }

    const exported = await exportDemoRun({ runId, supabaseClient: supabase });
    console.log(`\nStatic fallback updated: ${exported.outputPath}`);
    console.log('\n✓ Demo run baked successfully.');
  } catch (err) {
    console.error('Pipeline failed:', err);
    await supabase.from('runs').update({ status: 'failed', error_message: String(err) }).eq('id', runId);
    process.exit(1);
  }
}

main();
