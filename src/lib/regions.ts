import type { Region } from './types.ts'

const SOCAL = new Set([
  'los angeles',
  'orange',
  'san diego',
  'riverside',
  'san bernardino',
  'ventura',
  'imperial',
])

const BAY = new Set([
  'san francisco',
  'alameda',
  'contra costa',
  'san mateo',
  'santa clara',
  'marin',
  'napa',
  'sonoma',
  'solano',
])

const CENTRAL_COAST = new Set([
  'monterey',
  'san luis obispo',
  'santa barbara',
  'santa cruz',
  'san benito',
])

const CENTRAL_VALLEY = new Set([
  'sacramento',
  'san joaquin',
  'stanislaus',
  'merced',
  'fresno',
  'madera',
  'kings',
  'tulare',
  'kern',
  'yolo',
  'sutter',
  'yuba',
  'butte',
  'colusa',
  'glenn',
])

export function regionForCounty(county: string): Region {
  const key = county.toLowerCase().trim()
  if (SOCAL.has(key)) return 'socal'
  if (BAY.has(key)) return 'bay'
  if (CENTRAL_COAST.has(key)) return 'central-coast'
  if (CENTRAL_VALLEY.has(key)) return 'central-valley'
  return 'north'
}

export function regionLabel(region: Region): string {
  switch (region) {
    case 'socal':
      return 'Southern California'
    case 'bay':
      return 'Bay Area'
    case 'central-valley':
      return 'Central Valley'
    case 'central-coast':
      return 'Central Coast'
    case 'north':
      return 'Northern California'
  }
}
