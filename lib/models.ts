import OpenAI from 'openai';

if (!process.env.AZURE_OPENAI_ENDPOINT || !process.env.AZURE_OPENAI_API_KEY) {
  throw new Error('Azure OpenAI env vars missing (AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY)');
}

// Single client — the base URL is the same for all three deployments.
// Model routing happens via the `model` param in each request, set to the deployment name.
export const azureClient = new OpenAI({
  baseURL: process.env.AZURE_OPENAI_ENDPOINT,
  apiKey: process.env.AZURE_OPENAI_API_KEY,
});

export const deployments = {
  grokNonReasoning: process.env.AZURE_DEPLOYMENT_GROK_NR!,
  grokReasoning: process.env.AZURE_DEPLOYMENT_GROK_REASONING!,
  kimi: process.env.AZURE_DEPLOYMENT_KIMI!,
} as const;

// Stage → deployment mapping — single source of truth
export const stageDeployment = {
  parse: deployments.grokNonReasoning,
  rerank: deployments.kimi,
  simulate_recruiter: deployments.grokReasoning,
  simulate_persona: deployments.grokNonReasoning,
  score: deployments.grokReasoning,
  draft: deployments.grokNonReasoning,
  leak_check: deployments.grokNonReasoning,
  safety_check: deployments.grokNonReasoning,
  pool_gen: deployments.kimi,
} as const;
