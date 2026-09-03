import {
  clearancePct,
  crimePerThousand,
  growthPct,
  isEnterpriseHeavy,
  isIndustrialOutlier,
  parseMoney,
  perResident,
  ratePerThousand,
  taxTake,
} from './metrics.ts'
import { censusPlaceToCityName, dojAgencyToCityName, slugify } from './names.ts'
import { classifyPoliceModel, selectPeers } from './peers.ts'
import { buildAllPosts } from './posts.ts'
import { applyHealthcare, emptyHealthcareFields, type HealthcareBundle } from './healthcare.ts'
import { regionForCounty } from './regions.ts'
import type { City, Dataset, PeerSet, Post, SourceVintage } from './types.ts'

export type ScoTotalRow = {
  entity_name: string
  county?: string
  fiscal_year: string | number
  total_expenditures?: string | number
  estimated_population?: string | number
  expenditures_per_capita?: string | number
}

export type ScoLineRow = {
  entity_name: string
  county?: string
  fiscal_year: string | number
  form_table?: string
  category?: string
  subcategory_1?: string
  line_description?: string
  value?: string | number
  estimated_population?: string | number
}

export type HousingRow = {
  nameKey: string
  medianHomeValue: number | null
  medianRent: number | null
}

export type RaceRow = {
  nameKey: string
  hispanicPct: number | null
  whiteNonHispanicPct: number | null
  blackNonHispanicPct: number | null
  asianNonHispanicPct: number | null
  otherPct: number | null
}

export type CrimeRow = {
  year: number
  county: string
  agency: string
  violent: number
  property: number
  violentCleared: number | null
  propertyCleared: number | null
}

export type PersonnelRow = {
  year: number
  agency: string
  sworn: number
}

export type StaffingFields = Pick<
  City,
  | 'swornOfficers'
  | 'officersPer1000'
  | 'violentCleared'
  | 'propertyCleared'
  | 'violentClearancePct'
  | 'propertyClearancePct'
  | 'staffingAvailable'
>

export function emptyStaffingFields(): StaffingFields {
  return {
    swornOfficers: null,
    officersPer1000: null,
    violentCleared: null,
    propertyCleared: null,
    violentClearancePct: null,
    propertyClearancePct: null,
    staffingAvailable: false,
  }
}

export type RawInputs = {
  fiscalYear: number
  priorYear: number
  totalsCurrent: ScoTotalRow[]
  totalsPrior: ScoTotalRow[]
  spendLines: ScoLineRow[]
  taxLines: ScoLineRow[]
  housing: HousingRow[]
  race: RaceRow[]
  crime: CrimeRow[]
  personnel?: PersonnelRow[]
  acsVintage: string | null
  crimeYear: number | null
  personnelYear?: number | null
  healthcare?: HealthcareBundle
}

const PROPERTY_TAX_FORMS = new Set([
  'GENREV_SEC_UNSEC_PROPTAX',
  'GENREV_PROPTAX_INLIEU',
  'GENREV_SUPP_SEC_UNSEC_PROPTAX',
])

const SALES_TAX_FORMS = new Set(['GENREV_SALE_USE_TAX', 'FUNC_SALE_USE_TAX'])

export function buildDataset(raw: RawInputs): Dataset {
  const housingByName = new Map(raw.housing.map((row) => [row.nameKey, row]))
  const raceByName = new Map(raw.race.map((row) => [row.nameKey, row]))
  const crimeByName = indexCrime(raw.crime, raw.crimeYear)

  const cities = raw.totalsCurrent
    .map((row) => assembleCity(row, raw, housingByName, raceByName, crimeByName))
    .filter((city): city is City => city !== null)
    .sort((a, b) => a.name.localeCompare(b.name))

  resolveDuplicateSlugs(cities)
  if (raw.healthcare) applyHealthcare(cities, raw.healthcare)
  if (raw.personnel) applyStaffing(cities, raw.personnel)

  const { posts } = assignPeersAndPosts(cities)
  const sources: SourceVintage = {
    scoFiscalYear: raw.fiscalYear,
    scoPopulationPriorYear: raw.priorYear,
    acsVintage: raw.acsVintage,
    hospitalVintage: raw.healthcare?.hospitalVintage ?? null,
    crimeYear: raw.crimeYear,
    personnelYear: raw.personnelYear ?? null,
    generatedAt: new Date().toISOString(),
  }
  return { cities, posts, sources }
}

