export function money(value: number, digits = 0): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value)
}

export function moneyCompact(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return money(value / 1_000_000_000, 1) + ' billion'
  if (abs >= 1_000_000) return money(value / 1_000_000, 1) + ' million'
  return money(value)
}

export function number(value: number, digits = 0): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value)
}

export function pct(value: number, digits = 0): string {
  const formatted = number(Math.abs(value), digits)
  return `${formatted}%`
}

export function signedPct(value: number, digits = 0): string {
  const abs = pct(value, digits)
  if (value > 0.05) return `${abs} above`
  if (value < -0.05) return `${abs} below`
  return 'about even with'
}

export function listNames(names: string[], limit = 6): string {
  const shown = names.slice(0, limit)
  if (names.length <= limit) {
    if (shown.length <= 1) return shown[0] ?? ''
    if (shown.length === 2) return `${shown[0]} and ${shown[1]}`
    return `${shown.slice(0, -1).join(', ')}, and ${shown[shown.length - 1]}`
  }
  return `${shown.join(', ')}, and ${names.length - limit} others`
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
