import {
  b27001UninsuredColumns,
  parseGazetteerCoords,
  parseGazetteerCounties,
  parseHospitalCsv,
  practitionersFromC24010,
  uninsuredPctFromB27001,
  type AcsHealthRow,
  type CountyHealthRow,
  type HealthcareBundle,
} from './healthcare.ts'
import { parseMoney, raceShares } from './metrics.ts'
import { censusPlaceToCityName } from './names.ts'
import type { CrimeRow, HousingRow, PersonnelRow, RaceRow, ScoLineRow, ScoTotalRow } from './join.ts'
import { parseXlsxSheet } from './xlsx.ts'

const SCO = 'https://bythenumbers.sco.ca.gov/resource'
const PAGE = 1000
const MAX_PAGES = 80

export async function soda<T>(dataset: string, where: string, extra: Record<string, string> = {}): Promise<T[]> {
  const rows: T[] = []
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = new URLSearchParams({
      $where: where,
      $limit: String(PAGE),
      $offset: String(page * PAGE),
      ...extra,
    })
    const batch = await getJson<T[]>(`${SCO}/${dataset}.json?${params}`)
    rows.push(...batch)
    if (batch.length < PAGE) break
  }
  return rows
}

export async function fetchTotals(year: number): Promise<ScoTotalRow[]> {
  return soda<ScoTotalRow>('ykhf-vfsr', `fiscal_year=${year}`, { $order: 'entity_name' })
}

export async function fetchSpendLines(year: number): Promise<ScoLineRow[]> {
  const where = `fiscal_year=${year} AND (form_table in('CURR_EXP_POLICE','CURR_EXP_PARK_REC','CURR_EXP_ELECTRIC','CURR_EXP_WATER','CURR_EXP_GAS','CURR_EXP_SEWERS','CURR_EXP_SOLID_WASTE','CURR_EXP_PUB_UTILITIES') OR (line_description like '%Current Expenditures' AND category not like '%Enterprise%' AND subcategory_1 != 'Capital Outlay') OR (subcategory_1='Operating Expenses' AND form_table!='DEPR_AMORT_EXP' AND (category like 'Electric Enterprise%' OR category like 'Water Enterprise%' OR category like 'Gas%Enterprise%' OR category like 'Sewer Enterprise%' OR category like 'Solid Waste Enterprise%')))`
  return soda<ScoLineRow>('ju3w-4gxp', where)
}

export async function fetchTaxLines(year: number): Promise<ScoLineRow[]> {
  const forms = [
    'GENREV_SEC_UNSEC_PROPTAX',
    'GENREV_PROPTAX_INLIEU',
    'GENREV_SUPP_SEC_UNSEC_PROPTAX',
    'GENREV_SALE_USE_TAX',
    'FUNC_SALE_USE_TAX',
  ]
    .map((form) => `'${form}'`)
    .join(',')
  return soda<ScoLineRow>('rrtv-rsj9', `fiscal_year=${year} AND form_table in(${forms})`)
}

export async function fetchHousing(apiKey?: string): Promise<{ rows: HousingRow[]; vintage: string | null }> {
  const year = 2023
  const key = apiKey
  const params = new URLSearchParams({
    get: 'NAME,B25077_001E,B25064_001E',
    for: 'place:*',
    in: 'state:06',
  })
  if (key) params.set('key', key)
  try {
    const table = await getJson<string[][]>(`https://api.census.gov/data/${year}/acs/acs5?${params}`)
    const rows = parseCensusTable(table)
    if (rows.length > 0) return { rows, vintage: `ACS 5-year ${year}` }
  } catch {
    // Fall through to the public summary files.
  }
  try {
    const rows = await fetchAcsSummaryHousing(year)
    return { rows, vintage: rows.length > 0 ? `ACS 5-year ${year}` : null }
  } catch {
    return { rows: [], vintage: null }
  }
}

const ACS_SF = 'https://www2.census.gov/programs-surveys/acs/summary_file/2023/table-based-SF'
const GAZETTEER =
  'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/2023_gaz_place_06.txt'
const COUNTY_GAZETTEER =
  'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/2023_gaz_counties_06.txt'
