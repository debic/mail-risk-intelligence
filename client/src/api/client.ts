import type { ApiError, EmailDetail, EmailListItem, GraphData, NewEmailInput } from '../../../shared/types'

/** Error from the API, with a message that is safe to show in the UI. */
export class ApiRequestError extends Error {
  readonly status: number
  readonly details: string[]

  constructor(status: number, message: string, details: string[] = []) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.details = details
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, init)
  } catch {
    throw new ApiRequestError(0, 'Cannot reach the server. Is it running?')
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null
    throw new ApiRequestError(response.status, body?.error ?? `Request failed (HTTP ${response.status})`, body?.details)
  }
  return response.json() as Promise<T>
}

export const api = {
  listEmails: () => request<EmailListItem[]>('/emails'),
  getEmail: (id: string) => request<EmailDetail>(`/emails/${encodeURIComponent(id)}`),
  addEmail: (input: NewEmailInput) =>
    request<EmailDetail>('/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  /** Pasted text or a .txt/.eml/.pdf file, parsed on the server. */
  ingestEmail: (input: { text: string } | { file: File }) => {
    const form = new FormData()
    if ('file' in input) form.append('file', input.file)
    else form.append('text', input.text)
    return request<EmailDetail>('/emails/ingest', { method: 'POST', body: form })
  },
  retryEmail: (id: string) => request<EmailDetail>(`/emails/${encodeURIComponent(id)}/retry`, { method: 'POST' }),
  getGraph: () => request<GraphData>('/graph'),
}
