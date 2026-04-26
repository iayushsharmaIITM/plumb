/**
 * Pool generator — run once, commit data/pool.json + data/hidden-states.json.
 *
 * Uses Kimi K2.6 for rich coherent generation. Generates:
 *   - 5 heroes (individual, archetype-specific prompts)
 *   - 25 strong candidates (batched, 5 per call)
 *   - 90 filler candidates (batched, 10 per call)
 *
 * Total ~20 LLM calls, ~10-20 minutes, ~$1-2 in Azure credits.
 */

import 'dotenv/config';
import { writeFileSync, existsSync } from 'fs';
import { callModel } from '../lib/call-model';
import { stageDeployment } from '../lib/models';
import type { CandidateProfile, HiddenState } from '../lib/types';

const POOL_PATH = 'data/pool.json';
const HIDDEN_PATH = 'data/hidden-states.json';

// --- Hero archetypes ---
const HERO_SPECS = [
  {
    id: 'hero_1_perfect_disengaged',
    name_hint: 'realistic modern tech-worker name',
    archetype:
      'Perfect on paper (looks like ~94/100 match), quietly disengaged. Senior ML engineer at a frontier AI lab. Just got promoted. Spouse in second trimester of pregnancy. No actual intent to move.',
    hidden_targets: {
      satisfaction: '7-8',
      search_intensity: 'passive_curiosity',
      politeness_mask: '8-9',
      directness: 'diplomatic',
      primary_driver: 'stability',
      real_reason_for_move: 'not actually moving; replies out of courtesy and curiosity',
    },
    profile_shape:
      'FAANG/frontier lab pedigree (Anthropic/DeepMind/OpenAI-tier), shipped production agent systems, strong OSS, ML PhD or MS + top-tier undergrad. Tweets and blog posts about agent evals. 7-10 years experience.',
  },
  {
    id: 'hero_2_off_paper_eager',
    name_hint: 'realistic modern tech-worker name',
    archetype:
      'Slightly off-paper (~76/100 match), genuinely enthusiastic. 3 years at a YC startup, missing the 5-year ML production requirement. Fed up with startup churn, ready to move, hungry to grow.',
    hidden_targets: {
      satisfaction: '3-4',
      search_intensity: 'actively_interviewing',
      politeness_mask: '5-6',
      directness: 'very_direct',
      primary_driver: 'growth',
      real_reason_for_move:
        "startup has pivoted twice in 18 months; burned out on chaos, wants stable team and a real shipping culture",
    },
    profile_shape:
      'Current: Founding engineer or early engineer at YC startup (3 years). Before: software engineer at a bigger company. Strong generalist skills, agentic side projects, a couple of popular blog posts about LLM tooling. Only 3 years explicitly in ML/AI.',
  },
  {
    id: 'hero_3_inference_surfacer',
    name_hint: 'realistic modern tech-worker name',
    archetype:
      'Non-obvious great fit. Title is "Backend Engineer" but has substantial OSS contributions to agent frameworks and a blog on LLM evals. Must surface via reasoning, not keywords.',
    hidden_targets: {
      satisfaction: '6',
      search_intensity: 'casually_looking',
      politeness_mask: '6-7',
      directness: 'diplomatic',
      primary_driver: 'mission',
      real_reason_for_move:
        'wants to formally work on AI instead of doing it only as a side project; frustrated that his current role boxes him into backend API work',
    },
    profile_shape:
      'Current title: Backend Engineer (or Senior Backend Engineer), 6+ years at a mid-sized SaaS company. Skills_declared are mostly backend (Python, Postgres, AWS, distributed systems). But open_source_contributions include 2-3 PRs to LangGraph/LlamaIndex/Pydantic AI with stars, AND writing_samples include a detailed LLM evals blog post. Recent_signals show him talking about agent patterns on Twitter/GitHub.',
  },
  {
    id: 'hero_4_wrong_direction',
    name_hint: 'realistic modern tech-worker name',
    archetype:
      'Impressive but wrong-direction. Principal ML Scientist who wants to lead a team, not stay IC. High match, low interest in this role specifically.',
    hidden_targets: {
      satisfaction: '5',
      search_intensity: 'casually_looking',
      politeness_mask: '7',
      directness: 'diplomatic',
      primary_driver: 'growth',
      real_reason_for_move:
        'wants a management/leadership role; this IC role is not what he is looking for; will be polite but disengaged',
    },
    profile_shape:
      'Principal ML Scientist at a big tech company, 12+ years experience, PhD, significant publications. Recent signals include tweets about building teams and mentoring. Stated preferences mention interest in leadership roles.',
  },
  {
    id: 'hero_5_stretch_eager',
    name_hint: 'realistic modern tech-worker name',
    archetype:
      'Stretch candidate with a compelling story. Senior frontend engineer who built a Claude-based internal tool with real GitHub traction and is pivoting into AI. Match ~55-65, Interest 85+.',
    hidden_targets: {
      satisfaction: '4',
      search_intensity: 'actively_interviewing',
      politeness_mask: '6',
      directness: 'very_direct',
      primary_driver: 'mission',
      real_reason_for_move:
        "done with pure frontend work; built a Claude internal tool at current company that took off (1k+ GitHub stars) and wants to work on AI full-time",
    },
    profile_shape:
      '4-6 years as a frontend engineer (React, TypeScript, Next.js). Current role: Senior Frontend Engineer. Side project / internal-turned-OSS Claude tool with 1k+ stars (agent-adjacent). No formal ML background, but strong curiosity and demonstrated shipping instincts.',
  },
] as const;

