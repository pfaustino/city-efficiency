import { describe, expect, it } from 'vitest'
import { emptyHealthcareFields } from './healthcare.ts'
import { emptyStaffingFields } from './join.ts'
import { applyPeerReplacements, classifyPoliceModel, peerScore, selectPeers } from './peers.ts'
import type { City } from './types.ts'

function city(partial: Partial<City> & Pick<City, 'slug' | 'name' | 'population'>): City {
  return {
    county: 'Los Angeles',
    region: 'socal',
    fiscalYear: 2024,
    populationPrior: null,
    populationGrowthPct: null,
    totalSpend: 100,
    totalSpendPerResident: 1,
    governmentalCurrentSpend: 80,
    governmentalCurrentPerResident: 0.8,
    policeSpend: 50,
    policePerResident: 0.5,
    parksSpend: 10,
    parksPerResident: 0.1,
    utilitySpend: 20,
    utilityPerResident: 0.2,
    propertyTax: 20,
    salesTax: 10,
    taxPerResident: 0.3,
    medianHomeValue: 800_000,
    medianRent: 2000,
    hispanicPct: null,
    whiteNonHispanicPct: null,
    blackNonHispanicPct: null,
    asianNonHispanicPct: null,
    otherPct: null,
    raceAvailable: false,
    ...emptyHealthcareFields(),
    ...emptyStaffingFields(),
    violentCrime: 10,
    propertyCrime: 40,
    crimePer1000: 5,
    crimeAvailable: true,
    policeModel: 'municipal',
    enterpriseHeavy: false,
    industrialOutlier: false,
    ...partial,
  }
}

describe('selectPeers', () => {
  it('keeps the 20 closest cities in the population band', () => {
    const subject = city({ slug: 'burbank', name: 'Burbank', population: 100_000 })
    const cities = [subject]
    for (let i = 0; i < 30; i += 1) {
      cities.push(
        city({
          slug: `peer-${i}`,
          name: `Peer ${i}`,
          population: 80_000 + i * 2_000,
          region: i % 2 === 0 ? 'socal' : 'bay',
        }),
      )
    }
    const peers = selectPeers(subject, cities)
    expect(peers.slugs).toHaveLength(20)
    expect(peers.bandWidened).toBe(false)
    expect(peers.slugs).not.toContain('burbank')
  })

  it('widens the band when the tight set is short', () => {
    const subject = city({ slug: 'lone', name: 'Lone', population: 90_000 })
    const far = city({ slug: 'far', name: 'Far', population: 240_000, region: 'north' })
    const peers = selectPeers(subject, [subject, far])
    expect(peers.slugs).toEqual(['far'])
    expect(peers.bandWidened).toBe(true)
  })

  it('prefers the same region when population is close', () => {
    const subject = city({ slug: 'center', name: 'Center', population: 100_000, region: 'socal' })
    const local = city({ slug: 'local', name: 'Local', population: 101_000, region: 'socal' })
    const distant = city({ slug: 'distant', name: 'Distant', population: 101_000, region: 'bay' })
    expect(peerScore(subject, local)).toBeLessThan(peerScore(subject, distant))
  })

  it('skips industrial outliers', () => {
    const subject = city({ slug: 'center', name: 'Center', population: 100_000 })
    const vernon = city({
      slug: 'vernon',
      name: 'Vernon',
      population: 80_000,
      industrialOutlier: true,
    })
    expect(selectPeers(subject, [subject, vernon]).slugs).toEqual([])
  })

  it('swaps selected Burbank peers for nearby and large cities', () => {
    const burbank = city({ slug: 'burbank', name: 'Burbank', population: 105_000 })
    const peers = applyPeerReplacements(
      burbank,
      {
        slugs: ['norwalk', 'hesperia', 'downey', 'rialto', 'jurupa-valley', 'san-buenaventura', 'south-gate', 'vista'],
        bandWidened: false,
      },
      [
        burbank,
        city({ slug: 'norwalk', name: 'Norwalk', population: 100_000 }),
        city({ slug: 'hesperia', name: 'Hesperia', population: 100_000 }),
        city({ slug: 'downey', name: 'Downey', population: 100_000 }),
        city({ slug: 'rialto', name: 'Rialto', population: 100_000 }),
        city({ slug: 'jurupa-valley', name: 'Jurupa Valley', population: 100_000 }),
        city({ slug: 'san-buenaventura', name: 'San Buenaventura', population: 100_000 }),
        city({ slug: 'south-gate', name: 'South Gate', population: 100_000 }),
        city({ slug: 'vista', name: 'Vista', population: 100_000 }),
        city({ slug: 'chula-vista', name: 'Chula Vista', population: 270_000 }),
        city({ slug: 'simi-valley', name: 'Simi Valley', population: 125_000 }),
        city({ slug: 'glendale', name: 'Glendale', population: 190_000 }),
        city({ slug: 'pasadena', name: 'Pasadena', population: 140_000 }),
        city({ slug: 'los-angeles', name: 'Los Angeles', population: 3_800_000 }),
        city({ slug: 'san-francisco', name: 'San Francisco', population: 800_000 }),
        city({ slug: 'san-diego', name: 'San Diego', population: 1_300_000 }),
      ],
    )
    expect(peers.slugs).toEqual([
      'glendale',
      'pasadena',
      'los-angeles',
      'san-francisco',
      'san-diego',
      'chula-vista',
      'simi-valley',
      'vista',
    ])
  })
})

describe('classifyPoliceModel', () => {
  it('labels zero police spend as contract', () => {
    const subject = city({
      slug: 'contract',
      name: 'Contract',
      population: 80_000,
      policeSpend: 0,
      policePerResident: 0,
    })
    expect(classifyPoliceModel(subject, [])).toBe('contract')
  })

  it('labels far-below-median spend as contract', () => {
    const subject = city({
      slug: 'low',
      name: 'Low',
      population: 80_000,
      policeSpend: 1_000,
      policePerResident: 20,
    })
    const peers = [
      city({ slug: 'a', name: 'A', population: 80_000, policePerResident: 400 }),
      city({ slug: 'b', name: 'B', population: 80_000, policePerResident: 420 }),
    ]
    expect(classifyPoliceModel(subject, peers)).toBe('contract')
  })
})
