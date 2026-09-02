# Is Your City Getting What It Pays For?

A California-only static site that puts each city's spending next to 20 similar cities. Police, parks, and total spend come from the State Controller. Housing comes from the Census ACS. Crime comes from OpenJustice.

Live site (after Pages deploy): [https://pfaustino.github.io/city-efficiency/](https://pfaustino.github.io/city-efficiency/)

```bash
npm install
npm run update-data
npm run dev
```

`update-data` needs network access. Housing fill-in uses a Census API key when `CENSUS_API_KEY` is set; the rest of the snapshot still builds without it.

## What the posts look like

> Burbank spends $654 per resident on police. Here's how that compares with 20 similar California cities.

Peers are other California cities in a 0.5–2.0× population band, excluding industrial outliers. The site does not grade cities and does not claim that higher spending should produce lower crime.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run update-data` | Fetch public sources and write `data/*.json` |
| `npm run generate-pages` | Build city, post, and methodology HTML |
| `npm run dev` | Generate pages and run Vite |
| `npm run check` | Typecheck, tests, and production build |

## Sources

- [CA State Controller city expenditures](https://bythenumbers.sco.ca.gov/Finance-Application/City-Expenditures/ju3w-4gxp)
- [City expenditures per capita](https://bythenumbers.sco.ca.gov/Cities/City-Expenditures-Per-Capita/ykhf-vfsr)
- [City revenues](https://bythenumbers.sco.ca.gov/d/rrtv-rsj9)
- [Census ACS 5-year](https://www.census.gov/programs-surveys/acs)
- [OpenJustice crimes and clearances](https://openjustice.doj.ca.gov/data)