const HERO_SYSTEM = `You are generating a realistic professional profile for a fictional candidate who plays a specific role in a recruiting demo.

Return ONLY a JSON object with exactly these two top-level keys:

{
  "profile": { /* CandidateProfile */ },
  "hidden_state": { /* HiddenState */ }
}

CandidateProfile schema:
{
  "id": "string — use the id provided",
  "name": "string — realistic modern tech-worker name",
  "current_title": "string",
  "current_company": "string",
  "years_experience": number,
  "location": "string — city, country",
  "work_history": [
    { "role": "string", "company": "string", "years": number, "start_year": number, "end_year": number | null, "highlights": ["string", "string"] }
  ],
  "skills_declared": ["string"],
  "skills_demonstrated": [ { "skill": "string", "evidence_refs": ["string"] } ],
  "education": [ { "degree": "string", "institution": "string", "year": number } ],
  "writing_samples": [ { "title": "string", "url": "string", "excerpt": "string" } ],
  "open_source_contributions": [ { "repo": "string", "description": "string", "stars": number } ],
  "recent_signals": [ { "type": "tweet | blog_post | github_activity | conference_talk", "content": "string", "date": "YYYY-MM-DD" } ],
  "stated_preferences": { "remote_preference": "string", "comp_range": "string", "domains": ["string"] }
}

HiddenState schema:
{
  "situation": {
    "current_role_satisfaction": 1-10,
    "search_intensity": "passive_curiosity | casually_looking | actively_interviewing | has_offers",
    "time_at_current_role_months": number,
    "real_reason_for_move": "string — the honest reason behind any move, or 'not actually moving'"
  },
  "drivers": {
    "primary": "compensation | mission | growth | team | autonomy | stability",
    "secondary": "compensation | mission | growth | team | autonomy | stability",
    "compensation_expectation": { "min": number, "target": number, "attitude": "string" },
    "deal_breakers": ["string"]
  },
  "concerns": {
    "about_this_role": [ { "concern": "string", "severity": "low | medium | high" } ],
    "about_the_company": ["string"],
    "gut_feel": "string"
  },
  "life": {
    "constraints": "string",
    "external_pressures": "string",
    "risk_appetite": "high | medium | low"
  },
  "behavior": {
    "verbosity": "terse | medium | verbose",
    "politeness_mask": 0-10,
    "directness": "very_direct | diplomatic | evasive",
    "question_tendency": "rarely | normal | probing"
  },
  "revelation": {
    "volunteer": ["string — 3-5 items they'd mention unprompted"],
    "respond": ["string — 3-5 items they'd share honestly if directly asked"],
    "guarded": ["string — 3-5 items they'd deflect or minimize"]
  }
}

Rules:
- Generate realistic, specific details. Avoid clichés like "passionate about AI" or "results-driven."
- Name, companies, skills, and signals should read like a real person's profile.
- Dates should be plausible relative to 2026.
- Return ONLY the JSON. No markdown fences, no prose before or after.`;

