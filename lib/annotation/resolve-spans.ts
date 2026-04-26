import type { InterestEvidence, InterestSignalName } from '../types';

export interface ResolvedHighlight {
  start: number;
  end: number;
  signal: InterestSignalName;
  reasoning: string;
}

export function resolveSpans(
  turnContent: string,
  turnNumber: number,
  evidence: InterestEvidence
): ResolvedHighlight[] {
  const highlights: ResolvedHighlight[] = [];

  for (const signal of evidence.signals) {
    for (const ev of signal.evidence) {
      if (ev.turn !== turnNumber) continue;
      const idx = findSpan(turnContent, ev.span);
      if (idx === -1) {
        console.warn(
          `[annotation] span not found in turn ${turnNumber}: "${ev.span.slice(0, 60)}..."`
        );
        continue;
      }
      highlights.push({
        start: idx,
        end: idx + ev.span.length,
        signal: signal.name,
        reasoning: ev.reasoning,
      });
    }
  }

  // Sort by start offset, then drop overlapping lower-priority highlights
  highlights.sort((a, b) => a.start - b.start);
  const cleaned: ResolvedHighlight[] = [];
  for (const h of highlights) {
    const last = cleaned[cleaned.length - 1];
    if (last && h.start < last.end) continue;
    cleaned.push(h);
  }
  return cleaned;
}

function findSpan(content: string, span: string): number {
  // Exact match first
  let idx = content.indexOf(span);
  if (idx !== -1) return idx;

  // Whitespace-normalized match
  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
  const normContent = normalize(content);
  const normSpan = normalize(span);
  idx = normContent.indexOf(normSpan);
  if (idx === -1) return -1;

  // Map normalized offset back to original content offset
  let origIdx = 0;
  let normIdx = 0;
  while (normIdx < idx && origIdx < content.length) {
    if (/\s/.test(content[origIdx])) {
      while (origIdx < content.length && /\s/.test(content[origIdx])) origIdx++;
      normIdx++;
    } else {
      origIdx++;
      normIdx++;
    }
  }
  return origIdx;
}