const CHHS_PACKAGE = 'https://data.chhs.ca.gov/api/3/action/package_show?id=licensed-healthcare-facility-listing'
const CHHS_HOSPITAL_FALLBACKS = [
  'https://data.chhs.ca.gov/dataset/59d9abe7-2664-407a-a5aa-f89a866f3381/resource/641c5557-7d65-4379-8fea-6b7dedbda40b/download/current-healthcare-facility-listing20260901.csv',
  'https://data.chhs.ca.gov/dataset/59d9abe7-2664-407a-a5aa-f89a866f3381/resource/66e8522e-daa1-4de3-9aa0-e77bddfbf0b5/download/licensed-healthcare-facility-listing-june-30-2026.csv',
  'https://data.chhs.ca.gov/dataset/59d9abe7-2664-407a-a5aa-f89a866f3381/resource/81361b94-077a-443b-97aa-d4e7b9bbd5e4/download/licensed-healthcare-facility-listing-december-31-2025.csv',
]

export async function fetchAcsSummaryHousing(year: number): Promise<HousingRow[]> {
  const [places, values, rents] = await Promise.all([
    getText(GAZETTEER),
    getText(`${ACS_SF}/data/5YRData/acsdt5y${year}-b25077.dat`),
    getText(`${ACS_SF}/data/5YRData/acsdt5y${year}-b25064.dat`),
  ])
  const names = parseGazetteerPlaces(places)
  const valueByGeo = parseAcsEstimateFile(values, '1600000US06')
  const rentByGeo = parseAcsEstimateFile(rents, '1600000US06')
  const rows: HousingRow[] = []
  for (const [geoid, label] of names) {
    const geoId = `1600000US${geoid}`
    rows.push({
      nameKey: censusPlaceToCityName(label),
      medianHomeValue: valueByGeo.get(geoId) ?? null,
      medianRent: rentByGeo.get(geoId) ?? null,
    })
  }
  return rows
}

export async function fetchRace(apiKey?: string): Promise<{ rows: RaceRow[]; vintage: string | null }> {
  const year = 2023
  const params = new URLSearchParams({
    get: 'NAME,B03002_001E,B03002_003E,B03002_004E,B03002_006E,B03002_012E',
    for: 'place:*',
    in: 'state:06',
  })
  if (apiKey) params.set('key', apiKey)
  try {
    const table = await getJson<string[][]>(`https://api.census.gov/data/${year}/acs/acs5?${params}`)
    const rows = parseCensusRaceTable(table)
    if (rows.length > 0) return { rows, vintage: `ACS 5-year ${year}` }
  } catch {
    // Fall through to the public summary files.
  }
  try {
    const rows = await fetchAcsSummaryRace(year)
    return { rows, vintage: rows.length > 0 ? `ACS 5-year ${year}` : null }
  } catch {
    return { rows: [], vintage: null }
  }
}

export async function fetchAcsSummaryRace(year: number): Promise<RaceRow[]> {
  const [places, values] = await Promise.all([
    getText(GAZETTEER),
    getText(`${ACS_SF}/data/5YRData/acsdt5y${year}-b03002.dat`),
  ])
  const names = parseGazetteerPlaces(places)
  const byGeo = parseAcsColumns(values, '1600000US06', {
    total: ['B03002_E001', 'B03002_001E'],
    white: ['B03002_E003', 'B03002_003E'],
    black: ['B03002_E004', 'B03002_004E'],
    asian: ['B03002_E006', 'B03002_006E'],
    hispanic: ['B03002_E012', 'B03002_012E'],
  })
  const rows: RaceRow[] = []
  for (const [geoid, label] of names) {
    const geoId = `1600000US${geoid}`
    const counts = byGeo.get(geoId)
    const shares = counts
      ? raceShares(counts.total, counts.white, counts.black, counts.asian, counts.hispanic)
      : null
    rows.push({
      nameKey: censusPlaceToCityName(label),
      hispanicPct: shares?.hispanicPct ?? null,
      whiteNonHispanicPct: shares?.whiteNonHispanicPct ?? null,
      blackNonHispanicPct: shares?.blackNonHispanicPct ?? null,
      asianNonHispanicPct: shares?.asianNonHispanicPct ?? null,
      otherPct: shares?.otherPct ?? null,
    })
  }
  return rows
}

