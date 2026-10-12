// Responsive acceptance check: `npm run check:responsive` (with `npm run dev` running).
// Opens the inbox, an email detail, the Add email dialog and the graph at 5 widths in your
// installed Chrome and fails if anything scrolls sideways, sticks out, gets clipped or is too
// small to tap. Set SCREENSHOTS_DIR to also save a screenshot of every view.
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173'
const SCREENSHOTS_DIR = process.env.SCREENSHOTS_DIR
const WIDTHS = [320, 375, 768, 900, 1280]
const TWO_PANEL_FROM = 900
const MIN_TARGET = 24 // px, WCAG 2.2 target size minimum

const browser = await chromium
  .launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' })
  .catch((err) => {
    console.error(`Could not start Chrome (${err.message.split('\n')[0]}). Set CHROME_PATH to a Chrome/Chromium binary.`)
    process.exit(2)
  })

if (SCREENSHOTS_DIR) mkdirSync(SCREENSHOTS_DIR, { recursive: true })

function audit(page) {
  return page.evaluate((minTarget) => {
    const vw = innerWidth
    const vh = innerHeight
    const issues = []
    if (document.documentElement.scrollWidth > vw) {
      issues.push(`page scrolls horizontally (${document.documentElement.scrollWidth}px wide)`)
    }
    const isVisible = (el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && !el.closest('.visually-hidden') && !el.classList.contains('skip-link')
    }
    for (const el of document.querySelectorAll('button, a, input, textarea, [role=tab]')) {
      if (!isVisible(el)) continue
      const r = el.getBoundingClientRect()
      const label = (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 30)
      if (r.left < -1 || r.right > vw + 1) issues.push(`off-screen: "${label}"`)
      const isField = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'
      if (!isField && el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible') {
        issues.push(`text clipped: "${label}"`)
      }
      // Inline "Also in E009" links sit inside a text sentence, where WCAG allows smaller targets.
      if (r.height < minTarget && !el.closest('[class*=alsoIn]')) {
        issues.push(`small tap target ${Math.round(r.width)}x${Math.round(r.height)}: "${label}"`)
      }
    }
    for (const button of document.querySelectorAll('dialog[open] button')) {
      const lineHeight = parseFloat(getComputedStyle(button).lineHeight) || 20
      if (button.getBoundingClientRect().height > lineHeight * 2 + 4) {
        issues.push(`button label wraps: "${button.textContent.trim()}"`)
      }
    }
    const dialog = document.querySelector('dialog[open]')
    if (dialog) {
      const r = dialog.getBoundingClientRect()
      if (r.left < 0 || r.top < 0 || r.right > vw || r.bottom > vh) {
        issues.push(`dialog does not fit the screen (${Math.round(r.width)}x${Math.round(r.height)} in ${vw}x${vh})`)
      }
    }
    return issues
  }, MIN_TARGET)
}

const clickButton = (page, scope, text) =>
  page.evaluate(
    ([sel, t]) => [...document.querySelectorAll(sel)].find((el) => el.textContent.includes(t))?.click(),
    [scope, text],
  )

let failures = 0
const rows = []

for (const width of WIDTHS) {
  const height = width < 768 ? 740 : width < 1000 ? 1024 : 800
  const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 768, hasTouch: width < 768 })
  const page = await context.newPage()
  const results = {}
  const shot = async (view) => SCREENSHOTS_DIR && page.screenshot({ path: `${SCREENSHOTS_DIR}/${width}-${view}.png` })

  await page.goto(BASE_URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('button[data-row]')
  results.inbox = await audit(page)
  await shot('inbox')

  await clickButton(page, 'button[data-row]', 'Invoice #NS-4471')
  await page.waitForSelector('article h2')
  results.detail = await audit(page)
  const layout = await page.evaluate(() => {
    const shown = (sel) => getComputedStyle(document.querySelector(sel)).display !== 'none'
    return { list: shown('section[aria-label="Inbox"]'), detail: shown('section[aria-label="Email detail"]') }
  })
  const expectTwoPanels = width >= TWO_PANEL_FROM
  if (layout.list !== expectTwoPanels || !layout.detail) {
    results.detail.push(`expected ${expectTwoPanels ? 'two panels' : 'one panel'} at ${width}px`)
  }
  await shot('detail')

  await clickButton(page, 'header button', 'Add email')
  await page.waitForSelector('dialog[open]')
  results.dialog = await audit(page)
  await shot('dialog')
  await page.keyboard.press('Escape')

  await clickButton(page, 'nav button', 'Graph')
  await page.waitForSelector('canvas')
  await page.waitForTimeout(1500)
  results.graph = await audit(page)
  const canvas = await page.evaluate(() => document.querySelector('canvas').getBoundingClientRect())
  if (canvas.height < 280) results.graph.push(`graph area too short (${Math.round(canvas.height)}px)`)
  await shot('graph')

  for (const [view, issues] of Object.entries(results)) {
    failures += issues.length
    rows.push(`${String(width).padStart(5)}px  ${view.padEnd(7)} ${issues.length ? `FAIL  ${issues.join(' | ')}` : 'ok'}`)
  }
  await context.close()
}

await browser.close()
console.log(rows.join('\n'))
console.log(failures ? `\n${failures} responsive issue(s) found.` : `\nAll ${rows.length} views pass at ${WIDTHS.join(', ')}px.`)
process.exit(failures ? 1 : 0)
