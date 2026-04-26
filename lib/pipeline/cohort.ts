import type { Cohort } from '../types';

export function assignCohort(matchScore: number, interestScore: number): Cohort {
  if (matchScore >= 70 && interestScore >= 60) return 'recommended';
  if (matchScore >= 50 && matchScore <= 69 && interestScore >= 70) return 'stretch';
  if (matchScore >= 70 && interestScore < 60) return 'nurture';
  return 'pass';
}

export interface Rankable {
  id: string;
  match_score: number;
  interest_score: number;
  cohort: Cohort;
}

export function rankWithinCohort(candidates: Rankable[]): Map<string, number> {
  const ranks = new Map<string, number>();
  const byCohort: Record<Cohort, Rankable[]> = {
    recommended: [],
    stretch: [],
    nurture: [],
    pass: [],
  };
  for (const c of candidates) byCohort[c.cohort].push(c);

  const sortKey: Record<Cohort, (c: Rankable) => number> = {
    recommended: (c) => -c.interest_score,
    stretch: (c) => -c.interest_score,
    nurture: (c) => -c.match_score,
    pass: (c) => -(c.match_score + c.interest_score),
  };

  for (const cohort of ['recommended', 'stretch', 'nurture', 'pass'] as Cohort[]) {
    byCohort[cohort]
      .sort((a, b) => sortKey[cohort](a) - sortKey[cohort](b))
      .forEach((c, idx) => ranks.set(c.id, idx + 1));
  }

  return ranks;
}
