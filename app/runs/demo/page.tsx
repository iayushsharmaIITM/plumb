'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/supabase/browser';
import DiscoverySummary from '@/components/plumb/discovery-summary';
import CohortSection from '@/components/plumb/cohort-section';
import CandidateRow from '@/components/plumb/candidate-row';
import { demoFixture } from '@/lib/demo-fixture';
import type { Cohort, CandidateProfile, MatchEvidence, InterestEvidence } from '@/lib/types';

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
}

interface RunData {
  id: string;
  jd_text: string;
  jd_parsed: Record<string, unknown>;
  status: string;
}

export default function DemoPage() {
  const [run, setRun] = useState<RunData>(demoFixture.run);
  const [candidates, setCandidates] = useState<CandidateData[]>(demoFixture.candidates);
  const [source, setSource] = useState<'static' | 'supabase'>('static');

  useEffect(() => {
    let active = true;

    async function loadSupabaseDemo() {
      try {
        await Promise.resolve();
        const supabase = createBrowserClient();

        const { data: demoRun } = await supabase
          .from('runs')
          .select('*')
          .eq('is_demo', true)
          .eq('status', 'complete')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!demoRun) return;

        const { data: cands } = await supabase
          .from('candidates_public')
          .select('*')
          .eq('run_id', demoRun.id)
          .order('rank_within_cohort', { ascending: true });

        if (!active || !cands || cands.length === 0) return;

        setRun(demoRun as unknown as RunData);
        setCandidates(cands as unknown as CandidateData[]);
        setSource('supabase');
      } catch (error) {
        console.warn('[demo] using static fallback:', (error as Error).message);
      }
    }

    void loadSupabaseDemo();
    return () => { active = false; };
  }, []);

  const cohorts: Record<Cohort, CandidateData[]> = { recommended: [], stretch: [], nurture: [], pass: [] };
  for (const c of candidates) {
    if (c.cohort) cohorts[c.cohort].push(c);
    else cohorts.pass.push(c);
  }

  const runId = source === 'supabase' ? run.id : demoFixture.run.id;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-lg font-bold text-brand hover:opacity-80 transition-opacity">
          Plumb
        </Link>
        <span className="badge bg-brand-dim text-brand">Featured Run</span>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Hero banner */}
        <div className="card p-6 sm:p-8 space-y-4 animate-fade-in bg-gradient-to-br from-surface-1 to-surface-2">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-recommended animate-pulse" />
            <span className="text-xs font-semibold text-recommended uppercase tracking-wider">
              Pre-computed Demo
            </span>
            <span className="badge bg-surface-3 text-zinc-500">
              {source === 'supabase' ? 'Live baked run' : 'Static fallback'}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            Agentic AI Engineer — Deccan AI
          </h1>
          <p className="text-sm text-zinc-400 leading-relaxed max-w-2xl">
            Two candidates side by side. <strong className="text-foreground">Candidate A</strong> — 94 Match, 41 Interest.
            Senior ML engineer, replies politely, deflects on comp. <strong className="text-foreground">Candidate B</strong> — 76 Match, 93 Interest.
            Missing one must-have, asks four substantive questions, ready to move.
            <span className="text-brand font-medium"> Plumb ranks B above A.</span>
          </p>
          <div className="flex gap-3 text-xs text-zinc-600">
            <span>120 profiles scanned</span>
            <span>·</span>
            <span>8 candidates shortlisted</span>
            <span>·</span>
            <span>4-turn conversations</span>
            <span>·</span>
            <span>5-signal Interest Rubric</span>
          </div>
        </div>

        <DiscoverySummary
          scannedCount={120}
          shortlistedCount={candidates.length}
          sourceLabel="Seeded ATS + portfolio corpus"
          isStaticFallback={source === 'static'}
        />

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
                  />
                ))}
            </CohortSection>
          ))}
        </div>
      </main>

      <footer className="text-center py-6 text-xs text-zinc-700 border-t border-border">
        Built by Ayush Sharma for Catalyst by Deccan AI · Powered by Grok 4.2 + Kimi K2.6 via Azure AI Foundry
      </footer>
    </div>
  );
}
