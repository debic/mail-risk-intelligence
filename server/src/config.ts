import { MAX_BODY_CHARS, MAX_UPLOAD_BYTES, SUPPORTED_EXTENSIONS } from '../../shared/limits.js';

// Every server setting in one place. Values that make sense per environment can be overridden
// with environment variables (see .env.example); the rest are tuned constants with their reason.

const envNumber = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const config = {
  port: envNumber('PORT', 3001),
  /** SQLite file; defaults to data/app.db. */
  dbPath: process.env.DB_PATH || undefined,

  llm: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    /** Read on every call so a key added to .env is picked up after a restart. */
    get apiKey() {
      return process.env.GROQ_API_KEY;
    },
    timeoutMs: envNumber('GROQ_TIMEOUT_MS', 20_000),
    /** gpt-oss models reason before answering; "low" keeps token use within free-tier limits. */
    reasoningEffort: 'low' as const,
  },

  rateLimit: {
    /** Wait for the per-minute token budget to refill to this before each call (a full Agent B call uses ~3-4K). */
    minTokensBeforeCall: 4500,
    maxThrottleWaitMs: 60_000,
  },

  retry: {
    /** Retries after the first attempt, for transient errors only (timeouts, 429/5xx, invalid output). */
    maxRetries: envNumber('MAX_RETRIES', 1),
    delayMs: 1500,
    /** Never wait longer than this for a rate limit to reset before a retry. */
    maxWaitMs: 60_000,
  },

  uploads: {
    supportedExtensions: SUPPORTED_EXTENSIONS,
    maxBytes: MAX_UPLOAD_BYTES,
    maxBodyChars: MAX_BODY_CHARS,
  },
};