export function applyRace(cities: City[], rows: RaceRow[]): void {
  const raceByName = new Map(rows.map((row) => [row.nameKey, row]))
  for (const city of cities) {
    const nameKey = city.slug.replaceAll('-', ' ')
    const race = raceByName.get(nameKey) ?? raceByName.get(censusPlaceToCityName(city.name))
    city.hispanicPct = race?.hispanicPct ?? null
    city.whiteNonHispanicPct = race?.whiteNonHispanicPct ?? null
    city.blackNonHispanicPct = race?.blackNonHispanicPct ?? null
    city.asianNonHispanicPct = race?.asianNonHispanicPct ?? null
    city.otherPct = race?.otherPct ?? null
    city.raceAvailable = race?.hispanicPct !== null && race?.hispanicPct !== undefined
  }
}

export function applyCrime(cities: City[], rows: CrimeRow[], year: number | null): void {
  const crimeByName = indexCrime(rows, year)
  for (const city of cities) {
    const nameKey = city.slug.replaceAll('-', ' ')
    const crime = crimeByName.get(nameKey)
    city.violentCrime = crime?.violent ?? null
    city.propertyCrime = crime?.property ?? null
    city.crimePer1000 = crime ? crimePerThousand(crime.violent, crime.property, city.population) : null
    city.crimeAvailable = Boolean(crime)
    city.violentCleared = crime?.violentCleared ?? null
    city.propertyCleared = crime?.propertyCleared ?? null
    city.violentClearancePct = clearancePct(crime?.violentCleared ?? null, crime?.violent ?? null)
    city.propertyClearancePct = clearancePct(crime?.propertyCleared ?? null, crime?.property ?? null)
  }
}

export function applyStaffing(cities: City[], rows: PersonnelRow[]): void {
  const byName = indexPersonnel(rows)
  for (const city of cities) {
    const nameKey = city.slug.replaceAll('-', ' ')
    const staff = byName.get(nameKey)
    city.swornOfficers = staff?.sworn ?? null
    city.officersPer1000 = staff ? ratePerThousand(staff.sworn, city.population) : null
    city.staffingAvailable = Boolean(staff)
  }
}

export function applyUtilities(cities: City[], spendLines: ScoLineRow[]): void {
  const byName = new Map<string, ScoLineRow[]>()
  for (const line of spendLines) {
    const name = line.entity_name ?? ''
    const list = byName.get(name)
    if (list) list.push(line)
    else byName.set(name, [line])
  }
  for (const city of cities) {
    const spend = sumUtilitySpend(byName.get(city.name) ?? [])
    city.utilitySpend = spend
    city.utilityPerResident = spend === null ? null : perResident(spend, city.population)
  }
}

export function assignPeersAndPosts(cities: City[]): { posts: Post[] } {
  const peerSets = new Map<string, PeerSet>()
  for (const city of cities) {
    peerSets.set(city.slug, selectPeers(city, cities))
  }
  for (const city of cities) {
    const peers = peerSets.get(city.slug)
    if (!peers) continue
    const peerCities = peers.slugs
      .map((slug) => cities.find((item) => item.slug === slug))
      .filter((item): item is City => item !== undefined)
    city.policeModel = classifyPoliceModel(city, peerCities)
  }
  return { posts: buildAllPosts(cities, peerSets) }
}

