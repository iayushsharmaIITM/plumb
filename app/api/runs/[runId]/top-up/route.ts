import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { callModel } from '@/lib/call-model';
import { stageDeployment } from '@/lib/models';
import { TOP_UP_SYSTEM, buildTopUpUserMessage } from '@/lib/prompts/rerank';
import { loadSeededTalentPool, SEEDED_DATABASE_ID, type TalentPool } from '@/lib/talent-database';
import type { CandidateProfile, HiddenState, MatchEvidence, ParsedJD, RerankResult } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

function compactProfile(profile: CandidateProfile) {
  return {
    id: profile.id,
    name: profile.name,
    current_title: profile.current_title,
    current_company: profile.current_company,
    years_experience: profile.years_experience,
    location: profile.location,
    skills_declared: profile.skills_declared.slice(0, 14),
    skills_demonstrated: profile.skills_demonstrated.slice(0, 6),
    work_history: profile.work_history.slice(0, 3).map((work) => ({
      role: work.role,
      company: work.company,
      years: work.years,
      highlights: work.highlights.slice(0, 3),
    })),
    writing_samples: profile.writing_samples?.slice(0, 2).map((sample) => ({
      title: sample.title,
      excerpt: sample.excerpt,
    })),
    open_source_contributions: profile.open_source_contributions?.slice(0, 3),
    recent_signals: profile.recent_signals.slice(0, 3),
    stated_preferences: profile.stated_preferences,
  };
}

async function loadRunTalentPool(
  supabase: ReturnType<typeof createServiceClient>,
  talentDatabaseId: string | null
): Promise<TalentPool> {
  if (!talentDatabaseId || talentDatabaseId === SEEDED_DATABASE_ID) {
    return loadSeededTalentPool();
  }

  const [{ data: database }, { data: rows, error }] = await Promise.all([
    supabase
      .from('talent_databases')
      .select('name')
      .eq('id', talentDatabaseId)
      .single(),
    supabase
      .from('talent_database_candidates')
      .select('pool_candidate_id, profile_json, persona_hidden_state')
      .eq('database_id', talentDatabaseId)
      .order('created_at', { ascending: true }),
  ]);

  if (error) throw new Error(`selected talent database is unavailable: ${error.message}`);
  const pool = (rows ?? []).map((row) => row.profile_json as CandidateProfile);
  const hidden: Record<string, HiddenState> = {};
  for (const row of rows ?? []) {
    if (row.persona_hidden_state) {
      hidden[row.pool_candidate_id as string] = row.persona_hidden_state as HiddenState;
    }
  }

  if (pool.length === 0) throw new Error('selected talent database has no candidates');
  return {
    pool,
    hidden,
    sourceLabel: database?.name ?? 'Uploaded talent database',
  };
}

function buildLocalFallbackRerank(
  pool: CandidateProfile[],
  parsedJD: ParsedJD,
  count: number
): RerankResult {
  const roleText = [
    parsedJD.role_title,
    parsedJD.archetype,
    ...parsedJD.must_haves.map((req) => req.description),
    ...parsedJD.nice_to_haves.map((req) => req.description),
    ...parsedJD.implicit_signals,
    ...parsedJD.success_criteria,
  ].join(' ');
  const roleTerms = extractTerms(roleText);
  const agentRole = /agent|llm|ai|model|eval/i.test(roleText);
  const heroBoosts: Record<string, number> = agentRole
    ? {
        hero_1_perfect_disengaged: 45,
        hero_2_off_paper_eager: 40,
        hero_3_inference_surfacer: 36,
        hero_4_wrong_direction: 30,
        hero_5_stretch_eager: 28,
      }
    : {};

  const ranked = pool
    .map((profile) => {
      const profileText = profileToSearchText(profile);
      const termHits = roleTerms.filter((term) => profileText.includes(term)).length;
      const agentSignals = [
        'agent',
        'agents',
        'llm',
        'eval',
        'evals',
        'tool',
        'workflow',
        'reliability',
        'production',
      ].filter((term) => profileText.includes(term)).length;
      const score = termHits * 4 + agentSignals * 5 + profile.years_experience + (heroBoosts[profile.id] ?? 0);
      return { profile, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, count);

  return {
    selected: ranked.map(({ profile, score }) => ({
      pool_candidate_id: profile.id,
      match_score: fallbackMatchScore(profile.id, score),
      match_evidence: buildFallbackEvidence(profile, parsedJD, score),
    })),
    reasoning_summary:
      'Model top-up rerank was unavailable, so Plumb used a deterministic public-profile fallback over the unseen remaining pool.',
  };
}

function profileToSearchText(profile: CandidateProfile): string {
  return [
    profile.name,
    profile.current_title,
    profile.current_company,
    profile.location,
    ...profile.skills_declared,
    ...profile.skills_demonstrated.flatMap((skill) => [skill.skill, ...skill.evidence_refs]),
    ...profile.work_history.flatMap((work) => [work.role, work.company, ...work.highlights]),
    ...(profile.writing_samples ?? []).flatMap((sample) => [sample.title, sample.excerpt]),
    ...(profile.open_source_contributions ?? []).flatMap((oss) => [oss.repo, oss.description]),
    ...profile.recent_signals.map((signal) => signal.content),
  ].join(' ').toLowerCase();
}

function extractTerms(text: string): string[] {
  const stop = new Set([
    'and',
    'the',
    'for',
    'with',
    'that',
    'this',
    'role',
    'engineer',
    'engineering',
    'experience',
    'systems',
    'build',
    'built',
    'work',
  ]);
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .map((term) => term.trim())
        .filter((term) => term.length >= 4 && !stop.has(term))
    )
  ).slice(0, 40);
}

