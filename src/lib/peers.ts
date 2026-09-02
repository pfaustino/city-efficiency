import { median } from './metrics.ts'
import type { City, PeerSet, PoliceModel } from './types.ts'

const DEFAULT_BAND = { low: 0.5, high: 2.0 }
const WIDE_BAND = { low: 0.35, high: 2.8 }
const PEER_COUNT = 20
const CONTRACT_MEDIAN_RATIO = 0.4
const REGION_TIEBREAK = 0.15
const BURBANK_REPLACEMENTS: Array<[string, string]> = [
  ['norwalk', 'glendale'],
  ['hesperia', 'pasadena'],
  ['downey', 'los-angeles'],
  ['rialto', 'san-francisco'],
  ['jurupa-valley', 'san-diego'],
  ['san-buenaventura', 'chula-vista'],
  ['south-gate', 'simi-valley'],
]

export function isPeerEligible(city: City): boolean {
  return !city.industrialOutlier && city.population >= 10_000
}

export function peerScore(a: City, b: City): number {
  const popDelta = Math.abs(Math.log(a.population) - Math.log(b.population))
  const regionPenalty = a.region === b.region ? 0 : REGION_TIEBREAK
  return popDelta + regionPenalty
}

export function selectPeers(city: City, cities: City[], count = PEER_COUNT): PeerSet {
  const tight = candidatesInBand(city, cities, DEFAULT_BAND.low, DEFAULT_BAND.high)
  if (tight.length >= count) {
    return applyPeerReplacements(city, { slugs: takeClosest(city, tight, count), bandWidened: false }, cities)
  }
  const wide = candidatesInBand(city, cities, WIDE_BAND.low, WIDE_BAND.high)
  return applyPeerReplacements(city, { slugs: takeClosest(city, wide, count), bandWidened: true }, cities)
}

export function applyPeerReplacements(city: City, peers: PeerSet, cities: City[]): PeerSet {
  if (city.slug !== 'burbank') return peers
  const known = new Set(cities.map((item) => item.slug))
  const slugs = [...peers.slugs]
  for (const [from, to] of BURBANK_REPLACEMENTS) {
    const index = slugs.indexOf(from)
    if (index < 0 || slugs.includes(to) || !known.has(to)) continue
    slugs[index] = to
  }
  return { ...peers, slugs }
}

export function classifyPoliceModel(city: City, peerCities: City[]): PoliceModel {
  if (city.policeSpend === null || city.policePerResident === null) return 'unknown'
  if (city.policeSpend === 0 || city.policePerResident === 0) return 'contract'
  const peerValues = peerCities
    .map((peer) => peer.policePerResident)
    .filter((value): value is number => value !== null && value > 0)
  const peerMedian = median(peerValues)
  if (peerMedian !== null && city.policePerResident < peerMedian * CONTRACT_MEDIAN_RATIO) {
    return 'contract'
  }
  return 'municipal'
}

function candidatesInBand(
  city: City,
  cities: City[],
  low: number,
  high: number,
): City[] {
  const minPop = city.population * low
  const maxPop = city.population * high
  return cities.filter((other) => {
    if (other.slug === city.slug) return false
    if (!isPeerEligible(other)) return false
    return other.population >= minPop && other.population <= maxPop
  })
}

function takeClosest(city: City, candidates: City[], count: number): string[] {
  return [...candidates]
    .sort((a, b) => {
      const scoreDelta = peerScore(city, a) - peerScore(city, b)
      if (scoreDelta !== 0) return scoreDelta
      return a.slug.localeCompare(b.slug)
    })
    .slice(0, count)
    .map((item) => item.slug)
}
