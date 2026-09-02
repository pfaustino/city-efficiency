import { describe, expect, it } from 'vitest'
import {
  crimePerThousand,
  growthPct,
  pearson,
  raceShares,
  ratePerThousand,
  isEnterpriseHeavy,
  isIndustrialOutlier,
  median,
  pctFromMedian,
  perResident,
  policeSpendPerCrime,
  rankAscending,
  rankDescending,
} from './metrics.ts'

describe('perResident', () => {
  it('matches the Burbank police figure', () => {
    const value = perResident(69_081_287, 105_603)
    expect(value).not.toBeNull()
    expect(Math.round(value ?? 0)).toBe(654)
  })

  it('rejects a zero population', () => {
    expect(perResident(100, 0)).toBeNull()
  })
})

describe('growth and crime', () => {
  it('computes a five-year population change', () => {
    expect(growthPct(110, 100)).toBeCloseTo(10)
  })

  it('computes crime per 1,000 residents', () => {
    expect(crimePerThousand(20, 80, 10_000)).toBeCloseTo(10)
  })

  it('splits Burbank violent and property rates', () => {
    expect(ratePerThousand(352, 105_603)).toBeCloseTo(3.3, 1)
    expect(ratePerThousand(2512, 105_603)).toBeCloseTo(23.8, 1)
  })

  it('turns ACS counts into race shares', () => {
    const shares = raceShares(1000, 500, 100, 150, 200)
    expect(shares).not.toBeNull()
    expect(shares?.whiteNonHispanicPct).toBeCloseTo(50)
    expect(shares?.blackNonHispanicPct).toBeCloseTo(10)
    expect(shares?.asianNonHispanicPct).toBeCloseTo(15)
    expect(shares?.hispanicPct).toBeCloseTo(20)
    expect(shares?.otherPct).toBeCloseTo(5)
  })

  it('measures a perfect Pearson correlation', () => {
    expect(pearson([1, 2, 3, 4, 5, 6, 7, 8], [2, 4, 6, 8, 10, 12, 14, 16])).toBeCloseTo(1)
  })
})

describe('cohort helpers', () => {
  it('ranks the highest value first', () => {
    expect(rankDescending(9, [9, 4, 4, 1])).toBe(1)
    expect(rankDescending(4, [9, 4, 4, 1])).toBe(2)
  })

  it('ranks the lowest value first', () => {
    expect(rankAscending(1, [9, 4, 4, 1])).toBe(1)
    expect(rankAscending(4, [9, 4, 4, 1])).toBe(2)
  })

  it('returns a midpoint median', () => {
    expect(median([1, 3, 2])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })

  it('measures distance from the median', () => {
    expect(pctFromMedian(120, 100)).toBeCloseTo(20)
  })
})

describe('flags', () => {
  it('marks industrial and tiny cities as outliers', () => {
    expect(isIndustrialOutlier('Vernon', 200)).toBe(true)
    expect(isIndustrialOutlier('Burbank', 105_603)).toBe(false)
    expect(isIndustrialOutlier('Amador', 186)).toBe(true)
  })

  it('flags enterprise-heavy totals', () => {
    expect(isEnterpriseHeavy(200, 80)).toBe(true)
    expect(isEnterpriseHeavy(200, 120)).toBe(false)
  })
})

describe('police efficiency', () => {
  it('measures police spending per reported crime', () => {
    const value = policeSpendPerCrime(654, 27.1)
    expect(value).not.toBeNull()
    expect(Math.round(value ?? 0)).toBe(24_133)
  })
})