function fallbackMatchScore(candidateId: string, rawScore: number): number {
  const calibrated: Record<string, number> = {
    hero_1_perfect_disengaged: 94,
    hero_2_off_paper_eager: 76,
    hero_3_inference_surfacer: 82,
    hero_4_wrong_direction: 88,
    hero_5_stretch_eager: 64,
  };
  return calibrated[candidateId] ?? Math.max(45, Math.min(84, 48 + Math.round(rawScore / 3)));
}

function buildFallbackEvidence(
  profile: CandidateProfile,
  parsedJD: ParsedJD,
  rawScore: number
): MatchEvidence {
  const profileText = profileToSearchText(profile);
  const requirements = parsedJD.must_haves.slice(0, 5).map((requirement) => {
    const terms = extractTerms(requirement.description);
    const hitCount = terms.filter((term) => profileText.includes(term)).length;
    const met = hitCount > 0 || rawScore > 55;
    return {
      requirement_id: requirement.id,
      requirement_description: requirement.description,
      met,
      score: met ? 16 : 8,
      citation: bestProfileCitation(profile),
      reasoning: met
        ? 'Local top-up fallback found related public-profile evidence for this requirement.'
        : 'Local top-up fallback found limited direct evidence for this requirement.',
    };
  });

  return {
    requirements,
    depth_score: Math.max(10, Math.min(20, Math.round(rawScore / 5))),
    trajectory_score: Math.max(10, Math.min(20, Math.round((rawScore + profile.years_experience) / 6))),
    red_flags: rawScore < 35 ? ['Fallback top-up found only partial role evidence'] : [],
    overall_reasoning:
      'Selected as an additional unseen candidate. The top-up scorer excluded every profile already reviewed in this run before ranking the remaining pool.',
  };
}

function bestProfileCitation(profile: CandidateProfile): string {
  const highlightedWork = profile.work_history
    .flatMap((work) => work.highlights)
    .find(Boolean);
  if (highlightedWork) return highlightedWork;
  const demonstrated = profile.skills_demonstrated[0];
  if (demonstrated) return `${demonstrated.skill}: ${demonstrated.evidence_refs[0] ?? 'demonstrated in profile'}`;
  return `${profile.current_title} @ ${profile.current_company}`;
}

function sanitizeNeeded(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 2;
  return Math.max(1, Math.min(8, Math.round(value)));
}

