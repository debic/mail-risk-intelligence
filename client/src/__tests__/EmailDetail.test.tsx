import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EmailDetail as Email } from '../../../shared/types'
import { EmailDetail } from '../components/EmailDetail'

afterEach(cleanup)

const base: Email = {
  id: 'E008',
  source: 'seed',
  from: 'security-alert@arclline-portal.com',
  to: ['s.pillai@arcline.com'],
  date: '2026-06-08T07:33:00Z',
  subject: 'Action required: your password expires in 24 hours',
  status: 'done',
  riskLevel: 'high',
  riskTags: ['phishing'],
  error: null,
  body: 'Reset your password here: hxxp://arclline-portal-secure.com/reset?id=88213',
  attachments: [],
  extraction: null,
  risk: { level: 'high', rationale: 'Lookalike domain asking for credentials.', tags: ['phishing'] },
  entities: [],
  relationships: [],
  analysis: null,
}

function renderDetail(email: Email, onRetry = vi.fn()) {
  const { container } = render(
    <EmailDetail
      email={email}
      loading={false}
      error={null}
      retrying={false}
      onBack={vi.fn()}
      onRetry={onRetry}
      onReload={vi.fn()}
    />,
  )
  return { onRetry, container }
}

describe('EmailDetail', () => {
  it('shows the risk level and rationale', () => {
    renderDetail(base)
    expect(screen.getByText('High risk')).toBeTruthy()
    expect(screen.getByText('Lookalike domain asking for credentials.')).toBeTruthy()
  })

  it('never turns defanged hxxp:// links into clickable links', () => {
    const { container } = renderDetail(base)
    expect(screen.getByText(/hxxp:\/\/arclline-portal-secure\.com/)).toBeTruthy()
    expect(container.querySelector('a')).toBeNull()
  })

  it('explains a failed analysis in plain language and offers a retry', () => {
    const { onRetry } = renderDetail({
      ...base,
      status: 'failed',
      riskLevel: null,
      risk: null,
      error: { stage: 'extraction', kind: 'no_key', message: 'GROQ_API_KEY is not configured' },
    })
    expect(screen.getByRole('alert').textContent).toContain('The AI service is not configured')
    fireEvent.click(screen.getByRole('button', { name: 'Retry analysis' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('tells the user when an analysis is still running', () => {
    renderDetail({ ...base, status: 'analyzing', riskLevel: null, risk: null })
    expect(screen.getByText(/The AI agents are reading this email/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Re-analyze/ }).hasAttribute('disabled')).toBe(true)
  })
})
