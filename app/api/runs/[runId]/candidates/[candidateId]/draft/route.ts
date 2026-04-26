import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { callModel } from '@/lib/call-model';
import { stageDeployment } from '@/lib/models';
import { buildDraftSystemPrompt, buildDraftUserMessage } from '@/lib/prompts/draft';
import { rankWithinCohort } from '@/lib/pipeline/cohort';
import type { CandidateProfile, Cohort, InterestEvidence } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

function buildFallbackDraft(profile: CandidateProfile, cohort: Cohort): string {
  if (cohort === 'pass') return '';

  if (cohort === 'recommended') {
    return `Hi ${profile.name.split(' ')[0]} - thanks for the thoughtful conversation. Your interest in the agent systems work came through clearly, and the next best step is a technical intro with the hiring manager focused on ownership, evals, and production reliability.`;
  }

  if (cohort === 'stretch') {
    return `Hi ${profile.name.split(' ')[0]} - I think this is worth a stretch conversation. There are a few gaps to calibrate, but your interest and adjacent experience are strong enough to justify a focused technical screen.`;
  }

  return `Hi ${profile.name.split(' ')[0]} - thanks for taking the time to talk. It sounds like the timing or motivation may not be quite right today, so I will keep this light and reconnect when there is a better-fit opening or moment.`;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string; candidateId: string }> }
) {
  const { runId, candidateId } = await params;
  const supabase = createServiceClient();

  const [{ data: run }, { data: cand }, { data: turns }] = await Promise.all([
    supabase.from('runs').select('recruiter_brief').eq('id', runId).single(),
    supabase
      .from('candidates')
      .select('profile_json, cohort, interest_evidence, match_score, interest_score, next_action_draft, status')
      .eq('id', candidateId)
      .single(),
    supabase
      .from('conversations')
      .select('turn_number, speaker, content')
      .eq('candidate_id', candidateId)
      .order('turn_number', { ascending: true }),
  ]);

  if (!run) return NextResponse.json({ error: 'run missing' }, { status: 400 });
  if (!cand) return NextResponse.json({ error: 'candidate missing' }, { status: 404 });

  if (cand.next_action_draft && cand.status === 'complete') {
    return NextResponse.json({ draft: cand.next_action_draft, cached: true });
  }

  await supabase.from('candidates').update({ status: 'drafting' }).eq('id', candidateId);

  try {
    const profile = cand.profile_json as CandidateProfile;
    const cohort = cand.cohort as Cohort;
    let draftText = '';

    if (cohort !== 'pass') {
      const transcriptSummary = (turns ?? [])
        .map((t) => `[${t.speaker}]: ${t.content}`)
        .join('\n\n')
        .slice(0, 6_000);
      const interestStr = JSON.stringify(cand.interest_evidence as InterestEvidence);

      const { content } = await callModel<string>({
        stage: 'draft',
        run_id: runId,
        candidate_id: candidateId,
        deployment: stageDeployment.draft,
        system: buildDraftSystemPrompt(cohort, run.recruiter_brief),
        messages: [
          {
            role: 'user',
            content: buildDraftUserMessage(profile.name, cohort, transcriptSummary, interestStr),
          },
        ],
        response_format: 'text',
        temperature: 0.6,
        max_tokens: 1_000,
        timeout_ms: 30_000,
        max_retries: 0,
      });
      draftText = content.trim();
    }

    await supabase
      .from('candidates')
      .update({ next_action_draft: draftText, status: 'complete' })
      .eq('id', candidateId);

    // Re-rank within cohorts across all candidates in this run
    const { data: allCands } = await supabase
      .from('candidates')
      .select('id, match_score, interest_score, cohort')
      .eq('run_id', runId);
    if (allCands) {
      const rankable = allCands
        .filter((c) => c.cohort && c.match_score != null && c.interest_score != null)
        .map((c) => ({
          id: c.id as string,
          match_score: c.match_score as number,
          interest_score: c.interest_score as number,
          cohort: c.cohort as Cohort,
        }));
      const ranks = rankWithinCohort(rankable);
      await Promise.all(
        Array.from(ranks.entries()).map(([id, rank]) =>
          supabase.from('candidates').update({ rank_within_cohort: rank }).eq('id', id)
        )
      );
    }

    return NextResponse.json({ draft: draftText, cohort });
  } catch (e) {
    const message = (e as Error).message;
    const profile = cand.profile_json as CandidateProfile;
    const cohort = cand.cohort as Cohort;
    const draftText = buildFallbackDraft(profile, cohort);

    await supabase
      .from('candidates')
      .update({ next_action_draft: draftText, status: 'complete' })
      .eq('id', candidateId);

    const { data: allCands } = await supabase
      .from('candidates')
      .select('id, match_score, interest_score, cohort')
      .eq('run_id', runId);
    if (allCands) {
      const rankable = allCands
        .filter((c) => c.cohort && c.match_score != null && c.interest_score != null)
        .map((c) => ({
          id: c.id as string,
          match_score: c.match_score as number,
          interest_score: c.interest_score as number,
          cohort: c.cohort as Cohort,
        }));
      const ranks = rankWithinCohort(rankable);
      await Promise.all(
        Array.from(ranks.entries()).map(([id, rank]) =>
          supabase.from('candidates').update({ rank_within_cohort: rank }).eq('id', id)
        )
      );
    }

    console.warn(`[draft] model failed for ${candidateId}; used fallback draft: ${message}`);
    return NextResponse.json({ draft: draftText, cohort, fallback: true });
  }
}