export async function fetchHealthcare(apiKey?: string): Promise<HealthcareBundle> {
  const year = 2023
  const [placeGaz, countyGaz, hospitalFile] = await Promise.all([
    getText(GAZETTEER),
    getText(COUNTY_GAZETTEER),
    fetchHospitalCsv(),
  ])
  const coords = parseGazetteerCoords(placeGaz)
  const countyNames = parseGazetteerCounties(countyGaz)
  const hospitals = parseHospitalCsv(hospitalFile.text)
  let places = apiKey ? await fetchAcsHealthApi(year, apiKey, 'place') : []
  let counties = apiKey ? await fetchAcsCountyHealthApi(year, apiKey, countyNames) : []
  if (places.length === 0 || counties.length === 0) {
    const summary = await fetchAcsSummaryHealth(year, countyNames)
    if (places.length === 0) places = summary.places
    if (counties.length === 0) counties = summary.counties
  }
  return {
    places,
    counties,
    hospitals,
    coords,
    hospitalVintage: hospitalFile.vintage,
  }
}

async function fetchHospitalCsv(): Promise<{ text: string; vintage: string | null }> {
  const urls = [...(await findChhsHospitalUrls()), ...CHHS_HOSPITAL_FALLBACKS]
  for (const url of urls) {
    try {
      const text = await getText(url)
      if (text.includes('FACILITY_NAME') && text.includes('LICENSE_CATEGORY_DESC')) {
        return { text, vintage: hospitalVintageFromUrl(url) }
      }
    } catch {
      // try the next published listing
    }
  }
  return { text: '', vintage: null }
}

async function findChhsHospitalUrls(): Promise<string[]> {
  try {
    const payload = await getJson<{
      result?: { resources?: Array<{ format?: string; name?: string; url?: string }> }
    }>(CHHS_PACKAGE)
    return (payload.result?.resources ?? [])
      .filter(
        (item) =>
          (item.format ?? '').toUpperCase() === 'CSV' &&
          /facility listing/i.test(item.name ?? '') &&
          !/dictionary/i.test(item.name ?? ''),
      )
      .map((item) => item.url)
      .filter((url): url is string => Boolean(url))
  } catch {
    return []
  }
}

function hospitalVintageFromUrl(url: string): string {
  const file = url.split('/').pop() ?? url
  if (/20260901|2026-09-01/i.test(file)) return 'HCAI licensed hospitals, September 2026'
  const month = file.match(/(january|february|march|april|may|june|july|august|september|october|november|december)-(\d{1,2})-(\d{4})/i)
  if (month) {
    const label = month[1][0].toUpperCase() + month[1].slice(1).toLowerCase()
    return `HCAI licensed hospitals, ${label} ${month[3]}`
  }
  return 'HCAI licensed hospitals'
}

async function fetchAcsHealthApi(year: number, apiKey: string, geo: 'place'): Promise<AcsHealthRow[]> {
  const detail = new URLSearchParams({
    get: 'NAME,B19013_001E,C24010_017E,C24010_053E',
    for: `${geo}:*`,
    in: 'state:06',
    key: apiKey,
  })
  const subject = new URLSearchParams({
    get: 'NAME,S2701_C01_001E,S2701_C04_001E',
    for: `${geo}:*`,
    in: 'state:06',
    key: apiKey,
  })
  try {
    const [detailTable, subjectTable] = await Promise.all([
      getJson<string[][]>(`https://api.census.gov/data/${year}/acs/acs5?${detail}`),
      getJson<string[][]>(`https://api.census.gov/data/${year}/acs/acs5/subject?${subject}`),
    ])
    return parseCensusHealthTables(detailTable, subjectTable)
  } catch {
    return []
  }
}

async function fetchAcsCountyHealthApi(
  year: number,
  apiKey: string,
  countyNames: Map<string, string>,
): Promise<CountyHealthRow[]> {
  const detail = new URLSearchParams({
    get: 'NAME,B01003_001E,B19013_001E',
    for: 'county:*',
    in: 'state:06',
    key: apiKey,
  })
  const subject = new URLSearchParams({
    get: 'NAME,S2701_C01_001E,S2701_C04_001E',
    for: 'county:*',
    in: 'state:06',
    key: apiKey,
  })
  try {
    const [detailTable, subjectTable] = await Promise.all([
      getJson<string[][]>(`https://api.census.gov/data/${year}/acs/acs5?${detail}`),
      getJson<string[][]>(`https://api.census.gov/data/${year}/acs/acs5/subject?${subject}`),
    ])
    return parseCensusCountyHealthTables(detailTable, subjectTable, countyNames)
  } catch {
    return []
  }
}

