import { median, pctFromMedian, pearsonPairs, rankAscending, rankDescending, ratePerThousand } from './metrics.ts'
import { listNames, money, number, signedPct } from './format.ts'
import type { City, PeerSet, Post, PostMetric } from './types.ts'

const POST_POPULATION_MIN = 25_000

export type MetricSpec = {
  metric: PostMetric
  label: string
  unit: string
  getValue: (city: City) => number | null
}

export const METRIC_SPECS: MetricSpec[] = [
  { metric: 'police', label: 'police', unit: 'per resident', getValue: (city) => city.policePerResident },
  { metric: 'parks', label: 'parks and recreation', unit: 'per resident', getValue: (city) => city.parksPerResident },
  { metric: 'utilities', label: 'utilities', unit: 'per resident', getValue: (city) => city.utilityPerResident },
  { metric: 'total', label: 'total city spending', unit: 'per resident', getValue: (city) => city.totalSpendPerResident },
]

export function canWritePost(city: City, spec: MetricSpec): boolean {
  if (city.population < POST_POPULATION_MIN) return false
  if (city.industrialOutlier) return false
  const value = spec.getValue(city)
  if (value === null) return false
  if (spec.metric === 'police' && city.policeModel !== 'municipal') return false
  if (spec.metric === 'utilities' && !(value > 0)) return false
  return true
}

export function buildPost(city: City, spec: MetricSpec, peers: PeerSet, bySlug: Map<string, City>): Post | null {
  if (!canWritePost(city, spec)) return null
  const value = spec.getValue(city)
  if (value === null) return null

  const peerCities = peers.slugs
    .map((slug) => bySlug.get(slug))
    .filter((item): item is City => item !== undefined)

  const rankedPeers =
    spec.metric === 'police'
      ? peerCities.filter((peer) => peer.policeModel === 'municipal' && spec.getValue(peer) !== null)
      : peerCities.filter((peer) => spec.getValue(peer) !== null)

  const cohortValues = [value, ...rankedPeers.map((peer) => spec.getValue(peer)).filter((item): item is number => item !== null)]
  const cohortMedian = median(cohortValues)
  if (cohortMedian === null) return null

  const rank = rankDescending(value, cohortValues)
  const crimeCohort = [city, ...rankedPeers]
    .map((item) => item.crimePer1000)
    .filter((item): item is number => item !== null)
  const crimeRank =
    city.crimePer1000 !== null && crimeCohort.length > 0
      ? rankDescending(city.crimePer1000, crimeCohort)
      : null

  const pct = pctFromMedian(value, cohortMedian)
  const peerNames = rankedPeers.map((peer) => peer.name)
  const title = `${city.name} spends ${money(value)} ${spec.unit} on ${spec.label}. Here's how that compares with ${rankedPeers.length} similar California cities.`
  const dek = `Among ${rankedPeers.length} similar California cities, that is ${signedPct(pct)} the peer median of ${money(cohortMedian)}.`
  const paragraphs = [
    `${city.name} spends ${money(value)} ${spec.unit} on ${spec.label}. Among ${rankedPeers.length} similar California cities (${listNames(peerNames)}), that is ${signedPct(pct)} the peer median of ${money(cohortMedian)}.`,
    crimeSentence(city, crimeRank, crimeCohort.length),
    rankSentence(city, spec, rank, cohortValues.length, peers.bandWidened),
    caveatSentence(city, spec),
  ].filter((paragraph) => paragraph.length > 0)

  return {
    slug: `${city.slug}-${spec.metric}`,
    citySlug: city.slug,
    metric: spec.metric,
    title,
    dek,
    paragraphs,
    peerSlugs: rankedPeers.map((peer) => peer.slug),
    peerBandWidened: peers.bandWidened,
    rank,
    cohortSize: cohortValues.length,
    median: cohortMedian,
    pctFromMedian: pct,
    crimeRank,
  }
}

export function buildAllPosts(cities: City[], peerSets: Map<string, PeerSet>): Post[] {
  const bySlug = new Map(cities.map((city) => [city.slug, city]))
  const posts: Post[] = []
  for (const city of cities) {
    const peers = peerSets.get(city.slug)
    if (!peers) continue
    for (const spec of METRIC_SPECS) {
      const post = buildPost(city, spec, peers, bySlug)
      if (post) posts.push(post)
    }
    const racePost = buildRacePost(city, peers, bySlug)
    if (racePost) posts.push(racePost)
    const healthPost = buildHealthcarePost(city, peers, bySlug)
    if (healthPost) posts.push(healthPost)
  }
  return posts.sort((a, b) => a.slug.localeCompare(b.slug))
}

