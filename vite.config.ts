import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/' : '/city-efficiency/',
  plugins: [generatedPages()],
  build: {
    rollupOptions: {
      input: resolve('index.html'),
      output: {
        entryFileNames: 'assets/app.js',
        assetFileNames: (info) =>
          info.names.some((name) => name.endsWith('.css')) ? 'assets/styles.css' : 'assets/[name][extname]',
      },
    },
  },
}))

function generatedPages(): Plugin {
  const generated = resolve('generated')
  return {
    name: 'generated-pages',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          next()
          return
        }
        const url = (req.url ?? '/').split('?')[0] ?? '/'
        const file = resolveGeneratedFile(generated, url)
        if (!file) {
          next()
          return
        }
        const html = htmlForDevServer(readFileSync(file, 'utf8'))
        void server.transformIndexHtml(url, html).then((transformed) => {
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(transformed)
        })
      })
    },
    closeBundle() {
      const dist = resolve('dist')
      if (!existsSync(generated) || !existsSync(dist)) return
      copyHtml(generated, dist)
    },
  }
}

const PAGES_BASE = '/city-efficiency'

function pagePath(url: string): string {
  let path = decodeURIComponent(url.split('?')[0] ?? '/')
  if (path === PAGES_BASE || path.startsWith(`${PAGES_BASE}/`)) {
    path = path.slice(PAGES_BASE.length) || '/'
  }
  return path.replace(/\/+$/, '') || '/'
}

function htmlForDevServer(html: string): string {
  return html
    .replaceAll(`${PAGES_BASE}/assets/styles.css`, '/src/styles.css')
    .replaceAll(`${PAGES_BASE}/assets/app.js`, '/src/home.ts')
    .replaceAll(`href="${PAGES_BASE}/favicon.svg"`, 'href="/favicon.svg"')
}

function resolveGeneratedFile(root: string, url: string): string | null {
  const path = pagePath(url)
  const relative = path.replace(/^\/+/, '')
  const candidates = [
    relative ? join(root, relative, 'index.html') : join(root, 'index.html'),
    relative ? join(root, `${relative}.html`) : '',
  ]
  return candidates.find((candidate) => candidate.endsWith('.html') && existsSync(candidate)) ?? null
}

function copyHtml(from: string, to: string): void {
  for (const name of readdirSync(from)) {
    const source = join(from, name)
    const dest = join(to, name)
    if (statSync(source).isDirectory()) {
      mkdirSync(dest, { recursive: true })
      copyHtml(source, dest)
      continue
    }
    if (!name.endsWith('.html')) continue
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, readFileSync(source, 'utf8'))
  }
}
