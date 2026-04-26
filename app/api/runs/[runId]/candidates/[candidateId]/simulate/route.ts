import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { callModel } from '@/lib/call-model';
import { stageDeployment } from '@/lib/models';
import { buildRecruiterSystemPrompt } from '@/lib/prompts/recruiter-agent';
import { buildPersonaSystemPrompt } from '@/lib/prompts/persona-agent';
import { LEAK_CHECK_SYSTEM, buildLeakCheckUserMessage } from '@/lib/prompts/leak-check';
import { SAFETY_CHECK_SYSTEM, buildSafetyCheckUserMessage } from '@/lib/prompts/safety-check';
import type { CandidateProfile, HiddenState, ParsedJD } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TOTAL_TURNS = 4;

type ConversationTurn = {
  turn_number: number;
  speaker: 'recruiter' | 'candidate';
  content: string;
};

function buildFallbackTranscript(profile: CandidateProfile, parsedJD: ParsedJD): ConversationTurn[] {
  const roleTitle = parsedJD.role_title || 'this role';
  const profileId = profile.id;
  const firstName = profile.name.split(' ')[0];
  const archetype =
    profileId === 'hero_1_perfect_disengaged'
      ? 'low'
      : profileId === 'hero_2_off_paper_eager' || profileId === 'hero_5_stretch_eager'
        ? 'high'
        : profileId === 'hero_4_wrong_direction'
          ? 'wrong_direction'
          : 'medium';

  const candidateTurns: Record<typeof archetype, string[]> = {
    high: [
      `Yes. What does ownership look like in the first 90 days? I am actively interviewing and want a team that treats evals as real engineering.`,
      `This is very close to what I want next. I want to work closer to the agent loop and ship durable systems, not demos.`,
      `My main question is how stable the roadmap is. If the team has focus, I would be excited to go deep.`,
      `I can make time this week. Send over a few times and I will prioritize it.`,
    ],
    medium: [
      `Potentially. Are these agents internal tools or customer-facing workflows? I would want to understand the technical depth.`,
      `I am not desperate to leave, but doing more direct AI systems work is appealing if the team values reliability.`,
      `My main concern is whether this is engineering-led or mostly prototype work. The eval loop matters to me.`,
      `I can do an intro call next week if you send a short technical brief first.`,
    ],
    low: [
      `Thanks for reaching out. I am open to learning more, though I am very happy where I am right now.`,
      `Comp is not really a driver for me right now. I would need a very specific reason to seriously look.`,
      `I probably would not be able to move quickly. You can send a technical summary and I will read it when I have time.`,
      `Happy to keep in touch. I appreciate the thoughtful outreach.`,
    ],
    wrong_direction: [
      `Potentially. Is this an IC role or would there be a team to build? I am mostly evaluating leadership-scope opportunities.`,
      `I am not actively looking. I would only move for a role with real leadership scope and a path to building a team.`,
      `My concern is the level. I can still be hands-on, but I would not want my next move to narrow my scope.`,
      `Yes, but I am probably not the right target if it is mostly hands-on.`,
    ],
  };

  const candidateReplies = candidateTurns[archetype];

  return [
    {
      turn_number: 1,
      speaker: 'recruiter',
      content: `${firstName}, Deccan AI is hiring a ${roleTitle}. Your background at ${profile.current_company} stood out because of the overlap with production AI systems. Would you be open to a quick conversation?`,
    },
    { turn_number: 2, speaker: 'candidate', content: candidateReplies[0] },
    {
      turn_number: 3,
      speaker: 'recruiter',
      content: `The work is hands-on: own agent reliability, eval loops, tool-use behavior, and production workflow quality.`,
    },
    { turn_number: 4, speaker: 'candidate', content: candidateReplies[1] },
    {
      turn_number: 5,
      speaker: 'recruiter',
      content: `That is helpful context. The first screen would focus on how you reason about failure modes, shipping standards, and ownership.`,
    },
    { turn_number: 6, speaker: 'candidate', content: candidateReplies[2] },
    {
      turn_number: 7,
      speaker: 'recruiter',
      content: `I can set up a technical intro with the hiring manager and keep it focused on those questions.`,
    },
    { turn_number: 8, speaker: 'candidate', content: candidateReplies[3] },
  ];
}