export function buildRacePost(city: City, peers: PeerSet, bySlug: Map<string, City>): Post | null {
  if (city.population < POST_POPULATION_MIN) return null
  if (city.industrialOutlier) return null
  if (!city.raceAvailable || city.hispanicPct === null) return null

  const peerCities = peers.slugs
    .map((slug) => bySlug.get(slug))
    .filter((item): item is City => item !== undefined)
  const hispanicValues = [city.hispanicPct, ...peerCities.map((peer) => peer.hispanicPct)].filter(
    (value): value is number => value !== null,
  )
  const cohortMedian = median(hispanicValues)
  if (cohortMedian === null) return null

  const rank = rankDescending(city.hispanicPct, hispanicValues)
  const pct = pctFromMedian(city.hispanicPct, cohortMedian)
  const peerNames = peerCities.map((peer) => peer.name)
  const white = city.whiteNonHispanicPct === null ? 'an unpublished' : `${number(city.whiteNonHispanicPct, 1)}%`
  const title = `${city.name}'s racial mix next to the same ${peerCities.length} cities used for spending comparisons.`
  const dek = `Census ACS race and ethnicity shares. Correlation with crime or police spending in this group is association, not cause.`
  const paragraphs = [
    `${city.name} is ${number(city.hispanicPct, 1)}% Hispanic or Latino and ${white} White non-Hispanic. Among the same ${peerCities.length} cities used for the spending posts (${listNames(peerNames)}), the Hispanic or Latino median is ${number(cohortMedian, 1)}% (${signedPct(pct)}).`,
    correlationSentence(city, peerCities),
    'These are Census ACS 5-year shares (table B03002). Hispanic or Latino is of any race. Other is the remaining non-Hispanic groups. The peer list is the same population-band set used for spending. A correlation here is not a claim that race causes crime or spending.',
  ]

  return {
    slug: `${city.slug}-demographics`,
    citySlug: city.slug,
    metric: 'race',
    title,
    dek,
    paragraphs,
    peerSlugs: peerCities.map((peer) => peer.slug),
    peerBandWidened: peers.bandWidened,
    rank,
    cohortSize: peerCities.length + 1,
    median: cohortMedian,
    pctFromMedian: pct,
    crimeRank: null,
  }
}

export function buildHealthcarePost(city: City, peers: PeerSet, bySlug: Map<string, City>): Post | null {
  if (city.population < POST_POPULATION_MIN) return null
  if (city.industrialOutlier) return null
  if (!city.healthcareAvailable || city.uninsuredPct === null) return null

  const peerCities = peers.slugs
    .map((slug) => bySlug.get(slug))
    .filter((item): item is City => item !== undefined && item.uninsuredPct !== null)
  const uninsuredValues = [city.uninsuredPct, ...peerCities.map((peer) => peer.uninsuredPct)].filter(
    (value): value is number => value !== null,
  )
  const cohortMedian = median(uninsuredValues)
  if (cohortMedian === null) return null

  const rank = rankAscending(city.uninsuredPct, uninsuredValues)
  const pct = pctFromMedian(city.uninsuredPct, cohortMedian)
  const peerNames = peerCities.map((peer) => peer.name)
  const incomeValues = [city.medianIncome, ...peerCities.map((peer) => peer.medianIncome)].filter(
    (value): value is number => value !== null,
  )
  const incomeMedian = median(incomeValues)
  const title = `${city.name} is ${number(city.uninsuredPct, 1)}% uninsured. Among ${peerCities.length} similar California cities the median is ${number(cohortMedian, 1)}%.`
  const dek = uninsuredDek(city, incomeMedian)
  const paragraphs = [
    uninsuredLead(city, peerNames, cohortMedian, pct, incomeMedian),
    'That figure is the Census ACS 5-year share of residents with no health insurance, all ages. It is the same definition in every city. It is not a city-run insurance plan, not a hospital rating, and not a grade for city hall.',
    'Most coverage comes from employers, Medi-Cal, Medicare, and Covered California. A lower uninsured rate can mean more people have job-based insurance, qualify for public coverage, or buy a marketplace plan. It does not mean the city provided the insurance, that residents are healthier, or that care is cheaper or better.',
    `Among these ${uninsuredValues.length} cities, ${city.name} ranks ${rank} for the lowest uninsured share. Rank is descriptive. The peer list is the same population-band set used for spending comparisons.`,
  ]

  return {
    slug: `${city.slug}-healthcare`,
    citySlug: city.slug,
    metric: 'healthcare',
    title,
    dek,
    paragraphs,
    peerSlugs: peerCities.map((peer) => peer.slug),
    peerBandWidened: peers.bandWidened,
    rank,
    cohortSize: uninsuredValues.length,
    median: cohortMedian,
    pctFromMedian: pct,
    crimeRank: null,
  }
}

