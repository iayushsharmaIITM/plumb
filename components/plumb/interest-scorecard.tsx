'use client';

import { useState } from 'react';
import type { InterestEvidence, InterestSignalName } from '@/lib/types';

const SIGNALS: { key: InterestSignalName; label: string; color: string; bg: string }[] = [
  { key: 'specificity_of_engagement', label: 'Specificity', color: 'text-signal-specificity', bg: 'bg-signal-specificity/15' },
  { key: 'forward_commitment', label: 'Commitment', color: 'text-signal-commitment', bg: 'bg-signal-commitment/15' },
  { key: 'objection_handling', label: 'Objections', color: 'text-signal-objection', bg: 'bg-signal-objection/15' },
  { key: 'availability_timing', label: 'Availability', color: 'text-signal-availability', bg: 'bg-signal-availability/15' },
  { key: 'motivation_alignment', label: 'Motivation', color: 'text-signal-motivation', bg: 'bg-signal-motivation/15' },
];

interface InterestScorecardProps {
  interestScore: number;
  evidence: InterestEvidence;
  activeSignal: InterestSignalName | null;
  onSignalClick: (signal: InterestSignalName | null) => void;
}

export default function InterestScorecard({ interestScore, evidence, activeSignal, onSignalClick }: InterestScorecardProps) {
  const [expanded, setExpanded] = useState(false);
  const followUpChecks = normalizeFollowUpChecks(evidence.risk_flags);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="score-ring text-brand">
          {interestScore}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Interest Score</h3>
          <p className="text-xs text-zinc-500">Genuine engagement signals from the conversation</p>
        </div>
      </div>

      {/* Signal cards */}
      <div className="space-y-2">
        {SIGNALS.map((sig) => {
          const signal = evidence.signals.find((s) => s.name === sig.key);
          const score = signal?.score ?? 0;
          const isActive = activeSignal === sig.key;

          return (
            <button
              key={sig.key}
              onClick={() => onSignalClick(isActive ? null : sig.key)}
              className={`w-full text-left card-elevated rounded-lg px-4 py-3 transition-all ${
                isActive ? 'ring-1 ring-brand/40 bg-surface-3' : 'hover:bg-surface-3/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${sig.bg.replace('/15', '')} opacity-80`}
                    style={{ background: `var(--color-signal-${sig.key.split('_').pop()})` }}
                  />
                  <span className="text-sm text-foreground">{sig.label}</span>
                </div>
                <span className={`text-sm font-bold font-mono ${sig.color}`}>{score}/20</span>
              </div>

              {/* Score bar */}
              <div className="mt-2 h-1.5 bg-surface-1 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${(score / 20) * 100}%`,
                    background: `var(--color-signal-${getSignalColorKey(sig.key)})`,
                  }}
                />
              </div>

              {/* Evidence count */}
              {signal && signal.evidence.length > 0 && (
                <p className="text-[10px] text-zinc-600 mt-1.5">
                  {signal.evidence.length} evidence span{signal.evidence.length > 1 ? 's' : ''} cited
                </p>
              )}
            </button>
          );
        })}
      </div>

      {/* Follow-up checks */}
      {followUpChecks.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-border">
          <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Follow-Up Checks</h4>
          <ul className="space-y-1">
            {followUpChecks.map((f, i) => (
              <li key={i} className="text-xs text-amber-300/80 flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Overall reasoning */}
      <div className="pt-2 border-t border-border">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {expanded ? '▾ Hide reasoning' : '▸ Show overall reasoning'}
        </button>
        {expanded && (
          <p className="text-sm text-zinc-400 mt-2 leading-relaxed animate-fade-in">
            {evidence.overall_reasoning}
          </p>
        )}
      </div>
    </div>
  );
}

function getSignalColorKey(key: InterestSignalName): string {
  const map: Record<InterestSignalName, string> = {
    specificity_of_engagement: 'specificity',
    forward_commitment: 'commitment',
    objection_handling: 'objection',
    availability_timing: 'availability',
    motivation_alignment: 'motivation',
  };
  return map[key];
}

function normalizeFollowUpChecks(flags: string[]): string[] {
  return flags
    .map((flag) => normalizeFollowUpCheck(flag))
    .filter(Boolean)
    .slice(0, 3);
}

function normalizeFollowUpCheck(flag: string): string {
  const lower = flag.toLowerCase();

  if (lower.includes('roadmap stability')) {
    return 'Candidate asked about roadmap stability; address roadmap focus in the next conversation.';
  }
  if (lower.includes('actively interviewing') || lower.includes('competing offer')) {
    return 'Candidate stated they are actively interviewing; confirm timeline before scheduling.';
  }
  if (lower.includes('fallback score')) {
    return 'Fallback scoring was used; recruiter should review the cited transcript spans.';
  }

  return flag
    .replace(/\bwhich could indicate\b/gi, ';')
    .replace(/\bcould indicate\b/gi, 'needs recruiter follow-up on')
    .replace(/\bpotential for\b/gi, 'confirm')
    .replace(/\bpotential of\b/gi, 'confirm')
    .replace(/\bmay signal\b/gi, 'needs recruiter follow-up on')
    .replace(/\bmight mean\b/gi, 'needs recruiter follow-up on')
    .replace(/\bsuggests?\b/gi, 'requires follow-up on')
    .replace(/\blikely\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}
