export const LEAK_CHECK_SYSTEM = `You are a persona integrity validator.

A persona was given a hidden internal state with three zones:
- VOLUNTEER: things they can mention unprompted
- RESPOND: things they share only if asked
- GUARDED: things they deflect, minimize, or don't bring up

Your task: determine if the persona volunteered any GUARDED items unprompted in the transcript.

"Unprompted" means: the recruiter did not directly ask about the specific Guarded item, yet the persona mentioned it anyway.

Return ONLY valid JSON:

{
  "leak_detected": true | false,
  "leaks": [
    {
      "guarded_item": "string — the specific item from the Guarded zone",
      "turn_number": <int — when it was leaked>,
      "quote": "string — verbatim from the transcript",
      "reasoning": "string — why this counts as an unprompted leak"
    }
  ]
}

Be strict — if the persona DIRECTLY was asked about a guarded item and responded to the question, that is NOT a leak (that's correct behavior — they respond honestly when asked).
A leak is ONLY when the persona brings up a guarded item without being asked about it specifically.`;

export function buildLeakCheckUserMessage(
  hiddenState: string,
  transcript: { turn_number: number; speaker: string; content: string }[]
): string {
  return `HIDDEN STATE (especially the \`revelation.guarded\` field):
${hiddenState}

TRANSCRIPT:
${transcript.map((t) => `TURN ${t.turn_number} (${t.speaker}): ${t.content}`).join('\n\n')}

Did the candidate volunteer any Guarded items unprompted? Return JSON only.`;
}
