import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { callModel } from '@/lib/call-model';
import { stageDeployment } from '@/lib/models';
import { buildPersonaSystemPrompt } from '@/lib/prompts/persona-agent';
import type { CandidateProfile, HiddenState } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface ConversationTurn {
  turn_number: number;
  speaker: 'recruiter' | 'candidate';
  content: string;
}

function fallbackCandidateReply(profile: CandidateProfile, hidden: HiddenState | null, recruiterMessage: string): string {
  const searchIntensity = hidden?.situation?.search_intensity;
  const question = recruiterMessage.includes('?');

  if (searchIntensity === 'actively_interviewing' || searchIntensity === 'has_offers') {
    return question
      ? `That is a fair question. I am actively comparing opportunities, so what matters most to me is whether this role has real ownership, a serious eval culture, and a team that ships durable systems. If that is true, I would be open to a deeper technical conversation.`
      : `Thanks, that helps. I am actively exploring a move, so I would want to understand the team, the first project, and how quickly someone in this role can own meaningful work.`;
  }

  if (searchIntensity === 'passive_curiosity') {
    return question
      ? `I can share some high-level context, but I am not in an active search right now. The role would need to be unusually aligned for me to spend serious time on it.`
      : `Appreciate the context. I am not looking aggressively, but I am happy to understand what makes this opportunity different from a typical AI role.`;
  }

  return question
    ? `Good question. I would want to understand that before deciding whether to continue, especially how the team works day to day and what success looks like in the first few months.`
    : `Thanks for sharing that. I am open to learning more, especially if the role has meaningful technical ownership and a clear product direction.`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string; candidateId: string }> }
) {
  const { runId, candidateId } = await params;
  const supabase = createServiceClient();

  let body: { message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const recruiterMessage = body.message?.trim();
  if (!recruiterMessage || recruiterMessage.length < 2) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }
  if (recruiterMessage.length > 2_000) {
    return NextResponse.json({ error: 'message must be under 2000 characters' }, { status: 400 });
  }

  const [{ data: candidate }, { data: existingTurns }] = await Promise.all([
    supabase
      .from('candidates')
      .select('profile_json, persona_hidden_state')
      .eq('id', candidateId)
      .eq('run_id', runId)
      .single(),
    supabase
      .from('conversations')
      .select('turn_number, speaker, content')
      .eq('candidate_id', candidateId)
      .order('turn_number', { ascending: true }),
  ]);

  if (!candidate) {
    return NextResponse.json({ error: 'candidate not found' }, { status: 404 });
  }

  const profile = candidate.profile_json as CandidateProfile;
  const hidden = (candidate.persona_hidden_state ?? null) as HiddenState | null;
  const turns = (existingTurns ?? []) as ConversationTurn[];
  const lastTurn = turns[turns.length - 1];
  if (lastTurn?.speaker === 'recruiter') {
    return NextResponse.json({ error: 'candidate reply is still pending' }, { status: 409 });
  }

  const recruiterTurn: ConversationTurn = {
    turn_number: (lastTurn?.turn_number ?? 0) + 1,
    speaker: 'recruiter',
    content: recruiterMessage,
  };

  const { error: recruiterInsertError } = await supabase.from('conversations').insert({
    candidate_id: candidateId,
    turn_number: recruiterTurn.turn_number,
    speaker: recruiterTurn.speaker,
    content: recruiterTurn.content,
  });
  if (recruiterInsertError) {
    return NextResponse.json({ error: recruiterInsertError.message }, { status: 500 });
  }

  const transcript = [...turns, recruiterTurn];
  let candidateReply = '';
  let fallback = false;

  try {
    const personaMessages = transcript.map((turn) => ({
      role: turn.speaker === 'candidate' ? ('assistant' as const) : ('user' as const),
      content: turn.content,
    }));

    const { content } = await callModel<string>({
      stage: 'simulate_persona',
      run_id: runId,
      candidate_id: candidateId,
      deployment: stageDeployment.simulate_persona,
      system: buildPersonaSystemPrompt(JSON.stringify(profile), JSON.stringify(hidden ?? {})),
      messages: personaMessages,
      response_format: 'text',
      temperature: 0.8,
      max_tokens: 1_200,
      timeout_ms: 25_000,
      max_retries: 0,
    });
    candidateReply = content.trim();
  } catch (error) {
    fallback = true;
    candidateReply = fallbackCandidateReply(profile, hidden, recruiterMessage);
    console.warn(`[chat] persona model failed for ${candidateId}; used fallback reply:`, error);
  }

  const candidateTurn: ConversationTurn = {
    turn_number: recruiterTurn.turn_number + 1,
    speaker: 'candidate',
    content: candidateReply,
  };

  const { error: candidateInsertError } = await supabase.from('conversations').insert({
    candidate_id: candidateId,
    turn_number: candidateTurn.turn_number,
    speaker: candidateTurn.speaker,
    content: candidateTurn.content,
  });
  if (candidateInsertError) {
    return NextResponse.json({ error: candidateInsertError.message }, { status: 500 });
  }

  await supabase
    .from('candidates')
    .update({
      status: 'complete',
      interest_score: null,
      interest_evidence: null,
      next_action_draft: null,
    })
    .eq('id', candidateId);

  return NextResponse.json({
    turns: [recruiterTurn, candidateTurn],
    fallback,
  });
}
