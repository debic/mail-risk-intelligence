import { useCallback, useEffect, useState } from 'react'
import type { GraphData } from '../../../shared/types'
import { api } from '../api/client'

/** Knowledge graph across all analyzed emails. Loaded each time the Graph view opens. */
export function useGraph() {
  const [graph, setGraph] = useState<GraphData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setGraph(await api.getGraph())
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { graph, error, loading: graph === null && error === null, reload }
}
