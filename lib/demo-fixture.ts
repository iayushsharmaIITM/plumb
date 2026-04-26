import demoRun from '@/data/demo-run.json';
import type { CandidateProfile, Cohort, InterestEvidence, MatchEvidence } from './types';

export interface DemoRunData {
  id: string;
  source_run_id?: string | null;
  jd_text: string;
  jd_parsed: Record<string, unknown>;
  status: string;
}

export interface DemoCandidateData {
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
  rank_within_cohort: number;
  status: string;
}

export interface DemoTurn {
  turn_number: number;
  speaker: 'recruiter' | 'candidate';
  content: string;
}

export interface DemoFixture {
  exported_at: string;
  source: string;
  run: DemoRunData;
  candidates: DemoCandidateData[];
  conversations: Record<string, DemoTurn[]>;
}

export const demoFixture = demoRun as DemoFixture;

export function getDemoCandidate(candidateId: string): DemoCandidateData | null {
  return demoFixture.candidates.find((candidate) => candidate.id === candidateId) ?? null;
}

export function getDemoTurns(candidateId: string): DemoTurn[] {
  return demoFixture.conversations[candidateId] ?? [];
}
