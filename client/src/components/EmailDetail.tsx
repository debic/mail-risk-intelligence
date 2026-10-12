import { useEffect, useRef, type ReactNode } from 'react'
import type { EmailDetail as Email, Fact } from '../../../shared/types'
import { describeAnalysisError } from '../utils/errors'
import { formatDateTime } from '../utils/format'
import { EmptyState } from './EmptyState'
import { RiskBadge } from './RiskBadge'
import { Tag } from './Tag'
import styles from './EmailDetail.module.css'

interface EmailDetailProps {
  email: Email | null
  loading: boolean
  error: string | null
  retrying: boolean
  onBack: () => void
  onRetry: () => void
  onReload: () => void
  /** Extra sections rendered after the key facts (entities and relationships). */
  children?: ReactNode
}

export function EmailDetail({
  email,
  loading,
  error,
  retrying,
  onBack,
  onRetry,
  onReload,
  children,
}: EmailDetailProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  // Move focus to the subject when a new email opens, so keyboard and screen reader users land on it.
  useEffect(() => {
    if (email) headingRef.current?.focus()
  }, [email?.id])

  const backButton = (
    <button type="button" className={styles.back} onClick={onBack}>
      <span aria-hidden="true">←</span> Back to inbox
    </button>
  )

  if (error && !email) {
    return (
      <div className={styles.panel}>
        {backButton}
        <EmptyState icon="!" title="Couldn't load this email">
          <p>{error}</p>
          <button type="button" className={styles.secondaryButton} onClick={onReload}>
            Try again
          </button>
        </EmptyState>
      </div>
    )
  }

  if (loading || !email) {
    return (
      <div className={styles.panel} aria-busy="true" aria-label="Loading email">
        {backButton}
        <div className={styles.skeleton}>
          <span style={{ width: '70%', height: 24 }} />
          <span style={{ width: '45%' }} />
          <span style={{ width: '35%' }} />
          <span style={{ width: '100%', height: 96 }} />
          <span style={{ width: '90%' }} />
          <span style={{ width: '80%' }} />
        </div>
      </div>
    )
  }

  const pending = email.status === 'queued' || email.status === 'analyzing'
  const extraction = email.extraction

  return (
    <article className={styles.panel}>
      {backButton}

      <header className={styles.header}>
        <h2 ref={headingRef} tabIndex={-1} className={styles.subject}>
          {email.subject}
        </h2>
        <dl className={styles.meta}>
          <div>
            <dt>From</dt>
            <dd className={styles.address}>{email.from}</dd>
          </div>
          <div>
            <dt>To</dt>
            <dd className={styles.address}>{email.to.join(', ') || '(none)'}</dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>
              <time dateTime={email.date}>{formatDateTime(email.date)}</time>
            </dd>
          </div>
        </dl>
        {/* Failed emails get their Retry button inside the error notice instead. */}
        {email.status !== 'failed' && (
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onRetry}
            disabled={pending || retrying}
          >
            <span aria-hidden="true">↻</span> Re-analyze
          </button>
        )}
      </header>

      <div aria-live="polite">
        {pending && (
          <div className={styles.notice} data-tone="info">
            <RiskBadge status={email.status} level={null} size="md" />
            <p>
              {email.status === 'queued'
                ? 'Waiting for its turn in the analysis queue. Results appear here automatically.'
                : 'The AI agents are reading this email. Results appear here automatically.'}
            </p>
          </div>
        )}

        {email.status === 'failed' && email.error && (
          <div className={styles.notice} data-tone="danger" role="alert">
            <RiskBadge status="failed" level={null} size="md" />
            <p>{describeAnalysisError(email.error)}</p>
            {extraction && <p className={styles.noticeHint}>The extracted facts below are still available.</p>}
            <details className={styles.technical}>
              <summary>Technical details</summary>
              <code>
                [{email.error.kind}] {email.error.message}
              </code>
            </details>
            <button type="button" className={styles.primaryButton} onClick={onRetry} disabled={retrying}>
              {retrying ? 'Retrying…' : 'Retry analysis'}
            </button>
          </div>
        )}
      </div>

      {email.risk && (
        <section className={styles.riskCard} data-level={email.risk.level} aria-labelledby="risk-heading">
          <h3 id="risk-heading" className="visually-hidden">
            Risk assessment
          </h3>
          <RiskBadge status="done" level={email.risk.level} size="md" />
          <p className={styles.rationale}>{email.risk.rationale}</p>
          {email.risk.tags.length > 0 && (
            <ul className={styles.tags} aria-label="Risk signals">
              {email.risk.tags.map((tag) => (
                <li key={tag}>
                  <Tag>{tag}</Tag>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {extraction && (
        <>
          <Section title="Summary">
            <p className={styles.summary}>{extraction.summary}</p>
          </Section>

          {extraction.requestedActions.length > 0 && (
            <Section title="Requested actions">
              <ul className={styles.bullets}>
                {extraction.requestedActions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Key facts">
            <KeyFacts facts={extraction.keyFacts} />
          </Section>

          {extraction.attachments.length > 0 && (
            <Section title="Attachments">
              <ul className={styles.attachments}>
                {extraction.attachments.map((attachment) => (
                  <li key={attachment.filename}>
                    <span className={styles.filename}>
                      <span aria-hidden="true">📎 </span>
                      {attachment.filename}
                    </span>
                    <span className={styles.muted}>{attachment.summary}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}

      {children}

      <details className={styles.original} open={!extraction}>
        <summary>Original email</summary>
        {/* Plain text on purpose: links such as hxxp:// must never become clickable. */}
        <pre className={styles.body}>{email.body}</pre>
        {email.attachments.map((attachment) => (
          <div key={attachment.filename} className={styles.rawAttachment}>
            <p className={styles.filename}>
              <span aria-hidden="true">📎 </span>
              {attachment.filename}
            </p>
            <pre className={styles.body}>{attachment.extracted_text}</pre>
          </div>
        ))}
      </details>

      {email.analysis?.model && (
        <p className={styles.footnote}>
          Analyzed by {email.analysis.model}
          {email.analysis.durationMs ? ` in ${(email.analysis.durationMs / 1000).toFixed(1)}s` : ''}
        </p>
      )}
    </article>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {children}
    </section>
  )
}

const FACT_LABELS: { key: 'amounts' | 'dates' | 'accounts' | 'references'; label: string }[] = [
  { key: 'amounts', label: 'Amounts' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'dates', label: 'Dates' },
  { key: 'references', label: 'References' },
]

function KeyFacts({ facts }: { facts: Record<'amounts' | 'dates' | 'accounts' | 'references', Fact[]> }) {
  const groups = FACT_LABELS.filter(({ key }) => facts[key].length > 0)
  if (groups.length === 0) return <p className={styles.muted}>No amounts, dates, accounts or references found.</p>

  return (
    <dl className={styles.facts}>
      {groups.map(({ key, label }) => (
        <div key={key} className={styles.factGroup}>
          <dt>{label}</dt>
          <dd>
            <ul>
              {facts[key].map((fact, i) => (
                <li key={`${fact.value}-${i}`}>
                  <span className={styles.factValue}>{fact.value}</span>
                  {fact.context && <span className={styles.muted}>{fact.context}</span>}
                </li>
              ))}
            </ul>
          </dd>
        </div>
      ))}
    </dl>
  )
}
