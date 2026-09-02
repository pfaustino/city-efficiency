import { describe, expect, it } from 'vitest'
import {
  findCrimeCsvUrl,
  parseAcsEstimateFile,
  parseCensusRaceTable,
  parseCensusTable,
  parseCrimeCsv,
  parseGazetteerPlaces,
  splitCsvLine,
} from './fetch.ts'

describe('parseCrimeCsv', () => {
  it('reads the OpenJustice summary columns', () => {
    const csv = [
      'Year,County,NCICCode,Violent_sum,Property_sum',
      '2024,Los Angeles,Burbank,400,2200',
      '2024,Los Angeles,Los Angeles Co. Sheriff\'s Department,9000,20000',
    ].join('\n')
    const rows = parseCrimeCsv(csv)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ year: 2024, agency: 'Burbank', violent: 400, property: 2200 })
  })
})

describe('parseCensusTable', () => {
  it('keeps incorporated cities and drops CDPs', () => {
    const table = [
      ['NAME', 'B25077_001E', 'B25064_001E'],
      ['Burbank city, California', '1100000', '2200'],
      ['Alta Vista CDP, California', '400000', '1400'],
    ]
    const rows = parseCensusTable(table)
    expect(rows).toEqual([{ nameKey: 'burbank', medianHomeValue: 1_100_000, medianRent: 2200 }])
  })
})

describe('parseCensusRaceTable', () => {
  it('converts B03002 counts into shares and drops CDPs', () => {
    const table = [
      ['NAME', 'B03002_001E', 'B03002_003E', 'B03002_004E', 'B03002_006E', 'B03002_012E'],
      ['Burbank city, California', '1000', '500', '100', '150', '200'],
      ['Alta Vista CDP, California', '400', '200', '40', '40', '80'],
    ]
    const rows = parseCensusRaceTable(table)
    expect(rows).toHaveLength(1)
    expect(rows[0].nameKey).toBe('burbank')
    expect(rows[0].whiteNonHispanicPct).toBeCloseTo(50)
    expect(rows[0].hispanicPct).toBeCloseTo(20)
  })
})

describe('findCrimeCsvUrl', () => {
  it('prefers a summary crimes-and-clearances CSV', () => {
    const html = `
      <a href="https://data-openjustice.doj.ca.gov/sites/default/files/dataset/2025-07/Crimes_Clearances_Monthly.csv">Monthly</a>
      <a href="https://data-openjustice.doj.ca.gov/sites/default/files/dataset/2025-07/Crimes_and_Clearances.csv">Summary</a>
    `
    expect(findCrimeCsvUrl(html)).toContain('Crimes_and_Clearances.csv')
  })
})

describe('splitCsvLine', () => {
  it('keeps commas inside quotes', () => {
    expect(splitCsvLine('"Los Angeles, City",100')).toEqual(['Los Angeles, City', '100'])
  })
})

describe('ACS summary files', () => {
  it('reads gazetteer place names', () => {
    const text = ['USPS\tGEOID\tANSICODE\tNAME', 'CA\t0649282\t2410352\tBurbank'].join('\n')
    const places = parseGazetteerPlaces(text)
    expect(places.get('0649282')).toBe('Burbank, California')
  })

  it('reads CA place estimates', () => {
    const text = ['GEO_ID|B25077_E001|B25077_M001', '1600000US0649282|1100000|5000'].join('\n')
    expect(parseAcsEstimateFile(text, '1600000US06').get('1600000US0649282')).toBe(1_100_000)
  })
})