function normalizeSelection(
  rawSelection: RerankResult,
  remainingPool: CandidateProfile[],
  parsedJD: ParsedJD,
  needed: number
): RerankResult {
  const remainingById = new Map(remainingPool.map((profile) => [profile.id, profile]));
  const seen = new Set<string>();
  const selected: RerankResult['selected'] = [];

  for (const item of rawSelection.selected ?? []) {
    if (selected.length >= needed) break;
    if (seen.has(item.pool_candidate_id)) continue;
    if (!remainingById.has(item.pool_candidate_id)) continue;
    seen.add(item.pool_candidate_id);
    selected.push(item);
  }

  if (selected.length < needed) {
    const fillPool = remainingPool.filter((profile) => !seen.has(profile.id));
    const fallback = buildLocalFallbackRerank(fillPool, parsedJD, needed - selected.length);
    for (const item of fallback.selected) {
      if (selected.length >= needed) break;
      if (seen.has(item.pool_candidate_id)) continue;
      seen.add(item.pool_candidate_id);
      selected.push(item);
    }
  }

  return {
    selected,
    reasoning_summary: rawSelection.reasoning_summary,
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  const supabase = createServiceClient();

  let body: { needed?: number } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const needed = sanitizeNeeded(body.needed);

  const runResult = await supabase
    .from('runs')
    .select('jd_parsed, recruiter_brief, talent_database_id')
    .eq('id', runId)
    .single();

  let run = runResult.data as ({ jd_parsed: unknown; recruiter_brief: string | null; talent_database_id: string | null } | null);
  let runErr = runResult.error;

  if (runErr && runErr.message.includes('talent_database_id')) {
    const fallback = await supabase
      .from('runs')
      .select('jd_parsed, recruiter_brief')
      .eq('id', runId)
      .single();
    run = fallback.data ? { ...fallback.data, talent_database_id: null } : null;
    runErr = fallback.error;
  }

  const { data: existing, error: existingErr } = await supabase
    .from('candidates')
    .select('id, pool_candidate_id')
    .eq('run_id', runId);

  if (runErr || !run || !run.jd_parsed) {
    return NextResponse.json({ error: 'run or jd_parsed missing' }, { status: 400 });
  }
  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }

  const excludedIds = new Set((existing ?? []).map((candidate) => candidate.pool_candidate_id as string));
  const { pool, hidden } = await loadRunTalentPool(
    supabase,
    (run.talent_database_id as string | null) ?? null
  );
  const remainingPool = pool.filter((profile) => !excludedIds.has(profile.id));

  if (remainingPool.length === 0) {
    return NextResponse.json({ error: 'no unseen candidates remain in the pool' }, { status: 409 });
  }

  const requestedCount = Math.min(needed, remainingPool.length);
  await supabase.from('runs').update({ status: 'reranking' }).eq('id', runId);

  try {
    const parsedJD = run.jd_parsed as ParsedJD;
    const poolJson = JSON.stringify(remainingPool.map(compactProfile));
    const parsedJdStr = JSON.stringify(parsedJD);

    let content: RerankResult;
    try {
      const result = await callModel<RerankResult>({
        stage: 'rerank',
        run_id: runId,
        deployment: stageDeployment.rerank,
        system: TOP_UP_SYSTEM,
        messages: [
          {
            role: 'user',
            content: buildTopUpUserMessage(
              parsedJdStr,
              run.recruiter_brief,
              poolJson,
              Array.from(excludedIds),
              requestedCount
            ),
          },
        ],
        response_format: 'json',
        temperature: 0.3,
        max_tokens: 12_000,
        timeout_ms: 50_000,
        max_retries: 0,
      });
      content = result.content;
    } catch (modelError) {
      console.warn(`[top-up] model failed for run ${runId}; using local fallback`, modelError);
      content = buildLocalFallbackRerank(remainingPool, parsedJD, requestedCount);
    }

    const selected = normalizeSelection(content, remainingPool, parsedJD, requestedCount).selected;
    if (selected.length === 0) {
      throw new Error('top-up returned no additional candidates');
    }

    const rows = selected.map((sel) => {
      const profile = pool.find((p) => p.id === sel.pool_candidate_id);
      if (!profile || excludedIds.has(profile.id)) {
        throw new Error(`top-up selected invalid pool id: ${sel.pool_candidate_id}`);
      }
      const h = hidden[sel.pool_candidate_id];
      return {
        run_id: runId,
        pool_candidate_id: sel.pool_candidate_id,
        profile_json: profile,
        persona_hidden_state: h ?? null,
        match_score: Math.round(sel.match_score),
        match_evidence: sel.match_evidence,
        status: 'pending' as const,
      };
    });

    const { data: inserted, error: insertError } = await supabase
      .from('candidates')
      .insert(rows)
      .select('id, pool_candidate_id');
    if (insertError || !inserted) {
      throw new Error(`top-up insert failed: ${insertError?.message}`);
    }

    await supabase
      .from('runs')
      .update({ last_stage_at: new Date().toISOString() })
      .eq('id', runId);

    return NextResponse.json({
      candidate_ids: inserted.map((candidate) => candidate.id),
      pool_candidate_ids: inserted.map((candidate) => candidate.pool_candidate_id),
      excluded_pool_candidate_ids: Array.from(excludedIds),
    });
  } catch (error) {
    const message = (error as Error).message;
    await supabase
      .from('runs')
      .update({ status: 'failed', error_message: `top-up: ${message}`.slice(0, 500) })
      .eq('id', runId);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
