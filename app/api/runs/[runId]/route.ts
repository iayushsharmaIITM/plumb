import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 10;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('runs')
    .select('*')
    .eq('id', runId)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json(data);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  const body = (await req.json()) as { status?: string; error_message?: string | null };
  const update: Record<string, unknown> = { last_stage_at: new Date().toISOString() };
  if (body.status) update.status = body.status;
  if (body.error_message !== undefined) update.error_message = body.error_message;

  const supabase = createServiceClient();
  const { error } = await supabase.from('runs').update(update).eq('id', runId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
