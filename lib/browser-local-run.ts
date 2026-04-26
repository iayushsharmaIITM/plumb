'use client';

import { assignCohort, rankWithinCohort } from '@/lib/pipeline/cohort';
import type {
  CandidateProfile,
  CandidateReviewDecision,
  Cohort,
  HiddenState,
  InterestEvidence,
  MatchEvidence,
} from '@/lib/types';

export interface StoredBrowserDatabase {
  name: string;
  candidate_count: number;
  source_type?: string;
  candidates: unknown[];
}

export interface StoredLocalRun {
  id: string;
  jd_text: string;
  recruiter_brief: string | null;
  talent_database: StoredBrowserDatabase;
  created_at: string;
}

export interface LocalTurn {
  turn_number: number;
  speaker: 'recruiter' | 'candidate';
  content: string;
}

export interface LocalCandidateData {
  id: string;
  run_id: string;
  pool_candidate_id: string;
  profile_json: CandidateProfile;
  match_score: number;
  match_evidence: MatchEvidence;
  interest_score: number;
  interest_evidence: InterestEvidence;
  cohort: Cohort;
  next_action_draft: string;
  rank_within_cohort: number | null;
  status: 'complete';
  review_decision: CandidateReviewDecision;
  reviewed_at: string | null;
  turns: LocalTurn[];
}

export function localRunStorageKey(runId: string): string {
  return `plumb:local-run:${runId}`;
}

export function localCandidatesStorageKey(runId: string): string {
  return `plumb:local-candidates:${runId}`;
}

export function saveLocalRun(run: StoredLocalRun): void {
  window.sessionStorage.setItem(localRunStorageKey(run.id), JSON.stringify(run));
}

export function loadLocalRun(runId: string): StoredLocalRun | null {
  try {
    const raw = window.sessionStorage.getItem(localRunStorageKey(runId));
    return raw ? JSON.parse(raw) as StoredLocalRun : null;
  } catch {
    return null;
  }
}

export function saveLocalCandidates(runId: string, candidates: LocalCandidateData[]): void {
  window.sessionStorage.setItem(localCandidatesStorageKey(runId), JSON.stringify(candidates));
}

export function loadLocalCandidates(runId: string): LocalCandidateData[] {
  try {
    const raw = window.sessionStorage.getItem(localCandidatesStorageKey(runId));
    return raw ? JSON.parse(raw) as LocalCandidateData[] : [];
  } catch {
    return [];
  }
}

