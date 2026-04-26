import type { ReactNode } from 'react';
import type { Cohort } from '@/lib/types';

const COHORT_META: Record<Cohort, { label: string; color: string; bg: string; description: string }> = {
  recommended: {
    label: 'Recommended',
    color: 'text-recommended',
    bg: 'bg-recommended/10',
    description: 'Strong match + strong interest — ready for an interview.',
  },
  stretch: {
    label: 'Stretch',
    color: 'text-stretch',
    bg: 'bg-stretch/10',
    description: 'Missing a requirement but highly interested — worth a conversation.',
  },
  nurture: {
    label: 'Nurture',
    color: 'text-nurture',
    bg: 'bg-nurture/10',
    description: 'Great match but not actively interested — stay in touch.',
  },
  pass: {
    label: 'Pass',
    color: 'text-pass',
    bg: 'bg-pass/10',
    description: 'Not the right fit for this role right now.',
  },
};

interface CohortSectionProps {
  cohort: Cohort;
  count: number;
  children: ReactNode;
}

export default function CohortSection({ cohort, count, children }: CohortSectionProps) {
  const meta = COHORT_META[cohort];
  if (count === 0) return null;

  return (
    <section className="space-y-3 animate-fade-in">
      <div className="flex items-center gap-3">
        <h2 className={`text-lg font-semibold ${meta.color}`}>{meta.label}</h2>
        <span className={`badge ${meta.bg} ${meta.color}`}>{count}</span>
        <p className="text-xs text-zinc-500 hidden sm:block">{meta.description}</p>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export { COHORT_META };
