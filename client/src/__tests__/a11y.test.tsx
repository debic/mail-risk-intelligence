import axe from 'axe-core'
import { cleanup, render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { EmailDetail as Email, EmailListItem } from '../../../shared/types'
import { AddEmailDialog } from '../components/AddEmailDialog'
import { EmailDetail } from '../components/EmailDetail'
import { EmailList } from '../components/EmailList'
import { EntitiesPanel } from '../components/EntitiesPanel'

// Automated accessibility checks (WCAG 2 A/AA rules) on the main components.
// jsdom cannot compute rendered colors, so color contrast is covered separately
// by tokens-contrast.test.ts; the full-page browser audit is documented in the README.

afterEach(cleanup)

beforeAll(() => {
  // jsdom does not implement the modal dialog API.
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function () {
    this.open = false
  }
})

async function expectNoViolations(ui: ReactElement) {
  const { container } = render(ui)
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    rules: { 'color-contrast': { enabled: false } },
  })
  const summary = results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
  expect(summary).toEqual([])
}

const listItems: EmailListItem[] = [
  {
    id: 'E001',
    source: 'seed',
    from: 'j.harrington-ceo@arclne-corp.com',
    to: ['finance-ops@arcline.com'],
    date: '2026-06-02T08:14:00Z',
    subject: 'URGENT - confidential wire needed before noon',
    status: 'done',
    riskLevel: 'high',
    riskTags: ['urgency', 'impersonation', 'lookalike-domain'],
    error: null,
  },
  {
    id: 'E002',
    source: 'seed',
    from: 'it-notifications@arcline.com',
    to: ['all-staff@arcline.com'],
    date: '2026-06-02T09:00:00Z',
    subject: 'Scheduled maintenance: VPN upgrade this weekend',
    status: 'analyzing',
    riskLevel: null,
    riskTags: [],
    error: null,
  },
]

const detail: Email = {
  ...listItems[0],
  body: 'I need Finance to wire $184,500 today. Details: hxxp://example.test',
  attachments: [{ filename: 'note.txt', extracted_text: 'Escrow partner details to follow.' }],
  extraction: {
    sender: { name: 'James Harrington', email: 'j.harrington-ceo@arclne-corp.com' },
    recipients: ['finance-ops@arcline.com'],
    date: '2026-06-02T08:14:00Z',
    subject: 'URGENT - confidential wire needed before noon',
    summary: 'The CEO asks Finance to wire $184,500 today and keep it confidential.',
    requestedActions: ['Wire $184,500 before noon'],
    keyFacts: {
      amounts: [{ value: '$184,500', context: 'wire' }],
      dates: [{ value: 'today before 12pm', context: 'deadline' }],
      accounts: [],
      references: [],
    },
    attachments: [{ filename: 'note.txt', summary: 'Escrow details to follow.' }],
  },
  risk: { level: 'high', rationale: 'Lookalike domain requesting an urgent wire.', tags: ['urgency'] },
  entities: [
    { id: 1, type: 'person', name: 'James Harrington', details: 'sender', otherEmailIds: [] },
    { id: 2, type: 'organization', name: 'Arcline', details: null, otherEmailIds: ['E002', 'E003'] },
    { id: 3, type: 'amount', name: '$184,500', details: 'wire', otherEmailIds: [] },
  ],
  relationships: [
    {
      id: 1,
      type: 'requests_transfer_to',
      evidence: 'wire to the escrow partner',
      source: { id: 1, type: 'person', name: 'James Harrington' },
      target: { id: 3, type: 'amount', name: '$184,500' },
    },
  ],
  analysis: { model: 'openai/gpt-oss-120b', durationMs: 4100, analyzedAt: '2026-06-02T08:15:00Z' },
}

const handlers = { onBack: vi.fn(), onRetry: vi.fn(), onReload: vi.fn() }

describe('accessibility (axe-core, WCAG 2 A/AA)', () => {
  it('inbox list with filters, risk badges and pending state', async () => {
    await expectNoViolations(
      <EmailList
        emails={listItems}
        loading={false}
        error={null}
        selectedId="E001"
        onSelect={vi.fn()}
        onRetryLoad={vi.fn()}
      />,
    )
  })

  it('inbox loading and error states', async () => {
    await expectNoViolations(
      <EmailList emails={null} loading error={null} selectedId={null} onSelect={vi.fn()} onRetryLoad={vi.fn()} />,
    )
    cleanup()
    await expectNoViolations(
      <EmailList
        emails={null}
        loading={false}
        error="Cannot reach the server."
        selectedId={null}
        onSelect={vi.fn()}
        onRetryLoad={vi.fn()}
      />,
    )
  })

  it('email detail with risk card, key facts, entities and relationships', async () => {
    await expectNoViolations(
      <EmailDetail email={detail} loading={false} error={null} retrying={false} {...handlers}>
        <EntitiesPanel entities={detail.entities} relationships={detail.relationships} onOpenEmail={vi.fn()} />
      </EmailDetail>,
    )
  })

  it('failed analysis with retry', async () => {
    await expectNoViolations(
      <EmailDetail
        email={{
          ...detail,
          status: 'failed',
          risk: null,
          entities: [],
          relationships: [],
          error: { stage: 'risk', kind: 'timeout', message: 'Groq did not respond within 20s' },
        }}
        loading={false}
        error={null}
        retrying={false}
        {...handlers}
      />,
    )
  })

  it('add email dialog', async () => {
    await expectNoViolations(<AddEmailDialog open onClose={vi.fn()} onCreated={vi.fn()} />)
  })
})
