interface DiscoverySummaryProps {
  scannedCount: number;
  shortlistedCount: number;
  sourceLabel?: string;
  isStaticFallback?: boolean;
}

export default function DiscoverySummary({
  scannedCount,
  shortlistedCount,
  sourceLabel = 'Seeded talent corpus',
  isStaticFallback = false,
}: DiscoverySummaryProps) {
  return (
    <section className="card p-5 animate-fade-in space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-brand" />
            <span className="text-xs font-semibold uppercase tracking-wider text-brand">
              Candidate Discovery
            </span>
          </div>
          <h2 className="mt-2 text-lg font-semibold text-foreground">
            The agent searched the talent corpus before outreach.
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-500">
            Plumb parses the JD into requirements, scans structured candidate profiles, cites public
            profile evidence for Match Score, then only simulates outreach for the shortlist.
          </p>
        </div>
        {isStaticFallback && (
          <span className="badge bg-surface-3 text-zinc-500">Static fallback</span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Metric label="Profiles scanned" value={scannedCount.toLocaleString()} />
        <Metric label="Shortlisted" value={shortlistedCount.toLocaleString()} />
        <Metric label="Source" value={sourceLabel} />
        <Metric label="Evidence" value="JD + profile citations" />
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">{label}</p>
      <p className="mt-1 text-sm font-semibold text-zinc-300">{value}</p>
    </div>
  );
}
