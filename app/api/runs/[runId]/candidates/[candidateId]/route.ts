import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import type { CandidateReviewDecision } from '@/lib/types';

export const runtime = 'nodejs';

const REVIEW_DECISIONS = new Set<CandidateReviewDecision>([
  'undecided',
  'selected',
  'waitlist',
  'rejected',
]);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string; candidateId: string }> }
) {
  const { candidateId } = await params;
  const supabase = createServiceClient();

  // Return candidate data (without hidden state)
  const { data, error } = await supabase
    .from('candidates')
    .select(`
      id, run_id, pool_candidate_id, profile_json,
      match_score, match_evidence,
      interest_score, interest_evidence,
      cohort, next_action_draft, rank_within_cohort,
      status, created_at, updated_at
    `)
    .eq('id', candidateId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string; candidateId: string }> }
) {
  const { runId, candidateId } = await params;
  const body = (await req.json()) as { review_decision?: CandidateReviewDecision };
  const decision = body.review_decision;

  if (!decision || !REVIEW_DECISIONS.has(decision)) {
    return NextResponse.json({ error: 'invalid review_decision' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('candidates')
    .update({
      review_decision: decision,
      reviewed_at: decision === 'undecided' ? null : new Date().toISOString(),
    })
    .eq('id', candidateId)
    .eq('run_id', runId)
    .select('id, review_decision, reviewed_at')
    .single();

  if (error) {
    const missingColumn = error.message.includes('review_decision') || error.message.includes('reviewed_at');
    return NextResponse.json({
      error: missingColumn
        ? 'candidate review columns are missing; apply supabase/migrations/004_candidate_review_topup.sql'
        : error.message,
    }, { status: missingColumn ? 409 : 500 });
  }

  return NextResponse.json(data);
}
