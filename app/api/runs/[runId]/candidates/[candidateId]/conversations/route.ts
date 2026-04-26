import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string; candidateId: string }> }
) {
  const { candidateId } = await params;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('conversations')
    .select('turn_number, speaker, content')
    .eq('candidate_id', candidateId)
    .order('turn_number', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
