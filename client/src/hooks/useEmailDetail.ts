import { useCallback, useEffect, useRef, useState } from 'react'
import type { EmailDetail } from '../../../shared/types'
import { api } from '../api/client'
import { POLL_MS } from '../config'

/** One email's full analysis. Polls while it is queued or being analyzed. */
export function useEmailDetail(id: string | null) {
  const [email, setEmail] = useState<EmailDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const currentId = useRef(id)
  currentId.current = id

  const load = useCallback(async (emailId: string) => {
    try {
      const data = await api.getEmail(emailId)
      // Drop late responses for an email that is no longer selected.
      if (currentId.current !== emailId) return
      setEmail(data)
      setError(null)
    } catch (err) {
      if (currentId.current === emailId) setError((err as Error).message)
    }
  }, [])

  useEffect(() => {
    setEmail(null)
    setError(null)
    if (id) void load(id)
  }, [id, load])

  const pending = email?.status === 'queued' || email?.status === 'analyzing'
  useEffect(() => {
    if (!id || !pending) return
    const timer = setInterval(() => void load(id), POLL_MS)
    return () => clearInterval(timer)
  }, [id, pending, load])

  const retry = useCallback(async () => {
    if (!id) return
    setRetrying(true)
    try {
      setEmail(await api.retryEmail(id))
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRetrying(false)
    }
  }, [id])

  return {
    email: email?.id === id ? email : null,
    error,
    loading: id !== null && email?.id !== id && error === null,
    retrying,
    reload: () => id && load(id),
    retry,
  }
}
