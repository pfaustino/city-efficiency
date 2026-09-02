import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchCrime, fetchHealthcare, fetchHousing, fetchRace, fetchSpendLines, fetchTaxLines, fetchTotals } from '../src/lib/fetch.ts'
import { applyRace, applyUtilities, buildDataset } from '../src/lib/join.ts'
import { applyHealthcare } from '../src/lib/healthcare.ts'
import type { City, SourceVintage } from '../src/lib/types.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fiscalYear = 2024
const priorYear = 2019

async function main(): Promise<void> {
  if (process.argv.includes('--utilities-only')) {
    await patchUtilities()
    return
  }
  if (process.argv.includes('--race-only')) {
    await patchRace()
    return
  }
  if (process.argv.includes('--healthcare-only')) {
    await patchHealthcare()
    return
  }

  console.log(`Fetching SCO totals for ${fiscalYear} and ${priorYear}…`)
  const [totalsCurrent, totalsPrior] = await Promise.all([
    fetchTotals(fiscalYear),
    fetchTotals(priorYear),
  ])
  console.log(`Totals: ${totalsCurrent.length} current, ${totalsPrior.length} prior`)

  console.log('Fetching SCO spend and tax lines…')
  const [spendLines, taxLines] = await Promise.all([
    fetchSpendLines(fiscalYear),
    fetchTaxLines(fiscalYear),
  ])
  console.log(`Spend lines: ${spendLines.length}; tax lines: ${taxLines.length}`)

  console.log('Fetching Census housing, race, and healthcare…')
  const [housing, race, healthcare] = await Promise.all([
    fetchHousing(process.env.CENSUS_API_KEY),
    fetchRace(process.env.CENSUS_API_KEY),
    fetchHealthcare(process.env.CENSUS_API_KEY),
  ])
  console.log(`Housing rows: ${housing.rows.length} (${housing.vintage ?? 'unavailable'})`)
  console.log(`Race rows: ${race.rows.length} (${race.vintage ?? 'unavailable'})`)
  console.log(`Healthcare places: ${healthcare.places.length}; hospitals: ${healthcare.hospitals.length}`)

  console.log('Fetching OpenJustice crime…')
  const crime = await fetchCrime()
  console.log(`Crime rows: ${crime.rows.length} (year ${crime.year ?? 'unavailable'})`)

  const dataset = buildDataset({
    fiscalYear,
    priorYear,
    totalsCurrent,
    totalsPrior,
    spendLines,
    taxLines,
    housing: housing.rows,
    race: race.rows,
    crime: crime.rows,
    acsVintage: housing.vintage ?? race.vintage,
    crimeYear: crime.year,
    healthcare,
  })

  const dataDir = join(root, 'data')
  mkdirSync(dataDir, { recursive: true })
  writeJson(join(dataDir, 'cities.json'), dataset.cities)
  writeJson(join(dataDir, 'posts.json'), dataset.posts)
  writeJson(join(dataDir, 'sources.json'), dataset.sources)
  console.log(`Wrote ${dataset.cities.length} cities and ${dataset.posts.length} posts`)
}

async function patchUtilities(): Promise<void> {
  const citiesPath = join(root, 'data', 'cities.json')
  const cities = JSON.parse(readFileSync(citiesPath, 'utf8')) as City[]
  console.log(`Fetching SCO utility spend lines for ${fiscalYear}…`)
  const spendLines = await fetchSpendLines(fiscalYear)
  console.log(`Spend lines: ${spendLines.length}`)
  applyUtilities(cities, spendLines)
  writeJson(citiesPath, cities)
  const withUtilities = cities.filter((city) => (city.utilityPerResident ?? 0) > 0).length
  console.log(`Updated utility spending for ${withUtilities} of ${cities.length} cities`)
}

async function patchRace(): Promise<void> {
  const citiesPath = join(root, 'data', 'cities.json')
  const cities = JSON.parse(readFileSync(citiesPath, 'utf8')) as City[]
  console.log('Fetching Census race shares…')
  const race = await fetchRace(process.env.CENSUS_API_KEY)
  console.log(`Race rows: ${race.rows.length} (${race.vintage ?? 'unavailable'})`)
  applyRace(cities, race.rows)
  writeJson(citiesPath, cities)
  const withRace = cities.filter((city) => city.raceAvailable).length
  console.log(`Updated race shares for ${withRace} of ${cities.length} cities`)
}

async function patchHealthcare(): Promise<void> {
  const citiesPath = join(root, 'data', 'cities.json')
  const sourcesPath = join(root, 'data', 'sources.json')
  const cities = JSON.parse(readFileSync(citiesPath, 'utf8')) as City[]
  console.log('Fetching hospitals, ACS income, insurance, and practitioners…')
  const healthcare = await fetchHealthcare(process.env.CENSUS_API_KEY)
  console.log(`Places: ${healthcare.places.length}; hospitals: ${healthcare.hospitals.length} (${healthcare.hospitalVintage ?? 'unavailable'})`)
  applyHealthcare(cities, healthcare)
  writeJson(citiesPath, cities)
  const sources = JSON.parse(readFileSync(sourcesPath, 'utf8')) as SourceVintage
  sources.hospitalVintage = healthcare.hospitalVintage
  writeJson(sourcesPath, sources)
  const withHealth = cities.filter((city) => city.healthcareAvailable).length
  console.log(`Updated healthcare access for ${withHealth} of ${cities.length} cities`)
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