export function parseCensusHealthTables(detail: string[][], subject: string[][]): AcsHealthRow[] {
  if (detail.length < 2) return []
  const dHeader = detail[0]
  const nameIdx = dHeader.indexOf('NAME')
  const incomeIdx = dHeader.findIndex((col) => col.startsWith('B19013_001'))
  const maleIdx = dHeader.findIndex((col) => col.startsWith('C24010_017'))
  const femaleIdx = dHeader.findIndex((col) => col.startsWith('C24010_053'))
  const uninsuredByName = indexSubjectUninsured(subject)
  const rows: AcsHealthRow[] = []
  for (const line of detail.slice(1)) {
    const label = line[nameIdx] ?? ''
    if (!label || /CDP/i.test(label)) continue
    const male = parseMoney(line[maleIdx])
    const female = parseMoney(line[femaleIdx])
    rows.push({
      nameKey: censusPlaceToCityName(label),
      medianIncome: parseMoney(line[incomeIdx]),
      uninsuredPct: uninsuredByName.get(label) ?? null,
      practitioners: male === null || female === null ? null : male + female,
    })
  }
  return rows
}

function indexSubjectUninsured(table: string[][]): Map<string, number> {
  const map = new Map<string, number>()
  if (table.length < 2) return map
  const header = table[0]
  const nameIdx = header.indexOf('NAME')
  const totalIdx = header.findIndex((col) => col.startsWith('S2701_C01_001'))
  const uninsuredIdx = header.findIndex((col) => col.startsWith('S2701_C04_001'))
  if (nameIdx < 0 || totalIdx < 0 || uninsuredIdx < 0) return map
  for (const line of table.slice(1)) {
    const total = parseMoney(line[totalIdx])
    const uninsured = parseMoney(line[uninsuredIdx])
    if (total === null || !(total > 0) || uninsured === null) continue
    map.set(line[nameIdx] ?? '', (100 * uninsured) / total)
  }
  return map
}

function parseCensusCountyHealthTables(
  detail: string[][],
  subject: string[][],
  countyNames: Map<string, string>,
): CountyHealthRow[] {
  if (detail.length < 2) return []
  const header = detail[0]
  const nameIdx = header.indexOf('NAME')
  const popIdx = header.findIndex((col) => col.startsWith('B01003_001'))
  const incomeIdx = header.findIndex((col) => col.startsWith('B19013_001'))
  const countyIdx = header.indexOf('county')
  const uninsuredByName = indexSubjectUninsured(subject)
  const rows: CountyHealthRow[] = []
  for (const line of detail.slice(1)) {
    const geoid = `06${line[countyIdx] ?? ''}`
    const county = countyNames.get(geoid) ?? (line[nameIdx] ?? '').replace(/ County, California$/i, '')
    if (!county) continue
    rows.push({
      county,
      population: parseMoney(line[popIdx]),
      medianIncome: parseMoney(line[incomeIdx]),
      uninsuredPct: uninsuredByName.get(line[nameIdx] ?? '') ?? null,
    })
  }
  return rows
}

