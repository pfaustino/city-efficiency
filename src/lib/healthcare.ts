import { perResident } from './metrics.ts'
import { censusPlaceToCityName, normalizeName } from './names.ts'
import type { City } from './types.ts'

export type PlaceCoord = {
  lat: number
  lon: number
}

export type HospitalRow = {
  name: string
  cityKey: string
  county: string
  lat: number
  lon: number
  hasEr: boolean
}

export type AcsHealthRow = {
  nameKey: string
  medianIncome: number | null
  uninsuredPct: number | null
  practitioners: number | null
}

export type CountyHealthRow = {
  county: string
  population: number | null
  medianIncome: number | null
  uninsuredPct: number | null
}

export type HealthcareBundle = {
  places: AcsHealthRow[]
  counties: CountyHealthRow[]
  hospitals: HospitalRow[]
  coords: Map<string, PlaceCoord>
  hospitalVintage: string | null
}

export type HealthcareFields = Pick<
  City,
  | 'medianIncome'
  | 'uninsuredPct'
  | 'practitionersPer100k'
  | 'hospitalCount'
  | 'erCount'
  | 'hospitalsPer100k'
  | 'ersPer100k'
  | 'milesToHospital'
  | 'countyHospitalCount'
  | 'countyErCount'
  | 'countyHospitalsPer100k'
  | 'countyUninsuredPct'
  | 'countyMedianIncome'
  | 'healthcareAvailable'
>

const B27001_UNINSURED = [
  '005',
  '008',
  '011',
  '014',
  '017',
  '020',
  '023',
  '026',
  '029',
  '033',
  '036',
  '039',
  '042',
  '045',
  '048',
  '051',
  '054',
  '057',
]

export function emptyHealthcareFields(): HealthcareFields {
  return {
    medianIncome: null,
    uninsuredPct: null,
    practitionersPer100k: null,
    hospitalCount: 0,
    erCount: 0,
    hospitalsPer100k: null,
    ersPer100k: null,
    milesToHospital: null,
    countyHospitalCount: 0,
    countyErCount: 0,
    countyHospitalsPer100k: null,
    countyUninsuredPct: null,
    countyMedianIncome: null,
    healthcareAvailable: false,
  }
}

export function countyKey(name: string): string {
  return name.replace(/\s+county$/i, '').trim()
}

export function ratePer100k(count: number, population: number): number | null {
  const per = perResident(count, population)
  return per === null ? null : per * 100_000
}

export function milesBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthMiles = 3958.8
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * earthMiles * Math.asin(Math.min(1, Math.sqrt(a)))
}

export function parseGazetteerCounties(text: string): Map<string, string> {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim())
  const map = new Map<string, string>()
  if (lines.length < 2) return map
  const header = lines[0].split('\t').map((col) => col.trim().toLowerCase())
  const geoIdx = header.findIndex((col) => col === 'geoid')
  const nameIdx = header.findIndex((col) => col === 'name')
  if (geoIdx < 0 || nameIdx < 0) return map
  for (const line of lines.slice(1)) {
    const cols = line.split('\t')
    const geoid = cols[geoIdx]?.trim()
    const name = cols[nameIdx]?.trim()
    if (geoid && name) map.set(geoid, countyKey(name))
  }
  return map
}

export function parseGazetteerCoords(text: string): Map<string, PlaceCoord> {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim())
  const map = new Map<string, PlaceCoord>()
  if (lines.length < 2) return map
  const header = lines[0].split('\t').map((col) => col.trim().toLowerCase())
  const nameIdx = header.findIndex((col) => col === 'name')
  const latIdx = header.findIndex((col) => col === 'intptlat')
  const lonIdx = header.findIndex((col) => col === 'intptlong')
  if (nameIdx < 0 || latIdx < 0 || lonIdx < 0) return map
  for (const line of lines.slice(1)) {
    const cols = line.split('\t')
    const name = cols[nameIdx]?.trim() ?? ''
    if (!name || /CDP$/i.test(name)) continue
    const lat = Number(cols[latIdx])
    const lon = Number(cols[lonIdx])
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    map.set(censusPlaceToCityName(`${name}, California`), { lat, lon })
  }
  return map
}

export function parseHospitalCsv(text: string): HospitalRow[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim())
  if (lines.length < 2) return []
  const header = splitCsv(lines[0]).map((col) => col.trim().toLowerCase())
  const nameIdx = findCsvCol(header, ['facility_name'])
  const cityIdx = findCsvCol(header, ['dba_city'])
  const countyIdx = findCsvCol(header, ['county_name'])
  const statusIdx = findCsvCol(header, ['facility_status_desc'])
  const levelIdx = findCsvCol(header, ['facility_level_desc'])
  const typeIdx = findCsvCol(header, ['license_type_desc'])
  const categoryIdx = findCsvCol(header, ['license_category_desc'])
  const erIdx = findCsvCol(header, ['er_service_level_desc'])
  const latIdx = findCsvCol(header, ['latitude'])
  const lonIdx = findCsvCol(header, ['longitude'])
  if (cityIdx < 0 || latIdx < 0 || lonIdx < 0) return []

  const rows: HospitalRow[] = []
  for (const line of lines.slice(1)) {
    const cols = splitCsv(line)
    if ((cols[statusIdx] ?? '') !== 'Open') continue
    if ((cols[typeIdx] ?? '') !== 'Hospital') continue
    if ((cols[categoryIdx] ?? '') !== 'General Acute Care Hospital') continue
    if ((cols[levelIdx] ?? '') !== 'Parent Facility') continue
    const lat = Number(cols[latIdx])
    const lon = Number(cols[lonIdx])
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const city = cols[cityIdx] ?? ''
    if (!city) continue
    const er = (cols[erIdx] ?? '').toLowerCase()
    rows.push({
      name: cols[nameIdx] ?? '',
      cityKey: normalizeName(city),
      county: countyKey(cols[countyIdx] ?? ''),
      lat,
      lon,
      hasEr: er.startsWith('emergency'),
    })
  }
  return rows
}

