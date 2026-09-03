import { describe, expect, it } from 'vitest'
import { emptyHealthcareFields } from './healthcare.ts'
import { emptyStaffingFields } from './join.ts'
import { buildHealthcarePost, buildPost, buildRacePost, canWritePost, METRIC_SPECS } from './posts.ts'
import type { City } from './types.ts'

function city(partial: Partial<City> & Pick<City, 'slug' | 'name' | 'population'>): City {
  return {
    county: 'Los Angeles',
    region: 'socal',
    fiscalYear: 2024,
    populationPrior: 100_000,
    populationGrowthPct: 5.6,
    totalSpend: 200_000_000,
    totalSpendPerResident: 1894,
    governmentalCurrentSpend: 120_000_000,
    governmentalCurrentPerResident: 1136,
    policeSpend: 69_081_287,
    policePerResident: 654,
    parksSpend: 16_388_506,
    parksPerResident: 155,
    utilitySpend: 239_000_000,
    utilityPerResident: 2263,
    propertyTax: 58_000_000,
    salesTax: 30_000_000,
    taxPerResident: 833,
    medianHomeValue: 1_100_000,
    medianRent: 2200,
    hispanicPct: null,
    whiteNonHispanicPct: null,
    blackNonHispanicPct: null,
    asianNonHispanicPct: null,
    otherPct: null,
    raceAvailable: false,
    ...emptyHealthcareFields(),
    ...emptyStaffingFields(),
    violentCrime: 400,
    propertyCrime: 2200,
    crimePer1000: 24.6,
    crimeAvailable: true,
    policeModel: 'municipal',
    enterpriseHeavy: true,
    industrialOutlier: false,
    ...partial,
  }
}

describe('buildPost', () => {
  it('writes the Burbank police comparison', () => {
    const burbank = city({ slug: 'burbank', name: 'Burbank', population: 105_603 })
    const glendale = city({
      slug: 'glendale',
      name: 'Glendale',
      population: 190_000,
      policePerResident: 500,
      crimePer1000: 20,
    })
    const pasadena = city({
      slug: 'pasadena',
      name: 'Pasadena',
      population: 138_000,
      policePerResident: 600,
      crimePer1000: 22,
    })
    const bySlug = new Map([
      [burbank.slug, burbank],
      [glendale.slug, glendale],
      [pasadena.slug, pasadena],
    ])
    const spec = METRIC_SPECS[0]
    const post = buildPost(burbank, spec, { slugs: ['glendale', 'pasadena'], bandWidened: false }, bySlug)
    expect(post).not.toBeNull()
    expect(post?.title).toContain('Burbank spends $654 per resident on police')
    expect(post?.title).toContain('2 similar California cities')
    expect(post?.paragraphs[0]).toContain('Glendale')
    expect(post?.rank).toBe(1)
    expect(post?.crimeRank).toBe(1)
  })

  it('skips contract cities for police posts', () => {
    const cityRow = city({
      slug: 'lakewood',
      name: 'Lakewood',
      population: 80_000,
      policeModel: 'contract',
    })
    expect(canWritePost(cityRow, METRIC_SPECS[0])).toBe(false)
  })

  it('skips cities under 25,000 residents', () => {
    const cityRow = city({ slug: 'tiny', name: 'Tiny', population: 12_000 })
    expect(canWritePost(cityRow, METRIC_SPECS[0])).toBe(false)
  })

  it('writes a utilities post when municipal utility spend is present', () => {
    const spec = METRIC_SPECS.find((item) => item.metric === 'utilities')
    expect(spec).toBeDefined()
    const burbank = city({ slug: 'burbank', name: 'Burbank', population: 105_603 })
    expect(canWritePost(burbank, spec!)).toBe(true)
    expect(canWritePost(city({ slug: 'none', name: 'None', population: 80_000, utilityPerResident: 0 }), spec!)).toBe(
      false,
    )
  })

  it('writes a demographics report on the same peer list', () => {
    const burbank = city({
      slug: 'burbank',
      name: 'Burbank',
      population: 105_603,
      hispanicPct: 27.4,
      whiteNonHispanicPct: 50.1,
      blackNonHispanicPct: 2.3,
      asianNonHispanicPct: 12.8,
      otherPct: 7.4,
      raceAvailable: true,
    })
    const glendale = city({
      slug: 'glendale',
      name: 'Glendale',
      population: 190_000,
      hispanicPct: 20,
      whiteNonHispanicPct: 60,
      blackNonHispanicPct: 2,
      asianNonHispanicPct: 12,
      otherPct: 6,
      raceAvailable: true,
    })
    const pasadena = city({
      slug: 'pasadena',
      name: 'Pasadena',
      population: 138_000,
      hispanicPct: 35,
      whiteNonHispanicPct: 40,
      blackNonHispanicPct: 10,
      asianNonHispanicPct: 10,
      otherPct: 5,
      raceAvailable: true,
    })
    const bySlug = new Map([
      [burbank.slug, burbank],
      [glendale.slug, glendale],
      [pasadena.slug, pasadena],
    ])
    const post = buildRacePost(burbank, { slugs: ['glendale', 'pasadena'], bandWidened: false }, bySlug)
    expect(post).not.toBeNull()
    expect(post?.slug).toBe('burbank-demographics')
    expect(post?.metric).toBe('race')
    expect(post?.peerSlugs).toEqual(['glendale', 'pasadena'])
    expect(post?.title).toContain('same 2 cities')
  })

  it('writes a healthcare report on the same peer list', () => {
    const burbank = city({
      slug: 'burbank',
      name: 'Burbank',
      population: 105_603,
      uninsuredPct: 6.2,
      medianIncome: 90_000,
      hospitalCount: 1,
      erCount: 1,
      hospitalsPer100k: 0.95,
      ersPer100k: 0.95,
      milesToHospital: 1.4,
      healthcareAvailable: true,
    })
    const glendale = city({
      slug: 'glendale',
      name: 'Glendale',
      population: 190_000,
      uninsuredPct: 8.1,
      healthcareAvailable: true,
    })
    const pasadena = city({
      slug: 'pasadena',
      name: 'Pasadena',
      population: 138_000,
      uninsuredPct: 7.4,
      healthcareAvailable: true,
    })
    const bySlug = new Map([
      [burbank.slug, burbank],
      [glendale.slug, glendale],
      [pasadena.slug, pasadena],
    ])
    const post = buildHealthcarePost(burbank, { slugs: ['glendale', 'pasadena'], bandWidened: false }, bySlug)
    expect(post).not.toBeNull()
    expect(post?.slug).toBe('burbank-healthcare')
    expect(post?.metric).toBe('healthcare')
    expect(post?.rank).toBe(1)
    expect(post?.peerSlugs).toEqual(['glendale', 'pasadena'])
    expect(post?.title).toContain('6.2% uninsured')
  })
})
