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

// ---------- Agent B: risk + entities + relationships ----------

export const RISK_LEVELS = ['none', 'low', 'medium', 'high'] as const;
// Placeholder tags models sometimes emit when there is nothing to report.
const MEANINGLESS_TAGS = new Set(['none', 'no-risk', 'n-a', 'na', 'normal', 'routine']);
export const ENTITY_TYPES = ['person', 'organization', 'amount', 'account', 'location', 'other'] as const;

/** "Financial Anomaly" / "financial_anomaly" -> "financial-anomaly" */
export function toKebabCase(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');
}

/** "Requests Transfer To" / "requests-transfer-to" -> "requests_transfer_to" */
export function toSnakeCase(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/_+/g, '_');
}

const EntitySchema = z.object({
  id: z.string(),
  // Unknown types become "other" instead of failing the whole analysis.
  type: z.enum(ENTITY_TYPES).catch('other'),
  name: z.string().min(1),
  details: z.string().nullable().default(null),
});

const RelationshipSchema = z.object({
  source: z.string(),
  target: z.string(),
  type: z.string().min(1).transform(toSnakeCase),
  evidence: z.string().nullable().default(null),
});

export const RiskAnalysisSchema = z
  .object({
    risk: z.object({
      level: z.enum(RISK_LEVELS),
      rationale: z.string().min(1),
      tags: z
        .array(z.string())
        .default([])
        .transform((tags) => [...new Set(tags.map(toKebabCase).filter((tag) => tag && !MEANINGLESS_TAGS.has(tag)))]),
    }),
    entities: z.array(EntitySchema).default([]),
    relationships: z.array(RelationshipSchema).default([]),
  })
  // Drop relationships that point to entity ids the model never declared,
  // instead of rejecting an otherwise useful analysis.
  .transform((analysis) => {
    const ids = new Set(analysis.entities.map((entity) => entity.id));
    return {
      ...analysis,
      relationships: analysis.relationships.filter((rel) => ids.has(rel.source) && ids.has(rel.target)),
    };
  });

export type RiskAnalysis = z.infer<typeof RiskAnalysisSchema>;

// Compile-time guard: validated agent output must fit the shared API types the client uses.
type Assert<T extends true> = T;
export type _ExtractionMatchesShared = Assert<Extraction extends import('../../../shared/types.js').Extraction ? true : false>;
