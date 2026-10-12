import type { z } from 'zod';

/** The model replied, but not with JSON matching the expected schema. */
export class InvalidOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOutputError';
  }
}

/**
 * Parse raw model text into a validated object.
 * Tolerates markdown code fences around the JSON; anything else invalid throws InvalidOutputError.
 */
export function parseModelJson<T extends z.ZodType>(raw: string, schema: T): z.infer<T> {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  let data: unknown;
  try {
    data = JSON.parse(cleaned);
  } catch {
    throw new InvalidOutputError(`Model returned invalid JSON: ${raw.slice(0, 120)}`);
  }

  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new InvalidOutputError(`Model output did not match schema: ${issues}`);
  }
  return result.data;
}