function assembleCity(
  row: ScoTotalRow,
  raw: RawInputs,
  housingByName: Map<string, HousingRow>,
  raceByName: Map<string, RaceRow>,
  crimeByName: Map<string, CrimeRow>,
): City | null {
  const name = row.entity_name?.trim()
  if (!name) return null
  const lines = raw.spendLines.filter((line) => line.entity_name === name)
  const taxes = raw.taxLines.filter((line) => line.entity_name === name)
  const county = (row.county ?? lines[0]?.county ?? taxes[0]?.county ?? '').trim()
  const population = parseMoney(row.estimated_population)
  const totalSpend = parseMoney(row.total_expenditures)
  if (population === null || population <= 0 || totalSpend === null) return null

  const slug = slugify(name)
  const nameKey = slugify(name).replaceAll('-', ' ')
  const policeSpend = sumForms(lines, new Set(['CURR_EXP_POLICE']))
  const parksSpend = sumForms(lines, new Set(['CURR_EXP_PARK_REC']))
  const utilitySpend = sumUtilitySpend(lines)
  const governmentalCurrentSpend = sumGovernmentalCurrent(lines)
  const propertyTax = sumForms(taxes, PROPERTY_TAX_FORMS)
  const salesTax = sumForms(taxes, SALES_TAX_FORMS)
  const taxTotal = taxTake(propertyTax, salesTax)
  const prior = raw.totalsPrior.find((item) => item.entity_name === name)
  const populationPrior = parseMoney(prior?.estimated_population)
  const housing = housingByName.get(nameKey) ?? housingByName.get(censusPlaceToCityName(name))
  const race = raceByName.get(nameKey) ?? raceByName.get(censusPlaceToCityName(name))
  const crime = crimeByName.get(nameKey)

  const totalSpendPerResident = perResident(totalSpend, population)
  if (totalSpendPerResident === null) return null

  return {
    slug,
    name,
    county,
    region: regionForCounty(county),
    fiscalYear: raw.fiscalYear,
    population,
    populationPrior,
    populationGrowthPct: populationPrior === null ? null : growthPct(population, populationPrior),
    totalSpend,
    totalSpendPerResident,
    governmentalCurrentSpend,
    governmentalCurrentPerResident:
      governmentalCurrentSpend === null ? null : perResident(governmentalCurrentSpend, population),
    policeSpend,
    policePerResident: policeSpend === null ? null : perResident(policeSpend, population),
    parksSpend,
    parksPerResident: parksSpend === null ? null : perResident(parksSpend, population),
    utilitySpend,
    utilityPerResident: utilitySpend === null ? null : perResident(utilitySpend, population),
    propertyTax,
    salesTax,
    taxPerResident: taxTotal === null ? null : perResident(taxTotal, population),
    medianHomeValue: housing?.medianHomeValue ?? null,
    medianRent: housing?.medianRent ?? null,
    hispanicPct: race?.hispanicPct ?? null,
    whiteNonHispanicPct: race?.whiteNonHispanicPct ?? null,
    blackNonHispanicPct: race?.blackNonHispanicPct ?? null,
    asianNonHispanicPct: race?.asianNonHispanicPct ?? null,
    otherPct: race?.otherPct ?? null,
    raceAvailable: race?.hispanicPct !== null && race?.hispanicPct !== undefined,
    ...emptyHealthcareFields(),
    violentCrime: crime?.violent ?? null,
    propertyCrime: crime?.property ?? null,
    crimePer1000: crime ? crimePerThousand(crime.violent, crime.property, population) : null,
    crimeAvailable: Boolean(crime),
    ...emptyStaffingFields(),
    violentCleared: crime?.violentCleared ?? null,
    propertyCleared: crime?.propertyCleared ?? null,
    violentClearancePct: clearancePct(crime?.violentCleared ?? null, crime?.violent ?? null),
    propertyClearancePct: clearancePct(crime?.propertyCleared ?? null, crime?.property ?? null),
    policeModel: 'unknown',
    enterpriseHeavy: isEnterpriseHeavy(totalSpend, governmentalCurrentSpend),
    industrialOutlier: isIndustrialOutlier(name, population),
  }
}

