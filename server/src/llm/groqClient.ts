// Thin wrapper around Groq's OpenAI-compatible chat completions API.
// Returns the raw model text; parsing and validation happen in each agent.

import { config } from '../config.js';

export type LlmErrorKind = 'no_key' | 'timeout' | 'http' | 'network' | 'empty' | 'bad_json';

/** Error with a machine-readable kind, so the orchestrator and UI can explain what went wrong. */
export class LlmError extends Error {
  constructor(
    public readonly kind: LlmErrorKind,
    message: string,
    public readonly status?: number,
    /** How long Groq asked us to wait before retrying (rate limits), if it said so. */
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

export interface CallGroqOptions {
  system: string;
  user: string;
  timeoutMs?: number;
}

/** Parse Groq's wait hints: "retry-after: 7" (seconds) or "x-ratelimit-reset-tokens: 1m2.5s" / "43.9s" / "120ms". */
export function parseRetryAfter(headers: Headers): number | undefined {
  const retryAfter = headers.get('retry-after');
  if (retryAfter && !Number.isNaN(Number(retryAfter))) {
    return Number(retryAfter) * 1000;
  }
  const reset = headers.get('x-ratelimit-reset-tokens') ?? headers.get('x-ratelimit-reset-requests');
  const match = reset?.match(/^(?:(\d+)m)?(?:([\d.]+)s)?(?:([\d.]+)ms)?$/);
  if (!match || !reset) return undefined;
  const [, minutes = '0', seconds = '0', millis = '0'] = match;
  return Number(minutes) * 60_000 + Number(seconds) * 1000 + Number(millis);
}

// Client-side throttle for Groq's tokens-per-minute limit. Groq reports the remaining budget
// on every response; when it runs low we wait for it to refill instead of hitting a 429.
let budget: { remaining: number; limitPerMinute: number; seenAt: number } | null = null;

function rememberBudget(headers: Headers): void {
  const remaining = Number(headers.get('x-ratelimit-remaining-tokens'));
  const limitPerMinute = Number(headers.get('x-ratelimit-limit-tokens'));
  if (Number.isFinite(remaining) && limitPerMinute > 0) {
    budget = { remaining, limitPerMinute, seenAt: Date.now() };
  }
}

/** How long to wait so the token budget refills to config.rateLimit.minTokensBeforeCall (0 if it already has). */
export function throttleWaitMs(now = Date.now()): number {
  if (!budget) return 0;
  const tokensPerMs = budget.limitPerMinute / 60_000;
  const refilled = budget.remaining + (now - budget.seenAt) * tokensPerMs;
  const missing = Math.min(config.rateLimit.minTokensBeforeCall, budget.limitPerMinute) - refilled;
  return missing <= 0 ? 0 : Math.min(Math.ceil(missing / tokensPerMs), config.rateLimit.maxThrottleWaitMs);
}

export function getModelName(): string {
  return config.llm.model;
}

export async function callGroq(options: CallGroqOptions): Promise<string> {
  try {
    return await requestCompletion(options, true);
  } catch (err) {
    // Groq's strict JSON mode occasionally rejects the model's output. Ask again without it:
    // our own zod validation still rejects anything that is not the expected JSON.
    if (err instanceof LlmError && err.kind === 'bad_json') {
      return requestCompletion(options, false);
    }
    throw err;
  }
}

async function requestCompletion(
  { system, user, timeoutMs = config.llm.timeoutMs }: CallGroqOptions,
  jsonMode: boolean,
): Promise<string> {
  const apiKey = config.llm.apiKey;
  if (!apiKey) {
    throw new LlmError('no_key', 'GROQ_API_KEY is not configured');
  }

  const model = getModelName();

  const wait = throttleWaitMs();
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }

  let response: Response;
  try {
    response = await fetch(config.llm.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        ...(model.startsWith('openai/gpt-oss') && { reasoning_effort: config.llm.reasoningEffort }),
        // JSON mode: the model must return a single valid JSON object.
        ...(jsonMode && { response_format: { type: 'json_object' } }),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new LlmError('timeout', `Groq did not respond within ${timeoutMs / 1000}s`);
    }
    throw new LlmError('network', `Could not reach Groq: ${(err as Error).message}`);
  }

  rememberBudget(response.headers);

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    // JSON mode rejects malformed model output with a 400; it is garbage output, not a bad request.
    if (response.status === 400 && detail.includes('json_validate_failed')) {
      throw new LlmError('bad_json', 'Model produced malformed JSON (rejected by Groq JSON mode)', 400);
    }
    throw new LlmError(
      'http',
      `Groq returned HTTP ${response.status}: ${detail.slice(0, 200)}`,
      response.status,
      parseRetryAfter(response.headers),
    );
  }

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new LlmError('empty', 'Groq returned an empty response');
  }
  return content;
}
