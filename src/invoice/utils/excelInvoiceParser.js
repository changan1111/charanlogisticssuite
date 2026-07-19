import * as XLSX from 'xlsx'

// Converts an Excel date serial number (days since 1899-12-30, accounting for the
// Lotus 1-2-3 leap year bug Excel inherited) to {y, m, d}. Pure integer math — no
// Date object involved, so it is completely immune to timezone shifts.
function excelSerialToYMD(serial) {
  // Excel's epoch is 1899-12-30; serial 60 is the fictitious 1900-02-29.
  let days = Math.floor(serial)
  if (days > 59) days -= 1 // correct for Excel's leap-year bug
  const epoch = Date.UTC(1899, 11, 31) // 1899-12-31 in UTC ms, day 1 = 1900-01-01
  const ms = epoch + days * 86400000
  const dt = new Date(ms)
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }
}

// Converts an Excel serial date or Date object to "yyyy-mm-dd" for <input type="date">
function toISODate(val) {
  if (!val) return ''
  if (val instanceof Date) {
    // xlsx's cellDates Date objects are not always reliably UTC-midnight across
    // environments, so prefer UTC parts as the safer default.
    const y = val.getUTCFullYear(), m = String(val.getUTCMonth() + 1).padStart(2, '0'), d = String(val.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  // Excel serial number — convert with pure date-math, no timezone involved
  if (typeof val === 'number') {
    const { y, m, d } = excelSerialToYMD(val)
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  const s = String(val).trim()
  // already yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  // dd-mm-yyyy or dd/mm/yyyy
  const m1 = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/)
  if (m1) return `${m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`
  const parsed = new Date(s)
  if (!isNaN(parsed)) {
    // new Date(string) parses as LOCAL midnight (unlike xlsx's UTC Date objects), so use local getters here
    const y = parsed.getFullYear(), m = String(parsed.getMonth() + 1).padStart(2, '0'), d = String(parsed.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return ''
}

/**
 * Parses a logistics invoice-source Excel file (Kaira/JIT style) into line items.
 *
 * Pattern recognized (works for any client following this layout):
 *  - Header row contains both "DATE" and "DESCRIPTION" columns — everything below is data.
 *  - Columns (left to right, after blank col A): S:NO | DATE | DESCRIPTION | TOTAL PRICE
 *  - A DATE value, once seen, carries forward to all rows below until a new DATE appears.
 *  - A row that has a price starts a NEW line item (its own description text, qty fixed at 1).
 *  - A row with NO price (and usually no S:NO/date) is a continuation/sub-detail of the
 *    line item directly above it — its text is appended to that item's description.
 *  - Rows like "Grand Total" / "computer generated" footers are ignored.
 *
 * Returns: { items: [{id, date, desc, rate, qty}], skippedRows: number, rawRowCount: number }
 */
export function parseInvoiceExcel(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: false })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null })

  // Locate header row: must contain DATE and DESCRIPTION (case-insensitive) among its cells
  let headerIdx = -1
  for (let i = 0; i < rows.length; i++) {
    const cells = (rows[i] || []).map(c => (c == null ? '' : String(c).trim().toUpperCase()))
    if (cells.includes('DATE') && cells.includes('DESCRIPTION')) { headerIdx = i; break }
  }
  if (headerIdx === -1) {
    return { items: [], skippedRows: 0, rawRowCount: rows.length, error: 'Could not find a header row containing DATE and DESCRIPTION columns.' }
  }

  const headerCells = (rows[headerIdx] || []).map(c => (c == null ? '' : String(c).trim().toUpperCase()))
  const dateCol  = headerCells.findIndex(c => c === 'DATE')
  const descCol  = headerCells.findIndex(c => c === 'DESCRIPTION')
  // price column: contains TOTAL PRICE (handles "TOTAL PRICE\nS$" etc.)
  let priceCol = headerCells.findIndex(c => c.includes('TOTAL PRICE'))
  if (priceCol === -1) priceCol = headerCells.findIndex(c => c.includes('PRICE') || c.includes('AMOUNT'))

  const dataRows = rows.slice(headerIdx + 1)
  const items = []
  let currentDate = ''
  let currentItem = null
  let skipped = 0

  for (const row of dataRows) {
    if (!row || row.every(c => c == null || String(c).trim() === '')) continue // fully blank row

    const dateVal  = dateCol  >= 0 ? row[dateCol]  : null
    const descVal  = descCol  >= 0 ? row[descCol]  : null
    const priceVal = priceCol >= 0 ? row[priceCol] : null

    const descStr = descVal == null ? '' : String(descVal).trim()
    const lowerDesc = descStr.toLowerCase()
    if (lowerDesc.includes('grand total') || lowerDesc.includes('computer generated') || lowerDesc === '') {
      if (lowerDesc.includes('grand total')) break // stop parsing — footer reached
      skipped++
      continue
    }

    if (dateVal != null && String(dateVal).trim() !== '') {
      const iso = toISODate(dateVal)
      if (iso) currentDate = iso
    }

    const hasPrice = priceVal != null && String(priceVal).trim() !== '' && !isNaN(parseFloat(priceVal))

    if (hasPrice) {
      if (currentItem) items.push(currentItem)
      currentItem = {
        id: `imp-${items.length}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        date: currentDate,
        desc: descStr,
        rate: String(parseFloat(priceVal)),
        qty: '1',
      }
    } else {
      // continuation line — append to the previous item's description on a NEW LINE
      // (still ONE line item; \n is only for legibility in the editor/invoice)
      if (currentItem) {
        currentItem.desc += '\n' + descStr
      } else {
        // No item open yet and no price — start a draft item with 0 rate so nothing is silently dropped
        currentItem = {
          id: `imp-${items.length}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          date: currentDate,
          desc: descStr,
          rate: '0',
          qty: '1',
        }
      }
    }
  }
  if (currentItem) items.push(currentItem)

  return { items, skippedRows: skipped, rawRowCount: rows.length, error: null }
}

/** Extracts client name + address guess from the top of the sheet (rows above the header). */
export function parseClientHint(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: false })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null })

  let billingIdx = -1
  for (let i = 0; i < rows.length; i++) {
    const cells = (rows[i] || []).map(c => (c == null ? '' : String(c).trim().toUpperCase()))
    if (cells.some(c => c.includes('BILLING ADDRESS'))) { billingIdx = i; break }
  }
  if (billingIdx === -1) return { name: '', address: '' }

  const getFirstNonEmpty = (row) => {
    if (!row) return ''
    for (const c of row) {
      if (c != null && String(c).trim() !== '') return String(c).trim()
    }
    return ''
  }

  const nameRow = rows[billingIdx + 1]
  const name = getFirstNonEmpty(nameRow)
  const addrLines = []
  for (let i = billingIdx + 2; i < Math.min(billingIdx + 5, rows.length); i++) {
    const line = getFirstNonEmpty(rows[i])
    if (!line) break
    if (/^S:\s*NO/i.test(line) || line.toUpperCase() === 'DATE') break
    addrLines.push(line)
  }
  return { name, address: addrLines.join(', ') }
}
