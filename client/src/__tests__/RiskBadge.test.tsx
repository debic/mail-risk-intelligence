import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RiskBadge } from '../components/RiskBadge'

afterEach(cleanup)

describe('RiskBadge', () => {
  it.each([
    ['high', 'High risk'],
    ['medium', 'Medium risk'],
    ['low', 'Low risk'],
    ['none', 'No risk'],
  ] as const)('shows a text label for %s risk, not only a color', (level, label) => {
    render(<RiskBadge status="done" level={level} />)
    expect(screen.getByText(label)).toBeTruthy()
  })

  it('keeps the colored marker hidden from screen readers', () => {
    const { container } = render(<RiskBadge status="done" level="high" />)
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy()
  })

  it.each([
    ['queued', 'Queued'],
    ['analyzing', 'Analyzing…'],
    ['failed', 'Analysis failed'],
  ] as const)('shows the %s pipeline state', (status, label) => {
    render(<RiskBadge status={status} level={null} />)
    expect(screen.getByText(label)).toBeTruthy()
  })

  it('never shows a failed analysis as a risk level', () => {
    render(<RiskBadge status="failed" level={null} />)
    expect(screen.queryByText(/risk$/)).toBeNull()
  })
})
