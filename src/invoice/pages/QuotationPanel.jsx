// QuotationPanel.jsx — Charan Logistics Quotation Generator
// Charan Logistics fields are pre-populated and locked.
// User fills: Quotation No, Date, Client details, Line Items (desc + price, qty always 1).

import { useState } from 'react'
import { todayStr, fmt } from '../utils/helpers'
import { makeQuotationPDF } from '../utils/pdfGen'

// ─── Default rate-card items (pre-loaded, all editable) ────────────────────
const RATE_CARD = [
  { desc: 'Van with Driver – Monthly Contract\nDedicated van + driver, Mon–Sat, 8 AM–6 PM\nFuel, ERP & parking charges inclusive', rateType: '/Month', price: 7250 },
  { desc: 'Van with Driver – Daily Rate\nOn-demand deployment, minimum 1 day\nFuel, ERP & parking charges inclusive',              rateType: '/Day',   price: 280  },
  { desc: 'Adhoc Drop Service\nMinimum 10 locations per drop\nIsland-wide delivery within Singapore',                              rateType: '/Drop',  price: 15   },
]

const mkItem = (desc = '', rateType = '/Trip', price = 0) => ({
  id: Date.now() + Math.random(),
  desc,
  rateType,
  price,
  qty: 1,   // always 1
  tax: 'Nil',
})

