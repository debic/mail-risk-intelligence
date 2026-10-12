import { useState } from 'react'
import { AppHeader, type View } from './components/AppHeader'
import { EmailDetail } from './components/EmailDetail'
import { EmailList } from './components/EmailList'
import { EmptyState } from './components/EmptyState'
import { SplitLayout } from './components/SplitLayout'
import { useEmailDetail } from './hooks/useEmailDetail'
import { useEmails } from './hooks/useEmails'

function App() {
  const [view, setView] = useState<View>('inbox')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const inbox = useEmails()
  const detail = useEmailDetail(selectedId)

  async function handleRetry() {
    await detail.retry()
    // Refresh the list so its badge switches to "Queued" and it starts polling too.
    void inbox.reload()
  }

  return (
    <>
      <AppHeader view={view} onViewChange={setView} onAddEmail={() => {}} />
      <main>
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
                />
              ) : (
                <EmptyState title="Select an email">
                  Choose an email from the list to see its risk assessment, extracted facts and entities.
                </EmptyState>
              )
            }
          />
        ) : (
          <EmptyState icon="◎" title="Knowledge graph">
            Entities and relationships across all emails will appear here.
          </EmptyState>
        )}
      </main>
    </>
  )
}

export default App
