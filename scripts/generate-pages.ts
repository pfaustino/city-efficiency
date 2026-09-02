import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cityPage, homePage, methodologyPage, postPage } from '../src/lib/html.ts'
import { assignPeersAndPosts } from '../src/lib/join.ts'
import type { City, Dataset, SourceVintage } from '../src/lib/types.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dev = process.argv.includes('--dev')

function main(): void {
  const dataset = readDataset()
  const out = join(root, 'generated')
  mkdirSync(out, { recursive: true })
  write(join(out, 'index.html'), homePage(dataset, dev))
  write(join(out, 'methodology', 'index.html'), methodologyPage(dataset, dev))
  for (const city of dataset.cities) {
    write(join(out, 'cities', city.slug, 'index.html'), cityPage(city, dataset, dev))
  }
  for (const post of dataset.posts) {
    write(join(out, 'posts', post.slug, 'index.html'), postPage(post, dataset, dev))
  }
  console.log(`Wrote ${dataset.cities.length} city pages and ${dataset.posts.length} posts to generated/`)
}

function readDataset(): Dataset {
  const cities = readJson<City[]>(join(root, 'data', 'cities.json'))
  const sources = readJson<SourceVintage>(join(root, 'data', 'sources.json'))
  const { posts } = assignPeersAndPosts(cities)
  writeJson(join(root, 'data', 'posts.json'), posts)
  return { cities, posts, sources }
}

function readJson<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    throw new Error(`Missing ${path}. Run npm run update-data first.`)
  }
}

function write(path: string, html: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, html)
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

main()