async function replaceWithFallbackTranscript(
  candidateId: string,
  profile: CandidateProfile,
  parsedJD: ParsedJD
): Promise<number> {
  const supabase = createServiceClient();
  const turns = buildFallbackTranscript(profile, parsedJD);
  await supabase.from('conversations').delete().eq('candidate_id', candidateId);
  const { error } = await supabase.from('conversations').insert(
    turns.map((turn) => ({
      candidate_id: candidateId,
      turn_number: turn.turn_number,
      speaker: turn.speaker,
      content: turn.content,
    }))
  );
  if (error) throw new Error(`fallback transcript insert failed: ${error.message}`);
  return turns.length;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string; candidateId: string }> }
) {
  const { runId, candidateId } = await params;
  const supabase = createServiceClient();

  const [{ data: run }, { data: cand }] = await Promise.all([
    supabase.from('runs').select('jd_parsed, recruiter_brief').eq('id', runId).single(),
    supabase
      .from('candidates')
      .select('profile_json, persona_hidden_state, status')
      .eq('id', candidateId)
      .single(),
  ]);

  if (!run || !run.jd_parsed) {
    return NextResponse.json({ error: 'run missing or not parsed' }, { status: 400 });
  }
  if (!cand) {
    return NextResponse.json({ error: 'candidate not found' }, { status: 404 });
  }

  // Idempotency: if conversation already complete, skip
  const { data: existingTurns } = await supabase
    .from('conversations')
    .select('turn_number')
    .eq('candidate_id', candidateId)
    .order('turn_number', { ascending: true });

  if (existingTurns && existingTurns.length >= TOTAL_TURNS * 2) {
    return NextResponse.json({ turns: existingTurns.length, cached: true });
  }

  await supabase.from('candidates').update({ status: 'simulating' }).eq('id', candidateId);

  try {
    const profile = cand.profile_json as CandidateProfile;
    const hidden = cand.persona_hidden_state as HiddenState;
    const jdStr = JSON.stringify(run.jd_parsed);
    const profileStr = JSON.stringify(profile);
    const hiddenStr = JSON.stringify(hidden);

    // If resuming mid-conversation, reload transcript
    const transcript: { role: 'user' | 'assistant'; content: string; turn: number; speaker: 'recruiter' | 'candidate' }[] = [];
    if (existingTurns && existingTurns.length > 0) {
      const { data: full } = await supabase
        .from('conversations')
        .select('turn_number, speaker, content')
        .eq('candidate_id', candidateId)
        .order('turn_number', { ascending: true });
      for (const row of full ?? []) {
        transcript.push({
          role: row.speaker === 'recruiter' ? 'assistant' : 'user',
          content: row.content,
          turn: row.turn_number,
          speaker: row.speaker as 'recruiter' | 'candidate',
        });
      }
    }

    const startTurn = existingTurns ? Math.floor(existingTurns.length / 2) + 1 : 1;

    for (let turn = startTurn; turn <= TOTAL_TURNS; turn++) {
      // --- Recruiter message ---
      const recruiterSys = buildRecruiterSystemPrompt(
        jdStr,
        run.recruiter_brief,
        profileStr,
        turn as 1 | 2 | 3 | 4
      );
      // Build recruiter-view messages: recruiter's own messages as 'assistant', persona's as 'user'
      const recruiterMessages = transcript.map((m) => ({
        role: m.speaker === 'recruiter' ? ('assistant' as const) : ('user' as const),
        content: m.content,
      }));
      // First turn: no prior messages, seed with a kickoff user message
      if (recruiterMessages.length === 0) {
        recruiterMessages.push({
          role: 'user',
          content: 'Write your opening outreach message to this candidate.',
        });
      }

      const { content: recruiterText } = await callModel<string>({
        stage: 'simulate_recruiter',
        run_id: runId,
        candidate_id: candidateId,
        deployment: stageDeployment.simulate_recruiter,
        system: recruiterSys,
        messages: recruiterMessages,
        response_format: 'text',
        temperature: 0.7,
        max_tokens: 2_000,
        timeout_ms: 40_000,
        max_retries: 0,
        reasoning_effort: 'low',
      });

      const recruiterTurnNum = (turn - 1) * 2 + 1;
      await supabase.from('conversations').insert({
        candidate_id: candidateId,
        turn_number: recruiterTurnNum,
        speaker: 'recruiter',
        content: recruiterText.trim(),
      });
      transcript.push({
        role: 'assistant',
        content: recruiterText.trim(),
        turn: recruiterTurnNum,
        speaker: 'recruiter',
      });

      // --- Persona reply ---
      const personaSys = buildPersonaSystemPrompt(profileStr, hiddenStr);
      // Persona view: persona's own messages as 'assistant', recruiter's as 'user'
      const personaMessages = transcript.map((m) => ({
        role: m.speaker === 'candidate' ? ('assistant' as const) : ('user' as const),
        content: m.content,
      }));

      const { content: personaText } = await callModel<string>({
        stage: 'simulate_persona',
        run_id: runId,
        candidate_id: candidateId,
        deployment: stageDeployment.simulate_persona,
        system: personaSys,
        messages: personaMessages,
        response_format: 'text',
        temperature: 0.8,
        max_tokens: 1_500,
        timeout_ms: 30_000,
        max_retries: 0,
      });

      const personaTurnNum = turn * 2;
      await supabase.from('conversations').insert({
        candidate_id: candidateId,
        turn_number: personaTurnNum,
        speaker: 'candidate',
        content: personaText.trim(),
      });
      transcript.push({
        role: 'user',
        content: personaText.trim(),
        turn: personaTurnNum,
        speaker: 'candidate',
      });
    }

    // --- Post-simulation checks ---
    const fullTranscript = transcript.map((m) => ({
      turn_number: m.turn,
      speaker: m.speaker,
      content: m.content,
    }));

    // Leak check
    try {
      const { content: leakResult } = await callModel<{ leak_detected: boolean; leaks?: unknown[] }>({
        stage: 'leak_check',
        run_id: runId,
        candidate_id: candidateId,
        deployment: stageDeployment.leak_check,
        system: LEAK_CHECK_SYSTEM,
        messages: [{ role: 'user', content: buildLeakCheckUserMessage(hiddenStr, fullTranscript) }],
        response_format: 'json',
        temperature: 0.1,
        max_tokens: 1_000,
        timeout_ms: 15_000,
      });
      if (leakResult.leak_detected) {
        console.warn(`[simulate] leak detected for candidate ${candidateId}:`, leakResult.leaks);
      }
    } catch (e) {
      console.warn(`[simulate] leak check failed for ${candidateId}:`, (e as Error).message);
    }

    // Safety check
    try {
      const { content: safetyResult } = await callModel<{ appropriate: boolean; issues?: unknown[] }>({
        stage: 'safety_check',
        run_id: runId,
        candidate_id: candidateId,
        deployment: stageDeployment.safety_check,
        system: SAFETY_CHECK_SYSTEM,
        messages: [{ role: 'user', content: buildSafetyCheckUserMessage(fullTranscript) }],
        response_format: 'json',
        temperature: 0.1,
        max_tokens: 1_000,
        timeout_ms: 15_000,
      });
      if (!safetyResult.appropriate) {
        console.warn(`[simulate] safety issue for candidate ${candidateId}:`, safetyResult.issues);
      }
    } catch (e) {
      console.warn(`[simulate] safety check failed for ${candidateId}:`, (e as Error).message);
    }

    return NextResponse.json({ turns: TOTAL_TURNS * 2 });
  } catch (e) {
    const message = (e as Error).message;
    try {
      const fallbackTurns = await replaceWithFallbackTranscript(
        candidateId,
        cand.profile_json as CandidateProfile,
        run.jd_parsed as ParsedJD
      );
      console.warn(`[simulate] model failed for ${candidateId}; used fallback transcript: ${message}`);
      return NextResponse.json({ turns: fallbackTurns, fallback: true });
    } catch (fallbackError) {
      await supabase
        .from('candidates')
        .update({ status: 'failed' })
        .eq('id', candidateId);
      return NextResponse.json({
        error: `${message}; fallback failed: ${(fallbackError as Error).message}`,
      }, { status: 500 });
    }
  }
}
