import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 10;

const BASE_SELECT = `
  id, run_id, pool_candidate_id, profile_json,
  match_score, match_evidence,
  interest_score, interest_evidence,
  cohort, next_action_draft, rank_within_cohort,
  status, created_at, updated_at
`;

const REVIEW_SELECT = `${BASE_SELECT}, review_decision, reviewed_at`;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('candidates')
    .select(REVIEW_SELECT)
    .eq('run_id', runId)
    .order('rank_within_cohort', { ascending: true });

  if (error && error.message.includes('review_decision')) {
    const fallback = await supabase
      .from('candidates')
      .select(BASE_SELECT)
      .eq('run_id', runId)
      .order('rank_within_cohort', { ascending: true });

    if (fallback.error) {
      return NextResponse.json({ error: fallback.error.message }, { status: 500 });
    }

    return NextResponse.json((fallback.data ?? []).map((candidate) => ({
      ...candidate,
      review_decision: 'undecided',
      reviewed_at: null,
    })));
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
