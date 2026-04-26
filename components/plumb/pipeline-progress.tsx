'use client';

import type { PipelineStage } from '@/lib/pipeline/orchestrator';

const STAGES: { key: PipelineStage; label: string; description: string }[] = [
  { key: 'parsing', label: 'Parse JD', description: 'Extracting structured requirements' },
  { key: 'reranking', label: 'Discover', description: 'Scanning the candidate corpus and shortlisting matches' },
  { key: 'simulating', label: 'Engage', description: 'Running simulated recruiter conversations' },
  { key: 'scoring', label: 'Interest', description: 'Computing evidence-cited Interest Scores' },
  { key: 'drafting', label: 'Action', description: 'Writing recruiter-ready next steps' },
  { key: 'complete', label: 'Done', description: 'Pipeline complete' },
];

interface PipelineProgressProps {
  currentStage: PipelineStage | null;
  error?: string | null;
}

export default function PipelineProgress({ currentStage, error }: PipelineProgressProps) {
  const currentIdx = currentStage
    ? STAGES.findIndex((s) => s.key === currentStage)
    : -1;
  const progress = currentStage === 'complete' ? 100 : Math.max(0, ((currentIdx + 0.5) / (STAGES.length - 1)) * 100);

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-300">Scouting Agent Progress</h3>
        {currentStage && currentStage !== 'complete' && (
          <span className="text-xs text-brand animate-pulse">Processing...</span>
        )}
        {currentStage === 'complete' && (
          <span className="badge bg-recommended/15 text-recommended">Complete</span>
        )}
      </div>

      {/* Progress bar */}
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {/* Stage indicators */}
      <div className="flex justify-between">
        {STAGES.map((stage, i) => {
          const isActive = i === currentIdx;
          const isDone = i < currentIdx || currentStage === 'complete';
          return (
            <div key={stage.key} className="flex flex-col items-center gap-1.5 flex-1">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  isDone
                    ? 'bg-brand text-white'
                    : isActive
                      ? 'bg-brand/20 text-brand ring-2 ring-brand/40'
                      : 'bg-surface-3 text-zinc-600'
                }`}
              >
                {isDone ? '✓' : i + 1}
              </div>
              <span className={`text-[11px] font-medium ${isActive ? 'text-brand' : isDone ? 'text-zinc-400' : 'text-zinc-600'}`}>
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Current stage description */}
      {currentStage && currentStage !== 'complete' && (
        <p className="text-xs text-zinc-500 text-center">
          {STAGES[currentIdx]?.description}...
        </p>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
