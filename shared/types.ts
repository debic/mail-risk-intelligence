// Types shared by the client and the server.

export interface Attachment {
  filename: string;
  extracted_text: string;
}

/** Common email shape produced by ingestion (seed JSON, pasted text, .txt, .eml, .pdf). */
export interface RawEmail {
  id: string;
  from: string;
  to: string[];
  date: string;
  subject: string;
  body: string;
  attachments: Attachment[];
}

// ---------- Stored emails and analysis, as returned by the API ----------

export type EmailSource = 'seed' | 'paste' | 'upload';
export type EmailStatus = 'queued' | 'analyzing' | 'done' | 'failed';
export type RiskLevel = 'none' | 'low' | 'medium' | 'high';
export type EntityType = 'person' | 'organization' | 'amount' | 'account' | 'location' | 'other';

export interface Fact {
  value: string;
  context: string;
}

/** Agent A output. */
export interface Extraction {
  sender: { name: string | null; email: string };
  recipients: string[];
  date: string | null;
  subject: string;
  summary: string;
  requestedActions: string[];
  keyFacts: { amounts: Fact[]; dates: Fact[]; accounts: Fact[]; references: Fact[] };
  attachments: { filename: string; summary: string }[];
}

export interface AnalysisError {
  stage: 'extraction' | 'risk';
  kind: string;
  message: string;
}

/** Row in the inbox list. */
export interface EmailListItem {
  id: string;
  source: EmailSource;
  from: string;
  to: string[];
  date: string;
  subject: string;
  status: EmailStatus;
  riskLevel: RiskLevel | null;
  riskTags: string[];
  error: AnalysisError | null;
}

export interface EntityRef {
  id: number;
  type: EntityType;
  name: string;
}

export interface EmailEntity extends EntityRef {
  details: string | null;
}

export interface EmailRelationship {
  id: number;
  type: string;
  evidence: string | null;
  source: EntityRef;
  target: EntityRef;
}

/** Full email for the detail view. */
export interface EmailDetail extends EmailListItem {
  body: string;
  attachments: Attachment[];
  extraction: Extraction | null;
  risk: { level: RiskLevel; rationale: string; tags: string[] } | null;
  entities: EmailEntity[];
  relationships: EmailRelationship[];
  analysis: { model: string | null; durationMs: number | null; analyzedAt: string } | null;
}
