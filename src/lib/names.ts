const CENSUS_NAME_ALIASES: Record<string, string> = {
  'san buenaventura ventura': 'ventura',
  'el paso de robles paso robles': 'paso robles',
}

const DOJ_NAME_ALIASES: Record<string, string> = {
  'san buenaventura': 'ventura',
  ventura: 'ventura',
  'el paso de robles': 'paso robles',
  'paso robles': 'paso robles',
}

export function slugify(name: string, county?: string): string {
  const base = normalizeName(name).replace(/\s+/g, '-')
  if (!base && county) return normalizeName(county).replace(/\s+/g, '-')
  return base
}

export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/city of /g, '')
    .replace(/\bcity\b/g, '')
    .replace(/\btown\b/g, '')
    .replace(/police department/g, '')
    .replace(/\bpd\b/g, '')
    .replace(/sheriff.?s department/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function censusPlaceToCityName(label: string): string {
  const stripped = label
    .replace(/, California$/i, '')
    .replace(/\s+city$/i, '')
    .replace(/\s+town$/i, '')
    .replace(/\s+CDP$/i, '')
    .trim()
  const key = normalizeName(stripped)
  return CENSUS_NAME_ALIASES[key] ?? key
}

export function dojAgencyToCityName(agency: string): string | null {
  const raw = agency.trim()
  if (!raw) return null
  const lower = raw.toLowerCase()
  if (lower.includes('sheriff')) return null
  if (lower.includes('highway patrol') || lower.includes('chp')) return null
  if (lower.includes('university') || lower.includes('college') || lower.startsWith('uc ')) return null
  if (lower.includes('district') || lower.includes('park')) return null
  if (lower.includes('transit') || lower.includes('airport')) return null
  if (lower.includes('unified') || lower.includes('school')) return null
  const key = normalizeName(raw)
  if (!key) return null
  return DOJ_NAME_ALIASES[key] ?? key
}

export function displayName(name: string): string {
  return name
    .split(' ')
    .map((part) => (part.length === 0 ? part : part[0].toUpperCase() + part.slice(1)))
    .join(' ')
}
