import 'dotenv/config';
import OpenAI from 'openai';

const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const apiKey = process.env.AZURE_OPENAI_API_KEY;
if (!endpoint || !apiKey) {
  console.error('Missing AZURE_OPENAI_ENDPOINT or AZURE_OPENAI_API_KEY');
  process.exit(1);
}

const client = new OpenAI({ baseURL: endpoint, apiKey });

const deployments = {
  grokNR: process.env.AZURE_DEPLOYMENT_GROK_NR!,
  grokReasoning: process.env.AZURE_DEPLOYMENT_GROK_REASONING!,
  kimi: process.env.AZURE_DEPLOYMENT_KIMI!,
};

type TestResult = { test: string; passed: boolean; detail?: string; latency_ms?: number };
const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<string>): Promise<void> {
  const start = Date.now();
  try {
    const detail = await fn();
    const latency = Date.now() - start;
    results.push({ test: name, passed: true, detail, latency_ms: latency });
    console.log(`✓ ${name} (${latency}ms) — ${detail.slice(0, 80)}`);
  } catch (e) {
    const latency = Date.now() - start;
    const msg = (e as Error).message;
    results.push({ test: name, passed: false, detail: msg, latency_ms: latency });
    console.log(`✗ ${name} (${latency}ms) — ${msg.slice(0, 200)}`);
  }
}

// Kimi K2.6 is a reasoning model — its internal thinking tokens count against max_tokens.
// Always allocate generous budget (≥500) so visible output isn't empty with finish_reason=length.
async function simpleCall(deployment: string, extra: Record<string, unknown> = {}) {
  const res = await client.chat.completions.create({
    model: deployment,
    messages: [{ role: 'user', content: 'Reply with the single word "pong".' }],
    max_tokens: 1000,
    ...extra,
  });
  const content = res.choices[0]?.message?.content ?? '';
  if (!content.trim()) throw new Error(`empty content, finish_reason=${res.choices[0]?.finish_reason}`);
  return content;
}

async function jsonCall(deployment: string) {
  const res = await client.chat.completions.create({
    model: deployment,
    messages: [
      { role: 'system', content: 'Return ONLY valid JSON. No markdown.' },
      { role: 'user', content: 'Return {"ok": true, "number": 42} as JSON.' },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 1000,
  });
  const content = res.choices[0]?.message?.content ?? '';
  const parsed = JSON.parse(content);
  if (parsed.ok !== true || parsed.number !== 42) throw new Error(`JSON mismatch: ${content}`);
  return 'ok';
}

async function longInputCall(deployment: string) {
  const padding = 'The quick brown fox jumps over the lazy dog. '.repeat(1000);
  const res = await client.chat.completions.create({
    model: deployment,
    messages: [
      {
        role: 'user',
        content: `${padding}\n\nHow many times does "fox" appear in the text above? Answer with a single number only.`,
      },
    ],
    max_tokens: 4000,
  });
  const content = res.choices[0]?.message?.content ?? '';
  if (!content.trim()) throw new Error(`empty content, finish_reason=${res.choices[0]?.finish_reason}`);
  return content;
}

async function main() {
  console.log('=== Azure AI Foundry verification ===');
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Deployments: ${JSON.stringify(deployments)}\n`);

  await test('Grok NR — simple call', () => simpleCall(deployments.grokNR));
  await test('Grok Reasoning — simple call', () => simpleCall(deployments.grokReasoning));
  await test('Kimi K2.6 — simple call', () => simpleCall(deployments.kimi));

  await test('Grok NR — JSON mode', () => jsonCall(deployments.grokNR));
  await test('Grok Reasoning — JSON mode', () => jsonCall(deployments.grokReasoning));
  await test('Kimi — JSON mode', () => jsonCall(deployments.kimi));

  await test('Grok NR — 10K input', () => longInputCall(deployments.grokNR));
  await test('Grok Reasoning — 10K input', () => longInputCall(deployments.grokReasoning));
  await test('Kimi — 10K input (reasoning task)', async () => {
    // Reasoning task, not enumeration. Kimi's thinking budget scales with task complexity.
    const padding = 'The quick brown fox jumps over the lazy dog. '.repeat(1000);
    const res = await client.chat.completions.create({
      model: deployments.kimi,
      messages: [
        {
          role: 'user',
          content: `${padding}\n\nIn one sentence, what animal is described above? Answer: the ___.`,
        },
      ],
      max_tokens: 4000,
    });
    const content = res.choices[0]?.message?.content ?? '';
    if (!content.trim()) throw new Error(`empty content, finish_reason=${res.choices[0]?.finish_reason}`);
    return content;
  });

  await test('Grok Reasoning — reasoning_effort=medium', () =>
    simpleCall(deployments.grokReasoning, { reasoning_effort: 'medium' })
  );

  await test('Kimi — 40K input (rerank simulation)', async () => {
    const padding = 'Candidate profile text. '.repeat(8000);
    const res = await client.chat.completions.create({
      model: deployments.kimi,
      messages: [{ role: 'user', content: `${padding}\n\nReply with "ok".` }],
      max_tokens: 1000,
    });
    const content = res.choices[0]?.message?.content ?? '';
    if (!content.trim()) throw new Error(`empty content, finish_reason=${res.choices[0]?.finish_reason}`);
    return content;
  });

  console.log('\n=== SUMMARY ===');
  const passed = results.filter((r) => r.passed).length;
  console.log(`${passed}/${results.length} passed`);
  if (passed < results.length) {
    console.log('\nFailures:');
    results.filter((r) => !r.passed).forEach((r) => console.log(`  - ${r.test}: ${r.detail}`));
    process.exit(1);
  }
  console.log('\nAll checks green. Safe to proceed with scaffold.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
