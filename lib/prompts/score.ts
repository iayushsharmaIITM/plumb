export const SCORE_SYSTEM = `You are analyzing a simulated recruiting conversation to produce an Interest Score with evidence citations.

Your task: evaluate the candidate's responses across 5 signals. For each signal, provide a score (0-20) and cite specific verbatim spans from the transcript that support your score.

THE 5 SIGNALS:

1. specificity_of_engagement (0-20)
   - Did the candidate engage with the specifics of the role, or reply generically?
   - High: asks substantive questions about the tech stack, team, problems being solved
   - Low: pleasantries only, vague interest, no real engagement with what the role IS

2. forward_commitment (0-20)
   - Did the candidate signal movement toward a next step?
   - High: "when can we talk", "happy to do a call next week", proposes concrete actions
   - Low: "let me think about it", "interesting, will reflect", no forward motion

3. objection_handling (0-20)
   - Did the candidate surface concerns and how did they resolve?
   - High: raises a specific concern, engages with an answer, updates their view
   - Low: no objections surfaced (suggests low engagement), or objections that were brushed aside

4. availability_timing (0-20)
   - How ready is this candidate to move?
   - High: signals active search, short timeline, or explicit availability
   - Low: explicit or implicit signals they're not actively looking ("just open", "not in a rush")

5. motivation_alignment (0-20)
   - Are the candidate's drivers met by this opportunity?
   - High: the role matches what they're seeking (growth, mission, scope, team)
   - Low: the role misaligns with their implied or stated drivers

Return ONLY valid JSON matching this exact schema:

{
  "signals": [
    {
      "name": "specificity_of_engagement",
      "score": 0-20,
      "evidence": [
        {
          "turn": <integer — the turn_number from the transcript>,
          "span": "<VERBATIM copy-paste from the transcript — must match character-for-character — do NOT paraphrase, do NOT add ellipsis>",
          "reasoning": "1-2 sentences: why this span supports this signal"
        }
      ]
    }
  ],
  "overall_reasoning": "3-4 sentences: overall read on the candidate's genuine interest level",
  "risk_flags": ["string — risks a recruiter should know about, e.g. 'Candidate deflected on comp questions, suggests high comp gap'"]
}

CRITICAL SPAN RULES:
- "signals" array must contain EXACTLY 5 items in this exact order: specificity_of_engagement, forward_commitment, objection_handling, availability_timing, motivation_alignment.
- Each "span" must be an EXACT verbatim substring of a message in the transcript (recruiter or candidate).
- Quote at most 1-2 spans per signal — prioritize the strongest evidence.
- Do NOT paraphrase. Do NOT use ellipses. Do NOT modify punctuation. Do NOT add quotes around spans.
- If no evidence exists for a signal, score it low but still cite the best available span or use an empty evidence array.

Return ONLY the JSON. No markdown.`;

export function buildScoreUserMessage(
  profileSummary: string,
  parsedJD: string,
  transcript: { turn_number: number; speaker: string; content: string }[]
): string {
  const transcriptStr = transcript
    .map((t) => `TURN ${t.turn_number} (${t.speaker}):\n${t.content}`)
    .join('\n\n');

  return `CANDIDATE (brief):
${profileSummary}

THE ROLE (parsed):
${parsedJD}

CONVERSATION TRANSCRIPT:
${transcriptStr}

Score the 5 interest signals. Cite verbatim spans. Return JSON only.`;
}
