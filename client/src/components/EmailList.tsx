import { useMemo, useState, type KeyboardEvent } from 'react'
import type { EmailListItem, RiskLevel } from '../../../shared/types'
import { formatShortDate } from '../utils/format'
import { EmptyState } from './EmptyState'
import { RiskBadge } from './RiskBadge'
import { Tag } from './Tag'
import styles from './EmailList.module.css'

type Filter = 'all' | RiskLevel

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'high', label: 'High' },
  { id: 'medium', label: 'Medium' },
  { id: 'low', label: 'Low' },
  { id: 'none', label: 'None' },
]

const MAX_TAGS = 2

interface EmailListProps {
  emails: EmailListItem[] | null
  loading: boolean
  error: string | null
  selectedId: string | null
  onSelect: (id: string) => void
  onRetryLoad: () => void
}

export function EmailList({ emails, loading, error, selectedId, onSelect, onRetryLoad }: EmailListProps) {
  const [filter, setFilter] = useState<Filter>('all')

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { all: 0, high: 0, medium: 0, low: 0, none: 0 }
    for (const email of emails ?? []) {
      result.all++
      if (email.status === 'done' && email.riskLevel) result[email.riskLevel]++
    }
    return result
  }, [emails])

  const visible = useMemo(
    () => (emails ?? []).filter((email) => filter === 'all' || (email.status === 'done' && email.riskLevel === filter)),
    [emails, filter],
  )

  // Arrow keys move focus between rows; Enter/Space (native button) opens the email.
  function handleKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const rows = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-row]'))
    const index = rows.indexOf(document.activeElement as HTMLButtonElement)
    const next = rows[index + (event.key === 'ArrowDown' ? 1 : -1)]
    if (next) {
      event.preventDefault()
      next.focus()
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <h1 className={styles.heading}>
          Inbox
          {emails && <span className={styles.count}>{emails.length}</span>}
        </h1>
        <div className={styles.filters} role="group" aria-label="Filter by risk level">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={styles.filter}
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
              disabled={loading || error !== null}
            >
              {item.label}
              <span className={styles.filterCount}>{counts[item.id]}</span>
            </button>
          ))}
        </div>
      </div>

      {loading && <ListSkeleton />}

      {error && (
        <EmptyState icon="!" title="Couldn't load the inbox">
          <p>{error}</p>
          <button type="button" className={styles.retry} onClick={onRetryLoad}>
            Try again
          </button>
        </EmptyState>
      )}

      {emails && visible.length === 0 && (
        <EmptyState title={emails.length === 0 ? 'No emails yet' : 'No emails match this filter'}>
          {emails.length === 0 ? 'Add an email to analyze it.' : 'Try another risk level.'}
        </EmptyState>
      )}

      {visible.length > 0 && (
        <ul className={styles.list} onKeyDown={handleKeyDown}>
          {visible.map((email) => (
            <li key={email.id}>
              <EmailRow email={email} selected={email.id === selectedId} onSelect={onSelect} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function EmailRow({
  email,
  selected,
  onSelect,
}: {
  email: EmailListItem
  selected: boolean
  onSelect: (id: string) => void
}) {
  const tone = email.status === 'done' ? email.riskLevel : email.status
  const extraTags = email.riskTags.length - MAX_TAGS

  return (
    <button
      type="button"
      data-row
      className={styles.row}
      data-tone={tone}
      aria-current={selected ? 'true' : undefined}
      onClick={() => onSelect(email.id)}
    >
      <span className={styles.rowTop}>
        <span className={styles.sender} title={email.from}>
          {email.from}
        </span>
        <time className={styles.date} dateTime={email.date}>
          {formatShortDate(email.date)}
        </time>
      </span>
      <span className={styles.subject}>{email.subject}</span>
      <span className={styles.meta}>
        <RiskBadge status={email.status} level={email.riskLevel} />
        {email.riskTags.slice(0, MAX_TAGS).map((tag) => (
          <Tag key={tag}>{tag}</Tag>
        ))}
        {extraTags > 0 && <span className={styles.more}>+{extraTags}</span>}
      </span>
    </button>
  )
}

function ListSkeleton() {
  return (
    <ul className={styles.list} aria-busy="true" aria-label="Loading emails">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className={styles.skeletonRow}>
          <span className={styles.skeletonLine} style={{ width: '55%' }} />
          <span className={styles.skeletonLine} style={{ width: '85%' }} />
          <span className={styles.skeletonLine} style={{ width: '30%' }} />
        </li>
      ))}
    </ul>
  )
}
