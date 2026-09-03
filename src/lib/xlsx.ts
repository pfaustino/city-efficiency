const LOCAL_FILE = 0x04034b50

export async function unzipEntry(buf: Uint8Array, name: string): Promise<string> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let offset = 0
  while (offset + 30 <= buf.length) {
    const sig = view.getUint32(offset, true)
    if (sig !== LOCAL_FILE) break
    const method = view.getUint16(offset + 8, true)
    const compSize = view.getUint32(offset + 18, true)
    const nameLen = view.getUint16(offset + 26, true)
    const extraLen = view.getUint16(offset + 28, true)
    const fileName = new TextDecoder().decode(buf.subarray(offset + 30, offset + 30 + nameLen))
    const dataStart = offset + 30 + nameLen + extraLen
    const data = buf.subarray(dataStart, dataStart + compSize)
    if (fileName === name || fileName.endsWith(`/${name}`)) {
      const raw = method === 0 ? data : await inflateRaw(data)
      return new TextDecoder().decode(raw)
    }
    offset = dataStart + compSize
  }
  throw new Error(`ZIP entry not found: ${name}`)
}

export async function parseXlsxSheet(buf: Uint8Array, sheetPath = 'xl/worksheets/sheet1.xml'): Promise<string[][]> {
  const shared = parseSharedStrings(await unzipEntry(buf, 'xl/sharedStrings.xml'))
  const sheet = await unzipEntry(buf, sheetPath)
  const rows: string[][] = []
  for (const rowMatch of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = new Map<number, string>()
    let maxCol = -1
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1]
      const ref = attr(attrs, 'r')
      const type = attr(attrs, 't')
      const col = columnIndex(ref.replace(/\d+$/, ''))
      const raw = cellMatch[2].match(/<v[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? ''
      const value = type === 's' ? (shared[Number(raw)] ?? '') : decodeXml(raw)
      cells.set(col, value)
      if (col > maxCol) maxCol = col
    }
    const row: string[] = []
    for (let i = 0; i <= maxCol; i += 1) row.push(cells.get(i) ?? '')
    rows.push(row)
  }
  return rows
}

export function parseSharedStrings(xml: string): string[] {
  const out: string[] = []
  for (const item of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const texts = [...item[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1]))
    out.push(texts.join(''))
  }
  return out
}

function attr(attrs: string, name: string): string {
  return attrs.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? ''
}

function columnIndex(letters: string): number {
  let n = 0
  for (const ch of letters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64)
  }
  return n - 1
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(data.byteLength)
  copy.set(data)
  const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function decodeXml(value: string): string {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
}
