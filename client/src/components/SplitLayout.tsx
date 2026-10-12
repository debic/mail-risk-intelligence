import type { ReactNode } from 'react'
import styles from './SplitLayout.module.css'

interface SplitLayoutProps {
  list: ReactNode
  detail: ReactNode
  /** On narrow screens only one pane is visible: the list, or the detail once an email is open. */
  showDetailOnMobile: boolean
}

export function SplitLayout({ list, detail, showDetailOnMobile }: SplitLayoutProps) {
  return (
    <div className={styles.split} data-mobile-pane={showDetailOnMobile ? 'detail' : 'list'}>
      <section className={styles.list} aria-label="Inbox">
        {list}
      </section>
      <section className={styles.detail} aria-label="Email detail">
        {detail}
      </section>
    </div>
  )
}