async function fetchAcsSummaryHealth(
  year: number,
  countyNames: Map<string, string>,
): Promise<{ places: AcsHealthRow[]; counties: CountyHealthRow[] }> {
  const [placesText, incomeText, insuranceText, occText, popText] = await Promise.all([
    getText(GAZETTEER),
    getText(`${ACS_SF}/data/5YRData/acsdt5y${year}-b19013.dat`),
    getText(`${ACS_SF}/data/5YRData/acsdt5y${year}-b27001.dat`),
    getText(`${ACS_SF}/data/5YRData/acsdt5y${year}-c24010.dat`).catch(() => ''),
    getText(`${ACS_SF}/data/5YRData/acsdt5y${year}-b01003.dat`),
  ])
  const placeNames = parseGazetteerPlaces(placesText)
  const placeIncome = parseAcsEstimateFile(incomeText, '1600000US06')
  const placeIns = parseAcsColumns(insuranceText, '1600000US06', b27001UninsuredColumns())
  const placeOcc = occText
    ? parseAcsColumns(occText, '1600000US06', {
        male: ['C24010_E017', 'C24010_017E'],
        female: ['C24010_E053', 'C24010_053E'],
      })
    : new Map()
  const places: AcsHealthRow[] = []
  for (const [geoid, label] of placeNames) {
    const geoId = `1600000US${geoid}`
    if (/CDP/i.test(label)) continue
    places.push({
      nameKey: censusPlaceToCityName(label),
      medianIncome: placeIncome.get(geoId) ?? null,
      uninsuredPct: uninsuredPctFromB27001(placeIns.get(geoId)),
      practitioners: practitionersFromC24010(placeOcc.get(geoId)),
    })
  }

  const countyIncome = parseAcsEstimateFile(incomeText, '0500000US06')
  const countyIns = parseAcsColumns(insuranceText, '0500000US06', b27001UninsuredColumns())
  const countyPop = parseAcsEstimateFile(popText, '0500000US06')
  const counties: CountyHealthRow[] = []
  for (const [geoid, county] of countyNames) {
    const geoId = `0500000US${geoid}`
    counties.push({
      county,
      population: countyPop.get(geoId) ?? null,
      medianIncome: countyIncome.get(geoId) ?? null,
      uninsuredPct: uninsuredPctFromB27001(countyIns.get(geoId)),
    })
  }
  return { places, counties }
}

export function parseGazetteerPlaces(text: string): Map<string, string> {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim())
  if (lines.length < 2) return new Map()
  const header = lines[0].split('\t').map((col) => col.trim().toLowerCase())
  const geoIdx = header.findIndex((col) => col === 'geoid')
  const nameIdx = header.findIndex((col) => col === 'name')
  const map = new Map<string, string>()
  if (geoIdx < 0 || nameIdx < 0) return map
  for (const line of lines.slice(1)) {
    const cols = line.split('\t')
    const geoid = cols[geoIdx]?.trim()
    const name = cols[nameIdx]?.trim()
    if (geoid && name) map.set(geoid, `${name}, California`)
  }
  return map
}

export function parseAcsEstimateFile(text: string, geoPrefix: string): Map<string, number> {
  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  const map = new Map<string, number>()
  if (lines.length < 2) return map
  const header = lines[0].split('|')
  const geoIdx = header.indexOf('GEO_ID')
  const valueIdx = header.findIndex((col) => /_E001$|_001E$/.test(col))
  if (geoIdx < 0 || valueIdx < 0) return map
  for (const line of lines.slice(1)) {
    if (!line.includes(geoPrefix)) continue
    const cols = line.split('|')
    const geoId = cols[geoIdx]
    if (!geoId?.startsWith(geoPrefix)) continue
    const value = parseMoney(cols[valueIdx])
    if (value !== null) map.set(geoId, value)
  }
  return map
}

export function parseAcsColumns(
  text: string,
  geoPrefix: string,
  columns: Record<string, string[]>,
): Map<string, Record<string, number | null>> {
  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  const map = new Map<string, Record<string, number | null>>()
  if (lines.length < 2) return map
  const header = lines[0].split('|')
  const geoIdx = header.indexOf('GEO_ID')
  if (geoIdx < 0) return map
  const indexes: Record<string, number> = {}
  for (const [key, names] of Object.entries(columns)) {
    indexes[key] = names.map((name) => header.indexOf(name)).find((idx) => idx >= 0) ?? -1
  }
  for (const line of lines.slice(1)) {
    if (!line.includes(geoPrefix)) continue
    const cols = line.split('|')
    const geoId = cols[geoIdx]
    if (!geoId?.startsWith(geoPrefix)) continue
    const row: Record<string, number | null> = {}
    for (const [key, idx] of Object.entries(indexes)) {
      row[key] = idx >= 0 ? parseMoney(cols[idx]) : null
    }
    map.set(geoId, row)
  }
  return map
}

export async function fetchCrime(): Promise<{ rows: CrimeRow[]; year: number | null }> {
  const csv = await downloadCrimeCsv()
  if (!csv) return { rows: [], year: null }
  const rows = parseCrimeCsv(csv)
  const year = rows.reduce((max, row) => Math.max(max, row.year), 0)
  return { rows, year: year || null }
}

