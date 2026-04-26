'use client';

import { loadLocalCandidates } from '@/lib/browser-local-run';
import type {
  CandidateProfile,
  CandidateReviewDecision,
  Cohort,
  InterestEvidence,
  MatchEvidence,
} from '@/lib/types';

interface ExportRun {
  id: string;
  jd_text: string;
  status: string;
  jd_parsed?: Record<string, unknown> | null;
}

interface ExportCandidate {
  id: string;
  pool_candidate_id: string;
  profile_json: CandidateProfile;
  match_score: number | null;
  interest_score: number | null;
  interest_evidence: InterestEvidence | null;
  match_evidence: MatchEvidence | null;
  cohort: Cohort | null;
  next_action_draft: string | null;
  rank_within_cohort: number | null;
  status: string;
  review_decision?: CandidateReviewDecision | null;
  reviewed_at?: string | null;
}

interface ExportTurn {
  turn_number: number;
  speaker: 'recruiter' | 'candidate';
  content: string;
}

interface ExportRunButtonProps {
  runId: string;
  run: ExportRun | null;
  candidates: ExportCandidate[];
  sourceLabel: string;
  scannedCount: number;
  conversations?: Record<string, ExportTurn[]>;
}

export default function ExportRunButton({
  runId,
  run,
  candidates,
  sourceLabel,
  scannedCount,
  conversations,
}: ExportRunButtonProps) {
  const disabled = candidates.length === 0;

  async function handleExport(format: 'csv' | 'json') {
    const payload = await buildPayload({
      runId,
      run,
      candidates,
      sourceLabel,
      scannedCount,
      conversations,
    });

    if (format === 'json') {
      downloadFile(
        `plumb-${runId.slice(0, 8)}-shortlist.json`,
        JSON.stringify(payload, null, 2),
        'application/json'
      );
      return;
    }

    downloadFile(
      `plumb-${runId.slice(0, 8)}-shortlist.csv`,
      toCsv(payload.candidates),
      'text/csv;charset=utf-8'
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-1 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Export</p>
        <p className="mt-1 text-xs text-zinc-600">
          Download public shortlist data, evidence, transcripts, and next actions.
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void handleExport('csv')}
          disabled={disabled}
          className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40"
        >
          CSV
        </button>
        <button
          type="button"
          onClick={() => void handleExport('json')}
          disabled={disabled}
          className="rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          JSON
        </button>
      </div>
    </div>
  );
}

async function buildPayload({
  runId,
  run,
  candidates,
  sourceLabel,
  scannedCount,
  conversations,
}: ExportRunButtonProps) {
  const turnsByCandidate = conversations ?? await loadConversations(runId, candidates);

  return {
    exported_at: new Date().toISOString(),
    export_version: 1,
    run: {
      id: runId,
      status: run?.status ?? 'unknown',
      jd_text: run?.jd_text ?? '',
      jd_parsed: run?.jd_parsed ?? null,
      source_label: sourceLabel,
      profiles_scanned: scannedCount,
      shortlisted: candidates.length,
    },
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      pool_candidate_id: candidate.pool_candidate_id,
      review_decision: candidate.review_decision ?? 'undecided',
      reviewed_at: candidate.reviewed_at ?? null,
      rank_within_cohort: candidate.rank_within_cohort,
      cohort: candidate.cohort,
      status: candidate.status,
      match_score: candidate.match_score,
      interest_score: candidate.interest_score,
      profile: candidate.profile_json,
      match_evidence: candidate.match_evidence,
      interest_evidence: candidate.interest_evidence,
      next_action_draft: candidate.next_action_draft,
      transcript: turnsByCandidate[candidate.id] ?? [],
    })),
  };
}

async function loadConversations(
  runId: string,
  candidates: ExportCandidate[]
): Promise<Record<string, ExportTurn[]>> {
  if (runId.startsWith('local-')) {
    return Object.fromEntries(
      loadLocalCandidates(runId).map((candidate) => [candidate.id, candidate.turns])
    );
  }

  const pairs = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        const res = await fetch(`/api/runs/${runId}/candidates/${candidate.id}/conversations`, {
          cache: 'no-store',
        });
        if (!res.ok) return [candidate.id, []] as const;
        return [candidate.id, await res.json() as ExportTurn[]] as const;
      } catch {
        return [candidate.id, []] as const;
      }
    })
  );
  return Object.fromEntries(pairs);
}

function toCsv(candidates: Awaited<ReturnType<typeof buildPayload>>['candidates']): string {
  const rows = [
    [
      'rank',
      'cohort',
      'review_decision',
      'name',
      'title',
      'company',
      'location',
      'years_experience',
      'match_score',
      'interest_score',
      'skills',
      'match_reasoning',
      'interest_reasoning',
      'next_action',
      'transcript',
    ],
    ...candidates.map((candidate) => [
      candidate.rank_within_cohort ?? '',
      candidate.cohort ?? '',
      candidate.review_decision,
      candidate.profile.name,
      candidate.profile.current_title,
      candidate.profile.current_company,
      candidate.profile.location,
      candidate.profile.years_experience,
      candidate.match_score ?? '',
      candidate.interest_score ?? '',
      candidate.profile.skills_declared.join('; '),
      candidate.match_evidence?.overall_reasoning ?? '',
      candidate.interest_evidence?.overall_reasoning ?? '',
      candidate.next_action_draft ?? '',
      candidate.transcript
        .map((turn) => `${turn.speaker.toUpperCase()} ${turn.turn_number}: ${turn.content}`)
        .join('\n'),
    ]),
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
