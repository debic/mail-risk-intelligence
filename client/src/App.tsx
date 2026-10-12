import { useState } from 'react'
import { AppHeader, type View } from './components/AppHeader'
import { EmptyState } from './components/EmptyState'
import { SplitLayout } from './components/SplitLayout'

function App() {
  const [view, setView] = useState<View>('inbox')
  const [selectedId] = useState<string | null>(null)

  return (
    <>
      <AppHeader view={view} onViewChange={setView} onAddEmail={() => {}} />
      <main>
        {view === 'inbox' ? (
          <SplitLayout
            showDetailOnMobile={selectedId !== null}
            list={<EmptyState title="Inbox">The email list arrives in step 4.2.</EmptyState>}
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
