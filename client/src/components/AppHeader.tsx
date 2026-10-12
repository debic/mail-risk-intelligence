import styles from './AppHeader.module.css'

export type View = 'inbox' | 'graph'

interface AppHeaderProps {
  view: View
  onViewChange: (view: View) => void
  onAddEmail: () => void
}

const VIEWS: { id: View; label: string }[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'graph', label: 'Graph' },
]

export function AppHeader({ view, onViewChange, onAddEmail }: AppHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <span className={styles.logo} aria-hidden="true">
          ◆
        </span>
        <span className={styles.title}>
          Mail Risk <span className={styles.titleRest}>Intelligence</span>
        </span>
      </div>

      <nav aria-label="Main" className={styles.nav}>
        {VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={styles.tab}
            aria-current={view === item.id ? 'page' : undefined}
            onClick={() => onViewChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <button type="button" className={styles.addButton} onClick={onAddEmail}>
        <span aria-hidden="true">+</span>
        <span className={styles.addLabel}>Add email</span>
        <span className="visually-hidden"> (paste text or upload a file)</span>
      </button>
    </header>
  )
}
