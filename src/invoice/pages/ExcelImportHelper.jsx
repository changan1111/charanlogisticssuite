import { useState, useRef } from 'react'
import { parseInvoiceExcel, parseClientHint } from '../utils/excelInvoiceParser'
import { fmt } from '../utils/helpers'

const mkRow = (d = {}) => ({
  id: d.id || `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  date: d.date || '',
  desc: d.desc || '',
  rate: d.rate ?? '',
  qty: d.qty ?? '1',
})

export default function ExcelImportHelper({ onSendToInvoice }) {
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState([])
  const [clientHint, setClientHint] = useState({ name: '', address: '' })
  const [error, setError] = useState('')
  const [parsing, setParsing] = useState(false)
  const fileRef = useRef(null)

  const total = rows.reduce((s, r) => s + (parseFloat(r.qty) || 1) * (parseFloat(r.rate) || 0), 0)

  const handleFile = async (file) => {
    if (!file) return
    setError('')
    setParsing(true)
    setFileName(file.name)
    try {
      const buf = await file.arrayBuffer()
      const { items, error: parseErr } = parseInvoiceExcel(buf)
      const hint = parseClientHint(buf)
      setClientHint(hint)
      if (parseErr) {
        setError(parseErr)
        setRows([])
      } else if (!items.length) {
        setError('No line items could be detected in this file. Check that it has DATE / DESCRIPTION / TOTAL PRICE columns.')
        setRows([])
      } else {
        setRows(items.map(it => mkRow(it)))
      }
    } catch (e) {
      setError('Could not read this file: ' + (e.message || 'unknown error'))
      setRows([])
    }
    setParsing(false)
  }

  const onDrop = (e) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const update = (id, key, val) => setRows(rs => rs.map(r => r.id === id ? { ...r, [key]: val } : r))
  const removeRow = (id) => setRows(rs => rs.filter(r => r.id !== id))
  const addRow = () => setRows(rs => [...rs, mkRow()])
  const clearAll = () => { setRows([]); setFileName(''); setClientHint({ name: '', address: '' }); setError('') }

  const handleSend = () => {
    const validRows = rows.filter(r => r.desc.trim() && parseFloat(r.rate) >= 0)
    if (!validRows.length) { setError('Add at least one line item with a description before sending.'); return }
    onSendToInvoice({
      rows: validRows.map(r => ({ id: r.id, date: r.date, desc: r.desc.trim(), qty: r.qty || '1', rate: r.rate || '0' })),
      clientHint,
    })
  }

  return (
    <div className="page">
      <div className="pr-info-note">
        💡 Upload a logistics invoice-source Excel file (Kaira/JIT style — DATE / DESCRIPTION / TOTAL PRICE columns).
        Dates carry forward to rows below until a new date appears. Continuation rows with no price merge into the
        line item above them. Review and edit everything below before sending to Add Invoice.
      </div>

      <div className="pr-card">
        <div className="pr-card-title">Upload Excel File</div>
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          style={{
            border: '2px dashed #cbd5e0', borderRadius: 10, padding: '32px 20px',
            textAlign: 'center', cursor: 'pointer', background: '#fafbfc', transition: 'background .15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#f3f6fa'}
          onMouseLeave={e => e.currentTarget.style.background = '#fafbfc'}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
          <div style={{ fontWeight: 600, color: '#2d3748', marginBottom: 4 }}>
            {fileName ? `Loaded: ${fileName}` : 'Click or drag an .xlsx file here'}
          </div>
          <div style={{ fontSize: 12.5, color: '#718096' }}>
            {parsing ? 'Parsing…' : 'Supports Kaira / JIT style invoice-source spreadsheets'}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={e => handleFile(e.target.files?.[0])}
          />
        </div>

        {(clientHint.name || clientHint.address) && (
          <div style={{ marginTop: 14, padding: '10px 14px', background: '#ebf8ff', border: '1px solid #bee3f8', borderRadius: 8, fontSize: 13 }}>
            <strong>Detected client:</strong> {clientHint.name || '—'}
            {clientHint.address && <div style={{ color: '#4a5568', marginTop: 2 }}>{clientHint.address}</div>}
          </div>
        )}

        {error && <div className="alert-error" style={{ marginTop: 14 }}>❌ {error}</div>}
      </div>

      {rows.length > 0 && (
        <div className="pr-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div className="pr-card-title" style={{ marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }}>
              Parsed Line Items ({rows.length})
            </div>
            <button className="qt-add-row-btn" onClick={clearAll} style={{ fontSize: 12.5 }}>✕ Clear & Start Over</button>
          </div>

          <div className="qt-items-table-wrap">
            <table className="qt-items-table" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th style={{ width: 130 }}>Date</th>
                  <th>Description</th>
                  <th style={{ width: 60, textAlign: 'center' }}>Qty</th>
                  <th style={{ width: 110, textAlign: 'right' }}>Rate (S$)</th>
                  <th style={{ width: 110, textAlign: 'right' }}>Amount</th>
                  <th style={{ width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id}>
                    <td style={{ textAlign: 'center', color: '#7a6e58', fontWeight: 600 }}>{i + 1}</td>
                    <td><input type="date" value={r.date} onChange={e => update(r.id, 'date', e.target.value)} /></td>
                    <td style={{ verticalAlign: 'top', padding: '4px' }}>
                      <textarea
                        value={r.desc}
                        onChange={e => { update(r.id, 'desc', e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }}
                        placeholder="Description"
                        rows={1}
                        style={{ resize: 'none', overflow: 'hidden', minHeight: 34, lineHeight: '1.5', width: '100%', boxSizing: 'border-box', padding: '5px 8px', fontFamily: 'inherit', fontSize: 'inherit', border: '1px solid #cbd5e0', borderRadius: 4, background: 'white', outline: 'none' }}
                        ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' } }}
                      />
                    </td>
                    <td><input type="number" min="1" value={r.qty} onChange={e => update(r.id, 'qty', e.target.value)} style={{ textAlign: 'center' }} /></td>
                    <td><input type="number" min="0" step="0.01" value={r.rate} onChange={e => update(r.id, 'rate', e.target.value)} style={{ textAlign: 'right' }} /></td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      S$ {fmt((parseFloat(r.qty) || 1) * (parseFloat(r.rate) || 0))}
                    </td>
                    <td><button className="qt-del-btn" onClick={() => removeRow(r.id)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="qt-add-row-btn" onClick={addRow}>+ Add Item</button>

          <div className="qt-totals-row">
            <div className="qt-total-item">
              <div className="qt-total-label">Total ({rows.length} items)</div>
              <div className="qt-total-value grand">S$ {fmt(total)}</div>
            </div>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="pr-actions">
          <button className="btn btn-outline" onClick={clearAll}>✕ Discard</button>
          <button className="btn btn-primary" onClick={handleSend}>
            📤 Send {rows.length} Line Item{rows.length !== 1 ? 's' : ''} to Add Invoice
          </button>
        </div>
      )}
    </div>
  )
}
