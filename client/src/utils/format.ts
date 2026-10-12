const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
const shortDateWithYear = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const fullDate = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' })

function parse(iso: string): Date | null {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

/** "Jun 2", or "Jun 2, 2025" when not in the current year. */
export function formatShortDate(iso: string): string {
  const date = parse(iso)
  if (!date) return iso
  return date.getFullYear() === new Date().getFullYear() ? shortDate.format(date) : shortDateWithYear.format(date)
}

/** "Jun 2, 2026, 8:14 AM" */
export function formatDateTime(iso: string): string {
  const date = parse(iso)
  return date ? fullDate.format(date) : iso
}
