import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: process.env.AZURE_OPENAI_ENDPOINT,
  apiKey: process.env.AZURE_OPENAI_API_KEY,
});

const deployments = {
  grokNR: process.env.AZURE_DEPLOYMENT_GROK_NR,
  grokReasoning: process.env.AZURE_DEPLOYMENT_GROK_REASONING,
  kimi: process.env.AZURE_DEPLOYMENT_KIMI,
};

console.log('Endpoint:', process.env.AZURE_OPENAI_ENDPOINT);
console.log('Deployments:', deployments);
console.log('');

const results = [];

async function test(name, fn) {
  const start = Date.now();
  try {
    const detail = await fn();
    const ms = Date.now() - start;
    results.push({ name, passed: true, ms });
    console.log(`✓ ${name} (${ms}ms) — ${detail}`);
  } catch (e) {
    const ms = Date.now() - start;
    results.push({ name, passed: false, ms, error: e.message });
    console.log(`✗ ${name} (${ms}ms) — ${e.message}`);
  }
}

async function simpleCall(deployment, extra = {}) {
  const res = await client.chat.completions.create({
    model: deployment,
    messages: [{ role: 'user', content: 'Reply with the single word "pong".' }],
    max_tokens: 10,
    ...extra,
  });
  return res.choices[0]?.message?.content ?? '';
}

async function jsonCall(deployment) {
  const res = await client.chat.completions.create({
    model: deployment,
    messages: [
      { role: 'system', content: 'Return ONLY valid JSON. No markdown.' },
      { role: 'user', content: 'Return {"ok": true, "number": 42} as JSON.' },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 50,
  });
  const content = res.choices[0]?.message?.content ?? '';
  const parsed = JSON.parse(content);
  if (parsed.ok !== true || parsed.number !== 42) throw new Error('JSON mismatch');
  return 'JSON parsed correctly';
}

// Run tests sequentially
await test('Grok NR — simple call', () => simpleCall(deployments.grokNR));
await test('Grok Reasoning — simple call', () => simpleCall(deployments.grokReasoning));
await test('Kimi K2.6 — simple call', () => simpleCall(deployments.kimi));

await test('Grok NR — JSON mode', () => jsonCall(deployments.grokNR));
await test('Grok Reasoning — JSON mode', () => jsonCall(deployments.grokReasoning));
await test('Kimi — JSON mode', () => jsonCall(deployments.kimi));

await test('Grok Reasoning — reasoning_effort', () =>
  simpleCall(deployments.grokReasoning, { reasoning_effort: 'medium' })
);

await test('Kimi — 10K input', async () => {
  const padding = 'The quick brown fox jumps over the lazy dog. '.repeat(1000);
  const res = await client.chat.completions.create({
    model: deployments.kimi,
    messages: [{ role: 'user', content: `${padding}\n\nReply with "ok".` }],
    max_tokens: 10,
  });
  return res.choices[0]?.message?.content ?? '';
});

console.log('\n=== SUMMARY ===');
const passed = results.filter(r => r.passed).length;
console.log(`${passed}/${results.length} passed`);
if (passed < results.length) {
  console.log('\nFailures:');
  results.filter(r => !r.passed).forEach(r => console.log(`  - ${r.name}: ${r.error}`));
  process.exit(1);
}
