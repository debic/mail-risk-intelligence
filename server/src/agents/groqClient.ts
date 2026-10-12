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

export async function callGroq({ system, user, timeoutMs = DEFAULT_TIMEOUT_MS }: CallGroqOptions): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new LlmError('no_key', 'GROQ_API_KEY is not configured');
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
        model: process.env.GROQ_MODEL || DEFAULT_MODEL,
        temperature: 0,
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

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new LlmError('http', `Groq returned HTTP ${response.status}: ${detail.slice(0, 200)}`, response.status);
  }

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new LlmError('empty', 'Groq returned an empty response');
  }
  return content;
}
