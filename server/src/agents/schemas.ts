import { z } from 'zod';

// Schemas for LLM output. Models are not perfectly consistent, so arrays default
// to [] and optional details accept null, while the fields the UI relies on stay required.

/** A value pulled from the email plus where it came from, e.g. { value: "$47,300", context: "Invoice NS-4471 amount due" }. */
const FactSchema = z.object({
  value: z.string(),
  context: z.string().default(''),
});

export const ExtractionSchema = z.object({
  sender: z.object({
    name: z.string().nullable().default(null),
    email: z.string(),
  }),
  recipients: z.array(z.string()).default([]),
  date: z.string().nullable().default(null),
  subject: z.string(),
  summary: z.string().min(1),
  requestedActions: z.array(z.string()).default([]),
  keyFacts: z
    .object({
      amounts: z.array(FactSchema).default([]),
      dates: z.array(FactSchema).default([]),
      accounts: z.array(FactSchema).default([]),
      references: z.array(FactSchema).default([]),
    })
    .default({ amounts: [], dates: [], accounts: [], references: [] }),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        summary: z.string(),
      }),
    )
    .default([]),
});

export type Extraction = z.infer<typeof ExtractionSchema>;
