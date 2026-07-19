import { useState, useEffect } from 'react'
import { sb } from '../supabase'
import LineItemsEditor from './LineItemsEditor'
import ExcelUploadButton from './ExcelUploadButton'

export default function EditInvoiceModal({ inv, lineItemCache, cfg, onClose, onSaved }) {
  const [form, setForm] = useState({
    billingdate: '', status: inv.status || '', name: inv.name || '',
    address: inv.addr || '', attn: inv.attn || ''
  })
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let bd = inv.billingDate || ''
    if (bd && bd.includes('-') && bd.split('-')[0].length === 2) {
      const [d, m, y] = bd.split('-')
      bd = `${y}-${m}-${d}`
    }
    setForm({ billingdate: bd, status: inv.status || '', name: inv.name || '', address: inv.addr || '', attn: inv.attn || '' })

    const mapRows = (items) => items.map(li => ({
      id: li.id ?? Math.random(),
      date: (() => {
        const raw = li.date || li.li_date || li.delivery_date || li.item_date || ''
        if (!raw) return ''
        const parts = raw.split(/[-\/]/)
        if (parts.length !== 3) return ''
        if (parts[0].length === 4) return raw
        return `${parts[2]}-${parts[1]}-${parts[0]}`
      })(),
      desc: li.description || li.desc || li.item || '',
      qty: String(parseFloat(li.qty || li.quantity || li.units || 1) || 1),
      rate: String(parseFloat(li.unit_price || li.price || li.rate || 0) || 0),
    }))

    const invNum = inv.number ?? inv.invoice_number
    if (invNum) {
      sb.from('line_items').select('*').eq('invoice_number', invNum)
        .then(({ data, error }) => {
          if (data && data.length > 0) {
            setRows(mapRows(data))
          } else {
            const cached = lineItemCache[invNum] || inv.items || []
            if (cached.length > 0) setRows(mapRows(cached))
          }
        })
    }
  }, [inv.number, inv.invoice_number])

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // Excel import (in-place): append parsed rows BELOW the invoice's existing line items.
  // Existing rows are never touched; fully blank rows are dropped before appending.
  const isEmptyRow = r => !(r.desc || '').trim() && !String(r.rate ?? '').trim() && !(r.date || '')
  const handleExcelRows = (newRows) => {
    setError(''); setSuccess('')
    setRows(prev => [...prev.filter(r => !isEmptyRow(r)), ...newRows])
  }

  const submit = async () => {
    setError(''); setSuccess('')
    const { billingdate, status, name } = form
    if (!billingdate || !status || !name) { setError('Please fill all required fields.'); return }

    const validRows = rows.filter(r => (r.desc || r.description) && parseFloat(r.qty) > 0)
    if (!validRows.length) { setError('At least one line item is required.'); return }

    const [by, bm, bd] = billingdate.split('-')
    const billingDateFmt = `${bd}-${bm}-${by}`
    const total = validRows.reduce((s, r) => s + parseFloat(r.qty) * parseFloat(r.rate || 0), 0)

    setSaving(true)
    try {
      const { error: e1 } = await sb.from('clients').update({
        billing_date: billingDateFmt, status,
        name, address: form.address,
        attn: form.attn, total,
      }).eq('invoice_number', inv.number ?? inv.invoice_number)
      if (e1) throw e1

      const invNum = inv.number ?? inv.invoice_number
      await sb.from('line_items').delete().eq('invoice_number', invNum)
      if (validRows.length) {
        const liData = validRows.map(r => {
          const dateRaw = r.date
          let dateFmt = ''
          if (dateRaw) { const [y2, m2, d2] = dateRaw.split('-'); dateFmt = `${d2}-${m2}-${y2}` }
          const desc = r.desc || r.description || ''
          const qty = parseFloat(r.qty) || 1
          const price = parseFloat(r.rate || r.unit_price || 0)
          return {
            invoice_number: invNum,
            date: dateFmt,
            description: desc,
            qty: qty,
            unit_price: price,
          }
        })
        await sb.from('line_items').insert(liData)
      }

      setSuccess('✅ Invoice updated successfully!')
      setTimeout(() => { onSaved() }, 1500)
    } catch (e) {
      setError('Update failed: ' + (e.message || 'error'))
    }
    setSaving(false)
  }

  return (
    <div className="overlay open" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="modal-bar">
          <span className="modal-bar-lbl">Edit Invoice #{inv.number}</span>
          <button className="xbtn" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '1.5rem' }}>
          {success && <div className="alert-success">✅ {success}</div>}
          {error && <div className="alert-error">❌ {error}</div>}

          <div className="pr-card">
            <div className="pr-card-title">Invoice Details</div>
            <div className="pr-form-grid">
              <div className="pr-field">
                <label>Invoice Number</label>
                <input type="text" value={inv.number} disabled style={{ background: '#f5f5f5', cursor: 'not-allowed' }} />
              </div>
              <div className="pr-field">
                <label>Billing Date <span style={{ color: '#c0282e' }}>*</span></label>
                <input type="date" value={form.billingdate} onChange={e => f('billingdate', e.target.value)} />
              </div>
              <div className="pr-field">
                <label>Status <span style={{ color: '#c0282e' }}>*</span></label>
                <select value={form.status} onChange={e => f('status', e.target.value)}>
                  <option value="">— Select —</option>
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                </select>
              </div>
              <div className="pr-field span2">
                <label>Client Name <span style={{ color: '#c0282e' }}>*</span></label>
                <input type="text" value={form.name} onChange={e => f('name', e.target.value)} />
              </div>
              <div className="pr-field span2">
                <label>Client Address</label>
                <input type="text" value={form.address} onChange={e => f('address', e.target.value)} />
              </div>
              <div className="pr-field span2">
                <label>ATTN (optional)</label>
                <input type="text" value={form.attn} onChange={e => f('attn', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="pr-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
              <div className="pr-card-title" style={{ marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }}>Line Items</div>
              <ExcelUploadButton onRows={handleExcelRows} onError={setError} />
            </div>
            <LineItemsEditor value={rows} onChange={setRows} />
          </div>

          <div className="pr-actions">
            <button className="btn btn-outline" onClick={onClose}>✕ Cancel</button>
            <button className="btn btn-primary" onClick={submit} disabled={saving}>
              {saving ? <><span className="spinner-sm" />Saving…</> : '☁ Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
