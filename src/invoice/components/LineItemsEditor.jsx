import { useState, useEffect } from 'react'
import { fmt } from '../utils/helpers'

const emptyRow = () => ({ id: Date.now() + Math.random(), date: '', desc: '', qty: '1', rate: '' })

export default function LineItemsEditor({ value, onChange }) {
  const [rows, setRows] = useState(value && value.length ? value : [emptyRow(), emptyRow(), emptyRow()])

  useEffect(() => {
    if (value && value.length > 0) {
      const currentIds = rows.map(r => r.id).join(',')
      const newIds = value.map(r => r.id).join(',')
      if (currentIds !== newIds) setRows(value)
    }
  }, [value])

  useEffect(() => {
    onChange(rows)
  }, [rows])

  const autoResize = (el) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }

  const update = (id, field, val, el) => {
    if (field === 'qty') {
      const qty = Math.max(1, parseInt(val, 10) || 1)
      setRows(rs => rs.map(r => r.id === id ? { ...r, qty: String(qty) } : r))
      return
    }
    if (field === 'rate') {
      const rate = val === '' ? '' : String(parseFloat(val) || 0)
      setRows(rs => rs.map(r => r.id === id ? { ...r, rate } : r))
      return
    }
    if (field === 'desc' && el) autoResize(el)
    setRows(rs => rs.map(r => r.id === id ? { ...r, [field]: val } : r))
  }

  const handleDescKeyDown = (e, id) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const el = e.target
      const start = el.selectionStart
      const end = el.selectionEnd
      const current = el.value
      const next = current.slice(0, start) + '\n' + current.slice(end)
      setRows(rs => rs.map(r => r.id === id ? { ...r, desc: next } : r))
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 1
        autoResize(el)
      })
    }
  }

  const addRow = () => setRows(rs => [...rs, emptyRow()])
  const delRow = (id) => setRows(rs => rs.filter(r => r.id !== id))

  const total = rows.reduce((s, r) => s + (parseFloat(r.qty) || 0) * (parseFloat(r.rate) || 0), 0)

  return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <table className="qt-items-table" style={{ minWidth: 580 }}>
          <thead>
            <tr>
              <th style={{ width: 36 }}>#</th>
              <th>Date</th>
              <th>Description <span style={{ color: '#f0d080' }}>*</span></th>
              <th style={{ width: 70, textAlign: 'center' }}>Qty <span style={{ color: '#f0d080' }}>*</span></th>
              <th style={{ width: 120, textAlign: 'right' }}>Rate (S$) <span style={{ color: '#f0d080' }}>*</span></th>
              <th style={{ width: 120, textAlign: 'right' }}>Amount (S$)</th>
              <th style={{ width: 36 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const amt = (parseFloat(r.qty) || 0) * (parseFloat(r.rate) || 0)
              return (
                <tr key={r.id}>
                  <td style={{ textAlign: 'center', color: '#7a6e58', fontWeight: 600, fontSize: '.82rem' }}>{i + 1}</td>
                  <td><input type="date" value={r.date} onChange={e => update(r.id, 'date', e.target.value)} style={{ minWidth: 130 }} /></td>
                  <td style={{ verticalAlign: 'top', padding: '4px' }}>
                    <textarea
                      placeholder="Description (Enter = new line)"
                      value={r.desc}
                      rows={1}
                      onChange={e => update(r.id, 'desc', e.target.value, e.target)}
                      onKeyDown={e => handleDescKeyDown(e, r.id)}
                      style={{
                        resize: 'none',
                        overflow: 'hidden',
                        minHeight: 34,
                        lineHeight: '1.5',
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '5px 8px',
                        fontFamily: 'inherit',
                        fontSize: 'inherit',
                        border: '1px solid #cbd5e0',
                        borderRadius: 4,
                        background: 'white',
                        outline: 'none',
                        color: 'var(--ink)',
                      }}
                      onFocus={e => e.target.style.borderColor = '#3b82f6'}
                      onBlur={e => e.target.style.borderColor = '#cbd5e0'}
                      ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' } }}
                    />
                  </td>
                  <td><input type="number" placeholder="1" value={r.qty} min="1" step="1" onChange={e => update(r.id, 'qty', e.target.value)} style={{ textAlign: 'center' }} /></td>
                  <td><input type="number" placeholder="0.00" value={r.rate} step="0.01" onChange={e => update(r.id, 'rate', e.target.value)} style={{ textAlign: 'right' }} /></td>
                  <td style={{ textAlign: 'right', fontWeight: 600, fontSize: '.85rem', color: amt < 0 ? '#c0282e' : 'var(--ink)' }}>S$ {fmt(amt)}</td>
                  <td><button className="qt-del-btn" onClick={() => delRow(r.id)} title="Remove row">✕</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <button className="qt-add-row-btn" onClick={addRow} type="button">+ Add Row</button>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12, gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '.68rem', textTransform: 'uppercase', letterSpacing: '.07em', color: '#7a6e58' }}>Total Amount</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, fontFamily: "'Outfit',serif", color: total < 0 ? '#c0282e' : 'var(--gold)' }}>S$ {fmt(total)}</div>
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: '.75rem', color: 'var(--muted)' }}>
        💡 Total is auto-calculated. Description is required. Use negative Rate for deductions.
      </div>
    </>
  )
}
