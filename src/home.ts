import './styles.css'

const search = document.querySelector<HTMLInputElement>('#city-search')
if (search) {
  search.addEventListener('input', () => {
    const query = search.value.trim().toLowerCase()
    const rows = Array.from(document.querySelectorAll<HTMLTableRowElement>('#cities tbody tr'))
    for (const row of rows) {
      const name = row.dataset.name ?? row.textContent ?? ''
      row.hidden = query.length > 0 && !name.includes(query)
    }
  })
}

const tables = Array.from(document.querySelectorAll<HTMLTableElement>('table[data-sortable]'))
for (const table of tables) {
  const heads = Array.from(table.querySelectorAll<HTMLTableCellElement>('thead th[data-sort]'))
  heads.forEach((head, index) => {
    head.tabIndex = 0
    if (!head.title && !head.dataset.tip) head.title = 'Sort this column'
    if (!head.getAttribute('aria-sort')) head.setAttribute('aria-sort', 'none')
    head.addEventListener('click', () => sortTable(table, index, head.dataset.sort === 'number'))
    head.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        sortTable(table, index, head.dataset.sort === 'number')
      }
    })
  })
}

function sortTable(table: HTMLTableElement, column: number, numeric: boolean): void {
  const body = table.tBodies[0]
  if (!body) return
  const rows = Array.from(body.rows)
  const current = table.dataset.sortCol === String(column) ? table.dataset.sortDir : ''
  const dir = current === 'asc' ? 'desc' : 'asc'
  rows.sort((a, b) => {
    const av = cellValue(a.cells[column], numeric)
    const bv = cellValue(b.cells[column], numeric)
    if (av < bv) return dir === 'asc' ? -1 : 1
    if (av > bv) return dir === 'asc' ? 1 : -1
    return 0
  })
  for (const row of rows) body.append(row)
  table.dataset.sortCol = String(column)
  table.dataset.sortDir = dir
  const heads = Array.from(table.querySelectorAll<HTMLTableCellElement>('thead th[data-sort]'))
  heads.forEach((head, index) => {
    head.setAttribute('aria-sort', index === column ? (dir === 'asc' ? 'ascending' : 'descending') : 'none')
  })
}

function cellValue(cell: HTMLTableCellElement | undefined, numeric: boolean): string | number {
  if (!cell) return numeric ? Number.NEGATIVE_INFINITY : ''
  if (numeric) {
    const raw = cell.dataset.value ?? cell.textContent ?? ''
    const n = Number(raw)
    return Number.isFinite(n) ? n : Number.NEGATIVE_INFINITY
  }
  return (cell.textContent ?? '').trim().toLowerCase()
}