const UTILITY_GOV_FORMS = new Set([
  'CURR_EXP_ELECTRIC',
  'CURR_EXP_WATER',
  'CURR_EXP_GAS',
  'CURR_EXP_SEWERS',
  'CURR_EXP_SOLID_WASTE',
  'CURR_EXP_PUB_UTILITIES',
])

export function isUtilityLine(row: ScoLineRow): boolean {
  if (row.form_table && UTILITY_GOV_FORMS.has(row.form_table)) return true
  if ((row.subcategory_1 ?? '') !== 'Operating Expenses') return false
  if (row.form_table === 'DEPR_AMORT_EXP') return false
  const category = (row.category ?? '').toLowerCase()
  return (
    category.includes('electric enterprise') ||
    category.includes('water enterprise') ||
    (category.includes('gas') && category.includes('enterprise')) ||
    category.includes('sewer enterprise') ||
    category.includes('solid waste enterprise')
  )
}

function sumUtilitySpend(rows: ScoLineRow[]): number | null {
  let total = 0
  let found = false
  for (const row of rows) {
    if (!isUtilityLine(row)) continue
    const value = parseMoney(row.value)
    if (value === null) continue
    total += value
    found = true
  }
  return found ? total : null
}

function sumForms(rows: ScoLineRow[], forms: Set<string>): number | null {
  let total = 0
  let found = false
  for (const row of rows) {
    if (!row.form_table || !forms.has(row.form_table)) continue
    const value = parseMoney(row.value)
    if (value === null) continue
    total += value
    found = true
  }
  return found ? total : null
}

function sumGovernmentalCurrent(rows: ScoLineRow[]): number | null {
  let total = 0
  let found = false
  for (const row of rows) {
    if (!isGovernmentalCurrent(row)) continue
    const value = parseMoney(row.value)
    if (value === null) continue
    total += value
    found = true
  }
  return found ? total : null
}

export function isGovernmentalCurrent(row: ScoLineRow): boolean {
  const category = row.category ?? ''
  const sub = row.subcategory_1 ?? ''
  const line = row.line_description ?? ''
  if (category.toLowerCase().includes('enterprise')) return false
  if (sub.toLowerCase() === 'capital outlay') return false
  if (sub.toLowerCase() === 'debt service') return false
  return line.endsWith('_Current Expenditures')
}

function indexCrime(rows: CrimeRow[], year: number | null): Map<string, CrimeRow> {
  const map = new Map<string, CrimeRow>()
  for (const row of rows) {
    if (year !== null && row.year !== year) continue
    const cityName = dojAgencyToCityName(row.agency)
    if (!cityName) continue
    const existing = map.get(cityName)
    if (!existing) {
      map.set(cityName, { ...row, agency: cityName })
      continue
    }
    existing.violent += row.violent
    existing.property += row.property
    existing.violentCleared = addCount(existing.violentCleared, row.violentCleared)
    existing.propertyCleared = addCount(existing.propertyCleared, row.propertyCleared)
  }
  return map
}

function indexPersonnel(rows: PersonnelRow[]): Map<string, PersonnelRow> {
  const map = new Map<string, PersonnelRow>()
  for (const row of rows) {
    const cityName = dojAgencyToCityName(row.agency)
    if (!cityName) continue
    const existing = map.get(cityName)
    if (!existing) {
      map.set(cityName, { ...row, agency: cityName })
      continue
    }
    existing.sworn += row.sworn
  }
  return map
}

function addCount(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null
  return (a ?? 0) + (b ?? 0)
}

function resolveDuplicateSlugs(cities: City[]): void {
  const counts = new Map<string, number>()
  for (const city of cities) {
    counts.set(city.slug, (counts.get(city.slug) ?? 0) + 1)
  }
  for (const city of cities) {
    if ((counts.get(city.slug) ?? 0) > 1) {
      city.slug = `${city.slug}-${slugify(city.county)}`
    }
  }
}
