export const REGIONS = ['socal', 'bay', 'central-valley', 'central-coast', 'north'] as const

export type Region = (typeof REGIONS)[number]

export type PoliceModel = 'municipal' | 'contract' | 'unknown'

export type PostMetric = 'police' | 'parks' | 'total' | 'utilities' | 'race' | 'healthcare'

export type City = {
  slug: string
  name: string
  county: string
  region: Region
  fiscalYear: number
  population: number
  populationPrior: number | null
  populationGrowthPct: number | null
  totalSpend: number
  totalSpendPerResident: number
  governmentalCurrentSpend: number | null
  governmentalCurrentPerResident: number | null
  policeSpend: number | null
  policePerResident: number | null
  parksSpend: number | null
  parksPerResident: number | null
  utilitySpend: number | null
  utilityPerResident: number | null
  propertyTax: number | null
  salesTax: number | null
  taxPerResident: number | null
  medianHomeValue: number | null
  medianRent: number | null
  hispanicPct: number | null
  whiteNonHispanicPct: number | null
  blackNonHispanicPct: number | null
  asianNonHispanicPct: number | null
  otherPct: number | null
  raceAvailable: boolean
  medianIncome: number | null
  uninsuredPct: number | null
  practitionersPer100k: number | null
  hospitalCount: number
  erCount: number
  hospitalsPer100k: number | null
  ersPer100k: number | null
  milesToHospital: number | null
  countyHospitalCount: number
  countyErCount: number
  countyHospitalsPer100k: number | null
  countyUninsuredPct: number | null
  countyMedianIncome: number | null
  healthcareAvailable: boolean
  violentCrime: number | null
  propertyCrime: number | null
  crimePer1000: number | null
  crimeAvailable: boolean
  swornOfficers: number | null
  officersPer1000: number | null
  violentCleared: number | null
  propertyCleared: number | null
  violentClearancePct: number | null
  propertyClearancePct: number | null
  staffingAvailable: boolean
  policeModel: PoliceModel
  enterpriseHeavy: boolean
  industrialOutlier: boolean
}

export type PeerSet = {
  slugs: string[]
  bandWidened: boolean
}

export type Post = {
  slug: string
  citySlug: string
  metric: PostMetric
  title: string
  dek: string
  paragraphs: string[]
  peerSlugs: string[]
  peerBandWidened: boolean
  rank: number
  cohortSize: number
  median: number
  pctFromMedian: number
  crimeRank: number | null
}

export type SourceVintage = {
  scoFiscalYear: number
  scoPopulationPriorYear: number
  acsVintage: string | null
  hospitalVintage?: string | null
  crimeYear: number | null
  personnelYear?: number | null
  generatedAt: string
}

export type Dataset = {
  cities: City[]
  posts: Post[]
  sources: SourceVintage
}