function uninsuredDek(city: City, incomeMedian: number | null): string {
  if (city.medianIncome === null || incomeMedian === null) {
    return 'This is Census coverage, not a city insurance program. Rank is lowest uninsured share, not a grade.'
  }
  return `${city.name}'s median household income is ${money(city.medianIncome)}, ${signedPct(pctFromMedian(city.medianIncome, incomeMedian))} the peer income median of ${money(incomeMedian)}. This is Census coverage, not a city insurance program.`
}

function uninsuredLead(
  city: City,
  peerNames: string[],
  uninsuredMedian: number,
  uninsuredPctFromMed: number,
  incomeMedian: number | null,
): string {
  const head = `${city.name} is ${number(city.uninsuredPct ?? 0, 1)}% uninsured. Among ${peerNames.length} similar California cities (${listNames(peerNames)}), the uninsured median is ${number(uninsuredMedian, 1)}% (${signedPct(uninsuredPctFromMed)}).`
  if (city.medianIncome === null || incomeMedian === null) return head
  const incomeGap = pctFromMedian(city.medianIncome, incomeMedian)
  const income = ` Median household income is ${money(city.medianIncome)}, ${signedPct(incomeGap)} the peer income median of ${money(incomeMedian)}.`
  if (incomeGap < -0.5) {
    return `${head}${income} A lower uninsured rate here is not explained by higher income alone.`
  }
  return `${head}${income}`
}

function correlationSentence(city: City, peers: City[]): string {
  const cohort = [city, ...peers]
  const hispanicViolent = pearsonPairs(
    cohort.map((item) => ({ x: item.hispanicPct, y: ratePerThousand(item.violentCrime, item.population) })),
  )
  const hispanicPolice = pearsonPairs(
    cohort.map((item) => ({ x: item.hispanicPct, y: item.policePerResident })),
  )
  if (hispanicViolent === null && hispanicPolice === null) {
    return `${city.name} does not have enough paired peer values in this group to report a correlation.`
  }
  const parts: string[] = []
  if (hispanicViolent !== null) {
    parts.push(
      `Hispanic or Latino share and violent crime per 1,000 have Pearson r = ${number(hispanicViolent, 2)}`,
    )
  }
  if (hispanicPolice !== null) {
    parts.push(`Hispanic or Latino share and police spending per resident have r = ${number(hispanicPolice, 2)}`)
  }
  return `Within this ${cohort.length}-city group, ${parts.join(', and ')}. That is an association in this peer set, not a cause.`
}

function crimeSentence(city: City, crimeRank: number | null, cohortSize: number): string {
  if (!city.crimeAvailable || city.crimePer1000 === null || crimeRank === null) {
    return `${city.name} does not have a published city-level crime total for this comparison, so crime is not ranked against peers.`
  }
  return `${city.name} ranks ${crimeRank} of ${cohortSize} in that group for reported crime per 1,000 residents (${number(city.crimePer1000, 1)}).`
}

function rankSentence(
  city: City,
  spec: MetricSpec,
  rank: number,
  cohortSize: number,
  widened: boolean,
): string {
  const band = widened
    ? ' The comparison used a wider population band because fewer than 20 cities sat in the usual 0.5–2.0 range.'
    : ''
  return `${city.name} ranks ${rank} of ${cohortSize} for ${spec.label} spending.${band}`
}

function caveatSentence(city: City, spec: MetricSpec): string {
  if (spec.metric === 'total' && city.enterpriseHeavy) {
    return `${city.name} runs large enterprise utilities, which can inflate total spending relative to cities that buy those services from another provider.`
  }
  if (spec.metric === 'police') {
    return 'Police current operating expenditures come from the State Controller City Financial Transactions Report. Higher spending is not a claim that crime should be lower.'
  }
  if (spec.metric === 'utilities') {
    return 'Utility spending is municipal electric, water, gas, sewer, and solid waste operations. Cities served by investor-owned utilities show little or no electric spending. Depreciation is excluded.'
  }
  return 'Figures are current operating expenditures unless noted. Sources and year vintages are on the methodology page.'
}
