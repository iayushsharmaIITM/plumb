import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { callModel } from '@/lib/call-model';
import { stageDeployment } from '@/lib/models';
import { PARSE_SYSTEM, buildParseUserMessage } from '@/lib/prompts/parse';
import type { ParsedJD } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  const supabase = createServiceClient();

  const { data: run, error: runErr } = await supabase
    .from('runs')
    .select('jd_text, recruiter_brief, jd_parsed')
    .eq('id', runId)
    .single();
  if (runErr || !run) {
    return NextResponse.json({ error: 'run not found' }, { status: 404 });
  }

  if (run.jd_parsed) {
    return NextResponse.json({ parsed: run.jd_parsed, cached: true });
  }

  await supabase.from('runs').update({ status: 'parsing' }).eq('id', runId);

  try {
    const { content } = await callModel<ParsedJD>({
      stage: 'parse',
      run_id: runId,
      deployment: stageDeployment.parse,
      system: PARSE_SYSTEM,
      messages: [
        { role: 'user', content: buildParseUserMessage(run.jd_text, run.recruiter_brief) },
      ],
      response_format: 'json',
      temperature: 0.2,
      max_tokens: 4_096,
      timeout_ms: 45_000,
    });

    await supabase
      .from('runs')
      .update({ jd_parsed: content, last_stage_at: new Date().toISOString() })
      .eq('id', runId);

    return NextResponse.json({ parsed: content });
  } catch (e) {
    const message = (e as Error).message;
    await supabase
      .from('runs')
      .update({ status: 'failed', error_message: `parse: ${message}`.slice(0, 500) })
      .eq('id', runId);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
