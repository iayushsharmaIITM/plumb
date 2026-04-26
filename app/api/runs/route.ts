import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 10;

function isLocalRequest(req: NextRequest, ip: string): boolean {
  const host = req.headers.get('host') ?? '';
  return (
    process.env.NODE_ENV !== 'production' ||
    host.startsWith('localhost') ||
    host.startsWith('127.0.0.1') ||
    ip === '::1' ||
    ip === '127.0.0.1' ||
    ip === 'unknown'
  );
}

async function verifyTurnstile(req: NextRequest, token: string | null, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  const turnstileEnabled = process.env.TURNSTILE_ENABLED === 'true';
  if (!turnstileEnabled) return true;
  if (isLocalRequest(req, ip)) return true;
  if (!secret) return true; // Dev bypass
  if (!token) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    const data = (await res.json()) as { success: boolean };
    return data.success;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  let body: { jd_text?: string; recruiter_brief?: string | null; turnstile_token?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (!body.jd_text || body.jd_text.trim().length < 50) {
    return NextResponse.json({ error: 'jd_text required (min 50 chars)' }, { status: 400 });
  }

  const ok = await verifyTurnstile(req, body.turnstile_token ?? null, ip);
  if (!ok) return NextResponse.json({ error: 'turnstile verification failed' }, { status: 403 });

  const rl = isLocalRequest(req, ip)
    ? { allowed: true, remaining: 999 }
    : await checkRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'rate limit exceeded (3/day)' }, { status: 429 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('runs')
    .insert({
      jd_text: body.jd_text,
      recruiter_brief: body.recruiter_brief ?? null,
      status: 'pending',
      client_ip: ip,
    })
    .select('id')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'insert failed' }, { status: 500 });
  }

  return NextResponse.json({ run_id: data.id, remaining: rl.remaining });
}
