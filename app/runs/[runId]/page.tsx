'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/supabase/browser';
import {
  loadBrowserTalentDatabase,
  runPipeline,
  topUpPipeline,
  type BrowserTalentDatabase,
  type PipelineStage,
} from '@/lib/pipeline/orchestrator';
import {
  buildLocalCandidates,
  loadLocalCandidates,
  loadLocalRun,
  saveLocalCandidates,
} from '@/lib/browser-local-run';
import PipelineProgress from '@/components/plumb/pipeline-progress';
import DiscoverySummary from '@/components/plumb/discovery-summary';
import CohortSection from '@/components/plumb/cohort-section';
import CandidateRow from '@/components/plumb/candidate-row';
import ExportRunButton from '@/components/plumb/export-run-button';
import type { Cohort, CandidateProfile, MatchEvidence, InterestEvidence, CandidateReviewDecision } from '@/lib/types';

interface RunData {
  id: string;
  status: string;
  jd_text: string;
  jd_parsed: Record<string, unknown> | null;
  error_message: string | null;
  talent_database_id?: string | null;
}

interface TalentDatabaseSummary {
  id: string;
  name: string;
  candidate_count: number;
  source_type: string;
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
  const isLocalRun = runId.startsWith('local-');
  const [run, setRun] = useState<RunData | null>(null);
  const [candidates, setCandidates] = useState<CandidateData[]>([]);
  const [stage, setStage] = useState<PipelineStage | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [candidateLoadError, setCandidateLoadError] = useState<string | null>(null);
  const [topUpCount, setTopUpCount] = useState(2);
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [topUpError, setTopUpError] = useState<string | null>(null);
  const [serverTalentDatabase, setServerTalentDatabase] = useState<TalentDatabaseSummary | null>(null);
  const [browserTalentDatabase] = useState<BrowserTalentDatabase | null>(() =>
    loadBrowserTalentDatabase(runId)
  );
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
    if (isLocalRun) {
      void Promise.resolve().then(() => {
        const localRun = loadLocalRun(runId);
        if (!localRun) {
          setPipelineError('This browser-local run expired. Upload the database again to recreate it.');
          setStage('complete');
          return;
        }

        const cachedCandidates = loadLocalCandidates(runId);
        const nextCandidates = cachedCandidates.length > 0
          ? cachedCandidates
          : buildLocalCandidates(localRun);
        if (cachedCandidates.length === 0) saveLocalCandidates(runId, nextCandidates);

        setRun({
          id: runId,
          status: 'complete',
          jd_text: localRun.jd_text,
          jd_parsed: null,
          error_message: null,
        });
        setCandidates(nextCandidates);
        setStage('complete');
      });
      return;
    }

    async function load() {
      const res = await fetch(`/api/runs/${runId}`);
      if (res.ok) {
        const data = await res.json();
        setRun(data);
        if (data.status === 'complete') setStage('complete');
      }
    }
    load();
  }, [isLocalRun, runId]);

  useEffect(() => {
    if (isLocalRun || browserTalentDatabase || !run?.talent_database_id) return;

    async function loadDatabaseMetadata() {
      const res = await fetch('/api/talent-databases', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data.databases)) return;
      const selected = data.databases.find((database: TalentDatabaseSummary) =>
        database.id === run?.talent_database_id
      );
      if (selected) setServerTalentDatabase(selected);
    }

    void loadDatabaseMetadata();
  }, [browserTalentDatabase, isLocalRun, run?.talent_database_id]);

  useEffect(() => {
    if (isLocalRun) return;
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
  }, [isLocalRun, runId, refreshCandidates]);

  // Realtime subscription
  useEffect(() => {
    if (isLocalRun) return;
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
  }, [isLocalRun, runId, refreshCandidates]);

  useEffect(() => {
    if (isLocalRun) return;
    if (run?.status !== 'complete' || candidates.length > 0) return;

    const timer = window.setInterval(() => {
      void refreshCandidates();
    }, 1500);

    return () => window.clearInterval(timer);
  }, [isLocalRun, run?.status, candidates.length, refreshCandidates]);

  // Start pipeline if pending
  useEffect(() => {
    if (isLocalRun) return;
    if (!run || startedRef.current) return;
    if (run.status === 'complete' || run.status === 'failed') return;

    startedRef.current = true;
    runPipeline(runId, (s) => setStage(s)).catch((err) => {
      setPipelineError((err as Error).message);
    });
  }, [isLocalRun, run, runId]);

  async function handleDecisionChange(candidateId: string, reviewDecision: CandidateReviewDecision) {
    setTopUpError(null);
    const previous = candidates;
    const nextCandidates = candidates.map((candidate) =>
        candidate.id === candidateId
          ? {
              ...candidate,
              review_decision: reviewDecision,
              reviewed_at: reviewDecision === 'undecided' ? null : new Date().toISOString(),
            }
          : candidate
      );
    setCandidates(nextCandidates);

    if (isLocalRun) {
      const storedCandidates = loadLocalCandidates(runId).map((candidate) =>
        candidate.id === candidateId
          ? {
              ...candidate,
              review_decision: reviewDecision,
              reviewed_at: reviewDecision === 'undecided' ? null : new Date().toISOString(),
            }
          : candidate
      );
      saveLocalCandidates(runId, storedCandidates);
      return;
    }

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
      if (isLocalRun) {
        const localRun = loadLocalRun(runId);
        if (!localRun) throw new Error('This browser-local run expired. Upload the database again.');
        setStage('reranking');
        const storedCandidates = loadLocalCandidates(runId);
        const excluded = new Set(storedCandidates.map((candidate) => candidate.pool_candidate_id));
        const additions = buildLocalCandidates(localRun, excluded, topUpCount);
        if (additions.length === 0) throw new Error('no unseen candidates remain in the uploaded database');
        const nextCandidates = [...storedCandidates, ...additions];
        saveLocalCandidates(runId, nextCandidates);
        setCandidates(nextCandidates);
        setStage('complete');
        return;
      }

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
  const scannedCount = browserTalentDatabase?.candidate_count ?? serverTalentDatabase?.candidate_count ?? 120;
  const sourceLabel = browserTalentDatabase?.name ?? serverTalentDatabase?.name ?? 'Seeded ATS + portfolio corpus';
  const unseenCount = Math.max(0, scannedCount - candidates.length);

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
            scannedCount={scannedCount}
            shortlistedCount={candidates.length}
            sourceLabel={sourceLabel}
          />
        )}

        {candidates.length > 0 && (
          <ExportRunButton
            runId={runId}
            run={run}
            candidates={candidates}
            sourceLabel={sourceLabel}
            scannedCount={scannedCount}
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
