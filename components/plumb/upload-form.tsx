'use client';

import { useEffect, useRef, useState } from 'react';

interface UploadFormProps {
  onSubmit: (runId: string) => void;
}

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (jd.trim().length < 50) {
      setError('Job description must be at least 50 characters.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jd_text: jd,
          recruiter_brief: brief || null,
          turnstile_token: turnstileToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create run');
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
          {' '}· the agent will scout the seeded 120-profile talent corpus
        </p>
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