export function buildLocalCandidates(
  run: StoredLocalRun,
  existingPoolIds = new Set<string>(),
  count = 8
): LocalCandidateData[] {
  const requirements = inferRequirements(run.jd_text);
  const terms = extractTerms([run.jd_text, run.recruiter_brief ?? ''].join(' '));
  const profiles = normalizeProfiles(run.talent_database.candidates);

  const ranked = profiles
    .filter((profile) => !existingPoolIds.has(profile.id))
    .map((profile) => {
      const profileText = profileToText(profile);
      const termHits = terms.filter((term) => profileText.includes(term)).length;
      const skillHits = profile.skills_declared.filter((skill) =>
        terms.some((term) => skill.toLowerCase().includes(term))
      ).length;
      const evidenceHits = profile.skills_demonstrated.filter((skill) =>
        skill.evidence_refs.some((ref) => terms.some((term) => ref.toLowerCase().includes(term)))
      ).length;
      const score = Math.max(
        42,
        Math.min(96, Math.round(48 + termHits * 3.5 + skillHits * 4 + evidenceHits * 3 + profile.years_experience))
      );
      return { profile, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, count);

  const candidates = ranked.map(({ profile, score }, index) => {
    const interestScore = estimateInterestScore(profile, run.jd_text, index);
    const cohort = assignCohort(score, interestScore);
    const turns = buildTurns(profile, run.jd_text, interestScore);
    const candidate: LocalCandidateData = {
      id: `local-${profile.id}`,
      run_id: run.id,
      pool_candidate_id: profile.id,
      profile_json: profile,
      match_score: score,
      match_evidence: buildMatchEvidence(profile, requirements, score),
      interest_score: interestScore,
      interest_evidence: buildInterestEvidence(turns, interestScore),
      cohort,
      next_action_draft: buildNextAction(profile, cohort),
      rank_within_cohort: null,
      status: 'complete',
      review_decision: 'undecided',
      reviewed_at: null,
      turns,
    };
    return candidate;
  });

  const ranks = rankWithinCohort(candidates.map((candidate) => ({
    id: candidate.id,
    match_score: candidate.match_score,
    interest_score: candidate.interest_score,
    cohort: candidate.cohort,
  })));

  return candidates.map((candidate) => ({
    ...candidate,
    rank_within_cohort: ranks.get(candidate.id) ?? null,
  }));
}

export function appendLocalConversation(
  runId: string,
  candidateId: string,
  recruiterMessage: string
): { candidate: LocalCandidateData | null; turns: LocalTurn[] } {
  const candidates = loadLocalCandidates(runId);
  const index = candidates.findIndex((candidate) => candidate.id === candidateId);
  if (index < 0) return { candidate: null, turns: [] };

  const candidate = candidates[index];
  const nextTurn = candidate.turns.length + 1;
  const recruiterTurn: LocalTurn = {
    turn_number: nextTurn,
    speaker: 'recruiter',
    content: recruiterMessage,
  };
  const candidateTurn: LocalTurn = {
    turn_number: nextTurn + 1,
    speaker: 'candidate',
    content: buildFollowUpReply(candidate.profile_json, recruiterMessage),
  };
  const turns = [...candidate.turns, recruiterTurn, candidateTurn];
  const interestScore = Math.min(96, candidate.interest_score + scoreFollowUp(recruiterMessage));
  const updated: LocalCandidateData = {
    ...candidate,
    turns,
    interest_score: interestScore,
    interest_evidence: buildInterestEvidence(turns, interestScore),
    cohort: assignCohort(candidate.match_score, interestScore),
    next_action_draft: buildNextAction(candidate.profile_json, assignCohort(candidate.match_score, interestScore)),
  };
  candidates[index] = updated;
  saveLocalCandidates(runId, candidates);
  return { candidate: updated, turns: [recruiterTurn, candidateTurn] };
}

function normalizeProfiles(rawCandidates: unknown[]): CandidateProfile[] {
  return rawCandidates.map((raw, index) => {
    const item = isRecord(raw) ? raw : {};
    const name = asString(item.name) || `Candidate ${index + 1}`;
    const currentTitle = asString(item.current_title) || asString(item.title) || asString(item.role) || 'Candidate';
    const currentCompany = asString(item.current_company) || asString(item.company) || 'Unknown company';
    const yearsExperience = asNumber(item.years_experience) ?? asNumber(item.years) ?? 0;
    const skills = stringList(item.skills_declared ?? item.skills);
    const summary = asString(item.summary) || asString(item.notes) || asString(item.headline) || '';

    return {
      id: stableId(asString(item.id) || asString(item.email) || `${name}-${currentCompany}-${index}`),
      name,
      current_title: currentTitle,
      current_company: currentCompany,
      years_experience: yearsExperience,
      location: asString(item.location) || 'Unknown',
      work_history: Array.isArray(item.work_history) && item.work_history.length > 0
        ? item.work_history as CandidateProfile['work_history']
        : [{
            role: currentTitle,
            company: currentCompany,
            years: yearsExperience,
            start_year: Math.max(2000, 2026 - Math.max(1, Math.round(yearsExperience))),
            highlights: [
              summary || `${currentTitle} at ${currentCompany}`,
              ...stringList(item.highlights).slice(0, 3),
            ].filter(Boolean),
          }],
      skills_declared: skills,
      skills_demonstrated: demonstratedSkills(item, skills, summary),
      education: educationEntries(item),
      writing_samples: writingSamples(item),
      open_source_contributions: ossContributions(item),
      recent_signals: recentSignals(item, summary),
      stated_preferences: isRecord(item.stated_preferences)
        ? item.stated_preferences as CandidateProfile['stated_preferences']
        : undefined,
    };
  });
}

function demonstratedSkills(
  item: Record<string, unknown>,
  skills: string[],
  summary: string
): CandidateProfile['skills_demonstrated'] {
  if (Array.isArray(item.skills_demonstrated) && item.skills_demonstrated.length > 0) {
    return item.skills_demonstrated as CandidateProfile['skills_demonstrated'];
  }
  return skills.slice(0, 8).map((skill) => ({
    skill,
    evidence_refs: [summary || `Declared skill: ${skill}`],
  }));
}

function educationEntries(item: Record<string, unknown>): CandidateProfile['education'] {
  if (Array.isArray(item.education) && item.education.length > 0) {
    return item.education as CandidateProfile['education'];
  }
  const degree = asString(item.degree) || asString(item.education);
  const institution = asString(item.institution) || asString(item.school) || 'Unknown';
  return degree ? [{ degree, institution, year: asNumber(item.graduation_year) ?? 2024 }] : [];
}

function writingSamples(item: Record<string, unknown>): CandidateProfile['writing_samples'] {
  if (Array.isArray(item.writing_samples)) return item.writing_samples as CandidateProfile['writing_samples'];
  const writing = asString(item.writing) || asString(item.blog);
  return writing ? [{ title: 'Uploaded writing signal', url: '', excerpt: writing }] : undefined;
}

function ossContributions(item: Record<string, unknown>): CandidateProfile['open_source_contributions'] {
  if (Array.isArray(item.open_source_contributions)) {
    return item.open_source_contributions as CandidateProfile['open_source_contributions'];
  }
  const github = asString(item.github) || asString(item.open_source);
  return github ? [{ repo: github, description: asString(item.github_summary) || github }] : undefined;
}

function recentSignals(item: Record<string, unknown>, summary: string): CandidateProfile['recent_signals'] {
  if (Array.isArray(item.recent_signals) && item.recent_signals.length > 0) {
    return item.recent_signals as CandidateProfile['recent_signals'];
  }
  return [{
    type: 'blog_post',
    content: asString(item.recent_signal) || summary || 'Uploaded candidate profile signal',
    date: '2026-04-26',
  }];
}

function inferRequirements(jdText: string): string[] {
  const lines = jdText
    .split(/\n|\.|•|-/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 18);
  const prioritized = lines.filter((line) =>
    /llm|agent|retrieval|search|eval|nlp|machine learning|ml|data|workflow|fine-tune|document|query/i.test(line)
  );
  return Array.from(new Set([...prioritized, ...lines])).slice(0, 5);
}

function buildMatchEvidence(
  profile: CandidateProfile,
  requirements: string[],
  matchScore: number
): MatchEvidence {
  const profileText = profileToText(profile);
  const requirementEvidence = requirements.map((requirement, index) => {
    const terms = extractTerms(requirement);
    const hits = terms.filter((term) => profileText.includes(term));
    const met = hits.length > 0 || matchScore >= 70;
    return {
      requirement_id: `r${index + 1}`,
      requirement_description: requirement,
      met,
      score: met ? 16 : 8,
      citation: bestCitation(profile),
      reasoning: met
        ? 'Matched against uploaded profile evidence and declared skills.'
        : 'Only partial uploaded-profile evidence found for this requirement.',
    };
  });

  return {
    requirements: requirementEvidence,
    depth_score: Math.max(10, Math.min(20, Math.round(matchScore / 5))),
    trajectory_score: Math.max(10, Math.min(20, Math.round((matchScore + profile.years_experience) / 6))),
    red_flags: matchScore < 55 ? ['Uploaded profile has limited direct evidence for this JD.'] : [],
    overall_reasoning:
      'Ranked from the uploaded candidate database using JD term overlap, demonstrated skills, work-history citations, and experience depth.',
  };
}

function buildInterestEvidence(turns: LocalTurn[], interestScore: number): InterestEvidence {
  const candidateTurns = turns.filter((turn) => turn.speaker === 'candidate');
  const first = candidateTurns[0]?.content ?? 'Candidate asked for more role context.';
  const second = candidateTurns[1]?.content ?? first;

  return {
    signals: [
      signal('specificity_of_engagement', Math.min(20, Math.round(interestScore / 5)), 1, first, 'Candidate engaged with concrete role context.'),
      signal('forward_commitment', interestScore >= 70 ? 16 : 10, 2, second, 'Candidate gave enough signal to justify a recruiter follow-up.'),
      signal('objection_handling', interestScore >= 65 ? 15 : 9, 2, second, 'Candidate surfaced conditions instead of disengaging.'),
      signal('availability_timing', interestScore >= 75 ? 16 : 10, 1, first, 'Candidate remained open to a next conversation.'),
      signal('motivation_alignment', interestScore >= 70 ? 17 : 11, 2, second, 'Motivation aligns when the role scope is credible.'),
    ],
    overall_reasoning:
      'Browser-local simulation scored interest from the candidate profile, stated preferences, and transcript signals generated for this run.',
    risk_flags: interestScore < 65
      ? ['Candidate needs clearer role scope before moving forward.']
      : [],
  };
}

function signal(
  name: InterestEvidence['signals'][number]['name'],
  score: number,
  turn: number,
  span: string,
  reasoning: string
): InterestEvidence['signals'][number] {
  return {
    name,
    score,
    evidence: [{ turn, span, reasoning }],
  };
}

function buildTurns(profile: CandidateProfile, jdText: string, interestScore: number): LocalTurn[] {
  const focus = extractTerms(jdText).slice(0, 3).join(', ') || 'the role scope';
  return [
    {
      turn_number: 1,
      speaker: 'recruiter',
      content: `${profile.name}, your background in ${profile.skills_declared.slice(0, 2).join(' and ') || profile.current_title} stood out for this role. Would you be open to a quick conversation?`,
    },
    {
      turn_number: 2,
      speaker: 'candidate',
      content: interestScore >= 70
        ? `Yes, I am open to learning more. The ${focus} angle is close to work I want to do next, and I would want to understand ownership and team expectations.`
        : `I can take a look, but I would need more clarity on the ${focus} scope before committing time to a full process.`,
    },
    {
      turn_number: 3,
      speaker: 'recruiter',
      content: `The first conversation would focus on technical fit, project depth, and whether the team scope matches what you want next.`,
    },
    {
      turn_number: 4,
      speaker: 'candidate',
      content: interestScore >= 70
        ? 'That sounds worth discussing. If the work is hands-on and the team is serious about quality, I am open to a next step.'
        : 'That helps. I am not fully sure yet, but I am open to a short screen if the role is clearly aligned.',
    },
  ];
}

function buildFollowUpReply(profile: CandidateProfile, recruiterMessage: string): string {
  const message = recruiterMessage.toLowerCase();
  if (/timing|available|schedule|next/.test(message)) {
    return 'I can make time for a focused first conversation if the scope is aligned. Early next week would be realistic.';
  }
  if (/comp|salary|offer/.test(message)) {
    return 'Comp matters, but I would rather first confirm the role scope, team quality, and whether the work is technically deep.';
  }
  if (/team|manager|ownership|scope/.test(message)) {
    return 'Ownership and team quality are the main things I would want to understand. I am more interested if the role has real responsibility, not just support work.';
  }
  return `That is helpful context. Based on my work as ${profile.current_title}, I would be open to a focused conversation if the role has clear technical depth.`;
}

function buildNextAction(profile: CandidateProfile, cohort: Cohort): string {
  if (cohort === 'recommended') {
    return `Invite ${profile.name} to a technical screen and lead with the strongest match evidence from their uploaded profile.`;
  }
  if (cohort === 'stretch') {
    return `Schedule a short exploratory call with ${profile.name}; validate the missing requirement before a full loop.`;
  }
  if (cohort === 'nurture') {
    return `Send ${profile.name} a role-scope note and ask what would make this worth a deeper conversation.`;
  }
  return `Keep ${profile.name} warm only if the role constraints change or the candidate pool is exhausted.`;
}

function estimateInterestScore(profile: CandidateProfile, jdText: string, index: number): number {
  const text = profileToText(profile);
  const jdTerms = extractTerms(jdText);
  const overlap = jdTerms.filter((term) => text.includes(term)).length;
  const positive = ['open', 'growth', 'startup', 'mission', 'agent', 'llm', 'research', 'ownership', 'remote']
    .filter((term) => text.includes(term)).length;
  return Math.max(48, Math.min(92, Math.round(58 + overlap * 1.5 + positive * 3 - index)));
}

function scoreFollowUp(message: string): number {
  return /schedule|next|available|interview|team|scope|ownership/i.test(message) ? 4 : 2;
}

function profileToText(profile: CandidateProfile): string {
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
    ...profile.recent_signals.map((signalItem) => signalItem.content),
  ].join(' ').toLowerCase();
}

function bestCitation(profile: CandidateProfile): string {
  const work = profile.work_history.flatMap((entry) => entry.highlights).find(Boolean);
  if (work) return work;
  const skill = profile.skills_demonstrated[0];
  if (skill) return skill.evidence_refs[0] ?? skill.skill;
  return `${profile.current_title} at ${profile.current_company}`;
}

function extractTerms(text: string): string[] {
  const stop = new Set(['and', 'the', 'for', 'with', 'that', 'this', 'role', 'work', 'team', 'about', 'from']);
  return Array.from(new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .map((term) => term.trim())
      .filter((term) => term.length >= 4 && !stop.has(term))
  )).slice(0, 48);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(asString(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function stableId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || `candidate_${Date.now()}`;
}

export function neutralHiddenState(profile: CandidateProfile): HiddenState {
  return {
    situation: {
      current_role_satisfaction: 6,
      search_intensity: 'casually_looking',
      time_at_current_role_months: Math.max(6, Math.round(profile.years_experience * 12)),
      real_reason_for_move: 'Open to a stronger fit if the role has credible scope, team quality, and technical depth.',
    },
    drivers: {
      primary: 'growth',
      secondary: 'team',
      compensation_expectation: { min: 0, target: 0, attitude: 'Discuss later if there is mutual fit' },
      deal_breakers: ['unclear role scope', 'weak engineering culture'],
    },
    concerns: {
      about_this_role: [{ concern: 'Needs proof that the role is substantive.', severity: 'medium' }],
      about_the_company: ['Wants to understand team maturity and execution quality'],
      gut_feel: 'Cautiously interested if the opportunity matches the profile.',
    },
    life: {
      constraints: 'No private constraints provided in uploaded database.',
      external_pressures: 'None provided.',
      risk_appetite: 'medium',
    },
    behavior: {
      verbosity: 'medium',
      politeness_mask: 7,
      directness: 'diplomatic',
      question_tendency: 'normal',
    },
    revelation: {
      volunteer: ['public work history', 'visible skills', 'role curiosity'],
      respond: ['timing', 'motivation', 'team preferences'],
      guarded: ['compensation specifics', 'personal constraints', 'private job-search details'],
    },
  };
}
