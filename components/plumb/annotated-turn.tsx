'use client';

import { useState, useMemo } from 'react';
import { resolveSpans, type ResolvedHighlight } from '@/lib/annotation/resolve-spans';
import type { InterestEvidence, InterestSignalName } from '@/lib/types';

const SIGNAL_COLORS: Record<InterestSignalName, string> = {
  specificity_of_engagement: 'var(--color-signal-specificity)',
  forward_commitment: 'var(--color-signal-commitment)',
  objection_handling: 'var(--color-signal-objection)',
  availability_timing: 'var(--color-signal-availability)',
  motivation_alignment: 'var(--color-signal-motivation)',
};

const SIGNAL_LABELS: Record<InterestSignalName, string> = {
  specificity_of_engagement: 'Specificity',
  forward_commitment: 'Commitment',
  objection_handling: 'Objections',
  availability_timing: 'Availability',
  motivation_alignment: 'Motivation',
};

interface AnnotatedTurnProps {
  turnNumber: number;
  speaker: 'recruiter' | 'candidate';
  content: string;
  evidence: InterestEvidence | null;
  activeSignal?: InterestSignalName | null;
}

export default function AnnotatedTurn({ turnNumber, speaker, content, evidence, activeSignal }: AnnotatedTurnProps) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; highlight: ResolvedHighlight } | null>(null);

  const highlights = useMemo(() => {
    if (!evidence) return [];
    const all = resolveSpans(content, turnNumber, evidence);
    if (activeSignal) return all.filter((h) => h.signal === activeSignal);
    return all;
  }, [content, turnNumber, evidence, activeSignal]);

  const segments = useMemo(() => buildSegments(content, highlights), [content, highlights]);

  return (
    <div className={`flex gap-3 ${speaker === 'recruiter' ? '' : 'flex-row-reverse'}`}>
      {/* Avatar */}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
        speaker === 'recruiter' ? 'bg-brand/20 text-brand' : 'bg-recommended/15 text-recommended'
      }`}>
        {speaker === 'recruiter' ? 'R' : 'C'}
      </div>

      {/* Bubble */}
      <div className={`relative max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
        speaker === 'recruiter'
          ? 'bg-surface-2 text-zinc-300 rounded-tl-md'
          : 'bg-recommended/10 text-zinc-200 border border-recommended/15 rounded-tr-md'
      }`}>
        <span className="text-[10px] text-zinc-600 block mb-1.5">
          Turn {Math.ceil(turnNumber / 2)} · {speaker === 'recruiter' ? 'Recruiter agent' : 'Simulated candidate reply'}
        </span>
        <div className="whitespace-pre-wrap">
          {segments.map((seg, i) =>
            seg.highlight ? (
              <mark
                key={i}
                data-signal={seg.highlight.signal}
                onMouseEnter={(e) => {
                  const rect = (e.target as HTMLElement).getBoundingClientRect();
                  setTooltip({ x: rect.left, y: rect.bottom + 6, highlight: seg.highlight! });
                }}
                onMouseLeave={() => setTooltip(null)}
              >
                {seg.text}
              </mark>
            ) : (
              <span key={i}>{seg.text}</span>
            )
          )}
        </div>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="tooltip"
            style={{ top: '100%', left: 0, marginTop: 8 }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: SIGNAL_COLORS[tooltip.highlight.signal] }}
              />
              <span className="font-semibold text-foreground text-xs">
                {SIGNAL_LABELS[tooltip.highlight.signal]}
              </span>
            </div>
            <p className="text-xs text-zinc-400">{tooltip.highlight.reasoning}</p>
          </div>
        )}
      </div>
    </div>
  );
}

interface Segment {
  text: string;
  highlight: ResolvedHighlight | null;
}

function buildSegments(content: string, highlights: ResolvedHighlight[]): Segment[] {
  if (highlights.length === 0) return [{ text: content, highlight: null }];

  const segs: Segment[] = [];
  let cursor = 0;

  for (const h of highlights) {
    if (h.start > cursor) {
      segs.push({ text: content.slice(cursor, h.start), highlight: null });
    }
    segs.push({ text: content.slice(h.start, h.end), highlight: h });
    cursor = h.end;
  }

  if (cursor < content.length) {
    segs.push({ text: content.slice(cursor), highlight: null });
  }

  return segs;
}
