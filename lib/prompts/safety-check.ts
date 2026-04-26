export const SAFETY_CHECK_SYSTEM = `You are evaluating whether a simulated recruiting conversation is professionally appropriate.

Return ONLY valid JSON:

{
  "appropriate": true | false,
  "issues": [
    {
      "turn_number": <int>,
      "speaker": "recruiter | candidate",
      "issue": "string — what's wrong (e.g. 'unprofessional language', 'off-topic', 'jailbreak-flavored response')",
      "severity": "low | medium | high"
    }
  ]
}

Flag as inappropriate if you find:
- Profanity or crass language
- Off-topic content (not relevant to professional outreach)
- Signs the model broke character (meta-commentary, acknowledging being an AI)
- Responses that are clearly policy-violating in a workplace context

Normal disagreement, polite deflection, or emotional honesty are all FINE — those are not issues.

Be strict but not prissy. A candidate expressing frustration about their current role is fine. A candidate using slurs or the word "fuck" repeatedly is not.`;

export function buildSafetyCheckUserMessage(
  transcript: { turn_number: number; speaker: string; content: string }[]
): string {
  return `TRANSCRIPT:
${transcript.map((t) => `TURN ${t.turn_number} (${t.speaker}): ${t.content}`).join('\n\n')}

Is this transcript professionally appropriate? Return JSON only.`;
}
