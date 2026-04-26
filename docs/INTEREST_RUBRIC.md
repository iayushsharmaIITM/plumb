# Interest Score Rubric — Plumb

> Published rubric for transparency. This is exactly what the scoring model evaluates.

## Overview

The Interest Score (0–100) measures genuine candidate interest from a simulated 4-turn recruiting conversation. It is computed by scoring 5 independent signals, each 0–20, with verbatim span citations from the transcript.

## The 5 Signals

### 1. Specificity of Engagement (0–20)

Did the candidate engage with the specifics of the role, or reply generically?

- **High (16–20):** Asks substantive questions about the tech stack, team composition, problems being solved. References specific aspects of the role.
- **Medium (8–15):** Some engagement with role details, but mostly surface-level.
- **Low (0–7):** Pleasantries only, vague interest, no real engagement with what the role actually is.

### 2. Forward Commitment (0–20)

Did the candidate signal movement toward a next step?

- **High (16–20):** "When can we talk?", "Happy to do a call next week", proposes concrete actions.
- **Medium (8–15):** Open but non-committal: "That could be interesting", "I'd be open to learning more."
- **Low (0–7):** "Let me think about it", "Interesting, will reflect", no forward motion.

### 3. Objection Handling (0–20)

Did the candidate surface concerns and how did they resolve?

- **High (16–20):** Raises a specific concern, engages with the recruiter's response, updates their view. Productive friction.
- **Medium (8–15):** Mentions a concern but doesn't pursue it, or accepts reassurance without probing.
- **Low (0–7):** No objections surfaced (suggests low engagement), or objections brushed aside without resolution.

### 4. Availability & Timing (0–20)

How ready is this candidate to move?

- **High (16–20):** Signals active search, short timeline, or explicit availability. "I'm exploring options right now."
- **Medium (8–15):** Passively open: "Always happy to hear about interesting opportunities."
- **Low (0–7):** Explicit or implicit signals they're not actively looking. "Just seeing what's out there", "Not in a rush."

### 5. Motivation Alignment (0–20)

Are the candidate's drivers met by this opportunity?

- **High (16–20):** The role clearly matches what they're seeking — growth, mission, scope, team, autonomy. They articulate why.
- **Medium (8–15):** Partial alignment — some drivers met, others unclear or unaddressed.
- **Low (0–7):** The role misaligns with their implied or stated drivers. Wrong direction, wrong stage.

## Evidence Standard

Each signal score cites **1–2 verbatim spans** from the transcript:

```json
{
  "turn": 4,
  "span": "I'd love to chat next week — I'm genuinely curious about how you're thinking about agent evaluation",
  "reasoning": "Candidate proposes a concrete next step and references a specific technical area, indicating both forward commitment and specificity of engagement."
}
```

Spans must be **exact, character-for-character copies** from the transcript. No paraphrasing. No ellipses.

## Cohort Assignment

After scoring, candidates are assigned to cohorts:

| Cohort | Match Score | Interest Score | Action |
|---|---|---|---|
| **Recommended** | ≥ 70 | ≥ 60 | Interview invite |
| **Stretch** | 50–69 | ≥ 70 | Gap-aware conversation |
| **Nurture** | ≥ 70 | < 60 | Soft-touch, stay in orbit |
| **Pass** | Below thresholds | | No draft |

---

*This rubric is the product. Publishing it is the point — transparency in how interest is modeled.*
