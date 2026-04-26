import type { MatchEvidence } from '@/lib/types';

interface MatchBreakdownProps {
  matchScore: number;
  evidence: MatchEvidence;
}

export default function MatchBreakdown({ matchScore, evidence }: MatchBreakdownProps) {
  return (
    <div className="space-y-5">
      {/* Overall score */}
      <div className="flex items-center gap-4">
        <div className="score-ring text-zinc-300" style={{ borderColor: scoreColor(matchScore) }}>
          <span style={{ color: scoreColor(matchScore) }}>{matchScore}</span>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Match Score</h3>
          <p className="text-xs text-zinc-500">How well this candidate fits the role</p>
        </div>
      </div>

      {/* Requirements table */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Requirements</h4>
        <div className="space-y-1.5">
          {evidence.requirements.map((req) => (
            <div key={req.requirement_id} className="card-elevated rounded-lg px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-foreground">{req.requirement_description}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`badge text-[10px] ${req.met ? 'bg-recommended/15 text-recommended' : 'bg-red-500/15 text-red-400'}`}>
                    {req.met ? 'Met' : 'Gap'}
                  </span>
                  <span className="text-xs font-mono text-zinc-400">{req.score}</span>
                </div>
              </div>
              {req.citation && (
                <p className="text-xs text-zinc-500 italic border-l-2 border-surface-3 pl-3">
                  &ldquo;{req.citation}&rdquo;
                </p>
              )}
              {req.reasoning && (
                <p className="text-xs text-zinc-600">{req.reasoning}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Depth & Trajectory */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card-elevated rounded-lg p-4">
          <span className="text-xs text-zinc-500">Demonstrated Depth</span>
          <p className="text-xl font-bold font-mono text-foreground mt-1">{evidence.depth_score}</p>
        </div>
        <div className="card-elevated rounded-lg p-4">
          <span className="text-xs text-zinc-500">Trajectory Fit</span>
          <p className="text-xl font-bold font-mono text-foreground mt-1">{evidence.trajectory_score}</p>
        </div>
      </div>

      {/* Red flags */}
      {evidence.red_flags.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wider">Red Flags</h4>
          <ul className="space-y-1">
            {evidence.red_flags.map((f, i) => (
              <li key={i} className="text-xs text-red-300/80 flex gap-2">
                <span>⚠</span>{f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Overall reasoning */}
      <div className="text-sm text-zinc-400 leading-relaxed border-t border-border pt-4">
        {evidence.overall_reasoning}
      </div>
    </div>
  );
}

function scoreColor(score: number): string {
  if (score >= 80) return '#34d399';
  if (score >= 60) return '#60a5fa';
  if (score >= 40) return '#fbbf24';
  return '#f87171';
}
