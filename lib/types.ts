// === JD Parsed ===
export interface ParsedJD {
  role_title: string;
  seniority: 'junior' | 'mid' | 'senior' | 'staff' | 'principal' | 'executive';
  archetype: string;
  must_haves: Requirement[];
  nice_to_haves: Requirement[];
  implicit_signals: string[];
  red_flags: string[];
  success_criteria: string[];
}

export interface Requirement {
  id: string;
  description: string;
  category: 'technical' | 'experience' | 'domain' | 'soft';
}

// === Public Profile ===
export interface CandidateProfile {
  id: string;
  name: string;
  current_title: string;
  current_company: string;
  years_experience: number;
  location: string;
  work_history: WorkEntry[];
  skills_declared: string[];
  skills_demonstrated: DemonstratedSkill[];
  education: EducationEntry[];
  writing_samples?: WritingSample[];
  open_source_contributions?: OSSContribution[];
  recent_signals: RecentSignal[];
  stated_preferences?: StatedPreferences;
}

export interface WorkEntry {
  role: string;
  company: string;
  years: number;
  start_year: number;
  end_year?: number;
  highlights: string[];
}
export interface DemonstratedSkill {
  skill: string;
  evidence_refs: string[];
}
export interface EducationEntry {
  degree: string;
  institution: string;
  year: number;
}
export interface WritingSample {
  title: string;
  url: string;
  excerpt: string;
}
export interface OSSContribution {
  repo: string;
  description: string;
  stars?: number;
}
export interface RecentSignal {
  type: 'tweet' | 'blog_post' | 'github_activity' | 'conference_talk';
  content: string;
  date: string;
}
export interface StatedPreferences {
  remote_preference?: string;
  comp_range?: string;
  domains?: string[];
}

// === Hidden State ===
export type Driver =
  | 'compensation'
  | 'mission'
  | 'growth'
  | 'team'
  | 'autonomy'
  | 'stability';

export interface HiddenState {
  situation: {
    current_role_satisfaction: number;
    search_intensity:
      | 'passive_curiosity'
      | 'casually_looking'
      | 'actively_interviewing'
      | 'has_offers';
    time_at_current_role_months: number;
    real_reason_for_move: string;
  };
  drivers: {
    primary: Driver;
    secondary: Driver;
    compensation_expectation: { min: number; target: number; attitude: string };
    deal_breakers: string[];
  };
  concerns: {
    about_this_role: { concern: string; severity: 'low' | 'medium' | 'high' }[];
    about_the_company: string[];
    gut_feel: string;
  };
  life: {
    constraints: string;
    external_pressures: string;
    risk_appetite: 'high' | 'medium' | 'low';
  };
  behavior: {
    verbosity: 'terse' | 'medium' | 'verbose';
    politeness_mask: number;
    directness: 'very_direct' | 'diplomatic' | 'evasive';
    question_tendency: 'rarely' | 'normal' | 'probing';
  };
  revelation: {
    volunteer: string[];
    respond: string[];
    guarded: string[];
  };
}

// === Match Evidence ===
export interface MatchEvidence {
  requirements: {
    requirement_id: string;
    requirement_description: string;
    met: boolean;
    score: number;
    citation: string;
    reasoning: string;
  }[];
  depth_score: number;
  trajectory_score: number;
  red_flags: string[];
  overall_reasoning: string;
}

// === Interest Evidence ===
export type InterestSignalName =
  | 'specificity_of_engagement'
  | 'forward_commitment'
  | 'objection_handling'
  | 'availability_timing'
  | 'motivation_alignment';

export interface InterestEvidence {
  signals: {
    name: InterestSignalName;
    score: number;
    evidence: {
      turn: number;
      span: string;
      reasoning: string;
    }[];
  }[];
  overall_reasoning: string;
  risk_flags: string[];
}

// === Rerank output ===
export interface RerankResult {
  selected: {
    pool_candidate_id: string;
    match_score: number;
    match_evidence: MatchEvidence;
  }[];
  reasoning_summary: string;
}

// === Cohort ===
export type Cohort = 'recommended' | 'stretch' | 'nurture' | 'pass';

// === Recruiter review ===
export type CandidateReviewDecision = 'undecided' | 'selected' | 'waitlist' | 'rejected';

// === Model Call ===
export type StageName =
  | 'parse'
  | 'rerank'
  | 'simulate_recruiter'
  | 'simulate_persona'
  | 'score'
  | 'draft'
  | 'leak_check'
  | 'safety_check'
  | 'pool_gen';

export interface ModelCallOptions {
  stage: StageName;
  run_id?: string;
  candidate_id?: string;
  deployment: string;
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  response_format?: 'json' | 'text';
  temperature?: number;
  max_tokens?: number;
  timeout_ms?: number;
  max_retries?: number;
  reasoning_effort?: 'low' | 'medium' | 'high';
}

export interface ModelCallResult<T = unknown> {
  content: T;
  raw_text: string;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  retry_count: number;
}
