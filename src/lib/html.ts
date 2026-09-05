import { money, number, pct, signedPct, escapeHtml } from './format.ts'
import { median, pctFromMedian, pearsonPairs, policeSpendPerCrime, ratePerThousand } from './metrics.ts'
import { METRIC_SPECS } from './posts.ts'
import { regionLabel } from './regions.ts'
import type { City, Dataset, Post, PostMetric } from './types.ts'

const SITE = 'Is Your City Getting What It Pays For?'

export function siteBase(dev: boolean): string {
  return dev ? '' : '/city-efficiency'
}

export function assetTags(dev: boolean): string {
  if (dev) {
    return `<link rel="stylesheet" href="/src/styles.css" />
<script type="module" src="/src/home.ts"></script>`
  }
  const base = siteBase(false)
  return `<link rel="stylesheet" href="${base}/assets/styles.css" />
<script type="module" src="${base}/assets/app.js"></script>`
}

export function layout(options: {
  dev: boolean
  title: string
  description: string
  body: string
  path: string
}): string {
  const base = siteBase(options.dev)
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(options.title)}</title>
    <meta name="description" content="${escapeHtml(options.description)}" />
    <link rel="icon" href="${base}/favicon.svg" />
    ${assetTags(options.dev)}
  </head>
  <body>
    <header class="site-header">
      <a class="wordmark" href="${base}/">${escapeHtml(SITE)}</a>
      <nav>
        <a href="${base}/">Cities</a>
        <a href="${base}/methodology/">Methodology</a>
      </nav>
    </header>
    <main>${options.body}</main>
    <footer class="site-footer">
      <p>California city finances from the State Controller, housing from the Census ACS, and crime from OpenJustice. Comparison is not causation.</p>
    </footer>
  </body>
