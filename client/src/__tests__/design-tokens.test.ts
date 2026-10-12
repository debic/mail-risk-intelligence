// @vitest-environment node
/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Guard: colors live only in tokens.css. Any raw hex/rgb/hsl color in a component stylesheet
// (or global.css) fails here, so "components only use tokens" is enforced, not just intended.

const dir = (path: string) => fileURLToPath(new URL(path, import.meta.url))
const stylesheets = [
  ...readdirSync(dir('../components/'))
    .filter((file) => file.endsWith('.module.css'))
    .map((file) => `components/${file}`),
  'styles/global.css',
]

const RAW_COLOR = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/gi

describe('design tokens are the only source of color', () => {
  it.each(stylesheets)('%s has no hardcoded colors', (file) => {
    const css = readFileSync(dir(`../${file}`), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(css.match(RAW_COLOR) ?? []).toEqual([])
  })

  it('every var(--token) used in a stylesheet is defined in tokens.css', () => {
    const tokens = readFileSync(dir('../styles/tokens.css'), 'utf8')
    const defined = new Set([...tokens.matchAll(/--([a-z0-9-]+)\s*:/gi)].map((m) => m[1]))
    const undefinedTokens = stylesheets.flatMap((file) => {
      const css = readFileSync(dir(`../${file}`), 'utf8')
      // Locally defined custom properties (e.g. --marker-color) are allowed.
      const local = new Set([...css.matchAll(/--([a-z0-9-]+)\s*:/gi)].map((m) => m[1]))
      return [...css.matchAll(/var\(--([a-z0-9-]+)/gi)]
        .map((m) => m[1])
        .filter((name) => !defined.has(name) && !local.has(name))
        .map((name) => `${file}: --${name}`)
    })
    expect(undefinedTokens).toEqual([])
  })
})
