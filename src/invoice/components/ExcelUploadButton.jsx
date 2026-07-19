import { useState, useRef } from 'react'
import { parseInvoiceExcel } from '../utils/excelInvoiceParser'

/**
 * Compact "Import Excel" button for use inside Add Invoice / Edit Invoice.
 * Parses the same Kaira/JIT format as the Excel Import panel and hands the
 * parsed rows (already in LineItemsEditor shape) to the parent via onRows.
 * Parent decides what to do with them (we append below existing rows).
 */
export default function ExcelUploadButton({ onRows, onError }) {
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  const handleFile = async (file) => {
    if (!file) return
    setBusy(true)
    try {
      const buf = await file.arrayBuffer()
      const { items, error } = parseInvoiceExcel(buf)
      if (error) {
        onError?.(error)
      } else if (!items.length) {
        onError?.('No line items detected in this file. Check that it has DATE / DESCRIPTION / TOTAL PRICE columns.')
      } else {
        onRows(items.map(it => ({
          id: `imp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          date: it.date || '',
          desc: it.desc || '',
          qty: it.qty || '1',
          rate: it.rate ?? '0',
        })))
      }
    } catch (e) {
      onError?.('Could not read this file: ' + (e.message || 'unknown error'))
    }
    setBusy(false)
    if (fileRef.current) fileRef.current.value = '' // allow re-uploading the same file
  }

  return (
    <>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        title="Import line items from a Kaira/JIT style Excel — rows are appended below existing line items"
        style={{
          whiteSpace: 'nowrap', padding: '6px 12px', background: '#2b6cb0', color: 'white',
          border: 'none', borderRadius: 6, cursor: busy ? 'wait' : 'pointer', fontSize: 13, flexShrink: 0,
        }}
      >
        {busy ? 'Parsing…' : '📊 Import Excel'}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: 'none' }}
        onChange={e => handleFile(e.target.files?.[0])}
      />
    </>
  )
}
