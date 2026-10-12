import type {
  EmailDetail,
  EmailEntity,
  EmailListItem,
  EmailRelationship,
  EmailSource,
  EmailStatus,
  EntityType,
  RawEmail,
  RiskLevel,
} from '../../../shared/types.js';
import type { PipelineResult } from '../agents/orchestrator.js';
import type { Db } from './db.js';

// All SQL lives here; the rest of the server works with plain objects.

const ORG_SUFFIXES = /\b(inc|llc|ltd|corp|corporation|co|gmbh|plc)\b/g;

/** "Northgate Suppliers Inc." and "northgate suppliers" map to the same entity. */
export function normalizeEntityKey(type: string, name: string): string {
  let key = name.toLowerCase().replace(/[.,'"()]/g, ' ');
  if (type === 'organization') key = key.replace(ORG_SUFFIXES, ' ');
  return `${type}:${key.replace(/\s+/g, ' ').trim()}`;
}

interface EmailRow {
  id: string;
  source: EmailSource;
  sender: string;
  recipients: string;
  date: string;
  subject: string;
  body: string;
  attachments: string;
  status: EmailStatus;
  error_stage: 'extraction' | 'risk' | null;
  error_kind: string | null;
  error_message: string | null;
  risk_level: RiskLevel | null;
  risk_tags: string | null;
}

interface AnalysisRow {
  extraction: string | null;
  risk_level: RiskLevel | null;
  risk_rationale: string | null;
  risk_tags: string;
  model: string | null;
  duration_ms: number | null;
  analyzed_at: string;
}

function toListItem(row: EmailRow): EmailListItem {
  return {
    id: row.id,
    source: row.source,
    from: row.sender,
    to: JSON.parse(row.recipients),
    date: row.date,
    subject: row.subject,
    status: row.status,
    riskLevel: row.risk_level,
    riskTags: row.risk_tags ? JSON.parse(row.risk_tags) : [],
    error:
      row.status === 'failed' && row.error_stage
        ? { stage: row.error_stage, kind: row.error_kind ?? 'unknown', message: row.error_message ?? '' }
        : null,
  };
}

const SELECT_EMAIL = `
  SELECT e.*, a.risk_level, a.risk_tags
  FROM emails e LEFT JOIN analyses a ON a.email_id = e.id`;

export function createEmailRepository(db: Db) {
  const now = () => new Date().toISOString();

  return {
    /** Insert a new email as "queued". Returns false if the id already exists. */
    insertEmail(email: RawEmail, source: EmailSource): boolean {
      const result = db
        .prepare(
          `INSERT OR IGNORE INTO emails
             (id, source, sender, recipients, date, subject, body, attachments, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)`,
        )
        .run(
          email.id,
          source,
          email.from,
          JSON.stringify(email.to),
          email.date,
          email.subject,
          email.body,
          JSON.stringify(email.attachments),
          now(),
          now(),
        );
      return result.changes > 0;
    },

    listEmails(): EmailListItem[] {
      const rows = db.prepare(`${SELECT_EMAIL} ORDER BY e.date DESC`).all() as EmailRow[];
      return rows.map(toListItem);
    },

    getEmail(id: string): EmailDetail | null {
      const row = db.prepare(`${SELECT_EMAIL} WHERE e.id = ?`).get(id) as EmailRow | undefined;
      if (!row) return null;

      const analysis = db.prepare('SELECT * FROM analyses WHERE email_id = ?').get(id) as AnalysisRow | undefined;

      const entities = db
        .prepare(
          `SELECT en.id, en.type, en.name, ee.details
           FROM email_entities ee JOIN entities en ON en.id = ee.entity_id
           WHERE ee.email_id = ? ORDER BY en.type, en.name`,
        )
        .all(id) as EmailEntity[];

      const relRows = db
        .prepare(
          `SELECT r.id, r.type, r.evidence,
                  s.id AS s_id, s.type AS s_type, s.name AS s_name,
                  t.id AS t_id, t.type AS t_type, t.name AS t_name
           FROM relationships r
           JOIN entities s ON s.id = r.source_entity_id
           JOIN entities t ON t.id = r.target_entity_id
           WHERE r.email_id = ? ORDER BY r.id`,
        )
        .all(id) as {
        id: number;
        type: string;
        evidence: string | null;
        s_id: number;
        s_type: EntityType;
        s_name: string;
        t_id: number;
        t_type: EntityType;
        t_name: string;
      }[];

      const relationships: EmailRelationship[] = relRows.map((r) => ({
        id: r.id,
        type: r.type,
        evidence: r.evidence,
        source: { id: r.s_id, type: r.s_type, name: r.s_name },
        target: { id: r.t_id, type: r.t_type, name: r.t_name },
      }));

      return {
        ...toListItem(row),
        body: row.body,
        attachments: JSON.parse(row.attachments),
        extraction: analysis?.extraction ? JSON.parse(analysis.extraction) : null,
        risk:
          analysis?.risk_level && analysis.risk_rationale
            ? { level: analysis.risk_level, rationale: analysis.risk_rationale, tags: JSON.parse(analysis.risk_tags) }
            : null,
        entities,
        relationships,
        analysis: analysis
          ? { model: analysis.model, durationMs: analysis.duration_ms, analyzedAt: analysis.analyzed_at }
          : null,
      };
    },

    /** The email as originally ingested, which is what the pipeline analyzes. */
    getRawEmail(id: string): RawEmail | null {
      const row = db.prepare('SELECT * FROM emails WHERE id = ?').get(id) as EmailRow | undefined;
      if (!row) return null;
      return {
        id: row.id,
        from: row.sender,
        to: JSON.parse(row.recipients),
        date: row.date,
        subject: row.subject,
        body: row.body,
        attachments: JSON.parse(row.attachments),
      };
    },

    setStatus(id: string, status: EmailStatus): void {
      db.prepare('UPDATE emails SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), id);
    },

    /** Oldest queued email id, or null when there is nothing to process. */
    nextQueuedId(): string | null {
      const row = db.prepare(`SELECT id FROM emails WHERE status = 'queued' ORDER BY created_at, id LIMIT 1`).get() as
        | { id: string }
        | undefined;
      return row?.id ?? null;
    },

    /** Emails left "analyzing" by a server that stopped mid-run go back to the queue. */
    requeueInterrupted(): number {
      return db.prepare(`UPDATE emails SET status = 'queued', updated_at = ? WHERE status = 'analyzing'`).run(now())
        .changes;
    },

    /** Store a pipeline result (done or failed), replacing any previous analysis of this email. */
    saveResult(id: string, result: PipelineResult, model: string): void {
      const save = db.transaction(() => {
        db.prepare('DELETE FROM relationships WHERE email_id = ?').run(id);
        db.prepare('DELETE FROM email_entities WHERE email_id = ?').run(id);
        db.prepare('DELETE FROM analyses WHERE email_id = ?').run(id);

        const risk = result.status === 'done' ? result.analysis.risk : null;
        if (result.extraction) {
          db.prepare(
            `INSERT INTO analyses (email_id, extraction, risk_level, risk_rationale, risk_tags, model, duration_ms, analyzed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            id,
            JSON.stringify(result.extraction),
            risk?.level ?? null,
            risk?.rationale ?? null,
            JSON.stringify(risk?.tags ?? []),
            model,
            result.durationMs,
            now(),
          );
        }

        if (result.status === 'done') {
          const upsertEntity = db.prepare(
            `INSERT INTO entities (type, name, key) VALUES (?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET name = name
             RETURNING id`,
          );
          const linkEntity = db.prepare(
            'INSERT OR IGNORE INTO email_entities (email_id, entity_id, details) VALUES (?, ?, ?)',
          );
          // Agent B uses local ids ("e1"); map them to global entity ids.
          const idMap = new Map<string, number>();
          for (const entity of result.analysis.entities) {
            const { id: entityId } = upsertEntity.get(
              entity.type,
              entity.name,
              normalizeEntityKey(entity.type, entity.name),
            ) as { id: number };
            idMap.set(entity.id, entityId);
            linkEntity.run(id, entityId, entity.details);
          }

          const insertRel = db.prepare(
            `INSERT INTO relationships (email_id, source_entity_id, target_entity_id, type, evidence)
             VALUES (?, ?, ?, ?, ?)`,
          );
          for (const rel of result.analysis.relationships) {
            const source = idMap.get(rel.source);
            const target = idMap.get(rel.target);
            if (source !== undefined && target !== undefined) {
              insertRel.run(id, source, target, rel.type, rel.evidence);
            }
          }
        }

        if (result.status === 'done') {
          db.prepare(
            `UPDATE emails SET status = 'done', error_stage = NULL, error_kind = NULL, error_message = NULL, updated_at = ?
             WHERE id = ?`,
          ).run(now(), id);
        } else {
          db.prepare(
            `UPDATE emails SET status = 'failed', error_stage = ?, error_kind = ?, error_message = ?, updated_at = ?
             WHERE id = ?`,
          ).run(result.stage, result.error.kind, result.error.message, now(), id);
        }
      });
      save();
    },
  };
}

export type EmailRepository = ReturnType<typeof createEmailRepository>;
