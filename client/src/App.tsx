import { useEffect, useState } from 'react'
import type { RawEmail } from '../../shared/types'

// Stage 1: plain list to prove client and server are connected.
function App() {
  const [emails, setEmails] = useState<RawEmail[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/emails')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(setEmails)
      .catch((err: Error) => setError(err.message))
  }, [])

  return (
    <main>
      <h1>Mail Risk Intelligence</h1>
      {error && <p role="alert">Could not load emails: {error}</p>}
      <ul>
        {emails.map((email) => (
          <li key={email.id}>
            <strong>{email.from}</strong> | {email.subject} | {email.date}
          </li>
        ))}
      </ul>
    </main>
  )
}

export default App
