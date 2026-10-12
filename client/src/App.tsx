import { useState } from 'react'
import type { EmailDetail as Email } from '../../shared/types'
import { AddEmailDialog } from './components/AddEmailDialog'
import { AppHeader, type View } from './components/AppHeader'
import { EmailDetail } from './components/EmailDetail'
import { EmailList } from './components/EmailList'
import { EmptyState } from './components/EmptyState'
import { EntitiesPanel } from './components/EntitiesPanel'
import { SplitLayout } from './components/SplitLayout'
import { useEmailDetail } from './hooks/useEmailDetail'
import { useEmails } from './hooks/useEmails'

function App() {
  const [view, setView] = useState<View>('inbox')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const inbox = useEmails()
  const detail = useEmailDetail(selectedId)

  async function handleRetry() {
    await detail.retry()
    // Refresh the list so its badge switches to "Queued" and it starts polling too.
    void inbox.reload()
  }

  function handleCreated(email: Email) {
    // Show the new email right away; its status moves Queued → Analyzing → result by polling.
    setView('inbox')
    setSelectedId(email.id)
    void inbox.reload()
  }

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <AppHeader view={view} onViewChange={setView} onAddEmail={() => setAdding(true)} />
      <main id="main" tabIndex={-1}>
        {view === 'inbox' ? (
          <SplitLayout
            showDetailOnMobile={selectedId !== null}
            list={
              <EmailList
                emails={inbox.emails}
                loading={inbox.loading}
                error={inbox.error}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onRetryLoad={inbox.reload}
              />
            }
            detail={
              selectedId ? (
                <EmailDetail
                  email={detail.email}
                  loading={detail.loading}
                  error={detail.error}
                  retrying={detail.retrying}
                  onBack={() => setSelectedId(null)}
                  onRetry={handleRetry}
                  onReload={() => void detail.reload()}
                >
                  {detail.email?.status === 'done' && (
                    <EntitiesPanel
                      entities={detail.email.entities}
                      relationships={detail.email.relationships}
                      onOpenEmail={setSelectedId}
                    />
                  )}
                </EmailDetail>
              ) : (
                <EmptyState title="Select an email">
                  Choose an email from the list to see its risk assessment, extracted facts and entities.
                </EmptyState>
              )
            }
          />
        ) : (
          <>
            <h1 className="visually-hidden">Knowledge graph</h1>
            <EmptyState icon="◎" title="Knowledge graph is coming soon">
              It will connect people, organizations and accounts across all emails. For now, use the "Also in" links
              in each email's entities to jump between related emails.
            </EmptyState>
          </>
        )}
      </main>
      <AddEmailDialog open={adding} onClose={() => setAdding(false)} onCreated={handleCreated} />
    </>
  )
}

export default App