export function b27001UninsuredColumns(): Record<string, string[]> {
  const columns: Record<string, string[]> = {
    total: ['B27001_E001', 'B27001_001E'],
  }
  for (const code of B27001_UNINSURED) {
    columns[`u${code}`] = [`B27001_E${code}`, `B27001_${code}E`]
  }
  return columns
}

export function uninsuredPctFromB27001(row: Record<string, number | null> | undefined): number | null {
  if (!row) return null
  const total = row.total
  if (total === null || total === undefined || !(total > 0)) return null
  let uninsured = 0
  for (const code of B27001_UNINSURED) {
    const value = row[`u${code}`]
    if (value === null || value === undefined) return null
    uninsured += value
  }
  return (100 * uninsured) / total
}

export function practitionersFromC24010(row: Record<string, number | null> | undefined): number | null {
  if (!row) return null
  const male = row.male
  const female = row.female
  if (male === null || female === null || male === undefined || female === undefined) return null
  return male + female
}

export function applyHealthcare(cities: City[], bundle: HealthcareBundle): void {
  const placeByName = new Map(bundle.places.map((row) => [row.nameKey, row]))
  const countyByName = new Map(bundle.counties.map((row) => [countyKey(row.county).toLowerCase(), row]))
  const hospitalsByCity = new Map<string, HospitalRow[]>()
  const hospitalsByCounty = new Map<string, HospitalRow[]>()
  for (const hospital of bundle.hospitals) {
    pushMap(hospitalsByCity, hospital.cityKey, hospital)
    pushMap(hospitalsByCounty, hospital.county.toLowerCase(), hospital)
  }

  for (const city of cities) {
    const nameKey = city.slug.replaceAll('-', ' ')
    const place = placeByName.get(nameKey) ?? placeByName.get(censusPlaceToCityName(city.name))
    const coord = bundle.coords.get(nameKey) ?? bundle.coords.get(censusPlaceToCityName(city.name))
    const inCity = hospitalsByCity.get(nameKey) ?? hospitalsByCity.get(normalizeName(city.name)) ?? []
    const county = countyByName.get(countyKey(city.county).toLowerCase())
    const inCounty = hospitalsByCounty.get(countyKey(city.county).toLowerCase()) ?? []
    const hospitalCount = inCity.length
    const erCount = inCity.filter((item) => item.hasEr).length
    const countyHospitalCount = inCounty.length
    const countyErCount = inCounty.filter((item) => item.hasEr).length
    const practitioners = place?.practitioners ?? null

    city.medianIncome = place?.medianIncome ?? null
    city.uninsuredPct = place?.uninsuredPct ?? null
    city.practitionersPer100k = practitioners === null ? null : ratePer100k(practitioners, city.population)
    city.hospitalCount = hospitalCount
    city.erCount = erCount
    city.hospitalsPer100k = ratePer100k(hospitalCount, city.population)
    city.ersPer100k = ratePer100k(erCount, city.population)
    city.milesToHospital = nearestHospitalMiles(cityPoint(coord, inCity), bundle.hospitals)
    city.countyHospitalCount = countyHospitalCount
    city.countyErCount = countyErCount
    city.countyHospitalsPer100k =
      county?.population === null || county?.population === undefined
        ? null
        : ratePer100k(countyHospitalCount, county.population)
    city.countyUninsuredPct = county?.uninsuredPct ?? null
    city.countyMedianIncome = county?.medianIncome ?? null
    city.healthcareAvailable = city.uninsuredPct !== null || city.milesToHospital !== null
  }
}

function cityPoint(coord: PlaceCoord | undefined, inCity: HospitalRow[]): PlaceCoord | undefined {
  if (inCity.length === 0) return coord
  if (!coord) return meanCoord(inCity)
  const nearestInCity = nearestHospitalMiles(coord, inCity)
  if (nearestInCity !== null && nearestInCity > 10) return meanCoord(inCity)
  return coord
}

function meanCoord(hospitals: HospitalRow[]): PlaceCoord {
  const lat = hospitals.reduce((sum, item) => sum + item.lat, 0) / hospitals.length
  const lon = hospitals.reduce((sum, item) => sum + item.lon, 0) / hospitals.length
  return { lat, lon }
}

export function nearestHospitalMiles(coord: PlaceCoord | undefined, hospitals: HospitalRow[]): number | null {
  if (!coord || hospitals.length === 0) return null
  let nearest = Infinity
  for (const hospital of hospitals) {
    const miles = milesBetween(coord.lat, coord.lon, hospital.lat, hospital.lon)
    if (miles < nearest) nearest = miles
  }
  return Number.isFinite(nearest) ? nearest : null
}

function pushMap<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

function findCsvCol(header: string[], names: string[]): number {
  const normalized = header.map((col) => col.replace(/[^a-z0-9]/g, ''))
  for (const name of names) {
    const idx = normalized.indexOf(name.replace(/[^a-z0-9]/g, ''))
    if (idx >= 0) return idx
  }
  return -1
}

function splitCsv(line: string): string[] {
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