function buildHeroUser(spec: typeof HERO_SPECS[number]): string {
  return `Generate ONE fictional candidate.

id: "${spec.id}"

ARCHETYPE (critical — the profile + hidden state must honor this):
${spec.archetype}

PROFILE SHAPE GUIDANCE:
${spec.profile_shape}

HIDDEN STATE TARGETS:
- current_role_satisfaction around: ${spec.hidden_targets.satisfaction}
- search_intensity: ${spec.hidden_targets.search_intensity}
- politeness_mask around: ${spec.hidden_targets.politeness_mask}
- directness: ${spec.hidden_targets.directness}
- primary driver: ${spec.hidden_targets.primary_driver}
- real_reason_for_move: "${spec.hidden_targets.real_reason_for_move}"

CRITICAL GUARDED ITEMS: the real reason above MUST appear in revelation.guarded, NOT revelation.volunteer.

Return JSON only.`;
}

// --- Strong / Filler batch prompt ---
const BATCH_SYSTEM = `You are generating a batch of realistic fictional candidate profiles for a recruiting demo pool.

Return ONLY a JSON object:

{
  "candidates": [
    {
      "profile": { /* CandidateProfile schema */ },
      "hidden_state": { /* HiddenState schema */ }
    }
  ]
}

Full schemas:

CandidateProfile:
{
  "id": "string — use the id provided for each slot",
  "name": "string — realistic modern tech-worker name",
  "current_title": "string",
  "current_company": "string",
  "years_experience": number,
  "location": "string",
  "work_history": [ { "role": "string", "company": "string", "years": number, "start_year": number, "end_year": number | null, "highlights": ["string"] } ],
  "skills_declared": ["string"],
  "skills_demonstrated": [ { "skill": "string", "evidence_refs": ["string"] } ],
  "education": [ { "degree": "string", "institution": "string", "year": number } ],
  "writing_samples": [ { "title": "string", "url": "string", "excerpt": "string" } ],
  "open_source_contributions": [ { "repo": "string", "description": "string", "stars": number } ],
  "recent_signals": [ { "type": "tweet | blog_post | github_activity | conference_talk", "content": "string", "date": "YYYY-MM-DD" } ],
  "stated_preferences": { "remote_preference": "string", "comp_range": "string", "domains": ["string"] }
}

HiddenState:
{
  "situation": { "current_role_satisfaction": 1-10, "search_intensity": "passive_curiosity | casually_looking | actively_interviewing | has_offers", "time_at_current_role_months": number, "real_reason_for_move": "string" },
  "drivers": { "primary": "compensation | mission | growth | team | autonomy | stability", "secondary": "same", "compensation_expectation": { "min": number, "target": number, "attitude": "string" }, "deal_breakers": ["string"] },
  "concerns": { "about_this_role": [{ "concern": "string", "severity": "low | medium | high" }], "about_the_company": ["string"], "gut_feel": "string" },
  "life": { "constraints": "string", "external_pressures": "string", "risk_appetite": "high | medium | low" },
  "behavior": { "verbosity": "terse | medium | verbose", "politeness_mask": 0-10, "directness": "very_direct | diplomatic | evasive", "question_tendency": "rarely | normal | probing" },
  "revelation": { "volunteer": ["string"], "respond": ["string"], "guarded": ["string"] }
}

Distribution rules for hidden_state (apply across the whole batch):
- ~70% search_intensity in 'passive_curiosity' or 'casually_looking'
- ~20% 'actively_interviewing'
- ~10% 'has_offers'
- current_role_satisfaction clusters 6-7 with tails
- politeness_mask clusters 5-7 with tails
- Every hidden_state's revelation.guarded MUST contain 3-5 concrete items (comp specifics, real reason for move, specific concerns, deal-breakers, life context). NEVER leave guarded empty.

Profile rules:
- Vary titles, companies, seniority, domains. Mix backend / frontend / ML / devops / data / applied research.
- Many profiles should have PARTIAL fit for an AI Engineer role — some adjacent skills, some gaps. This is filler, not hero material.
- Realistic specifics, no clichés, no buzzword soup.

Return ONLY the JSON. No markdown fences.`;

function buildBatchUser(
  kind: 'strong' | 'filler',
  ids: string[]
): string {
  const shapeGuidance =
    kind === 'strong'
      ? `These are STRONG candidates — realistic enough to land in a Recommended cohort for an "Agentic AI Engineer" role, but none should be obvious 95+ matches (the heroes take that slot). Mix of: applied ML engineers, research engineers with shipping experience, strong software engineers transitioning into AI, agent-framework contributors. 4-8 years experience typical.`
      : `These are FILLER candidates — realistic noise for a sourcing pool. Most should have partial or poor fit for an Agentic AI Engineer role: mobile engineers, data analysts, junior ML engineers, senior SREs, product designers with some ML curiosity, people in unrelated industries. Full experience range (2-15 years). A few should have interesting angles but clearly wrong direction.`;

  return `Generate ${ids.length} candidates of kind: ${kind}.

${shapeGuidance}

Use these ids in order: ${ids.map((i, n) => `${n + 1}) "${i}"`).join('  ')}

Return a "candidates" array with exactly ${ids.length} items in that order. Each item has both "profile" and "hidden_state". JSON only.`;
}

