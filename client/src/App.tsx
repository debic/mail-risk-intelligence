import { useState } from 'react'
import { AppHeader, type View } from './components/AppHeader'
import { EmailList } from './components/EmailList'
import { EmptyState } from './components/EmptyState'
import { SplitLayout } from './components/SplitLayout'
import { useEmails } from './hooks/useEmails'

function App() {
  const [view, setView] = useState<View>('inbox')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { emails, error, loading, reload } = useEmails()

  return (
    <>
      <AppHeader view={view} onViewChange={setView} onAddEmail={() => {}} />
      <main>
        {view === 'inbox' ? (
          <SplitLayout
            showDetailOnMobile={selectedId !== null}
            list={
              <EmailList
                emails={emails}
                loading={loading}
                error={error}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onRetryLoad={reload}
              />
            }
            detail={
              <EmptyState title="Select an email">
                Choose an email from the list to see its risk assessment, extracted facts and entities.
              </EmptyState>
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
