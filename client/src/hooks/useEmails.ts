import { useCallback, useEffect, useState } from 'react'
import type { EmailListItem } from '../../../shared/types'
import { api } from '../api/client'
import { POLL_MS } from '../config'

export const isPending = (email: EmailListItem) => email.status === 'queued' || email.status === 'analyzing'

/** Inbox data. Polls while any email is still being analyzed, then stops. */
export function useEmails() {
  const [emails, setEmails] = useState<EmailListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setEmails(await api.listEmails())
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const hasPending = emails?.some(isPending) ?? false
  useEffect(() => {
    if (!hasPending) return
    const timer = setInterval(() => void reload(), POLL_MS)
    return () => clearInterval(timer)
  }, [hasPending, reload])

  return { emails, error, loading: emails === null && error === null, reload }
}