// --- Main ---
async function generateHero(spec: typeof HERO_SPECS[number]): Promise<{
  profile: CandidateProfile;
  hidden_state: HiddenState;
}> {
  console.log(`  → hero: ${spec.id}`);
  const result = await callModel<{ profile: CandidateProfile; hidden_state: HiddenState }>({
    stage: 'pool_gen',
    deployment: stageDeployment.pool_gen,
    system: HERO_SYSTEM,
    messages: [{ role: 'user', content: buildHeroUser(spec) }],
    response_format: 'json',
    temperature: 0.7,
    max_tokens: 24_000,
    timeout_ms: 120_000,
  });
  // Ensure id is correct
  result.content.profile.id = spec.id;
  return result.content;
}

async function generateBatch(
  kind: 'strong' | 'filler',
  ids: string[]
): Promise<{ profile: CandidateProfile; hidden_state: HiddenState }[]> {
  console.log(`  → batch ${kind} (${ids.length}): ${ids[0]} .. ${ids[ids.length - 1]}`);
  const result = await callModel<{
    candidates: { profile: CandidateProfile; hidden_state: HiddenState }[];
  }>({
    stage: 'pool_gen',
    deployment: stageDeployment.pool_gen,
    system: BATCH_SYSTEM,
    messages: [{ role: 'user', content: buildBatchUser(kind, ids) }],
    response_format: 'json',
    temperature: 0.8,
    max_tokens: 32_000,
    timeout_ms: 120_000,
  });
  if (!Array.isArray(result.content.candidates)) {
    throw new Error(`batch ${kind} returned non-array`);
  }
  return result.content.candidates.map((c, i) => {
    c.profile.id = ids[i];
    return c;
  });
}

async function main() {
  // Resume support — if pool.json already partially exists we'd overwrite; keep it simple here.
  if (existsSync(POOL_PATH) && !process.env.POOL_FORCE) {
    console.log(`${POOL_PATH} already exists. Set POOL_FORCE=1 to regenerate.`);
    process.exit(0);
  }

  const pool: CandidateProfile[] = [];
  const hidden: Record<string, HiddenState> = {};

  console.log('=== Heroes (5) ===');
  for (const spec of HERO_SPECS) {
    const out = await generateHero(spec);
    pool.push(out.profile);
    hidden[out.profile.id] = out.hidden_state;
    // Incremental snapshot — lets us resume partial runs visually
    writeFileSync(POOL_PATH, JSON.stringify(pool, null, 2));
    writeFileSync(HIDDEN_PATH, JSON.stringify(hidden, null, 2));
  }

  console.log('\n=== Strong (25) ===');
  const strongIds = Array.from({ length: 25 }, (_, i) => `strong_${String(i + 1).padStart(2, '0')}`);
  for (let i = 0; i < strongIds.length; i += 5) {
    const batch = strongIds.slice(i, i + 5);
    const out = await generateBatch('strong', batch);
    for (const c of out) {
      pool.push(c.profile);
      hidden[c.profile.id] = c.hidden_state;
    }
    writeFileSync(POOL_PATH, JSON.stringify(pool, null, 2));
    writeFileSync(HIDDEN_PATH, JSON.stringify(hidden, null, 2));
  }

  console.log('\n=== Filler (90) ===');
  const fillerIds = Array.from({ length: 90 }, (_, i) => `filler_${String(i + 1).padStart(3, '0')}`);
  for (let i = 0; i < fillerIds.length; i += 10) {
    const batch = fillerIds.slice(i, i + 10);
    const out = await generateBatch('filler', batch);
    for (const c of out) {
      pool.push(c.profile);
      hidden[c.profile.id] = c.hidden_state;
    }
    writeFileSync(POOL_PATH, JSON.stringify(pool, null, 2));
    writeFileSync(HIDDEN_PATH, JSON.stringify(hidden, null, 2));
  }

  console.log(`\nWrote ${pool.length} profiles → ${POOL_PATH}`);
  console.log(`Wrote ${Object.keys(hidden).length} hidden states → ${HIDDEN_PATH}`);
}

main().catch((e) => {
  console.error('POOL GEN FAILED:', e);
  process.exit(1);
});
