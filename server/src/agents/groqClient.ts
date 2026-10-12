// Thin wrapper around Groq's OpenAI-compatible chat completions API.
// Returns the raw model text; parsing and validation happen in each agent.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-oss-120b';
const DEFAULT_TIMEOUT_MS = 20_000;

export type LlmErrorKind = 'no_key' | 'timeout' | 'http' | 'network' | 'empty';

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
const MIN_TOKENS_BEFORE_CALL = 3000;
const MAX_THROTTLE_WAIT_MS = 60_000;
let budget: { remaining: number; limitPerMinute: number; seenAt: number } | null = null;

function rememberBudget(headers: Headers): void {
  const remaining = Number(headers.get('x-ratelimit-remaining-tokens'));
  const limitPerMinute = Number(headers.get('x-ratelimit-limit-tokens'));
  if (Number.isFinite(remaining) && limitPerMinute > 0) {
    budget = { remaining, limitPerMinute, seenAt: Date.now() };
  }
}

/** How long to wait so the token budget refills to MIN_TOKENS_BEFORE_CALL (0 if it already has). */
export function throttleWaitMs(now = Date.now()): number {
  if (!budget) return 0;
  const tokensPerMs = budget.limitPerMinute / 60_000;
  const refilled = budget.remaining + (now - budget.seenAt) * tokensPerMs;
  const missing = Math.min(MIN_TOKENS_BEFORE_CALL, budget.limitPerMinute) - refilled;
  return missing <= 0 ? 0 : Math.min(Math.ceil(missing / tokensPerMs), MAX_THROTTLE_WAIT_MS);
}

export function getModelName(): string {
  return process.env.GROQ_MODEL || DEFAULT_MODEL;
}

export async function callGroq({ system, user, timeoutMs = DEFAULT_TIMEOUT_MS }: CallGroqOptions): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
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
    response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        // gpt-oss models reason before answering; low effort keeps token use within free-tier limits.
        ...(model.startsWith('openai/gpt-oss') && { reasoning_effort: 'low' }),
        // JSON mode: the model must return a single valid JSON object.
        response_format: { type: 'json_object' },
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
