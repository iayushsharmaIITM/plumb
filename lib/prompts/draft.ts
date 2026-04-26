import type { Cohort } from '../types';

export function buildDraftSystemPrompt(
  cohort: Cohort,
  recruiterBrief: string | null
): string {
  const cohortGuidance: Record<Cohort, string> = {
    recommended: `The candidate is in the RECOMMENDED cohort — strong match, strong interest. Draft an interview invitation.
- Reference 1-2 specific moments from the transcript that indicated genuine interest
- Propose a concrete next step: a 30-minute call with the hiring manager, with 2 time options this or next week
- Tone: warm, confident, direct
- 4-6 sentences`,
    stretch: `The candidate is in the STRETCH cohort — missing a requirement but highly interested.
- Be honest about the gap. Mention the specific requirement that's a stretch.
- Explain why you're still interested (their interest, their adjacent strengths, their trajectory)
- Propose a lower-commitment next step: an informal chat, or an async Q&A
- Tone: honest, respectful — not condescending
- 4-6 sentences`,
    nurture: `The candidate is in the NURTURE cohort — great match but not actively interested.
- Acknowledge (without naming specifics) that the timing may not be right
- Offer to stay in touch / share updates on the team's work over time
- Invite them to reach out when their situation changes
- Do NOT push for a call. Respect the signal.
- Tone: low-pressure, genuine
- 3-5 sentences`,
    pass: '',
  };

  return `You are drafting a next-action message for a recruiter to send to a candidate.

${recruiterBrief ? `PRIVATE CONTEXT you can reference tastefully:\n${recruiterBrief}\n\n` : ''}${cohortGuidance[cohort]}

Formatting rules:
- Plain prose, no markdown, no bullet points
- No subject line (this is a message reply, not a fresh email)
- Do not sign off with "Best," or a name — the recruiter will add their own sign-off
- Write like a confident, respectful professional
- Output ONLY the message body.`;
}

export function buildDraftUserMessage(
  candidateName: string,
  cohort: Cohort,
  transcriptSummary: string,
  interestEvidence: string
): string {
  return `Candidate: ${candidateName}
Cohort: ${cohort}

Transcript summary:
${transcriptSummary}

Interest signals observed:
${interestEvidence}

Draft the next-action message. Return ONLY the message body, no preamble.`;
}