export default function QuotationPanel() {
  // ── Quotation meta ──────────────────────────────────────────────────────
  const [qNum,     setQNum]     = useState('')
  const [qDate,    setQDate]    = useState(todayStr())

  // ── Client details ──────────────────────────────────────────────────────
  const [qClient,  setQClient]  = useState('')   // Mr. IRWAN
  const [qTitle,   setQTitle]   = useState('')   // Senior Operation Manager
  const [qCompany, setQCompany] = useState('')   // PT Logistics Solutions Sdn Bhd
  const [qAddr,    setQAddr]    = useState('')
  const [qPhone,   setQPhone]   = useState('')
  const [qEmail,   setQEmail]   = useState('')

  // ── Notes / working hours ───────────────────────────────────────────────
  const [qNotes,   setQNotes]   = useState('Working Hours: Monday to Saturday, 8 AM – 6 PM. Overtime or Sunday deployment subject to additional charges.')

  // ── Line items ──────────────────────────────────────────────────────────
  const [items,    setItems]    = useState(() => RATE_CARD.map(r => mkItem(r.desc, r.rateType, r.price)))

  const [error,    setError]    = useState('')

  // ── Item helpers ────────────────────────────────────────────────────────
  const update = (id, k, v) => setItems(rs => rs.map(r => r.id === id ? { ...r, [k]: v } : r))
  const addItem  = ()  => setItems(rs => [...rs, mkItem()])
  const delItem  = (id) => setItems(rs => rs.filter(r => r.id !== id))

  const subtotal = items.reduce((s, it) => s + (parseFloat(it.price) || 0), 0)

  // ── Generate PDF ─────────────────────────────────────────────────────────
  const genPDF = async () => {
    setError('')

    if (!qNum.trim())    return setError('Quotation Number is required.')
    if (!qDate)          return setError('Date is required.')
    if (!qClient.trim()) return setError('Client Name is required.')
    if (!qAddr.trim())   return setError('Client Address is required.')

    const validItems = items
      .map(it => ({ ...it, price: parseFloat(it.price) || 0, qty: 1 }))
      .filter(it => it.desc.trim())

    if (!validItems.length) return setError('Add at least one line item with a description.')

    try {
      const blob = await makeQuotationPDF({
        qNum, qDate,
        qClient, qTitle, qCompany, qAddr, qPhone, qEmail,
        qNotes,
        items: validItems,
      })
      const url = URL.createObjectURL(blob)
      const a   = document.createElement('a')
      a.href = url
      a.download = `Quotation_${qNum || 'draft'}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error(e)
      setError('PDF generation failed. Check console for details.')
    }
  }

  return (
    <div className="page">
      <div className="pr-info-note">
        💡 Fill client details and line items — Charan Logistics details are pre-filled. Export as PDF.
      </div>
      {error && <div className="alert-error">❌ {error}</div>}

      {/* ── Quotation Meta ─────────────────────────────────────────────── */}
      <div className="pr-card">
        <div className="pr-card-title">Quotation Info</div>
        <div className="pr-form-grid">
          <div className="pr-field">
            <label>Quotation No. <span style={{ color: '#c0282e' }}>*</span></label>
            <input
              type="text"
              value={qNum}
              onChange={e => setQNum(e.target.value)}
              placeholder="e.g. QT202645"
            />
          </div>
          <div className="pr-field">
            <label>Date <span style={{ color: '#c0282e' }}>*</span></label>
            <input type="date" value={qDate} onChange={e => setQDate(e.target.value)} />
          </div>
        </div>
      </div>

      {/* ── Charan Logistics Info (read-only display) ──────────────────── */}
      <div className="pr-card" style={{ background: '#f0f7ff', border: '1px solid #bcd6f0' }}>
        <div className="pr-card-title" style={{ color: '#1e4b73' }}>
          From — Charan Logistics Pte Ltd <span style={{ fontSize: 11, fontWeight: 400, color: '#888' }}>(pre-filled)</span>
        </div>
        <div style={{ fontSize: 12, color: '#555', lineHeight: 1.7, paddingTop: 4 }}>
          <b>Reg No.</b> 202502540D &nbsp;|&nbsp;
          <b>Address:</b> 101 Kitchener Road, #03-14 Jalan Besar Plaza, Singapore 208511<br />
          <b>Phone:</b> +65 91858511 &nbsp;|&nbsp;
          <b>Email:</b> venkat@charanlogistics.com &nbsp;|&nbsp;
        </div>
      </div>

      {/* ── Client / Bill To ───────────────────────────────────────────── */}
      <div className="pr-card">
        <div className="pr-card-title">Bill To — Client Details</div>
        <div className="pr-form-grid">
          <div className="pr-field">
            <label>Client Name <span style={{ color: '#c0282e' }}>*</span></label>
            <input
              type="text"
              value={qClient}
              onChange={e => setQClient(e.target.value)}
              placeholder="e.g. Mr. IRWAN"
            />
          </div>
          <div className="pr-field">
            <label>Title / Designation</label>
            <input
              type="text"
              value={qTitle}
              onChange={e => setQTitle(e.target.value)}
              placeholder="e.g. Senior Operation Manager"
            />
          </div>
          <div className="pr-field span2">
            <label>Company Name</label>
            <input
              type="text"
              value={qCompany}
              onChange={e => setQCompany(e.target.value)}
              placeholder="e.g. PT Logistics Solutions Sdn Bhd"
            />
          </div>
          <div className="pr-field span2">
            <label>Address <span style={{ color: '#c0282e' }}>*</span></label>
            <textarea
              value={qAddr}
              onChange={e => setQAddr(e.target.value)}
              rows={2}
              placeholder="Block 10, Tuas South Avenue 6, #05-22 Tuas Industrial Complex, Singapore 637051"
            />
          </div>
          <div className="pr-field">
            <label>Phone</label>
            <input type="text" value={qPhone} onChange={e => setQPhone(e.target.value)} placeholder="+65 8XXX XXXX" />
          </div>
          <div className="pr-field">
            <label>Email</label>
            <input type="email" value={qEmail} onChange={e => setQEmail(e.target.value)} placeholder="client@company.com" />
          </div>
        </div>
      </div>

      {/* ── Line Items ─────────────────────────────────────────────────── */}
      <div className="pr-card">
        <div className="pr-card-title">Scope of Services & Pricing</div>
        <div className="qt-items-table-wrap">
          <table className="qt-items-table" style={{ minWidth: 560 }}>
            <thead>
              <tr>
                <th style={{ width: 36 }}>No.</th>
                <th>Description</th>
                <th style={{ width: 80 }}>Rate Type</th>
                <th style={{ width: 50, textAlign: 'center' }}>Qty</th>
                <th style={{ width: 110, textAlign: 'right' }}>Unit Price (S$)</th>
                <th style={{ width: 110, textAlign: 'right' }}>Total (S$)</th>
                <th style={{ width: 32 }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={it.id}>
                  <td style={{ textAlign: 'center', color: '#7a6e58', fontWeight: 600 }}>{i + 1}</td>
                  <td>
                    <textarea
                      value={it.desc}
                      onChange={e => update(it.id, 'desc', e.target.value)}
                      rows={2}
                      placeholder="Description & scope"
                      style={{ width: '100%', resize: 'vertical', fontSize: 12 }}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={it.rateType}
                      onChange={e => update(it.id, 'rateType', e.target.value)}
                      placeholder="/Month"
                      style={{ width: '100%' }}
                    />
                  </td>
                  <td style={{ textAlign: 'center', color: '#555', fontWeight: 600 }}>
                    1
                  </td>
                  <td>
                    <input
                      type="number"
                      value={it.price}
                      min="0"
                      step="0.01"
                      onChange={e => update(it.id, 'price', parseFloat(e.target.value) || 0)}
                      style={{ textAlign: 'right', width: '100%' }}
                    />
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    S$ {fmt(parseFloat(it.price) || 0)}
                  </td>
                  <td>
                    <button className="qt-del-btn" onClick={() => delItem(it.id)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="qt-add-row-btn" onClick={addItem}>+ Add Item</button>

        {/* Totals */}
        <div className="qt-totals-row" style={{ marginTop: 12 }}>
          <div className="qt-total-item">
            <div className="qt-total-label">Subtotal</div>
            <div className="qt-total-value">S$ {fmt(subtotal)}</div>
          </div>
          <div className="qt-total-item">
            <div className="qt-total-label">Grand Total</div>
            <div className="qt-total-value grand">S$ {fmt(subtotal)}</div>
          </div>
        </div>
      </div>

      {/* ── Notes ──────────────────────────────────────────────────────── */}
      <div className="pr-card">
        <div className="pr-card-title">Notes / Working Hours</div>
        <div className="pr-field">
          <textarea
            value={qNotes}
            onChange={e => setQNotes(e.target.value)}
            rows={3}
            placeholder="e.g. Working Hours: Mon–Sat, 8 AM–6 PM"
            style={{ width: '100%' }}
          />
        </div>
      </div>

      <div className="pr-actions">
        <button className="btn btn-dark" onClick={genPDF}>⬇ Download Quotation PDF</button>
      </div>
    </div>
  )
}
