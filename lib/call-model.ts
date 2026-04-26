import { azureClient, deployments } from './models';
import { createServiceClient } from './supabase/server';
import type { ModelCallOptions, ModelCallResult } from './types';

const DEFAULT_TIMEOUT_MS = 45_000;
const MAX_RETRIES = 2;

// Kimi K2.6 is a reasoning model — its internal thinking tokens are counted against max_tokens.
// Defaults below are generous to avoid empty content / finish_reason=length.
function resolveMaxTokens(deployment: string, requested?: number): number {
  if (requested) return requested;
  if (deployment === deployments.kimi) return 16_000;
  if (deployment === deployments.grokReasoning) return 8_000;
  return 4_096;
}

export async function callModel<T = unknown>(
  opts: ModelCallOptions
): Promise<ModelCallResult<T>> {
  const supabase = createServiceClient();
  let attempt = 0;
  let lastError: Error | null = null;
  const maxRetries = opts.max_retries ?? MAX_RETRIES;

  while (attempt <= maxRetries) {
    const startedAt = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        opts.timeout_ms ?? DEFAULT_TIMEOUT_MS
      );

      const body: Record<string, unknown> = {
        model: opts.deployment,
        messages: [
          { role: 'system', content: opts.system },
          ...opts.messages,
        ],
        temperature: opts.temperature ?? 0.2,
        max_tokens: resolveMaxTokens(opts.deployment, opts.max_tokens),
        stream: false,
      };

      // Kimi K2.6 does NOT support response_format: json_object — skip for Kimi.
      // The extractJson() fallback handles Kimi's raw output fine.
      if (opts.response_format === 'json' && opts.deployment !== deployments.kimi) {
        body.response_format = { type: 'json_object' };
      }

      if (opts.reasoning_effort) {
        body.reasoning_effort = opts.reasoning_effort;
      }

      const response = (await azureClient.chat.completions.create(
        body as unknown as Parameters<typeof azureClient.chat.completions.create>[0],
        { signal: controller.signal }
      )) as {
        choices: { message: { content: string | null }; finish_reason?: string | null }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      clearTimeout(timer);

      const rawText = response.choices[0]?.message?.content ?? '';
      const finishReason = response.choices[0]?.finish_reason;
      const latencyMs = Date.now() - startedAt;
      const inputTokens = response.usage?.prompt_tokens ?? 0;
      const outputTokens = response.usage?.completion_tokens ?? 0;

      if (!rawText.trim()) {
        throw new Error(
          `empty content from ${opts.deployment} stage=${opts.stage} finish_reason=${finishReason} (output_tokens=${outputTokens}). Likely max_tokens too small for a reasoning model.`
        );
      }

      // Log success
      await supabase.from('api_calls').insert({
        run_id: opts.run_id,
        candidate_id: opts.candidate_id,
        stage: opts.stage,
        model: opts.deployment,
        latency_ms: latencyMs,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        success: true,
        retry_count: attempt,
      });

      let parsed: T;
      if (opts.response_format === 'json') {
        try {
          parsed = JSON.parse(extractJson(rawText)) as T;
        } catch (e) {
          throw new Error(
            `JSON parse failed for stage=${opts.stage}: ${(e as Error).message}. Raw (first 500): ${rawText.slice(0, 500)}`
          );
        }
      } else {
        parsed = rawText as unknown as T;
      }

      return {
        content: parsed,
        raw_text: rawText,
        latency_ms: latencyMs,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        retry_count: attempt,
      };
    } catch (err) {
      lastError = err as Error;
      attempt++;

      await supabase.from('api_calls').insert({
        run_id: opts.run_id,
        candidate_id: opts.candidate_id,
        stage: opts.stage,
        model: opts.deployment,
        latency_ms: Date.now() - startedAt,
        input_tokens: 0,
        output_tokens: 0,
        success: false,
        error: lastError.message.slice(0, 500),
        retry_count: attempt - 1,
      });

      if (attempt > maxRetries) break;
      // Exponential backoff: 500ms, 1500ms
      await new Promise((r) => setTimeout(r, 500 * Math.pow(3, attempt - 1)));
    }
  }

  throw new Error(
    `callModel failed after ${maxRetries + 1} attempts for stage=${opts.stage}: ${lastError?.message}`
  );
}

/**
 * Strips markdown fences and leading prose around JSON.
 * Grok and Kimi occasionally wrap JSON in ```json ... ``` blocks even with response_format set.
 */
function extractJson(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const firstBrace = text.search(/[{[]/);
  if (firstBrace === -1) return text.trim();
  return text.slice(firstBrace).trim();
}