async function downloadCrimeCsv(): Promise<string | null> {
  const catalog = await getText('https://openjustice.doj.ca.gov/data')
  const fromPage = findCrimeCsvUrl(catalog)
  const fromApi = await findOpenJusticeCrimeCsvUrl()
  const candidates = [
    fromApi,
    fromPage,
    'https://data-openjustice.doj.ca.gov/sites/default/files/dataset/2026-07/Crimes_and_Clearances_with_Arson-1985-2025.csv',
    'https://openjustice.doj.ca.gov/downloads/Crimes_and_Clearances_with_Arson-1985-2024.csv',
    'https://data-openjustice.doj.ca.gov/sites/default/files/dataset/2025-07/Crimes_and_Clearances.csv',
    'https://data-openjustice.doj.ca.gov/sites/default/files/dataset/2024-07/Crimes_and_Clearances.csv',
  ].filter((item): item is string => Boolean(item))

  for (const url of candidates) {
    try {
      const text = await getText(url)
      if (text.includes('Violent') || text.includes('NCIC')) return text
    } catch {
      // try the next published filename
    }
  }
  return null
}

export async function findOpenJusticeCrimeCsvUrl(): Promise<string | null> {
  try {
    const payload = await getJson<{
      included?: Array<{ attributes?: { filename?: string; uri?: { url?: string } } }>
    }>(
      'https://data-openjustice.doj.ca.gov/jsonapi/node/dataset?filter[title][value]=Crimes and Clearances (including Arson)&include=field_source',
    )
    for (const item of payload.included ?? []) {
      const name = item.attributes?.filename ?? ''
      const url = item.attributes?.uri?.url
      if (!url || !/crime/i.test(name) || /month/i.test(name) || !name.endsWith('.csv')) continue
      return new URL(url, 'https://data-openjustice.doj.ca.gov/').href
    }
  } catch {
    return null
  }
  return null
}

