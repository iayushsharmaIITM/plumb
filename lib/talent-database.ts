import { readFileSync } from 'fs';
import path from 'path';
import type { CandidateProfile, HiddenState } from '@/lib/types';

export const SEEDED_DATABASE_ID = 'seeded-120';

export interface TalentPool {
  pool: CandidateProfile[];
  hidden: Record<string, HiddenState>;
  sourceLabel: string;
}

let poolCache: CandidateProfile[] | null = null;
let hiddenCache: Record<string, HiddenState> | null = null;

export function loadSeededTalentPool(): TalentPool {
  if (!poolCache || !hiddenCache) {
    const poolPath = path.join(process.cwd(), 'data/pool.json');
    const hiddenPath = path.join(process.cwd(), 'data/hidden-states.json');
    poolCache = JSON.parse(readFileSync(poolPath, 'utf8')) as CandidateProfile[];
    hiddenCache = JSON.parse(readFileSync(hiddenPath, 'utf8')) as Record<string, HiddenState>;
  }
  return {
    pool: poolCache,
    hidden: hiddenCache,
    sourceLabel: 'Seeded ATS + portfolio corpus',
  };
}

export function normalizeUploadedCandidates(rawCandidates: unknown[]): {
  profile: CandidateProfile;
  hiddenState: HiddenState | null;
}[] {
  return rawCandidates.map((raw, index) => normalizeUploadedCandidate(raw, index));
}

function normalizeUploadedCandidate(raw: unknown, index: number): {
  profile: CandidateProfile;
  hiddenState: HiddenState | null;
} {
  const item = isRecord(raw) ? raw : {};
  const name = asString(item.name) || `Candidate ${index + 1}`;
  const currentTitle = asString(item.current_title) || asString(item.title) || asString(item.role) || 'Candidate';
  const currentCompany = asString(item.current_company) || asString(item.company) || 'Unknown company';
  const yearsExperience = asNumber(item.years_experience) ?? asNumber(item.years) ?? 0;
  const skills = stringList(item.skills_declared ?? item.skills);
  const summary = asString(item.summary) || asString(item.notes) || asString(item.headline) || '';
  const id = stableId(asString(item.id) || asString(item.email) || `${name}-${currentCompany}-${index}`);

  const profile: CandidateProfile = {
    id,
    name,
    current_title: currentTitle,
    current_company: currentCompany,
    years_experience: yearsExperience,
    location: asString(item.location) || 'Unknown',
    work_history: workHistory(item, currentTitle, currentCompany, yearsExperience, summary),
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

  return {
    profile,
    hiddenState: hiddenStateFromUpload(item, profile),
  };
}

function workHistory(
  item: Record<string, unknown>,
  currentTitle: string,
  currentCompany: string,
  yearsExperience: number,
  summary: string
): CandidateProfile['work_history'] {
  if (Array.isArray(item.work_history) && item.work_history.length > 0) {
    return item.work_history as CandidateProfile['work_history'];
  }

  return [{
    role: currentTitle,
    company: currentCompany,
    years: yearsExperience,
    start_year: Math.max(2000, 2026 - Math.max(1, Math.round(yearsExperience))),
    highlights: [
      summary || `${currentTitle} at ${currentCompany}`,
      ...stringList(item.highlights).slice(0, 3),
    ].filter(Boolean),
  }];
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

function hiddenStateFromUpload(item: Record<string, unknown>, profile: CandidateProfile): HiddenState | null {
  if (isRecord(item.persona_hidden_state)) return item.persona_hidden_state as unknown as HiddenState;
  if (isRecord(item.hidden_state)) return item.hidden_state as unknown as HiddenState;
  return buildNeutralHiddenState(profile);
}

export function buildNeutralHiddenState(profile: CandidateProfile): HiddenState {
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
      about_this_role: [{ concern: 'Needs proof that the role is substantive, not just a generic opening', severity: 'medium' }],
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
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
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
