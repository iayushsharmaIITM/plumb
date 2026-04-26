# Sample Input and Output

## Input

The featured run uses [`data/meta-jd.md`](../data/meta-jd.md): an Agentic AI Engineer role for Deccan AI.

The agent scans the seeded 120-profile talent corpus in [`data/pool.json`](../data/pool.json).

## Output

The committed demo output lives in [`data/demo-run.json`](../data/demo-run.json). It contains only public-safe data:

- Run metadata and parsed JD
- 8 shortlisted candidates
- Match Score and profile evidence
- Interest Score and transcript span evidence
- Cohort assignment
- Simulated conversation turns
- Next-action draft

It does **not** include hidden persona state.

## Expected Demo Story

| Candidate | Match | Interest | Cohort | Interpretation |
|---|---:|---:|---|---|
| Maya Chen | 94 | Low | Nurture | Excellent technical fit, weak readiness to move |
| Jules Nakamura | 76 | High | Recommended | Slight match gap, strong genuine interest |

Plumb ranks the recruiter-actionable candidate higher, because the assignment is not just profile matching. It is scouting plus engagement.