export function findCrimeCsvUrl(html: string): string | null {
  const matches = html.matchAll(/https?:\/\/[^"' <]+\.csv/gi)
  for (const match of matches) {
    const url = match[0]
    if (/crime/i.test(url) && /clear/i.test(url) && !/monthly/i.test(url)) {
      return url
    }
  }
  const relative = html.match(/href="([^"]*Crime[^"]*Clear[^"]*\.csv)"/i)
  if (relative?.[1]) {
    return new URL(relative[1], 'https://openjustice.doj.ca.gov/').href
  }
  return null
}

export function parseCensusTable(table: string[][]): HousingRow[] {
  if (table.length < 2) return []
  const header = table[0]
  const nameIdx = header.indexOf('NAME')
  const valueIdx = header.findIndex((col) => col.startsWith('B25077'))
  const rentIdx = header.findIndex((col) => col.startsWith('B25064'))
  const rows: HousingRow[] = []
  for (const line of table.slice(1)) {
    const label = line[nameIdx] ?? ''
    if (!label || /CDP/i.test(label)) continue
    rows.push({
      nameKey: censusPlaceToCityName(label),
      medianHomeValue: parseMoney(line[valueIdx]),
      medianRent: parseMoney(line[rentIdx]),
    })
  }
  return rows
}

export function parseCensusRaceTable(table: string[][]): RaceRow[] {
  if (table.length < 2) return []
  const header = table[0]
  const nameIdx = header.indexOf('NAME')
  const totalIdx = header.findIndex((col) => col.startsWith('B03002_001'))
  const whiteIdx = header.findIndex((col) => col.startsWith('B03002_003'))
  const blackIdx = header.findIndex((col) => col.startsWith('B03002_004'))
  const asianIdx = header.findIndex((col) => col.startsWith('B03002_006'))
  const hispanicIdx = header.findIndex((col) => col.startsWith('B03002_012'))
  if (nameIdx < 0 || totalIdx < 0 || whiteIdx < 0 || blackIdx < 0 || asianIdx < 0 || hispanicIdx < 0) {
    return []
  }
  const rows: RaceRow[] = []
  for (const line of table.slice(1)) {
    const label = line[nameIdx] ?? ''
    if (!label || /CDP/i.test(label)) continue
    const shares = raceShares(
      parseMoney(line[totalIdx]),
      parseMoney(line[whiteIdx]),
      parseMoney(line[blackIdx]),
      parseMoney(line[asianIdx]),
      parseMoney(line[hispanicIdx]),
    )
    rows.push({
      nameKey: censusPlaceToCityName(label),
      hispanicPct: shares?.hispanicPct ?? null,
      whiteNonHispanicPct: shares?.whiteNonHispanicPct ?? null,
      blackNonHispanicPct: shares?.blackNonHispanicPct ?? null,
      asianNonHispanicPct: shares?.asianNonHispanicPct ?? null,
      otherPct: shares?.otherPct ?? null,
    })
  }
  return rows
}

export function parseCrimeCsv(text: string): CrimeRow[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim())
  if (lines.length < 2) return []
  const header = splitCsvLine(lines[0]).map((col) => col.trim())
  const yearIdx = findCol(header, ['year'])
  const countyIdx = findCol(header, ['county'])
  const agencyIdx = findCol(header, ['nciccode', 'ncic', 'agency'])
  const violentIdx = findCol(header, ['violent_sum', 'violent'])
  const propertyIdx = findCol(header, ['property_sum', 'property'])
  const violentClrIdx = findCol(header, ['violentclrsum', 'violentclr'])
  const propertyClrIdx = findCol(header, ['propertyclrsum', 'propertyclr'])
  if (yearIdx < 0 || agencyIdx < 0 || violentIdx < 0 || propertyIdx < 0) return []

  const rows: CrimeRow[] = []
  const limit = Math.min(lines.length, 200_000)
  for (let i = 1; i < limit; i += 1) {
    const cols = splitCsvLine(lines[i])
    const year = Number(cols[yearIdx])
    const violent = parseMoney(cols[violentIdx])
    const property = parseMoney(cols[propertyIdx])
    if (!Number.isFinite(year) || violent === null || property === null) continue
    rows.push({
      year,
      county: countyIdx >= 0 ? cols[countyIdx] ?? '' : '',
      agency: cols[agencyIdx] ?? '',
      violent,
      property,
      violentCleared: violentClrIdx >= 0 ? (parseMoney(cols[violentClrIdx]) ?? 0) : null,
      propertyCleared: propertyClrIdx >= 0 ? (parseMoney(cols[propertyClrIdx]) ?? 0) : null,
    })
  }
  return rows
}

export async function fetchPersonnel(): Promise<{ rows: PersonnelRow[]; year: number | null }> {
  const [csv, mapping] = await Promise.all([downloadPersonnelCsv(), downloadNcicMapping()])
  if (!csv || mapping.size === 0) return { rows: [], year: null }
  const rows = parsePersonnelCsv(csv, mapping)
  const year = rows.reduce((max, row) => Math.max(max, row.year), 0)
  return { rows, year: year || null }
}

async function downloadPersonnelCsv(): Promise<string | null> {
  const fromApi = await findOpenJusticeDatasetFile('Law Enforcement Personnel', (name) => {
    return /personnel/i.test(name) && name.endsWith('.csv') && !/criminal justice/i.test(name)
  })
  const candidates = [
    fromApi,
    'https://data-openjustice.doj.ca.gov/sites/default/files/dataset/2026-07/Law_Enforcement_Personnel_1991-2025.csv',
  ].filter((item): item is string => Boolean(item))
  for (const url of candidates) {
    try {
      const text = await getText(url)
      if (text.includes('FUNDED_NON_JAIL_SWORN_TOTAL') || text.includes('NCIC_AGENCY')) return text
    } catch {
      // try the next published filename
    }
  }
  return null
}

async function downloadNcicMapping(): Promise<Map<string, string>> {
  const fromApi = await findOpenJusticeDatasetFile('Agency Name - Jurisdiction Listing', (name) => {
    return /ncic/i.test(name) && name.endsWith('.xlsx')
  })
  const candidates = [
    fromApi,
    'https://data-openjustice.doj.ca.gov/sites/default/files/dataset/2026-07/NCIC%20Code%20Jurisdiction%20List_06182026.xlsx',
  ].filter((item): item is string => Boolean(item))
  for (const url of candidates) {
    try {
      const bytes = await getBytes(url)
      const map = parseNcicMappingTable(await parseXlsxSheet(bytes))
      if (map.size > 0) return map
    } catch {
      // try the next published filename
    }
  }
  return new Map()
}