</html>
`
}

export function homePage(dataset: Dataset, dev: boolean): string {
  const featured =
    dataset.posts.find((post) => post.slug === 'burbank-police') ?? dataset.posts[0]
  const cities = [...dataset.cities].sort((a, b) => a.name.localeCompare(b.name))
  const body = `
    <section class="hero">
      <p class="kicker">California cities</p>
      <h1>${escapeHtml(SITE)}</h1>
      <p class="lede">Spending, taxes, housing costs, and crime — placed next to 20 similar cities, not next to a slogan.</p>
    </section>
    ${featured ? featuredBlock(featured, dataset, dev) : ''}
    <section class="panel">
      <div class="panel-head">
        <h2>All cities</h2>
        <label class="search">
          <span>Search</span>
          <input id="city-search" type="search" placeholder="Burbank, Fresno, Oakland…" data-table="cities" />
        </label>
      </div>
      <div class="table-wrap">
        <table id="cities" class="data" data-sortable>
          <thead>
            <tr>
              ${sortHeader('City', 'text', 'City name.')}
              ${sortHeader('County', 'text', 'County where the city is located.')}
              ${sortHeader('Population', 'number', 'State Controller population estimate for this fiscal year.')}
              ${sortHeader('Total / resident', 'number', 'Total reported city spending divided by population. Can include enterprise utilities.')}
              ${sortHeader('Police / resident', 'number', 'Municipal police current operating spending per resident.')}
              ${sortHeader('Parks / resident', 'number', 'Parks and recreation current operating spending per resident.')}
              ${sortHeader('Violent / 1,000', 'number', 'FBI index violent crimes per 1,000 residents: homicide, rape, robbery, and aggravated assault. Does not include traffic stops or most misdemeanors.')}
              ${sortHeader('Property / 1,000', 'number', 'FBI index property crimes per 1,000 residents: burglary, theft, auto theft, and arson.')}
            </tr>
          </thead>
          <tbody>
            ${cities.map((city) => cityRow(city, dev)).join('\n')}
          </tbody>
        </table>
      </div>
    </section>`
  return layout({
    dev,
    title: SITE,
    description: 'Compare California city spending, taxes, housing, and crime against similar cities.',
    body,
    path: '/',
  })
}

export function cityPage(city: City, dataset: Dataset, dev: boolean): string {
  const base = siteBase(dev)
  const posts = dataset.posts.filter((post) => post.citySlug === city.slug)
  const racePosts = posts.filter((post) => post.metric === 'race')
  const healthPosts = posts.filter((post) => post.metric === 'healthcare')
  const spendPosts = posts.filter((post) => post.metric !== 'race' && post.metric !== 'healthcare')
  const body = `
    <article class="city">
      <p class="kicker">${escapeHtml(city.county)} County · ${escapeHtml(regionLabel(city.region))}</p>
      <h1>${escapeHtml(city.name)}</h1>
      <p class="lede">${escapeHtml(citySummary(city, dataset))}</p>
      <section class="metrics">
        ${metricCard('Spend / resident', money(city.totalSpendPerResident), city.enterpriseHeavy ? 'Includes enterprise utilities' : 'Total reported expenditures')}
        ${metricCard('Police / resident', moneyOrDash(city.policePerResident), policeCaption(city))}
        ${metricCard('Parks / resident', moneyOrDash(city.parksPerResident), 'Parks and recreation current spending')}
        ${metricCard('Utilities / resident', moneyOrDash(city.utilityPerResident), city.utilityPerResident && city.utilityPerResident > 0 ? 'Electric, water, gas, sewer, solid waste' : 'No municipal utility total')}
        ${metricCard('Violent / 1,000', crimeRateLabel(city, city.violentCrime, 'Not published'), city.crimeAvailable ? 'Homicide, rape, robbery, aggravated assault' : 'No city-level agency total')}
        ${metricCard('Property / 1,000', crimeRateLabel(city, city.propertyCrime, 'Not published'), city.crimeAvailable ? 'Burglary, theft, auto theft, arson' : 'No city-level agency total')}
        ${metricCard('Officers / 1,000', city.officersPer1000 === null ? '—' : number(city.officersPer1000, 1), city.staffingAvailable ? 'Funded non-jail sworn, October 31' : 'No municipal PD staffing total')}
        ${metricCard('Violent cleared', city.violentClearancePct === null ? '—' : pct(city.violentClearancePct, 0), city.violentClearancePct === null ? 'No city-level clearance total' : 'UCR clear by arrest or exceptional means')}
        ${metricCard('Uninsured', city.uninsuredPct === null ? '—' : `${number(city.uninsuredPct, 1)}%`, 'ACS 5-year, all ages')}
        ${metricCard('Miles to hospital', city.milesToHospital === null ? '—' : number(city.milesToHospital, 1), 'City center to nearest HCAI hospital')}
        ${metricCard('Home value', moneyOrDash(city.medianHomeValue), 'ACS median owner-occupied value')}
        ${metricCard('Population growth', growthLabel(city), `SCO estimate vs ${dataset.sources.scoPopulationPriorYear}`)}
      </section>
      <section class="split">
        <div>
          <h2>Taxes and housing</h2>
          <dl class="facts">
            <div><dt>Property tax revenue / resident</dt><dd>${moneyOrDash(share(city.propertyTax, city.population))}</dd></div>
            <div><dt>Sales tax revenue / resident</dt><dd>${moneyOrDash(share(city.salesTax, city.population))}</dd></div>
            <div><dt>Tax take / resident</dt><dd>${moneyOrDash(city.taxPerResident)}</dd></div>
            <div><dt>Median household income</dt><dd>${moneyOrDash(city.medianIncome)}</dd></div>
            <div><dt>Median rent</dt><dd>${moneyOrDash(city.medianRent)}</dd></div>
            <div><dt>Governmental current / resident</dt><dd>${moneyOrDash(city.governmentalCurrentPerResident)}</dd></div>
            <div><dt>Population</dt><dd>${number(city.population)}</dd></div>
          </dl>
        </div>
        <div>
          <h2>Demographics report</h2>
          ${racePosts.length === 0 ? '<p>No ACS race report for this city.</p>' : `<ul class="post-list">${racePosts.map((post) => `<li><a href="${base}/posts/${post.slug}/">${escapeHtml(post.title)}</a></li>`).join('')}</ul>`}
          <h2>Uninsured report</h2>
          ${healthPosts.length === 0 ? '<p>No ACS uninsured report for this city.</p>' : `<ul class="post-list">${healthPosts.map((post) => `<li><a href="${base}/posts/${post.slug}/">${escapeHtml(post.title)}</a></li>`).join('')}</ul>`}
          <h2>Comparison posts</h2>
          ${spendPosts.length === 0 ? '<p>This city is below the 25,000-resident cutoff used for generated posts.</p>' : `<ul class="post-list">${spendPosts.map((post) => `<li><a href="${base}/posts/${post.slug}/">${escapeHtml(post.title)}</a></li>`).join('')}</ul>`}
        </div>
      </section>
      <p class="note">Fiscal year ${city.fiscalYear}. Housing vintage: ${escapeHtml(dataset.sources.acsVintage ?? 'unavailable')}. Crime year: ${dataset.sources.crimeYear ?? 'unavailable'}. Staffing year: ${dataset.sources.personnelYear ?? 'unavailable'}.</p>
    </article>`
  return layout({
    dev,
    title: `${city.name} — ${SITE}`,
    description: citySummary(city, dataset),
    body,
    path: `/cities/${city.slug}/`,
  })
}

export function postPage(post: Post, dataset: Dataset, dev: boolean): string {
  if (post.metric === 'race') return racePostPage(post, dataset, dev)
  if (post.metric === 'healthcare') return healthcarePostPage(post, dataset, dev)
  const base = siteBase(dev)
  const city = dataset.cities.find((item) => item.slug === post.citySlug)
  if (!city) throw new Error(`Missing city for post ${post.slug}`)
  const spec = METRIC_SPECS.find((item) => item.metric === post.metric)
  if (!spec) throw new Error(`Missing spec for ${post.metric}`)
  const cohort = [city, ...post.peerSlugs.map((slug) => dataset.cities.find((item) => item.slug === slug)).filter((item): item is City => item !== undefined)]
  const body = `
    <article class="post">
      <p class="kicker"><a href="${base}/cities/${city.slug}/">${escapeHtml(city.name)}</a> · ${escapeHtml(spec.label)}</p>
      <h1>${escapeHtml(post.title)}</h1>
      <p class="lede">${escapeHtml(post.dek)}</p>
      ${post.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('\n')}
      <section class="panel">
        <h2>Peer comparison</h2>
        <div class="table-wrap">
          <table class="data" data-sortable>
            <thead>
              <tr>
                ${sortHeader('City', 'text', 'City name.')}
                ${sortHeader(`${spec.label} / resident`, 'number', metricPerResidentTip(spec.metric))}
                ${spec.metric === 'utilities'
                  ? sortHeader('Utility spend', 'number', 'Municipal electric, water, gas, sewer, and solid waste operating spending. Excludes depreciation. Investor-owned utility cities may be near zero.')
                  : `${sortHeader('Violent / 1,000', 'number', 'FBI index violent crimes per 1,000 residents: homicide, rape, robbery, and aggravated assault. Does not include traffic stops or most misdemeanors.')}
                ${sortHeader('Property / 1,000', 'number', 'FBI index property crimes per 1,000 residents: burglary, theft, auto theft, and arson.')}`}
                ${spec.metric === 'police' ? `${sortHeader('Officers / 1,000', 'number', 'Funded non-jail sworn officers per 1,000 residents. OpenJustice one-day survey, October 31. Sheriff, CHP, and campus agencies are excluded.')}
                ${sortHeader('Violent cleared %', 'number', 'Share of FBI index violent crimes cleared by arrest or exceptional means in that calendar year. A clearance can be for a prior-year crime, so the rate can exceed 100%.')}
                ${sortHeader('Property cleared %', 'number', 'Share of FBI index property crimes cleared by arrest or exceptional means in that calendar year. A clearance can be for a prior-year crime, so the rate can exceed 100%.')}
                ${sortHeader('Police $ / crime', 'number', 'Police spending per resident divided by reported index crimes per resident. Lower means less police spending for each reported crime.')}` : ''}
                ${sortHeader('Population', 'number', 'State Controller population estimate for this fiscal year.')}
              </tr>
            </thead>
            <tbody>
              ${cohort
                .sort((a, b) => (spec.getValue(b) ?? -1) - (spec.getValue(a) ?? -1))
                .map((item) => peerRow(item, spec.metric, item.slug === city.slug, dev))
                .join('\n')}
            </tbody>
          </table>
        </div>
        <p class="note">${city.name} ranks ${post.rank} of ${post.cohortSize} for this metric. Peer median: ${money(post.median)} (${signedPct(post.pctFromMedian)}).${post.peerBandWidened ? ' Population band was widened to fill the peer set.' : ''}${spec.metric === 'police' ? ` Officers / 1,000 is the OpenJustice October 31 sworn count. Clearance rates are UCR clear-by-arrest or exceptional means for that crime year; a clearance can be for a prior-year crime. Police $ / crime is police spending per resident divided by crimes per resident. Lower means less police spending for each reported crime. Staffing year: ${dataset.sources.personnelYear ?? 'unavailable'}.` : ''} Fiscal year ${city.fiscalYear}.</p>
      </section>
      ${city.slug === 'burbank' && spec.metric === 'utilities' ? burbankUtilityExplain() : ''}
      ${city.slug === 'burbank' && spec.metric === 'police' ? burbankPoliceExplain(city, cohort) : ''}
    </article>`
  return layout({
    dev,
    title: post.title,
    description: post.dek,
    body,
    path: `/posts/${post.slug}/`,
  })
}

function burbankPoliceExplain(city: City, cohort: City[]): string {
  const glendale = cohort.find((item) => item.slug === 'glendale')
  const officers = city.swornOfficers === null ? '—' : number(city.swornOfficers)
  const perThousand = city.officersPer1000 === null ? '—' : number(city.officersPer1000, 1)
  const violentClr = city.violentClearancePct === null ? '—' : pct(city.violentClearancePct, 0)
  const propertyClr = city.propertyClearancePct === null ? '—' : pct(city.propertyClearancePct, 0)
  const violentPerOfficer =
    city.swornOfficers && city.swornOfficers > 0 && city.violentCrime !== null
      ? number(city.violentCrime / city.swornOfficers, 1)
      : null
  let glendaleStaff = ''
  let glendaleClear = ''
  let glendaleWorkload = ''
  if (glendale) {
    if (glendale.swornOfficers !== null && glendale.officersPer1000 !== null) {
      glendaleStaff = ` Glendale reports ${number(glendale.swornOfficers)} sworn (${number(glendale.officersPer1000, 1)} per 1,000)`
      if (glendale.violentCrime !== null && glendale.swornOfficers > 0) {
        glendaleWorkload = ` That is ${number(glendale.violentCrime / glendale.swornOfficers, 1)} reported violent crimes per officer.`
      }
    }
    if (glendale.violentClearancePct !== null && glendale.propertyClearancePct !== null) {
      glendaleClear = `, and clears ${pct(glendale.violentClearancePct, 0)} of violent and ${pct(glendale.propertyClearancePct, 0)} of property index crime.`
    }
  }
  return `
      <section class="panel">
        <h2>What Burbank's police number means</h2>
        <p>This is tax-side city spending, not a utility bill. The $654 per resident is Burbank's FY2024 municipal police current operating cost ($69.1 million) divided by 105,603 residents. It is paid from the city's general operations, mainly taxes and other general revenue. It is not an average household "police bill," and it is not what a deputy-sheriff city pays the county.</p>
        <p>Burbank is high-middle, not an outlier. It ranks 6 of 21 and sits 50% above the peer median of $435. Santa Monica ($1,279), San Francisco ($863), Los Angeles ($855), Inglewood ($817), and Pasadena ($772) spend more. Vista, Compton, San Marcos, and Menifee spend in the mid-$200s.</p>
        <p>Reported index crime is also mid-high, and it is mostly property crime. Burbank's violent rate is 3.3 per 1,000 — below Los Angeles (6.8), Inglewood (6.6), Santa Monica (6.0), and San Francisco (4.7). Property crime is 23.8 per 1,000, near Compton's property rate and above Glendale (18.0) and San Diego (15.7). Combined crime is 27.1 per 1,000, also rank 6 of 21. Spending rank and crime rank match. That is a coincidence in this table, not proof that the extra dollars bought less crime or more safety.</p>
        <p>Police $ / crime is a ratio, not a grade. Burbank is about $24,100 per reported index crime, in the middle of the pack. Compton's $7,801 looks "cheap" because violent crime is 12.0 per 1,000, not because Compton is a model. San Marcos's $49,180 looks "expensive" because crime is very low. The ratio punishes quiet cities and rewards high-crime cities. Do not read it as efficiency.</p>
        <p>The denominator is residents, not the people police actually cover. Burbank has a large daytime commercial load (studios, media, and visitors). Those workers and guests are in the workload and in some of the crime counts. They are not in the 105,603. That inflates per-resident cost the same way it does for utilities, just less extremely.</p>
        <p>Staffing and clearances are now in the table. Burbank reports ${officers} funded non-jail sworn officers, or ${perThousand} per 1,000 residents. It cleared ${violentClr} of violent index crime and ${propertyClr} of property index crime.${violentPerOfficer ? ` That is ${violentPerOfficer} reported violent crimes per officer.` : ''}${glendaleStaff}${glendaleClear}${glendaleWorkload} These are still not a grade. The sworn count is an October 31 snapshot. A clearance can be for a prior-year crime. Neither figure is calls for service or response time.</p>
        <p>Glendale is the closest local comparison: a municipal PD next door. Glendale spends $605 per resident, with violent crime 2.3 and property crime 18.0. Burbank spends more and reports more index crime. That can mean more calls, more commercial activity, different reporting, or a worse return. This table cannot say which.</p>
        <p>What it does not infer: that Burbank is overpoliced, underpoliced, or wasting money. The figures are current operating expenditures from the State Controller (form CURR_EXP_POLICE), FBI index crimes and UCR clearances from OpenJustice, and the OpenJustice October 31 sworn survey. Traffic stops, citations, most misdemeanors, 911 calls, and response times are missing. Finance year FY2024 and the crime and staffing calendar years do not line up exactly. Higher spending is not a claim that crime should be lower.</p>
      </section>`
}

function burbankUtilityExplain(): string {
  return `
      <section class="panel">
        <h2>Why Burbank looks high</h2>
        <p>Burbank looks expensive because the city runs the electric utility. Most of this peer list does not.</p>
        <p>Of the $239.6 million, about $173 million is electric (72%). The single biggest line is $108 million in electricity purchases. Water is $30 million, trash $21 million, sewer $16 million. Gas is $0.</p>
        <p>West Covina, Murrieta, Costa Mesa, Menifee, and San Marcos show $0 because residents buy power from Southern California Edison or another investor-owned utility. That spending never hits the city's books, so the peer median of $249 is mostly water, sewer, and trash. The 810% gap is a bookkeeping difference, not a claim that Burbank households pay nine times more for lights and water.</p>
        <p>Pasadena, Glendale, Los Angeles, and San Francisco also have municipal electric utilities, and they sit in the same high band ($1,400–$1,600). Burbank is still higher than those peers, mainly because per-resident uses population as the denominator. Burbank Water and Power also serves a large commercial load (studios and the media district). That power is in the $239 million. Those workers are not in the 105,603 residents.</p>
        <p>What it infers: Burbank chose to own the power company. The city books the cost of buying and delivering electricity. It does not infer that Burbank wastes money, that residents get a worse deal than SCE cities, or that the extra $2,000 is sitting unused.</p>
        <p>Good or bad: neither, from this table alone. Municipal electric can mean local control and a charter transfer of up to 7% of retail electric sales into the General Fund. It can also mean the city, not SCE, eats power-price risk. Whether that is a good deal depends on Burbank Water and Power rates versus SCE, reliability, and that transfer — not on rank 1 of 21.</p>
      </section>`
}

function racePostPage(post: Post, dataset: Dataset, dev: boolean): string {
  const base = siteBase(dev)
  const city = dataset.cities.find((item) => item.slug === post.citySlug)
  if (!city) throw new Error(`Missing city for post ${post.slug}`)
  const cohort = [
    city,
    ...post.peerSlugs.map((slug) => dataset.cities.find((item) => item.slug === slug)).filter((item): item is City => item !== undefined),
  ]
  const body = `
    <article class="post">
      <p class="kicker"><a href="${base}/cities/${city.slug}/">${escapeHtml(city.name)}</a> · demographics</p>
      <h1>${escapeHtml(post.title)}</h1>
      <p class="lede">${escapeHtml(post.dek)}</p>
      ${post.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('\n')}
      <section class="panel">
        <h2>Peer comparison</h2>
        <div class="table-wrap">
          <table class="data" data-sortable>
            <thead>
              <tr>
                ${sortHeader('City', 'text', 'City name.')}
                ${sortHeader('Hispanic %', 'number', 'Census ACS Hispanic or Latino share, any race.')}
                ${sortHeader('White NH %', 'number', 'Census ACS White alone, not Hispanic or Latino.')}
                ${sortHeader('Black NH %', 'number', 'Census ACS Black or African American alone, not Hispanic or Latino.')}
                ${sortHeader('Asian NH %', 'number', 'Census ACS Asian alone, not Hispanic or Latino.')}
                ${sortHeader('Other %', 'number', 'Remaining non-Hispanic groups, including two or more races.')}
                ${sortHeader('Violent / 1,000', 'number', 'FBI index violent crimes per 1,000 residents: homicide, rape, robbery, and aggravated assault.')}
                ${sortHeader('Property / 1,000', 'number', 'FBI index property crimes per 1,000 residents: burglary, theft, auto theft, and arson.')}
                ${sortHeader('Police / resident', 'number', 'Municipal police current operating spending per resident.')}
              </tr>
            </thead>
            <tbody>
              ${cohort
                .sort((a, b) => (b.hispanicPct ?? -1) - (a.hispanicPct ?? -1))
                .map((item) => racePeerRow(item, item.slug === city.slug, dev))
                .join('\n')}
            </tbody>
          </table>
        </div>
        <p class="note">${city.name} Hispanic or Latino share is ${post.rank} of ${post.cohortSize} in this peer set. Peer median: ${number(post.median, 1)}% (${signedPct(post.pctFromMedian)}). Rank is descriptive, not a grade.${post.peerBandWidened ? ' Population band was widened to fill the peer set.' : ''} ACS vintage: ${escapeHtml(dataset.sources.acsVintage ?? 'unavailable')}.</p>
      </section>
      <section class="panel">
        <h2>Correlations in this peer set</h2>
        <p>Pearson r using cities in this table that have both values. |r| near 1 is a tight linear association. 0 is none. This is not causation.</p>
        <div class="table-wrap">
          <table class="data" data-sortable>
            <thead>
              <tr>
                ${sortHeader('Share', 'text', 'ACS race or ethnicity share used as the x variable.')}
                ${sortHeader('vs violent / 1,000', 'number', 'Pearson correlation with FBI index violent crime per 1,000 residents.')}
                ${sortHeader('vs property / 1,000', 'number', 'Pearson correlation with FBI index property crime per 1,000 residents.')}
                ${sortHeader('vs police / resident', 'number', 'Pearson correlation with municipal police spending per resident.')}
              </tr>
            </thead>
            <tbody>
              ${correlationRows(cohort)}
            </tbody>
          </table>
        </div>
      </section>
    </article>`
  return layout({
    dev,
    title: post.title,
    description: post.dek,
    body,
    path: `/posts/${post.slug}/`,
  })
}

function healthcarePostPage(post: Post, dataset: Dataset, dev: boolean): string {
  const base = siteBase(dev)
  const city = dataset.cities.find((item) => item.slug === post.citySlug)
  if (!city) throw new Error(`Missing city for post ${post.slug}`)
  const cohort = [
    city,
    ...post.peerSlugs.map((slug) => dataset.cities.find((item) => item.slug === slug)).filter((item): item is City => item !== undefined),
  ]
  const body = `
    <article class="post">
      <p class="kicker"><a href="${base}/cities/${city.slug}/">${escapeHtml(city.name)}</a> · uninsured</p>
      <h1>${escapeHtml(post.title)}</h1>
      <p class="lede">${escapeHtml(post.dek)}</p>
      ${post.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('\n')}
      <section class="panel">
        <h2>Why this is posted</h2>
        <p>This site asks whether a city is getting what it pays for. Most spending tables cannot answer that. Uninsured share can be compared with one Census definition in every city, so it is one of the few resident outcomes here that means what it says.</p>
        <p>The purpose of this page is to put that coverage fact next to income before anyone treats it as a city hall grade or as “they are just richer.” It is not an argument that ${escapeHtml(city.name)} provided the insurance, that residents are healthier, or that anything should be raised or cut.</p>
      </section>
      <section class="panel">
        <h2>Peer comparison</h2>
        <div class="table-wrap">
          <table class="data" data-sortable>
            <thead>
              <tr>
                ${sortHeader('City', 'text', 'City name.')}
                ${sortHeader('Uninsured %', 'number', 'Census ACS 5-year share with no health insurance, all ages. Same definition in every city.')}
                ${sortHeader('Median income', 'number', 'Census ACS median household income. Shown so a lower uninsured rate is not read as “richer city.”')}
                ${sortHeader('Population', 'number', 'State Controller population estimate for this fiscal year.')}
              </tr>
            </thead>
            <tbody>
              ${cohort
                .sort((a, b) => (a.uninsuredPct ?? 999) - (b.uninsuredPct ?? 999))
                .map((item) => uninsuredPeerRow(item, item.slug === city.slug, dev))
                .join('\n')}
            </tbody>
          </table>
        </div>
        <p class="note">${city.name} uninsured share is ${post.rank} of ${post.cohortSize} in this peer set, counting from the lowest rate. Peer median: ${number(post.median, 1)}% (${signedPct(post.pctFromMedian)}). Rank is descriptive, not a grade. This is not a city insurance program.${post.peerBandWidened ? ' Population band was widened to fill the peer set.' : ''} ACS vintage: ${escapeHtml(dataset.sources.acsVintage ?? 'unavailable')}.</p>
      </section>
      ${city.slug === 'burbank' ? burbankUninsuredExplain(city, cohort) : ''}
    </article>`
  return layout({
    dev,
    title: post.title,
    description: post.dek,
    body,
    path: `/posts/${post.slug}/`,
  })
}

function uninsuredPeerRow(city: City, current: boolean, dev: boolean): string {
  const base = siteBase(dev)
  return `<tr class="${current ? 'is-current' : ''}">
    <td><a href="${base}/cities/${city.slug}/">${escapeHtml(city.name)}</a>${current ? ' <span class="tag">This city</span>' : ''}</td>
    ${pctCell(city.uninsuredPct)}
    <td data-value="${city.medianIncome ?? ''}">${moneyOrDash(city.medianIncome)}</td>
    <td data-value="${city.population}">${number(city.population)}</td>
  </tr>`
}

function burbankUninsuredExplain(city: City, cohort: City[]): string {
  const uninsuredMedian = median(cohort.map((item) => item.uninsuredPct).filter((value): value is number => value !== null))
  const incomeMedian = median(cohort.map((item) => item.medianIncome).filter((value): value is number => value !== null))
  const rate = city.uninsuredPct === null ? '—' : `${number(city.uninsuredPct, 1)}%`
  const income = city.medianIncome === null ? 'unpublished' : money(city.medianIncome)
  const peerRate = uninsuredMedian === null ? 'unpublished' : `${number(uninsuredMedian, 1)}%`
  const peerIncome =
    city.medianIncome === null || incomeMedian === null
      ? ''
      : `, ${signedPct(pctFromMedian(city.medianIncome, incomeMedian))} the peer income median of ${money(incomeMedian)}`
  const named = ['costa-mesa', 'glendale', 'pasadena', 'san-francisco']
    .map((slug) => cohort.find((item) => item.slug === slug))
    .filter((item): item is City => item !== undefined && item.uninsuredPct !== null)
  const namedLines = named
    .map((item) => {
      const itemIncome = item.medianIncome === null ? 'unpublished income' : money(item.medianIncome)
      return `${item.name} is ${number(item.uninsuredPct ?? 0, 1)}% uninsured at ${itemIncome}`
    })
    .join('; ')
  const county =
    city.countyUninsuredPct === null
      ? ''
      : ` Los Angeles County as a whole is ${number(city.countyUninsuredPct, 1)}% uninsured. That is the county mix, not a Burbank score.`
  return `
      <section class="panel">
        <h2>What this number means</h2>
        <p>Burbank is ${rate} uninsured. Among these ${cohort.length - 1} similar-size cities the median is ${peerRate}. Burbank's median household income is ${income}${peerIncome}. The comparison uses the same Census ACS 5-year definition in every city: residents of all ages with no health insurance.</p>
        <p>${namedLines === '' ? '' : `${namedLines}. `}Income does not automatically produce coverage. A richer peer can have a higher uninsured rate. A poorer neighbor can too.</p>
        <p>The City of Burbank did not buy this result. Employer plans, Medi-Cal, Medicare, and Covered California are what insure people. Studio and hospital jobs in Burbank are a plausible reason more residents have coverage. This table does not measure that. It also does not measure whether people can get an appointment, what they pay, or how good the care is.</p>
        <p>What it does not infer: that Burbank is healthier, that city hall runs an insurance program, or that Providence Saint Joseph is a municipal hospital. Hospital counts and miles are a different question and are not in this table.${county}</p>
      </section>`
}

function racePeerRow(city: City, current: boolean, dev: boolean): string {
  const base = siteBase(dev)
  return `<tr class="${current ? 'is-current' : ''}">
    <td><a href="${base}/cities/${city.slug}/">${escapeHtml(city.name)}</a>${current ? ' <span class="tag">This city</span>' : ''}</td>
    ${pctCell(city.hispanicPct)}
    ${pctCell(city.whiteNonHispanicPct)}
    ${pctCell(city.blackNonHispanicPct)}
    ${pctCell(city.asianNonHispanicPct)}
    ${pctCell(city.otherPct)}
    ${crimeRateCell(city, city.violentCrime)}
    ${crimeRateCell(city, city.propertyCrime)}
    <td data-value="${city.policePerResident ?? ''}">${moneyOrDash(city.policePerResident)}</td>
  </tr>`
}

function correlationRows(cohort: City[]): string {
  const groups: Array<{ label: string; key: keyof City }> = [
    { label: 'Hispanic %', key: 'hispanicPct' },
    { label: 'White NH %', key: 'whiteNonHispanicPct' },
    { label: 'Black NH %', key: 'blackNonHispanicPct' },
    { label: 'Asian NH %', key: 'asianNonHispanicPct' },
  ]
  return groups
    .map((group) => {
      const violent = pearsonPairs(
        cohort.map((item) => ({ x: numOrNull(item[group.key]), y: ratePerThousand(item.violentCrime, item.population) })),
      )
      const property = pearsonPairs(
        cohort.map((item) => ({
          x: numOrNull(item[group.key]),
          y: ratePerThousand(item.propertyCrime, item.population),
        })),
      )
      const police = pearsonPairs(
        cohort.map((item) => ({ x: numOrNull(item[group.key]), y: item.policePerResident })),
      )
      return `<tr>
        <td>${escapeHtml(group.label)}</td>
        ${rCell(violent)}
        ${rCell(property)}
        ${rCell(police)}
      </tr>`
    })
    .join('\n')
}

function numOrNull(value: City[keyof City]): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function pctCell(value: number | null): string {
  return `<td data-value="${value ?? ''}">${value === null ? '—' : `${number(value, 1)}%`}</td>`
}

function pctValueCell(value: number | null): string {
  return `<td data-value="${value ?? ''}">${value === null ? '—' : pct(value, 0)}</td>`
}

function rateCell(value: number | null): string {
  return `<td data-value="${value ?? ''}">${value === null ? '—' : number(value, 1)}</td>`
}

function rCell(value: number | null): string {
  return `<td data-value="${value ?? ''}">${value === null ? '—' : number(value, 2)}</td>`
}

export function methodologyPage(dataset: Dataset, dev: boolean): string {
  const s = dataset.sources
  const body = `
    <article class="prose">
      <h1>Methodology</h1>
      <p>This site asks whether a California city is getting what it pays for by putting each city's spending next to 20 similar cities. It does not grade cities and it does not claim that higher spending should produce lower crime.</p>
      <h2>Sources</h2>
      <ul>
        <li>California State Controller City Financial Transactions Reports, fiscal year ${s.scoFiscalYear}. Police uses <code>CURR_EXP_POLICE</code>. Parks uses <code>CURR_EXP_PARK_REC</code>. Utilities use electric, water, gas, sewer, and solid waste enterprise operating expenses (excluding depreciation), plus the matching governmental current-expenditure lines. Totals and population come from the Controller's per-capita file. Taxes use general and functional property-tax and sales-and-use-tax lines.</li>
        <li>Population growth compares the Controller estimate for ${s.scoFiscalYear} with ${s.scoPopulationPriorYear}.</li>
        <li>Housing and race/ethnicity: ${s.acsVintage ?? 'Census ACS 5-year was unavailable when this snapshot was built'}. Race reports use table B03002 (Hispanic or Latino of any race, and non-Hispanic White, Black, and Asian). Other is the remaining non-Hispanic groups.</li>
        <li>Uninsured reports use Census ACS 5-year uninsured share (B27001 or S2701, all ages) and median household income (B19013) on the same peer list as the spending posts. The figure is the share of residents with no health insurance. It is not a city-run insurance program. Employer plans, Medi-Cal, Medicare, and Covered California are outside the city budget. CDC PLACES modeled adult uninsured rates are not used.</li>
        <li>Hospitals and ERs: ${s.hospitalVintage ?? 'HCAI licensed facility listing was unavailable when this snapshot was built'}. Counts are open general acute care parent hospitals. Miles are from the Census city centroid to the nearest of those hospitals. Those fields stay on city pages. They are not part of the uninsured comparison.</li>
        <li>Crime: CA DOJ OpenJustice Crimes and Clearances${s.crimeYear ? `, calendar year ${s.crimeYear}` : ', city-level file unavailable in this snapshot'}. Tables show violent and property rates separately. Those are FBI index crimes (homicide, rape, robbery, aggravated assault; burglary, theft, auto theft, and arson). Traffic stops, citations, and most misdemeanors are not included. Clearance rates are UCR clear-by-arrest or exceptional means. A clearance recorded in this year can be for a crime from an earlier year, so the rate can exceed 100%.</li>
        <li>Police staffing: CA DOJ OpenJustice Law Enforcement Personnel${s.personnelYear ? `, October 31, ${s.personnelYear}` : ', city-level file unavailable in this snapshot'}. Counts are funded non-jail sworn officers. Sheriff, CHP, campus, transit, and park agencies are not assigned to a city. This is a one-day snapshot, not average annual staffing, and it is not a calls-for-service or response-time file.</li>
      </ul>
      <h2>Similar cities</h2>
      <p>Peers are California cities with at least 10,000 residents, excluding Vernon, Industry, and Irwindale. The first pass keeps cities between 0.5× and 2.0× the subject city's population. The 20 closest by log population are kept, with a small preference for the same region. If fewer than 20 remain, the band widens to 0.35–2.8×. For Burbank, Glendale and Pasadena replace Norwalk and Hesperia; Los Angeles, San Francisco, and San Diego replace Downey, Rialto, and Jurupa Valley; Chula Vista replaces San Buenaventura; and Simi Valley replaces South Gate.</p>
      <p>Police $ / crime is police spending per resident divided by crimes per resident. It is a comparison ratio, not a claim that higher spending should produce lower crime. Utility comparisons use the same peer list. Cities served by investor-owned utilities will show little or no electric spending.</p>
      <p>Demographics reports reuse that same peer list. Pearson r values are computed only inside that 21-city group. They measure association, not cause.</p>
      <p>Uninsured reports reuse that same peer list. They compare coverage and income, not city spending and not hospital supply. A lower uninsured rate is not a claim that city hall provided the insurance or that residents are healthier.</p>
      <h2>What we do not do</h2>
      <ul>
        <li>Contract or sheriff cities are flagged when police spending is zero or far below the peer median. They are not ranked on police spending, and county sheriff crime totals are not assigned to those cities.</li>
        <li>Enterprise utilities can make total spending look high. City pages also show governmental current spending.</li>
        <li>Finance years, ACS 5-year windows, and crime calendar years do not line up exactly. Every page shows the vintage that was used.</li>
        <li>Uninsured comparisons are not a claim that the city provided health insurance.</li>
      </ul>
      <p class="note">Snapshot generated ${escapeHtml(s.generatedAt)}.</p>
    </article>`
  return layout({
    dev,
    title: `Methodology — ${SITE}`,
    description: 'Sources, peer rules, and caveats for the California city comparison site.',
    body,
    path: '/methodology/',
  })
}

function featuredBlock(post: Post, dataset: Dataset, dev: boolean): string {
  const base = siteBase(dev)
  const city = dataset.cities.find((item) => item.slug === post.citySlug)
  return `
    <section class="feature">
      <p class="kicker">Featured comparison</p>
      <h2><a href="${base}/posts/${post.slug}/">${escapeHtml(post.title)}</a></h2>
      <p>${escapeHtml(post.dek)}</p>
      ${city ? `<p class="note"><a href="${base}/cities/${city.slug}/">Open the ${escapeHtml(city.name)} city page</a></p>` : ''}
    </section>`
}

function cityRow(city: City, dev: boolean): string {
  const base = siteBase(dev)
  return `<tr data-name="${escapeHtml(city.name.toLowerCase())}">
    <td><a href="${base}/cities/${city.slug}/">${escapeHtml(city.name)}</a></td>
    <td>${escapeHtml(city.county)}</td>
    <td data-value="${city.population}">${number(city.population)}</td>
    <td data-value="${city.totalSpendPerResident}">${money(city.totalSpendPerResident)}</td>
    <td data-value="${city.policePerResident ?? ''}">${moneyOrDash(city.policePerResident)}</td>
    <td data-value="${city.parksPerResident ?? ''}">${moneyOrDash(city.parksPerResident)}</td>
    ${crimeRateCell(city, city.violentCrime)}
    ${crimeRateCell(city, city.propertyCrime)}
  </tr>`
}

function peerRow(city: City, metric: PostMetric, current: boolean, dev: boolean): string {
  const base = siteBase(dev)
  const spec = METRIC_SPECS.find((item) => item.metric === metric)
  const value = spec?.getValue(city) ?? null
  const efficiency = policeSpendPerCrime(city.policePerResident, city.crimePer1000)
  const efficiencyCell =
    metric === 'police'
      ? `${rateCell(city.officersPer1000)}
    ${pctValueCell(city.violentClearancePct)}
    ${pctValueCell(city.propertyClearancePct)}
    <td data-value="${efficiency ?? ''}">${efficiency === null ? '—' : money(efficiency)}</td>`
      : ''
  const middleCells =
    metric === 'utilities'
      ? `<td data-value="${city.utilitySpend ?? ''}">${moneyOrDash(city.utilitySpend)}</td>`
      : `${crimeRateCell(city, city.violentCrime)}
    ${crimeRateCell(city, city.propertyCrime)}`
  return `<tr class="${current ? 'is-current' : ''}">
    <td><a href="${base}/cities/${city.slug}/">${escapeHtml(city.name)}</a>${current ? ' <span class="tag">This city</span>' : ''}</td>
    <td data-value="${value ?? ''}">${moneyOrDash(value)}</td>
    ${middleCells}
    ${efficiencyCell}
    <td data-value="${city.population}">${number(city.population)}</td>
  </tr>`
}

function sortHeader(label: string, sort: 'text' | 'number', tip: string): string {
  const text = `${tip} Click to sort.`
  return `<th data-sort="${sort}" data-tip="${escapeHtml(text)}" aria-label="${escapeHtml(`${label}. ${text}`)}">${escapeHtml(label)}</th>`
}

function metricPerResidentTip(metric: PostMetric): string {
  if (metric === 'police') return 'Municipal police current operating spending per resident.'
  if (metric === 'parks') return 'Parks and recreation current operating spending per resident.'
  if (metric === 'utilities') {
    return 'Municipal electric, water, gas, sewer, and solid waste operating spending per resident. Excludes depreciation. Investor-owned utility cities may be near zero.'
  }
  return 'Total reported city spending divided by population. Can include enterprise utilities.'
}

function crimeRate(city: City, count: number | null): number | null {
  if (!city.crimeAvailable) return null
  return ratePerThousand(count, city.population)
}

function crimeRateLabel(city: City, count: number | null, empty: string): string {
  const rate = crimeRate(city, count)
  return rate === null ? empty : number(rate, 1)
}

function crimeRateCell(city: City, count: number | null): string {
  const rate = crimeRate(city, count)
  return `<td data-value="${rate ?? ''}">${crimeRateLabel(city, count, '—')}</td>`
}

function metricCard(label: string, value: string, note: string): string {
  return `<div class="metric"><p class="metric-label">${escapeHtml(label)}</p><p class="metric-value">${escapeHtml(value)}</p><p class="metric-note">${escapeHtml(note)}</p></div>`
}

function citySummary(city: City, dataset: Dataset): string {
  const police = city.policePerResident === null ? 'Police spending is not reported as a municipal total.' : `${city.name} spends ${money(city.policePerResident)} per resident on police.`
  const growth = city.populationGrowthPct === null ? '' : ` Population changed ${growthLabel(city)} versus the ${dataset.sources.scoPopulationPriorYear} estimate.`
  return `${police}${growth}`
}

function policeCaption(city: City): string {
  if (city.policeModel === 'contract') return 'Likely contract or sheriff model'
  if (city.policeModel === 'unknown') return 'Police model unclear'
  return 'Municipal police current spending'
}

function moneyOrDash(value: number | null): string {
  return value === null ? '—' : money(value)
}

function growthLabel(city: City): string {
  if (city.populationGrowthPct === null) return '—'
  const sign = city.populationGrowthPct > 0 ? '+' : city.populationGrowthPct < 0 ? '-' : ''
  return `${sign}${pct(city.populationGrowthPct, 1)}`
}

function share(amount: number | null, population: number): number | null {
  if (amount === null || population <= 0) return null
  return amount / population
}
