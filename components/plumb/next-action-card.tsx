'use client';

import { useState } from 'react';
import type { Cohort } from '@/lib/types';

const COHORT_LABELS: Record<Cohort, string> = {
  recommended: 'Interview Invitation',
  stretch: 'Stretch Conversation',
  nurture: 'Nurture Note',
  pass: '',
};

interface NextActionCardProps {
  cohort: Cohort;
  draft: string;
  candidateName: string;
}

export default function NextActionCard({ cohort, draft, candidateName }: NextActionCardProps) {
  const [copied, setCopied] = useState(false);

  if (cohort === 'pass' || !draft) return null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text
    }
  }

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Next Action</h3>
          <p className="text-xs text-zinc-500">{COHORT_LABELS[cohort]} for {candidateName}</p>
        </div>
        <button
          onClick={handleCopy}
          className="badge bg-surface-3 text-zinc-300 hover:bg-surface-2 transition-colors cursor-pointer text-xs px-3 py-1.5"
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>

      <div className="bg-surface-2 rounded-lg p-4 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap border border-border">
        {draft}
      </div>
    </div>
  );
}
