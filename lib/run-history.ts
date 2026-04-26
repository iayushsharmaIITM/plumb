'use client';

export interface RunHistoryItem {
  run_id: string;
  jd_text: string;
  source_label: string;
  source_count: number;
  created_at: string;
  status?: string;
}

const HISTORY_KEY = 'plumb:run-history';
const MAX_HISTORY = 20;

export function loadRunHistory(): RunHistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RunHistoryItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addRunHistory(item: RunHistoryItem): void {
  if (typeof window === 'undefined') return;
  const current = loadRunHistory().filter((run) => run.run_id !== item.run_id);
  const next = [item, ...current].slice(0, MAX_HISTORY);
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
}
