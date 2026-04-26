'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AnnotatedTurn from '@/components/plumb/annotated-turn';
import MatchBreakdown from '@/components/plumb/match-breakdown';
import InterestScorecard from '@/components/plumb/interest-scorecard';
import NextActionCard from '@/components/plumb/next-action-card';
import { COHORT_META } from '@/components/plumb/cohort-section';
import { getDemoCandidate, getDemoTurns } from '@/lib/demo-fixture';
import type { CandidateProfile, MatchEvidence, InterestEvidence, Cohort, InterestSignalName } from '@/lib/types';

interface CandidateData {
  id: string;
  profile_json: CandidateProfile;
  match_score: number;
  match_evidence: MatchEvidence;
  interest_score: number | null;
  interest_evidence: InterestEvidence | null;
  cohort: Cohort;
  next_action_draft: string | null;
  status: string;
}

interface Turn {
  turn_number: number;
  speaker: 'recruiter' | 'candidate';
  content: string;
}

export default function CandidateDrilldown() {
  const { runId, candidateId } = useParams<{ runId: string; candidateId: string }>();
  const [candidate, setCandidate] = useState<CandidateData | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [activeSignal, setActiveSignal] = useState<InterestSignalName | null>(null);
  const [activeTab, setActiveTab] = useState<'transcript' | 'match'>('transcript');
  const [loading, setLoading] = useState(true);
  const [chatMessage, setChatMessage] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [rescoring, setRescoring] = useState(false);

  useEffect(() => {
    if (runId === 'demo') {
      void Promise.resolve().then(() => {
        setCandidate(getDemoCandidate(candidateId) as CandidateData | null);
        setTurns(getDemoTurns(candidateId));
        setLoading(false);
      });
      return;
    }

    async function load() {
      const [candRes, turnsRes] = await Promise.all([
        fetch(`/api/runs/${runId}/candidates/${candidateId}`),
        fetch(`/api/runs/${runId}/candidates/${candidateId}/conversations`),
      ]);

      if (candRes.ok) {
        setCandidate(await candRes.json());
      }
      if (turnsRes.ok) {
        setTurns(await turnsRes.json());
      }
      setLoading(false);
    }
    load();
  }, [runId, candidateId]);

  async function refreshCandidate() {
    const [candRes, turnsRes] = await Promise.all([
      fetch(`/api/runs/${runId}/candidates/${candidateId}`),
      fetch(`/api/runs/${runId}/candidates/${candidateId}/conversations`),
    ]);

    if (candRes.ok) setCandidate(await candRes.json());
    if (turnsRes.ok) setTurns(await turnsRes.json());
  }

  async function handleLiveChatSubmit(e: React.FormEvent) {
    e.preventDefault();
    const message = chatMessage.trim();
    if (!message || chatLoading || runId === 'demo') return;

    setChatLoading(true);
    setChatError(null);

    try {
      const res = await fetch(`/api/runs/${runId}/candidates/${candidateId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Live chat failed');

      setTurns((prev) => [...prev, ...data.turns]);
      setChatMessage('');
      setChatLoading(false);

      setRescoring(true);
      const scoreRes = await fetch(`/api/runs/${runId}/candidates/${candidateId}/score?force=1`, {
        method: 'POST',
      });
      if (!scoreRes.ok) {
        const body = await scoreRes.text();
        throw new Error(`Re-score failed: ${body.slice(0, 200)}`);
      }

      const draftRes = await fetch(`/api/runs/${runId}/candidates/${candidateId}/draft`, {
        method: 'POST',
      });
      if (!draftRes.ok) {
        const body = await draftRes.text();
        throw new Error(`Draft refresh failed: ${body.slice(0, 200)}`);
      }

      await refreshCandidate();
    } catch (error) {
      setChatError((error as Error).message);
    } finally {
      setChatLoading(false);
      setRescoring(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="space-y-4 w-full max-w-4xl px-4">
          <div className="skeleton h-12 w-64" />
          <div className="skeleton h-96 w-full" />
        </div>
      </div>
    );
  }

  if (!candidate) {
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-500">
        Candidate not found.
      </div>
    );
  }

  const profile = candidate.profile_json;
  const cohortMeta = candidate.cohort ? COHORT_META[candidate.cohort] : null;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center gap-4">
        <Link href={`/runs/${runId}`} className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
          ← Back to dashboard
        </Link>
        <span className="text-xs text-zinc-700">|</span>
        <Link href="/" className="text-sm font-bold text-brand">Plumb</Link>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Candidate header */}
        <div className="card p-6 mb-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-surface-3 flex items-center justify-center text-lg font-bold text-zinc-400">
              {profile.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-foreground">{profile.name}</h1>
              <p className="text-sm text-zinc-400">
                {profile.current_title} @ {profile.current_company} · {profile.years_experience}y exp · {profile.location}
              </p>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <span className="text-2xl font-bold font-mono text-zinc-300">{candidate.match_score}</span>
                <span className="block text-[10px] text-zinc-500 uppercase tracking-wider">Match</span>
              </div>
              <div className="text-center">
                <span className="text-2xl font-bold font-mono text-brand">
                  {candidate.interest_score ?? (rescoring ? '...' : 'New')}
                </span>
                <span className="block text-[10px] text-zinc-500 uppercase tracking-wider">Interest</span>
              </div>
              {cohortMeta && (
                <span className={`badge ${cohortMeta.bg} ${cohortMeta.color}`}>
                  {cohortMeta.label}
                </span>
              )}
            </div>
          </div>
        </div>

        {candidate.match_evidence && (
          <div className="card p-5 mb-6 animate-fade-in-delay-1">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-brand" />
              <span className="text-xs font-semibold uppercase tracking-wider text-brand">
                Why Discovered
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              {candidate.match_evidence.overall_reasoning}
            </p>
            <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3">
              {candidate.match_evidence.requirements.slice(0, 3).map((req) => (
                <div key={req.requirement_id} className="rounded-lg border border-border bg-surface-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-zinc-300 line-clamp-2">
                      {req.requirement_description}
                    </span>
                    <span className={`badge text-[10px] ${req.met ? 'bg-recommended/15 text-recommended' : 'bg-red-500/15 text-red-400'}`}>
                      {req.met ? 'Met' : 'Gap'}
                    </span>
                  </div>
                  {req.citation && (
                    <p className="mt-2 text-xs leading-relaxed text-zinc-500 line-clamp-2">
                      &ldquo;{req.citation}&rdquo;
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Three-pane layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Match breakdown / Profile */}
          <div className="lg:col-span-4 space-y-4">
            {/* Tab switcher */}
            <div className="flex gap-1 bg-surface-1 rounded-lg p-1">
              {(['match', 'transcript'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 text-sm py-2 rounded-md font-medium transition-colors ${
                    activeTab === tab ? 'bg-surface-3 text-foreground' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {tab === 'match' ? 'Match' : 'Transcript'}
                </button>
              ))}
            </div>

            {activeTab === 'match' && candidate.match_evidence && (
              <div className="card p-5 animate-fade-in">
                <MatchBreakdown matchScore={candidate.match_score} evidence={candidate.match_evidence} />
              </div>
            )}

            {activeTab === 'transcript' && (
              <div className="card p-5 space-y-4 animate-fade-in max-h-[70vh] overflow-y-auto">
                <div className="rounded-lg border border-border bg-surface-2 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-brand">
                    Live Outreach Lab
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                    Type as the recruiter. The reply comes from this candidate&apos;s simulated
                    persona using hidden motivation state. In production, this same layer would
                    connect to email, LinkedIn, or an ATS inbox and score real replies.
                  </p>
                </div>
                {turns.map((turn) => (
                  <AnnotatedTurn
                    key={turn.turn_number}
                    turnNumber={turn.turn_number}
                    speaker={turn.speaker}
                    content={turn.content}
                    evidence={candidate.interest_evidence}
                    activeSignal={activeSignal}
                  />
                ))}
                {turns.length === 0 && (
                  <p className="text-sm text-zinc-500 text-center py-8">No conversation yet.</p>
                )}

                {runId === 'demo' ? (
                  <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-xs text-zinc-500">
                    Live chat is disabled on the static demo fallback. Run your own JD to talk to the simulated candidate persona.
                  </div>
                ) : (
                  <form onSubmit={handleLiveChatSubmit} className="sticky bottom-0 space-y-2 rounded-xl border border-border bg-background/95 p-3 backdrop-blur">
                    <label htmlFor="live-chat-message" className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                      Your recruiter message
                    </label>
                    <textarea
                      id="live-chat-message"
                      value={chatMessage}
                      onChange={(event) => setChatMessage(event.target.value)}
                      rows={3}
                      maxLength={2000}
                      placeholder="Ask a follow-up about timing, motivation, concerns, or next steps..."
                      className="w-full resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-brand focus:outline-none"
                      disabled={chatLoading}
                    />
                    {chatError && (
                      <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                        {chatError}
                      </p>
                    )}
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-zinc-600">
                        {rescoring ? 'Refreshing Interest Score from the expanded transcript...' : 'The candidate reply is appended to this transcript.'}
                      </p>
                      <button
                        type="submit"
                        disabled={chatLoading || !chatMessage.trim()}
                        className="rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {chatLoading ? 'Waiting...' : 'Send message'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* Right: Interest scorecard + next action */}
          <div className="lg:col-span-8 space-y-4">
            {candidate.interest_evidence && (
              <div className="card p-5 animate-fade-in-delay-1">
                <InterestScorecard
                  interestScore={candidate.interest_score ?? 0}
                  evidence={candidate.interest_evidence}
                  activeSignal={activeSignal}
                  onSignalClick={setActiveSignal}
                />
              </div>
            )}

            {!candidate.interest_evidence && rescoring && (
              <div className="card p-5 animate-fade-in-delay-1">
                <div className="skeleton h-12 w-44" />
                <p className="mt-3 text-sm text-zinc-500">
                  Updating Interest Score from the expanded live transcript...
                </p>
              </div>
            )}

            {candidate.next_action_draft && candidate.cohort && (
              <div className="animate-fade-in-delay-2">
                <NextActionCard
                  cohort={candidate.cohort}
                  draft={candidate.next_action_draft}
                  candidateName={profile.name}
                />
              </div>
            )}

            {/* Skills & background */}
            <div className="card p-5 space-y-4 animate-fade-in-delay-3">
              <h3 className="text-sm font-semibold text-foreground">Skills & Background</h3>
              <div className="flex flex-wrap gap-1.5">
                {profile.skills_declared.slice(0, 15).map((s) => (
                  <span key={s} className="badge bg-surface-3 text-zinc-400 text-[11px]">{s}</span>
                ))}
              </div>
              {profile.work_history.slice(0, 3).map((w, i) => (
                <div key={i} className="text-xs text-zinc-500">
                  <span className="text-zinc-300 font-medium">{w.role}</span> @ {w.company} · {w.years}y
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
