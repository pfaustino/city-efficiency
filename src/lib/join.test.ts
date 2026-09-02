import { describe, expect, it } from 'vitest'
import { buildDataset } from './join.ts'

describe('buildDataset', () => {
  it('joins Burbank spend, housing, and crime', () => {
    const dataset = buildDataset({
      fiscalYear: 2024,
      priorYear: 2019,
      totalsCurrent: [
        {
          entity_name: 'Burbank',
          county: 'Los Angeles',
          fiscal_year: 2024,
          total_expenditures: 800_000_000,
          estimated_population: 105_603,
        },
      ],
      totalsPrior: [
        {
          entity_name: 'Burbank',
          county: 'Los Angeles',
          fiscal_year: 2019,
          estimated_population: 104_000,
        },
      ],
      spendLines: [
        {
          entity_name: 'Burbank',
          form_table: 'CURR_EXP_POLICE',
          category: 'General Government and Public Safety',
          subcategory_1: 'Public Safety',
          line_description: 'Police_Current Expenditures',
          value: 69_081_287,
        },
        {
          entity_name: 'Burbank',
          form_table: 'CURR_EXP_PARK_REC',
          category: 'Health and Culture and Leisure',
          subcategory_1: 'Culture and Leisure',
          line_description: 'Parks and Recreation_Current Expenditures',
          value: 16_388_506,
        },
        {
          entity_name: 'Burbank',
          form_table: 'ELEC_PURCHASES',
          category: 'Electric Enterprise Fund',
          subcategory_1: 'Operating Expenses',
          line_description: 'Electricity Purchases_Electric Enterprise Fund',
          value: 108_342_790,
        },
      ],
      taxLines: [
        {
          entity_name: 'Burbank',
          form_table: 'GENREV_SEC_UNSEC_PROPTAX',
          value: 42_695_523,
        },
        {
          entity_name: 'Burbank',
          form_table: 'GENREV_SALE_USE_TAX',
          value: 30_000_000,
        },
      ],
      housing: [{ nameKey: 'burbank', medianHomeValue: 1_100_000, medianRent: 2200 }],
      race: [
        {
          nameKey: 'burbank',
          hispanicPct: 27.4,
          whiteNonHispanicPct: 50.1,
          blackNonHispanicPct: 2.3,
          asianNonHispanicPct: 12.8,
          otherPct: 7.4,
        },
      ],
      crime: [{ year: 2024, county: 'Los Angeles', agency: 'Burbank', violent: 400, property: 2200 }],
      acsVintage: 'ACS 5-year 2023',
      crimeYear: 2024,
    })

    expect(dataset.cities).toHaveLength(1)
    const burbank = dataset.cities[0]
    expect(burbank.slug).toBe('burbank')
    expect(Math.round(burbank.policePerResident ?? 0)).toBe(654)
    expect(Math.round(burbank.parksPerResident ?? 0)).toBe(155)
    expect(Math.round(burbank.utilityPerResident ?? 0)).toBe(1026)
    expect(burbank.crimeAvailable).toBe(true)
    expect(burbank.medianHomeValue).toBe(1_100_000)
    expect(burbank.hispanicPct).toBeCloseTo(27.4)
    expect(burbank.raceAvailable).toBe(true)
    expect(burbank.populationGrowthPct).not.toBeNull()
  })
})
