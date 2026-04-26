'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/supabase/browser';
import { runPipeline, topUpPipeline, type PipelineStage } from '@/lib/pipeline/orchestrator';
import PipelineProgress from '@/components/plumb/pipeline-progress';
import DiscoverySummary from '@/components/plumb/discovery-summary';
import CohortSection from '@/components/plumb/cohort-section';
import CandidateRow from '@/components/plumb/candidate-row';
import type { Cohort, CandidateProfile, MatchEvidence, InterestEvidence, CandidateReviewDecision } from '@/lib/types';

interface RunData {
  id: string;
  status: string;
  jd_text: string;
  jd_parsed: Record<string, unknown> | null;
  error_message: string | null;
}

interface CandidateData {
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
  review_decision: CandidateReviewDecision;
  reviewed_at: string | null;
}

export default function RunDashboard() {
  const { runId } = useParams<{ runId: string }>();
  const [run, setRun] = useState<RunData | null>(null);
  const [candidates, setCandidates] = useState<CandidateData[]>([]);
  const [stage, setStage] = useState<PipelineStage | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [candidateLoadError, setCandidateLoadError] = useState<string | null>(null);
  const [topUpCount, setTopUpCount] = useState(2);
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [topUpError, setTopUpError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const refreshCandidates = useCallback(async () => {
    try {
      const nextCandidates = await fetchCandidates(runId);
      setCandidates(nextCandidates);
      setCandidateLoadError(null);
    } catch (error) {
      setCandidateLoadError((error as Error).message);
    }
  }, [runId]);

  // Initial load
  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/runs/${runId}`);
      if (res.ok) {
        const data = await res.json();
        setRun(data);
        if (data.status === 'complete') setStage('complete');
      }
    }
    load();
  }, [runId]);

  useEffect(() => {
    let active = true;

    async function loadInitialCandidates() {
      try {
        const nextCandidates = await fetchCandidates(runId);
        if (active) {
          setCandidates(nextCandidates);
          setCandidateLoadError(null);
        }
      } catch (error) {
        if (active) setCandidateLoadError((error as Error).message);
      }
    }

    void loadInitialCandidates();
    return () => { active = false; };
  }, [runId, refreshCandidates]);

  // Realtime subscription
  useEffect(() => {
    const supabase = createBrowserClient();

    const channel = supabase
      .channel(`run-${runId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'candidates', filter: `run_id=eq.${runId}` }, () => {
        void refreshCandidates();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'runs', filter: `id=eq.${runId}` }, (payload) => {
        setRun((prev) => prev ? { ...prev, ...payload.new } : prev);
        if (payload.new.status === 'complete') {
          setStage('complete');
          void refreshCandidates();
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [runId, refreshCandidates]);

  useEffect(() => {
    if (run?.status !== 'complete' || candidates.length > 0) return;

    const timer = window.setInterval(() => {
      void refreshCandidates();
    }, 1500);

    return () => window.clearInterval(timer);
  }, [run?.status, candidates.length, refreshCandidates]);

  // Start pipeline if pending
  useEffect(() => {
    if (!run || startedRef.current) return;
    if (run.status === 'complete' || run.status === 'failed') return;

    startedRef.current = true;
    runPipeline(runId, (s) => setStage(s)).catch((err) => {
      setPipelineError((err as Error).message);
    });
  }, [run, runId]);

  async function handleDecisionChange(candidateId: string, reviewDecision: CandidateReviewDecision) {
    setTopUpError(null);
    const previous = candidates;
    setCandidates((current) =>
      current.map((candidate) =>
        candidate.id === candidateId
          ? {
              ...candidate,
              review_decision: reviewDecision,
              reviewed_at: reviewDecision === 'undecided' ? null : new Date().toISOString(),
            }
          : candidate
      )
    );

    const res = await fetch(`/api/runs/${runId}/candidates/${candidateId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ review_decision: reviewDecision }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Decision update failed' }));
      setCandidates(previous);
      setTopUpError(body.error ?? 'Decision update failed');
    }
  }

  async function handleTopUp() {
    setTopUpLoading(true);
    setTopUpError(null);

    try {
      await topUpPipeline(runId, topUpCount, (nextStage) => setStage(nextStage));
      await refreshCandidates();
    } catch (error) {
      setTopUpError((error as Error).message);
    } finally {
      setTopUpLoading(false);
    }
  }

  // Group by cohort
  const cohorts: Record<Cohort, CandidateData[]> = { recommended: [], stretch: [], nurture: [], pass: [] };
  for (const c of candidates) {
    if (c.cohort) cohorts[c.cohort].push(c);
    else cohorts.pass.push(c);
  }
  const selectedCount = candidates.filter((candidate) => candidate.review_decision === 'selected').length;
  const reviewedCount = candidates.filter((candidate) => candidate.review_decision !== 'undecided').length;
  const unseenCount = Math.max(0, 120 - candidates.length);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-lg font-bold text-brand hover:opacity-80 transition-opacity">
          Plumb
        </Link>
        <span className="text-xs text-zinc-600 font-mono">{runId.slice(0, 8)}</span>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Pipeline progress */}
        {stage !== 'complete' && (
          <PipelineProgress currentStage={stage} error={pipelineError} />
        )}

        {/* JD info */}
        {run && (
          <div className="card p-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-zinc-500">Job Description</span>
                <p className="text-sm text-zinc-300 line-clamp-2 mt-0.5">{run.jd_text.slice(0, 200)}...</p>
              </div>
              {stage === 'complete' && (
                <span className="badge bg-recommended/15 text-recommended">✓ Complete</span>
              )}
            </div>
          </div>
        )}

        {candidates.length > 0 && (
          <DiscoverySummary
            scannedCount={120}
            shortlistedCount={candidates.length}
            sourceLabel="Seeded ATS + portfolio corpus"
          />
        )}

        {candidates.length > 0 && stage === 'complete' && (
          <div className="card p-5 animate-fade-in">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="grid grid-cols-3 gap-3 text-center md:min-w-[280px]">
                <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
                  <span className="block text-lg font-bold font-mono text-recommended">{selectedCount}</span>
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">Selected</span>
                </div>
                <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
                  <span className="block text-lg font-bold font-mono text-zinc-300">{reviewedCount}</span>
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">Reviewed</span>
                </div>
                <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
                  <span className="block text-lg font-bold font-mono text-brand">{unseenCount}</span>
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">Unseen</span>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex items-center rounded-lg border border-border bg-surface-1 p-1">
                  <button
                    type="button"
                    onClick={() => setTopUpCount((count) => Math.max(1, count - 1))}
                    className="h-8 w-8 rounded-md text-zinc-500 transition-colors hover:bg-surface-3 hover:text-zinc-300"
                    aria-label="Decrease top-up count"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm font-bold font-mono text-zinc-300">
                    {topUpCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setTopUpCount((count) => Math.min(8, count + 1))}
                    className="h-8 w-8 rounded-md text-zinc-500 transition-colors hover:bg-surface-3 hover:text-zinc-300"
                    aria-label="Increase top-up count"
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => void handleTopUp()}
                  disabled={topUpLoading || unseenCount === 0}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {topUpLoading ? 'Finding...' : `Find ${topUpCount} More`}
                </button>
              </div>
            </div>
            {topUpError && (
              <p className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {topUpError}
              </p>
            )}
          </div>
        )}

        {/* Candidates by cohort */}
        {candidates.length > 0 && (
          <div className="space-y-6">
            {(['recommended', 'stretch', 'nurture', 'pass'] as Cohort[]).map((cohort) => (
              <CohortSection key={cohort} cohort={cohort} count={cohorts[cohort].length}>
                {cohorts[cohort]
                  .sort((a, b) => (a.rank_within_cohort ?? 99) - (b.rank_within_cohort ?? 99))
                  .map((c) => (
                    <CandidateRow
                      key={c.id}
                      runId={runId}
                      candidateId={c.id}
                      profile={c.profile_json}
                      matchScore={c.match_score}
                      interestScore={c.interest_score}
                      cohort={c.cohort}
                      matchEvidence={c.match_evidence}
                      interestEvidence={c.interest_evidence}
                      status={c.status}
                      reviewDecision={c.review_decision}
                      onDecisionChange={(candidateId, decision) => void handleDecisionChange(candidateId, decision)}
                    />
                  ))}
              </CohortSection>
            ))}
          </div>
        )}

        {/* Loading state */}
        {candidates.length === 0 && stage && stage !== 'complete' && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-20 w-full" />
            ))}
          </div>
        )}

        {/* Empty complete state */}
        {candidates.length === 0 && stage === 'complete' && (
          <div className="card p-8 text-center text-zinc-500">
            <p className="text-sm text-zinc-400">Loading the completed shortlist...</p>
            <p className="mt-2 text-xs text-zinc-600">
              The run is complete, but the dashboard is still fetching candidate rows.
            </p>
            {candidateLoadError && (
              <p className="mt-3 text-xs text-red-400">{candidateLoadError}</p>
            )}
            <button
              type="button"
              onClick={() => void refreshCandidates()}
              className="mt-4 rounded-lg border border-border px-4 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:bg-surface-2"
            >
              Refresh shortlist
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

async function fetchCandidates(runId: string): Promise<CandidateData[]> {
  const res = await fetch(`/api/runs/${runId}/candidates`, { cache: 'no-store' });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Candidate load failed: ${res.status} ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as Partial<CandidateData>[];
  return data.map((candidate) => ({
    ...candidate,
    review_decision: candidate.review_decision ?? 'undecided',
    reviewed_at: candidate.reviewed_at ?? null,
  })) as CandidateData[];
}
