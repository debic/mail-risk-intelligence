// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Reads the real design tokens and checks every text/background pair the UI uses
// against WCAG AA (4.5:1 for normal text). Changing a color that breaks contrast fails here.

const css = readFileSync(fileURLToPath(new URL('../styles/tokens.css', import.meta.url)), 'utf8')

function token(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!match) throw new Error(`Token --${name} not found`)
  return match[1]
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const PAIRS: [text: string, background: string][] = [
  ['color-text', 'color-surface'],
  ['color-text', 'color-bg'],
  ['color-text', 'color-surface-selected'],
  ['color-text-muted', 'color-surface'],
  ['color-text-muted', 'color-bg'],
  ['color-text-muted', 'color-surface-sunken'],
  ['color-text-subtle', 'color-surface'],
  ['color-text-subtle', 'color-bg'],
  ['color-accent', 'color-surface'],
  ['color-accent', 'color-accent-soft'],
  ['color-on-accent', 'color-accent'],
  ['color-danger', 'color-surface'],
  ['color-danger', 'color-danger-bg'],
  ['risk-high-fg', 'risk-high-bg'],
  ['risk-medium-fg', 'risk-medium-bg'],
  ['risk-low-fg', 'risk-low-bg'],
  ['risk-none-fg', 'risk-none-bg'],
  ['status-fg', 'status-bg'],
]

// Non-text UI (WCAG 1.4.11, 3:1): field boundaries and the keyboard focus ring on every surface it appears on.
const UI_PAIRS: [ui: string, background: string][] = [
  ['color-border-input', 'color-surface'],
  ['color-border-input', 'color-bg'],
  ['color-focus', 'color-surface'],
  ['color-focus', 'color-bg'],
  ['color-focus', 'color-surface-selected'],
  ['color-focus', 'color-accent-soft'],
  ['color-danger', 'color-surface'],
]

describe('design token contrast: text (WCAG AA, 4.5:1)', () => {
  it.each(PAIRS)('--%s on --%s', (text, background) => {
    expect(contrast(token(text), token(background))).toBeGreaterThanOrEqual(4.5)
  })
})

describe('design token contrast: non-text UI (WCAG 1.4.11, 3:1)', () => {
  it.each(UI_PAIRS)('--%s on --%s', (ui, background) => {
    expect(contrast(token(ui), token(background))).toBeGreaterThanOrEqual(3)
  })
})
