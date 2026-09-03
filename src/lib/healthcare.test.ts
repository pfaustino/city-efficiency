import { describe, expect, it } from 'vitest'
import {
  applyHealthcare,
  emptyHealthcareFields,
  milesBetween,
  nearestHospitalMiles,
  parseHospitalCsv,
  uninsuredPctFromB27001,
} from './healthcare.ts'
import type { City } from './types.ts'

describe('parseHospitalCsv', () => {
  it('keeps open general acute care parent hospitals and ER flags', () => {
    const csv = [
      'OSHPD_ID,FACILITY_NAME,DBA_CITY,COUNTY_NAME,ER_SERVICE_LEVEL_DESC,FACILITY_STATUS_DESC,FACILITY_LEVEL_DESC,LICENSE_TYPE_DESC,LICENSE_CATEGORY_DESC,LATITUDE,LONGITUDE',
      '1,PROVIDENCE SAINT JOSEPH,BURBANK,Los Angeles,Emergency - Basic,Open,Parent Facility,Hospital,General Acute Care Hospital,34.157,-118.329',
      '2,SNF,BURBANK,Los Angeles,Not Applicable,Open,Parent Facility,Long Term Care Facility,Skilled Nursing Facility,34.16,-118.31',
      '3,CLOSED,BURBANK,Los Angeles,Emergency - Basic,Closed,Parent Facility,Hospital,General Acute Care Hospital,34.15,-118.32',
    ].join('\n')
    const rows = parseHospitalCsv(csv)
    expect(rows).toHaveLength(1)
    expect(rows[0].cityKey).toBe('burbank')
    expect(rows[0].hasEr).toBe(true)
  })
})

describe('distance', () => {
  it('measures Burbank city center to Saint Joseph as a short hop', () => {
    const miles = milesBetween(34.1906, -118.325, 34.1573, -118.3293)
    expect(miles).toBeGreaterThan(1)
    expect(miles).toBeLessThan(3)
  })

  it('picks the nearest hospital', () => {
    const miles = nearestHospitalMiles({ lat: 34.19, lon: -118.33 }, [
      { name: 'far', cityKey: 'x', county: 'Los Angeles', lat: 36, lon: -119, hasEr: true },
      { name: 'near', cityKey: 'burbank', county: 'Los Angeles', lat: 34.16, lon: -118.33, hasEr: true },
    ])
    expect(miles).not.toBeNull()
    expect(miles ?? 0).toBeLessThan(3)
  })
})

describe('uninsuredPctFromB27001', () => {
  it('sums the uninsured cells', () => {
    const row: Record<string, number | null> = { total: 1000 }
    for (const code of ['005', '008', '011', '014', '017', '020', '023', '026', '029', '033', '036', '039', '042', '045', '048', '051', '054', '057']) {
      row[`u${code}`] = 0
    }
    row.u005 = 40
    row.u033 = 20
    expect(uninsuredPctFromB27001(row)).toBeCloseTo(6)
  })
})

describe('applyHealthcare', () => {
  it('attaches city and county hospital counts', () => {
    const city: City = {
      slug: 'burbank',
      name: 'Burbank',
      county: 'Los Angeles',
      region: 'socal',
      fiscalYear: 2024,
      population: 105_603,
      populationPrior: null,
      populationGrowthPct: null,
      totalSpend: 1,
      totalSpendPerResident: 1,
      governmentalCurrentSpend: 1,
      governmentalCurrentPerResident: 1,
      policeSpend: 1,
      policePerResident: 1,
      parksSpend: 1,
      parksPerResident: 1,
      utilitySpend: 1,
      utilityPerResident: 1,
      propertyTax: 1,
      salesTax: 1,
      taxPerResident: 1,
      medianHomeValue: null,
      medianRent: null,
      hispanicPct: null,
      whiteNonHispanicPct: null,
      blackNonHispanicPct: null,
      asianNonHispanicPct: null,
      otherPct: null,
      raceAvailable: false,
      ...emptyHealthcareFields(),
      swornOfficers: null,
      officersPer1000: null,
      violentCleared: null,
      propertyCleared: null,
      violentClearancePct: null,
      propertyClearancePct: null,
      staffingAvailable: false,
      violentCrime: null,
      propertyCrime: null,
      crimePer1000: null,
      crimeAvailable: false,
      policeModel: 'municipal',
      enterpriseHeavy: false,
      industrialOutlier: false,
    }
    applyHealthcare([city], {
      places: [{ nameKey: 'burbank', medianIncome: 90_000, uninsuredPct: 6.2, practitioners: 4200 }],
      counties: [{ county: 'Los Angeles', population: 10_000_000, medianIncome: 80_000, uninsuredPct: 8.5 }],
      hospitals: [
        {
          name: 'Providence',
          cityKey: 'burbank',
          county: 'Los Angeles',
          lat: 34.157,
          lon: -118.329,
          hasEr: true,
        },
      ],
      coords: new Map([['burbank', { lat: 34.19, lon: -118.33 }]]),
      hospitalVintage: 'test',
    })
    expect(city.uninsuredPct).toBeCloseTo(6.2)
    expect(city.hospitalCount).toBe(1)
    expect(city.erCount).toBe(1)
    expect(city.countyHospitalCount).toBe(1)
    expect(city.healthcareAvailable).toBe(true)
    expect(city.milesToHospital).not.toBeNull()
  })

  it('ignores an offshore city centroid when the city has hospitals', () => {
    const city: City = {
      slug: 'san-francisco',
      name: 'San Francisco',
      county: 'San Francisco',
      region: 'bay',
      fiscalYear: 2024,
      population: 843_071,
      populationPrior: null,
      populationGrowthPct: null,
      totalSpend: 1,
      totalSpendPerResident: 1,
      governmentalCurrentSpend: 1,
      governmentalCurrentPerResident: 1,
      policeSpend: 1,
      policePerResident: 1,
      parksSpend: 1,
      parksPerResident: 1,
      utilitySpend: 1,
      utilityPerResident: 1,
      propertyTax: 1,
      salesTax: 1,
      taxPerResident: 1,
      medianHomeValue: null,
      medianRent: null,
      hispanicPct: null,
      whiteNonHispanicPct: null,
      blackNonHispanicPct: null,
      asianNonHispanicPct: null,
      otherPct: null,
      raceAvailable: false,
      ...emptyHealthcareFields(),
      swornOfficers: null,
      officersPer1000: null,
      violentCleared: null,
      propertyCleared: null,
      violentClearancePct: null,
      propertyClearancePct: null,
      staffingAvailable: false,
      violentCrime: null,
      propertyCrime: null,
      crimePer1000: null,
      crimeAvailable: false,
      policeModel: 'municipal',
      enterpriseHeavy: false,
      industrialOutlier: false,
    }
    applyHealthcare([city], {
      places: [{ nameKey: 'san francisco', medianIncome: 140_000, uninsuredPct: 3.5, practitioners: 20_000 }],
      counties: [{ county: 'San Francisco', population: 843_071, medianIncome: 140_000, uninsuredPct: 3.5 }],
      hospitals: [
        {
          name: 'Kaiser',
          cityKey: 'san francisco',
          county: 'San Francisco',
          lat: 37.7826,
          lon: -122.4432,
          hasEr: true,
        },
      ],
      coords: new Map([['san francisco', { lat: 37.75, lon: -122.95 }]]),
      hospitalVintage: 'test',
    })
    expect(city.milesToHospital ?? 99).toBeLessThan(2)
  })
})
