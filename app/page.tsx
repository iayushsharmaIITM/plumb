'use client';

import { useRouter } from 'next/navigation';
import UploadForm from '@/components/plumb/upload-form';
import Link from 'next/link';

export default function Home() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero */}
      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-2xl space-y-10 animate-fade-in">
          {/* Brand */}
          <div className="text-center space-y-4">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
              <span className="text-brand">Plumb</span>
            </h1>
            <p className="text-lg sm:text-xl text-zinc-400 max-w-lg mx-auto leading-relaxed">
              Match Score is commodity.{' '}
              <span className="text-foreground font-medium">Interest Score is the product.</span>
            </p>
            <p className="text-sm text-zinc-600 max-w-md mx-auto">
              Parse a JD, scout a 120-profile talent corpus, explain why candidates match, simulate outreach, and rank who recruiters should actually talk to.
            </p>
          </div>

          {/* Featured run CTA */}
          <div className="flex justify-center">
            <Link
              href="/runs/demo"
              id="view-demo-button"
              className="group inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-surface-1 border border-border hover:border-brand/30 hover:bg-surface-2 transition-all text-sm font-medium text-zinc-300"
            >
              <span className="w-2 h-2 rounded-full bg-recommended animate-pulse" />
              View featured run — 120 profiles scanned, 8 shortlisted
              <span className="text-zinc-500 group-hover:text-brand transition-colors">→</span>
            </Link>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-zinc-600 uppercase tracking-widest">or run your own</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Upload form */}
          <div className="card p-6 sm:p-8">
            <UploadForm
              onSubmit={(runId) => router.push(`/runs/${runId}`)}
            />
          </div>

          {/* How it works */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-fade-in-delay-2">
            {[
              { step: '1', title: 'Parse', desc: 'Extract structured requirements from your JD' },
              { step: '2', title: 'Discover', desc: 'Scan candidate profiles and cite match evidence' },
              { step: '3', title: 'Engage', desc: 'Simulate outreach and score genuine interest' },
            ].map((s) => (
              <div key={s.step} className="card p-4 text-center space-y-2">
                <div className="w-8 h-8 rounded-full bg-brand/15 text-brand text-sm font-bold flex items-center justify-center mx-auto">
                  {s.step}
                </div>
                <h3 className="text-sm font-semibold text-foreground">{s.title}</h3>
                <p className="text-xs text-zinc-500">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-xs text-zinc-700 border-t border-border">
        Built by Ayush Sharma for Catalyst by Deccan AI · Powered by Grok 4.2 + Kimi K2.6 via Azure AI Foundry
      </footer>
    </div>
  );
}
