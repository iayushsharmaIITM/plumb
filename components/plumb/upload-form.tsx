'use client';

import { useEffect, useRef, useState } from 'react';

interface UploadFormProps {
  onSubmit: (runId: string) => void;
}

interface TalentDatabaseSummary {
  id: string;
  name: string;
  candidate_count: number;
  source_type: string;
  storage?: 'server' | 'browser';
  candidates?: unknown[];
}

const SEEDED_DATABASE_ID = 'seeded-120';

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: {
          sitekey: string;
          theme?: 'light' | 'dark' | 'auto';
          callback: (token: string) => void;
          'expired-callback': () => void;
          'error-callback': () => void;
        }
      ) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

export default function UploadForm({ onSubmit }: UploadFormProps) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const turnstileEnabled = process.env.NEXT_PUBLIC_TURNSTILE_ENABLED === 'true';
  const requiresTurnstile = Boolean(siteKey && turnstileEnabled);
  const [jd, setJd] = useState('');
  const [brief, setBrief] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReady, setTurnstileReady] = useState(!requiresTurnstile);
  const [databases, setDatabases] = useState<TalentDatabaseSummary[]>([
    {
      id: SEEDED_DATABASE_ID,
      name: 'Seeded ATS + portfolio corpus',
      candidate_count: 120,
      source_type: 'seeded',
    },
  ]);
  const [selectedDatabaseId, setSelectedDatabaseId] = useState(SEEDED_DATABASE_ID);
  const [uploadingDatabase, setUploadingDatabase] = useState(false);
  const [persistentUploadsReady, setPersistentUploadsReady] = useState(false);
  const [databaseMessage, setDatabaseMessage] = useState('');
  const [databaseWarning, setDatabaseWarning] = useState('');
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!requiresTurnstile || !siteKey || !turnstileRef.current || widgetIdRef.current) return;

    function renderWidget() {
      if (!window.turnstile || !turnstileRef.current || widgetIdRef.current) return;
      widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
        sitekey: siteKey!,
        theme: 'dark',
        callback: (token) => {
          setTurnstileToken(token);
          setTurnstileReady(true);
        },
        'expired-callback': () => {
          setTurnstileToken(null);
          setTurnstileReady(false);
        },
        'error-callback': () => {
          setTurnstileToken(null);
          setTurnstileReady(false);
          setError('Turnstile could not verify this browser. Please refresh and try again.');
        },
      });
    }

    if (window.turnstile) {
      renderWidget();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile-script]');
    if (existing) {
      existing.addEventListener('load', renderWidget, { once: true });
      return () => existing.removeEventListener('load', renderWidget);
    }

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.dataset.turnstileScript = 'true';
    script.addEventListener('load', renderWidget, { once: true });
    document.head.appendChild(script);

    return () => script.removeEventListener('load', renderWidget);
  }, [requiresTurnstile, siteKey]);

  useEffect(() => {
    async function loadDatabases() {
      try {
        const res = await fetch('/api/talent-databases', { cache: 'no-store' });
        const data = await res.json();
        if (Array.isArray(data.databases)) {
          setDatabases(data.databases.map((database: TalentDatabaseSummary) => ({
            ...database,
            storage: 'server',
          })));
        }
        setPersistentUploadsReady(Boolean(data.schema_ready));
      } catch {
        setPersistentUploadsReady(false);
      }
    }

    void loadDatabases();
  }, []);

  async function handleDatabaseUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingDatabase(true);
    setDatabaseMessage('');
    setDatabaseWarning('');
    setError('');

    try {
      const text = await file.text();
      const candidates = parseCandidateFile(text, file.name);
      const databaseName = file.name.replace(/\.[^.]+$/, '');

      if (persistentUploadsReady) {
        try {
          const res = await fetch('/api/talent-databases', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: databaseName,
              candidates,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Database upload failed');

          const serverDatabase: TalentDatabaseSummary = {
            ...data.database,
            storage: 'server',
          };
          setDatabases((current) => upsertDatabase(current, serverDatabase));
          setSelectedDatabaseId(serverDatabase.id);
          setDatabaseMessage(`Uploaded ${serverDatabase.candidate_count} candidates from ${file.name}.`);
          return;
        } catch {
          setPersistentUploadsReady(false);
        }
      }

      const browserDatabase: TalentDatabaseSummary = {
        id: `browser-${crypto.randomUUID?.() ?? Date.now().toString(36)}`,
        name: databaseName,
        candidate_count: candidates.length,
        source_type: 'browser_upload',
        storage: 'browser',
        candidates,
      };
      setDatabases((current) => upsertDatabase(current, browserDatabase));
      setSelectedDatabaseId(browserDatabase.id);
      setDatabaseMessage(`Loaded ${browserDatabase.candidate_count} candidates from ${file.name}. This run will match against that file.`);
    } catch (uploadError) {
      setDatabaseWarning((uploadError as Error).message);
    } finally {
      event.target.value = '';
      setUploadingDatabase(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (jd.trim().length < 50) {
      setError('Job description must be at least 50 characters.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const selectedDatabase = databases.find((database) => database.id === selectedDatabaseId);
      const browserDatabase = selectedDatabase?.storage === 'browser' ? selectedDatabase : null;
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jd_text: jd,
          recruiter_brief: brief || null,
          talent_database_id:
            selectedDatabaseId === SEEDED_DATABASE_ID || browserDatabase ? null : selectedDatabaseId,
          turnstile_token: turnstileToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create run');
      if (browserDatabase && browserDatabase.candidates) {
        sessionStorage.setItem(
          `plumb:run-talent-database:${data.run_id}`,
          JSON.stringify({
            name: browserDatabase.name,
            candidate_count: browserDatabase.candidate_count,
            source_type: browserDatabase.source_type,
            candidates: browserDatabase.candidates,
          })
        );
      }
      onSubmit(data.run_id);
    } catch (err) {
      setError((err as Error).message);
      if (requiresTurnstile) {
        window.turnstile?.reset(widgetIdRef.current ?? undefined);
        setTurnstileToken(null);
        setTurnstileReady(false);
      }
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-5">
      {/* JD Input */}
      <div className="space-y-2">
        <label htmlFor="jd-input" className="block text-sm font-medium text-zinc-300">
          Job Description <span className="text-red-400">*</span>
        </label>
        <textarea
          id="jd-input"
          value={jd}
          onChange={(e) => setJd(e.target.value)}
          placeholder="Paste the full job description here..."
          rows={8}
          className="w-full rounded-xl bg-surface-2 border border-border px-4 py-3 text-sm text-foreground placeholder:text-zinc-600 focus:border-brand focus:ring-1 focus:ring-brand/30 transition-colors resize-y"
          disabled={loading}
        />
        <p className="text-xs text-zinc-500">
          {jd.length < 50 ? `${50 - jd.length} more characters needed` : `${jd.length.toLocaleString()} characters`}
          {' '}· the agent will scout the selected candidate database
        </p>
      </div>

      {/* Talent database selector */}
      <div className="space-y-3 rounded-xl border border-border bg-surface-1 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <label htmlFor="database-select" className="block text-sm font-medium text-zinc-300">
              Candidate Database
            </label>
            <p className="mt-1 text-xs text-zinc-600">
              Upload a real candidate JSON/CSV, then choose it for this JD.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:bg-surface-3">
            {uploadingDatabase ? 'Uploading...' : 'Upload database'}
            <input
              type="file"
              accept=".json,.csv,application/json,text/csv"
              className="sr-only"
              onChange={handleDatabaseUpload}
              disabled={uploadingDatabase || loading}
            />
          </label>
        </div>

        <select
          id="database-select"
          value={selectedDatabaseId}
          onChange={(event) => setSelectedDatabaseId(event.target.value)}
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none"
          disabled={loading}
        >
          {databases.map((database) => (
            <option key={database.id} value={database.id}>
              {database.name} · {database.candidate_count} candidates
            </option>
          ))}
        </select>

        {databaseMessage && (
          <p className="rounded-lg border border-recommended/20 bg-recommended/10 px-3 py-2 text-xs text-recommended">
            {databaseMessage}
          </p>
        )}
        {databaseWarning && (
          <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            {databaseWarning}
          </p>
        )}
      </div>

      {/* Recruiter Brief */}
      <div className="space-y-2">
        <label htmlFor="brief-input" className="block text-sm font-medium text-zinc-300">
          Recruiter Brief <span className="text-zinc-600">(optional)</span>
        </label>
        <textarea
          id="brief-input"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="Private context the JD doesn't contain. E.g. &quot;Budget flex up to +25%&quot;, &quot;We lost our last two hires to comp at Google&quot;..."
          rows={3}
          className="w-full rounded-xl bg-surface-2 border border-border px-4 py-3 text-sm text-foreground placeholder:text-zinc-600 focus:border-brand focus:ring-1 focus:ring-brand/30 transition-colors resize-y"
          disabled={loading}
        />
      </div>

      {/* Turnstile */}
      {requiresTurnstile && (
        <div className="min-h-[65px]">
          <div ref={turnstileRef} />
          {!turnstileReady && (
            <p className="mt-2 text-xs text-zinc-600">Verifying browser before run creation...</p>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading || jd.trim().length < 50 || (requiresTurnstile && !turnstileToken)}
        id="run-plumb-button"
        className="w-full h-12 rounded-xl bg-brand font-semibold text-white text-sm transition-all hover:bg-brand-hover disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <span className="inline-block h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Creating run...
          </>
        ) : (
          'Run Plumb →'
        )}
      </button>
    </form>
  );
}

function parseCandidateFile(text: string, filename: string): unknown[] {
  if (filename.toLowerCase().endsWith('.csv')) {
    return parseCsv(text);
  }

  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.candidates)) return parsed.candidates;
  throw new Error('JSON upload must be an array or an object with a candidates array.');
}

function parseCsv(text: string): Record<string, string>[] {
  const rows = csvRows(text).filter((row) => row.some((cell) => cell.trim()));
  if (rows.length < 2) throw new Error('CSV upload needs a header row and at least one candidate row.');

  const headers = rows[0].map((header) => header.trim().toLowerCase());
  return rows.slice(1).map((row) => {
    const item: Record<string, string> = {};
    headers.forEach((header, index) => {
      item[header] = row[index]?.trim() ?? '';
    });
    return item;
  });
}

function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function upsertDatabase(
  databases: TalentDatabaseSummary[],
  nextDatabase: TalentDatabaseSummary
): TalentDatabaseSummary[] {
  const seeded = databases.find((database) => database.id === SEEDED_DATABASE_ID) ?? databases[0];
  const rest = databases.filter((database) =>
    database.id !== SEEDED_DATABASE_ID && database.id !== nextDatabase.id
  );
  return [seeded, nextDatabase, ...rest];
}
