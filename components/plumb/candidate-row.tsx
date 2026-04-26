import Link from 'next/link';
import type { Cohort, CandidateProfile, MatchEvidence, InterestEvidence, CandidateReviewDecision } from '@/lib/types';
import { COHORT_META } from './cohort-section';

interface CandidateRowProps {
  runId: string;
  candidateId: string;
  profile: CandidateProfile;
  matchScore: number | null;
  interestScore: number | null;
  cohort: Cohort | null;
  matchEvidence?: MatchEvidence | null;
  interestEvidence?: InterestEvidence | null;
  status: string;
  reviewDecision?: CandidateReviewDecision | null;
  onDecisionChange?: (candidateId: string, decision: CandidateReviewDecision) => void;
}

function ScoreBadge({ value, label, color }: { value: number | null; label: string; color: string }) {
  if (value === null) return <div className="skeleton w-12 h-8" />;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`text-lg font-bold font-mono ${color}`}>{value}</span>
      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</span>
    </div>
  );
}

export default function CandidateRow({
  runId,
  candidateId,
  profile,
  matchScore,
  interestScore,
  interestEvidence,
  matchEvidence,
  cohort,
  status,
  reviewDecision = 'undecided',
  onDecisionChange,
}: CandidateRowProps) {
  const isProcessing = status !== 'complete' && status !== 'failed';
  const discoveryReason =
    matchEvidence?.overall_reasoning ??
    matchEvidence?.requirements.find((req) => req.citation)?.reasoning;
  const interestSummary = interestEvidence?.overall_reasoning;
  const cohortMeta = cohort ? COHORT_META[cohort] : null;
  const decision = reviewDecision ?? 'undecided';

  return (
    <div className="card flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-surface-2/50 sm:flex-row sm:items-center">
      <Link
        href={`/runs/${runId}/candidates/${candidateId}`}
        className="group flex min-w-0 flex-1 items-center gap-4"
      >
        {/* Avatar placeholder */}
        <div className="w-10 h-10 rounded-full bg-surface-3 flex items-center justify-center text-sm font-bold text-zinc-400 shrink-0">
          {profile.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-foreground truncate">{profile.name}</span>
            {cohortMeta && (
              <span className={`badge ${cohortMeta.bg} ${cohortMeta.color} text-[10px]`}>
                {cohortMeta.label}
              </span>
            )}
            {decision !== 'undecided' && (
              <span className={`badge text-[10px] ${decisionBadgeClass(decision)}`}>
                {decisionLabel(decision)}
              </span>
            )}
            {isProcessing && (
              <span className="inline-block h-2 w-2 rounded-full bg-brand animate-pulse" />
            )}
            {status === 'failed' && (
              <span className="badge bg-red-500/15 text-red-400 text-[10px]">Failed</span>
            )}
          </div>
          <p className="text-xs text-zinc-500 truncate">
            {profile.current_title} @ {profile.current_company}
          </p>
          {discoveryReason && (
            <p className="text-xs text-zinc-500 mt-1 line-clamp-1">
              <span className="text-brand">Discovered:</span> {discoveryReason}
            </p>
          )}
          {interestSummary && (
            <p className="text-xs text-zinc-600 mt-1 line-clamp-1">
              <span className="text-zinc-500">Interest:</span> {interestSummary}
            </p>
          )}
        </div>

        {/* Scores */}
        <div className="flex items-center gap-5 shrink-0">
          <ScoreBadge value={matchScore} label="Match" color="text-zinc-300" />
          <ScoreBadge value={interestScore} label="Interest" color="text-brand" />
        </div>

        {/* Arrow */}
        <span className="text-zinc-600 group-hover:text-zinc-400 transition-colors shrink-0">→</span>
      </Link>

      {onDecisionChange && (
        <div className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-surface-1 p-1">
          {(['selected', 'waitlist', 'rejected'] as CandidateReviewDecision[]).map((nextDecision) => {
            const active = decision === nextDecision;
            return (
              <button
                key={nextDecision}
                type="button"
                onClick={() => onDecisionChange(candidateId, active ? 'undecided' : nextDecision)}
                className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                  active
                    ? decisionButtonActiveClass(nextDecision)
                    : 'text-zinc-500 hover:bg-surface-3 hover:text-zinc-300'
                }`}
              >
                {decisionLabel(nextDecision)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function decisionLabel(decision: CandidateReviewDecision): string {
  const labels: Record<CandidateReviewDecision, string> = {
    undecided: 'Open',
    selected: 'Selected',
    waitlist: 'Hold',
    rejected: 'Reject',
  };
  return labels[decision];
}

function decisionBadgeClass(decision: CandidateReviewDecision): string {
  const classes: Record<CandidateReviewDecision, string> = {
    undecided: 'bg-surface-3 text-zinc-400',
    selected: 'bg-recommended/15 text-recommended',
    waitlist: 'bg-nurture/15 text-nurture',
    rejected: 'bg-pass/15 text-pass',
  };
  return classes[decision];
}

function decisionButtonActiveClass(decision: CandidateReviewDecision): string {
  const classes: Record<CandidateReviewDecision, string> = {
    undecided: 'bg-surface-3 text-zinc-300',
    selected: 'bg-recommended/15 text-recommended',
    waitlist: 'bg-nurture/15 text-nurture',
    rejected: 'bg-pass/15 text-pass',
  };
  return classes[decision];
}
