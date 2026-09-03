export function perResident(amount: number, population: number): number | null {
  if (!Number.isFinite(amount) || !Number.isFinite(population) || population <= 0) {
    return null
  }
  return amount / population
}

export function growthPct(current: number, prior: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(prior) || prior <= 0) {
    return null
  }
  return ((current - prior) / prior) * 100
}

export function ratePerThousand(count: number | null, population: number): number | null {
  if (count === null || !Number.isFinite(count)) return null
  const per = perResident(count, population)
  return per === null ? null : per * 1000
}

export function crimePerThousand(
  violent: number | null,
  property: number | null,
  population: number,
): number | null {
  if (violent === null || property === null) return null
  if (!Number.isFinite(violent) || !Number.isFinite(property)) return null
  return ratePerThousand(violent + property, population)
}

export function taxTake(propertyTax: number | null, salesTax: number | null): number | null {
  if (propertyTax === null && salesTax === null) return null
  return (propertyTax ?? 0) + (salesTax ?? 0)
}

export function isIndustrialOutlier(name: string, population: number): boolean {
  const key = name.toLowerCase()
  if (key === 'vernon' || key === 'industry' || key === 'irwindale') return true
  return population < 10_000
}

export function isEnterpriseHeavy(
  totalSpend: number,
  governmentalCurrentSpend: number | null,
): boolean {
  if (governmentalCurrentSpend === null || totalSpend <= 0) return false
  return governmentalCurrentSpend < 0.5 * totalSpend
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

export function rankDescending(value: number, cohort: number[]): number {
  const higher = cohort.filter((item) => item > value).length
  return higher + 1
}

export function rankAscending(value: number, cohort: number[]): number {
  const lower = cohort.filter((item) => item < value).length
  return lower + 1
}

export function pctFromMedian(value: number, medianValue: number): number {
  if (!Number.isFinite(medianValue) || medianValue === 0) return 0
  return ((value - medianValue) / medianValue) * 100
}

export function parseMoney(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return null
  return n
}

export function clearancePct(cleared: number | null, offenses: number | null): number | null {
  if (cleared === null || offenses === null) return null
  if (!Number.isFinite(cleared) || !Number.isFinite(offenses) || !(offenses > 0)) return null
  return (cleared / offenses) * 100
}

export function policeSpendPerCrime(
  policePerResident: number | null,
  crimePer1000: number | null,
): number | null {
  if (policePerResident === null || crimePer1000 === null) return null
  if (!(policePerResident > 0) || !(crimePer1000 > 0)) return null
  return policePerResident / (crimePer1000 / 1000)
}

export function raceShares(
  total: number | null,
  whiteNonHispanic: number | null,
  blackNonHispanic: number | null,
  asianNonHispanic: number | null,
  hispanic: number | null,
): {
  hispanicPct: number
  whiteNonHispanicPct: number
  blackNonHispanicPct: number
  asianNonHispanicPct: number
  otherPct: number
} | null {
  if (total === null || !(total > 0)) return null
  if (
    whiteNonHispanic === null ||
    blackNonHispanic === null ||
    asianNonHispanic === null ||
    hispanic === null
  ) {
    return null
  }
  const whiteNonHispanicPct = (100 * whiteNonHispanic) / total
  const blackNonHispanicPct = (100 * blackNonHispanic) / total
  const asianNonHispanicPct = (100 * asianNonHispanic) / total
  const hispanicPct = (100 * hispanic) / total
  let otherPct =
    100 - whiteNonHispanicPct - blackNonHispanicPct - asianNonHispanicPct - hispanicPct
  if (otherPct < 0 && otherPct > -0.2) otherPct = 0
  if (otherPct < 0) return null
  return {
    hispanicPct,
    whiteNonHispanicPct,
    blackNonHispanicPct,
    asianNonHispanicPct,
    otherPct,
  }
}

export function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 8) return null
  let sumX = 0
  let sumY = 0
  for (let i = 0; i < xs.length; i += 1) {
    sumX += xs[i]
    sumY += ys[i]
  }
  const meanX = sumX / xs.length
  const meanY = sumY / ys.length
  let num = 0
  let denX = 0
  let denY = 0
  for (let i = 0; i < xs.length; i += 1) {
    const dx = xs[i] - meanX
    const dy = ys[i] - meanY
    num += dx * dy
    denX += dx * dx
    denY += dy * dy
  }
  if (!(denX > 0) || !(denY > 0)) return null
  return num / Math.sqrt(denX * denY)
}

export function pearsonPairs(
  rows: Array<{ x: number | null; y: number | null }>,
): number | null {
  const xs: number[] = []
  const ys: number[] = []
  for (const row of rows) {
    if (row.x === null || row.y === null) continue
    if (!Number.isFinite(row.x) || !Number.isFinite(row.y)) continue
    xs.push(row.x)
    ys.push(row.y)
  }
  return pearson(xs, ys)
}
