import { useState, useEffect } from 'react'
import { sb } from '../supabase'
import { todayStr } from '../utils/helpers'
import LineItemsEditor from '../components/LineItemsEditor'
import ExcelUploadButton from '../components/ExcelUploadButton'

export default function AddInvoicePanel({ cfg, onSaved, invoices, prefill, onPrefillConsumed }) {
  const [form, setForm] = useState({
    invnum: '', billingdate: todayStr(), status: '', name: '', address: '', attn: ''
  })
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)
  const [clientSuggestions, setClientSuggestions] = useState([])
  const [fromImport, setFromImport] = useState(false)

  useEffect(() => {
    if (!prefill) return
    setRows(prefill.rows.map(r => ({
      id: r.id || `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date: r.date || '', desc: r.desc || '', qty: r.qty || '1', rate: r.rate || '0',
    })))
    if (prefill.clientHint?.name) {
      setForm(p => ({ ...p, name: prefill.clientHint.name, address: prefill.clientHint.address || p.address }))
    }
    setFromImport(true)
    onPrefillConsumed?.()
  }, [prefill])

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // Excel import (in-place): append parsed rows BELOW existing ones.
  // Untouched blank seed rows are dropped so imports don't land under empty lines.
  const isEmptyRow = r => !(r.desc || '').trim() && !String(r.rate ?? '').trim() && !(r.date || '')
  const handleExcelRows = (newRows) => {
    setError(''); setSuccess('')
    setRows(prev => [...prev.filter(r => !isEmptyRow(r)), ...newRows])
    setFromImport(true)
  }

  const fetchAutoNumber = async () => {
    try {
      const { data } = await sb.from('clients').select('invoice_number').order('updated_at', { ascending: false }).limit(100)
      const nums = (data || []).map(r => {
        const parts = String(r.invoice_number || '').split('/')
        return parseInt(parts[parts.length - 1]) || 0
      }).filter(n => !isNaN(n))
      const year = new Date().getFullYear()
      const next = nums.length ? Math.max(...nums) + 1 : 1
      f('invnum', `${year}/${String(next).padStart(5, '0')}`)
    } catch { setError('Could not auto-generate number') }
  }

  const fetchClientAddr = async () => {
    if (!form.name.trim()) return
    try {
      const { data } = await sb.from('clients').select('name,address').ilike('name', `%${form.name.trim()}%`).order('updated_at', { ascending: false }).limit(10)
      if (!data || data.length === 0) return
      const unique = data.filter((r, i, arr) => arr.findIndex(x => x.name === r.name) === i)
      if (unique.length === 1) {
        f('name', unique[0].name)
        f('address', unique[0].address || '')
        setClientSuggestions([])
      } else {
        setClientSuggestions(unique)
      }
    } catch {}
  }

  const pickSuggestion = (row) => {
    f('name', row.name)
    f('address', row.address || '')
    setClientSuggestions([])
  }

  const reset = () => {
    setForm({ invnum: '', billingdate: todayStr(), status: '', name: '', address: '', attn: '' })
    setRows([])
    setError(''); setSuccess('')
    setFromImport(false)
  }

  const submit = async () => {
    setError(''); setSuccess('')
    const { invnum, billingdate, status, name } = form
    if (!invnum || !billingdate || !status || !name) {
      setError('Please fill all required fields marked with *.'); return
    }
    const validRows = rows.filter(r => r.desc && r.qty && parseFloat(r.qty) > 0 && !isNaN(parseFloat(r.rate)))
    if (!validRows.length) { setError('At least one line item with Description, Qty and Rate is required.'); return }

    const [by, bm, bd] = billingdate.split('-')
    const billingDateFmt = `${bd}-${bm}-${by}`
    const total = validRows.reduce((s, r) => s + parseFloat(r.qty) * parseFloat(r.rate || 0), 0)

    setSaving(true)
    try {
      const { error: invErr } = await sb.from('clients').upsert({
        invoice_number: invnum,
        billing_date: billingDateFmt,
        status,
        name,
        address: form.address,
        attn: form.attn,
        total,
      }, { onConflict: 'invoice_number' })
      if (invErr) throw invErr

      if (validRows.length) {
        const liData = validRows.map(r => {
          const dateRaw = r.date
          let dateFmt = ''
          if (dateRaw) {
            const [y2, m2, d2] = dateRaw.split('-')
            dateFmt = `${d2}-${m2}-${y2}`
          }
          return {
            invoice_number: invnum,
            date: dateFmt,
            description: r.desc,
            qty: parseFloat(r.qty),
            unit_price: parseFloat(r.rate || 0),
          }
        })
        const { error: liErr } = await sb.from('line_items').insert(liData)
        if (liErr) throw liErr
      }

      setSuccess(`Invoice #${invnum} saved successfully!`)
      reset()
      onSaved()
    } catch (e) {
      setError('Save failed: ' + (e.message || 'error'))
    }
    setSaving(false)
  }

  return (
    <div className="page">
      {success && <div className="alert-success">✅ {success}</div>}
      {error   && <div className="alert-error">❌ {error}</div>}
      {fromImport && (
        <div className="pr-info-note" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span>📊 Line items loaded from Excel import — review and edit before saving.</span>
          <button type="button" onClick={() => setFromImport(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#718096', fontSize: 13, flexShrink: 0 }}>✕ Dismiss</button>
        </div>
      )}

      <div className="pr-card">
        <div className="pr-card-title">Invoice Details</div>
        <div className="pr-form-grid">
          <div className="pr-field">
            <label>Invoice Number <span style={{ color: '#c0282e' }}>*</span></label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="text" value={form.invnum} onChange={e => f('invnum', e.target.value)} placeholder="e.g. 2026/00001" style={{ flex: 1, minWidth: 0 }} />
              <button type="button" onClick={fetchAutoNumber} style={{ whiteSpace: 'nowrap', padding: '6px 12px', background: '#2b6cb0', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, flexShrink: 0 }}>Auto Number</button>
            </div>
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
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="text" value={form.name} onChange={e => { f('name', e.target.value); setClientSuggestions([]) }} placeholder="e.g. ABC Pte Ltd" style={{ flex: 1 }} />
              <button type="button" onClick={fetchClientAddr} style={{ whiteSpace: 'nowrap', padding: '6px 12px', background: '#2b6cb0', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Fetch</button>
            </div>
            {clientSuggestions.length > 1 && (
              <div style={{ border: '1px solid #cbd5e0', borderRadius: 6, marginTop: 4, background: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', zIndex: 10, position: 'relative' }}>
                {clientSuggestions.map((s, i) => (
                  <div key={i} onClick={() => pickSuggestion(s)} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: i < clientSuggestions.length - 1 ? '1px solid #eee' : 'none', fontSize: 13 }}
                    onMouseEnter={e => e.target.style.background = '#ebf8ff'}
                    onMouseLeave={e => e.target.style.background = 'white'}>
                    <strong>{s.name}</strong>
                    {s.address && <span style={{ color: '#718096', marginLeft: 8, fontSize: 12 }}>{s.address.slice(0, 50)}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="pr-field span2">
            <label>Client Address</label>
            <input type="text" value={form.address} onChange={e => f('address', e.target.value)} placeholder="e.g. 10 Anson Road, Singapore 079903" />
          </div>
          <div className="pr-field span2">
            <label>ATTN (optional)</label>
            <input type="text" value={form.attn} onChange={e => f('attn', e.target.value)} placeholder="e.g. Mr. John / Accounts Dept" />
          </div>
        </div>
      </div>

      <div className="pr-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
          <div className="pr-card-title" style={{ marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }}>Line Items</div>
          <ExcelUploadButton onRows={handleExcelRows} onError={msg => { setSuccess(''); setError(msg) }} />
        </div>
        <LineItemsEditor value={rows} onChange={setRows} />
      </div>

      <div className="pr-actions">
        <button className="btn btn-outline" onClick={reset}>✕ Clear All</button>
        <button className="btn btn-primary" onClick={submit} disabled={saving}>
          {saving ? <><span className="spinner-sm" />Saving…</> : '☁ Save Invoice to Database'}
        </button>
      </div>
    </div>
  )
}
