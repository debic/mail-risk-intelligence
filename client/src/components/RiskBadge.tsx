import type { EmailStatus, RiskLevel } from '../../../shared/types'
import styles from './RiskBadge.module.css'

interface RiskBadgeProps {
  status: EmailStatus
  level: RiskLevel | null
  size?: 'sm' | 'md'
}

const RISK_LABEL: Record<RiskLevel, string> = {
  high: 'High risk',
  medium: 'Medium risk',
  low: 'Low risk',
  none: 'No risk',
}

// Color is never the only signal: the marker is decorative, the text label carries the meaning.
export function RiskBadge({ status, level, size = 'sm' }: RiskBadgeProps) {
  if (status === 'queued') return <Badge tone="queued" label="Queued" size={size} />
  if (status === 'analyzing') return <Badge tone="analyzing" label="Analyzing…" size={size} />
  if (status === 'failed' || !level) return <Badge tone="failed" label="Analysis failed" size={size} />
  return <Badge tone={level} label={RISK_LABEL[level]} size={size} />
}

function Badge({ tone, label, size }: { tone: string; label: string; size: 'sm' | 'md' }) {
  return (
    <span className={styles.badge} data-tone={tone} data-size={size}>
      <span className={styles.marker} aria-hidden="true" />
      {label}
    </span>
  )
}
