'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { loadRunHistory, type RunHistoryItem } from '@/lib/run-history';

export default function RunHistoryPanel() {
  const [history, setHistory] = useState<RunHistoryItem[]>([]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      setHistory(loadRunHistory());
    });
  }, []);

  if (history.length === 0) {
    return (
      <div className="card p-6 text-center">
        <p className="text-sm font-semibold text-zinc-300">No saved sessions yet.</p>
        <p className="mt-2 text-xs leading-relaxed text-zinc-600">
          Runs started from this browser will appear here with the selected database and JD preview.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-300">Session History</h2>
        <span className="text-[10px] uppercase tracking-wider text-zinc-600">This browser</span>
      </div>
      <div className="space-y-2">
        {history.map((item) => (
          <Link
            key={item.run_id}
            href={`/runs/${item.run_id}`}
            className="block rounded-lg border border-border bg-surface-2 px-4 py-3 transition-colors hover:border-brand/30 hover:bg-surface-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm font-medium text-zinc-300">
                  {item.jd_text}
                </p>
                <p className="mt-1 text-xs text-zinc-600">
                  {item.source_label} · {item.source_count.toLocaleString()} profiles
                </p>
              </div>
              <span className="shrink-0 text-[10px] text-zinc-600">
                {formatDate(item.created_at)}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Saved';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