export async function findOpenJusticeDatasetFile(
  title: string,
  test: (filename: string) => boolean,
): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      'filter[title][value]': title,
      include: 'field_source',
    })
    const payload = await getJson<{
      included?: Array<{ attributes?: { filename?: string; uri?: { url?: string } } }>
    }>(`https://data-openjustice.doj.ca.gov/jsonapi/node/dataset?${params}`)
    for (const item of payload.included ?? []) {
      const name = item.attributes?.filename ?? ''
      const url = item.attributes?.uri?.url
      if (!url || !test(name)) continue
      return new URL(url, 'https://data-openjustice.doj.ca.gov/').href
    }
  } catch {
    return null
  }
  return null
}

export function parsePersonnelCsv(text: string, ncicToAgency: Map<string, string>): PersonnelRow[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim())
  if (lines.length < 2) return []
  const header = splitCsvLine(lines[0]).map((col) => col.trim())
  const yearIdx = findCol(header, ['year'])
  const ncicIdx = findCol(header, ['ncicagency', 'ncic'])
  const swornIdx = findCol(header, ['fundednonjailsworntotal'])
  if (yearIdx < 0 || ncicIdx < 0 || swornIdx < 0) return []

  const latest = latestYear(lines, yearIdx)
  const rows: PersonnelRow[] = []
  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitCsvLine(lines[i])
    const year = Number(cols[yearIdx])
    if (year !== latest) continue
    const sworn = parseMoney(cols[swornIdx])
    if (!Number.isFinite(year) || sworn === null) continue
    const agency = ncicToAgency.get(normalizeNcic(cols[ncicIdx] ?? ''))
    if (!agency) continue
    rows.push({ year, agency, sworn })
  }
  return rows
}

export function parseNcicMappingTable(table: string[][], year = 2025): Map<string, string> {
  if (table.length < 2) return new Map()
  const header = table[0].map((col) => col.toLowerCase().replace(/[^a-z0-9]/g, ''))
  const codeIdx = header.findIndex((col) => col === 'code' || col === 'ncic' || col === 'nciccode')
  const agencyIdx = header.findIndex((col) => col === 'agency' || col === 'agencyname')
  const endIdx = header.findIndex((col) => col === 'end')
  if (codeIdx < 0 || agencyIdx < 0) return new Map()

  const map = new Map<string, string>()
  for (const row of table.slice(1)) {
    const code = normalizeNcic(row[codeIdx] ?? '')
    const agency = (row[agencyIdx] ?? '').trim()
    if (!/^[0-9a-z]{4}$/.test(code) || !agency) continue
    if (endIdx >= 0 && endedBefore(row[endIdx] ?? '', year)) continue
    map.set(code, agency)
  }
  return map
}

function normalizeNcic(value: string): string {
  return value.trim().toLowerCase()
}

function endedBefore(end: string, year: number): boolean {
  const match = end.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!match) return false
  return Number(match[3]) < year
}

function latestYear(lines: string[], yearIdx: number): number {
  let max = 0
  for (let i = 1; i < lines.length; i += 1) {
    const year = Number(splitCsvLine(lines[i])[yearIdx])
    if (Number.isFinite(year) && year > max) max = year
  }
  return max
}

function findCol(header: string[], names: string[]): number {
  const normalized = header.map((col) => col.toLowerCase().replace(/[^a-z0-9]/g, ''))
  for (const name of names) {
    const idx = normalized.indexOf(name.replace(/[^a-z0-9]/g, ''))
    if (idx >= 0) return idx
  }
  return -1
}

export function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        quoted = !quoted
      }
      continue
    }
    if (ch === ',' && !quoted) {
      out.push(current)
      current = ''
      continue
    }
    current += ch
  }
  out.push(current)
  return out
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status}`)
  }
  return (await response.json()) as T
}

async function getText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { Accept: 'text/html,text/csv,text/plain' } })
  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status}`)
  }
  return response.text()
}

async function getBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status}`)
  }
  return new Uint8Array(await response.arrayBuffer())
}
