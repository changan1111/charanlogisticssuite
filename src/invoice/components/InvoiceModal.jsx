import { fmt, cap, sortLineItems, getQty, getPrice, getDesc, getLineItemDate } from '../utils/helpers'
import { makeInvoicePDF } from '../utils/pdfGen'

function mkBadge(s) {
  const cls = { paid: 'b-paid', pending: 'b-pending', overdue: 'b-overdue' }[s] || 'b-pending'
  return <span className={`badge ${cls}`}><span className="bdot" />{cap(s)}</span>
}

export default function InvoiceModal({ inv, cfg, lineItemCache, onClose, onEdit, onMarkPaid }) {
  if (!inv) return null
  const cur = 'S$'
  const items = lineItemCache[inv.number] || inv.items || []
  const sorted = sortLineItems(items)
  const showDateCol = sorted.some(li => getLineItemDate(li))
  const itemsTotal = sorted.reduce((s, li) => s + (parseFloat(getQty(li)) || 1) * (parseFloat(getPrice(li)) || 0), 0)
  const displayTotal = itemsTotal > 0 ? itemsTotal : (parseFloat(inv.total) || 0)

  const bizLines = cfg.addr.split(',').map(s => s.trim()).filter(Boolean).join('\n')
  const addrLines = (inv.addr || '').split(',').map(s => s.trim()).filter(Boolean).join('\n')

  const dlPDF = async () => {
    const full = { ...inv, items: sorted }
    const blob = await makeInvoicePDF(full, cfg)
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    const runNum = (inv.number || '').split('/').pop() || '0000'
    const cname  = (inv.name || 'Client').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_').trim()
    const bd     = (inv.billingDate || '').replace(/[\/\-]/g, '-').trim()
    a.download   = `${runNum}_${cname}_Invoice_${bd}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  const shareInv = async () => {
    const full = { ...inv, items: sorted }
    const blob  = await makeInvoicePDF(full, cfg)
    const runNum = (inv.number || '').split('/').pop() || '0000'
    const cname  = (inv.name || 'Client').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_').trim()
    const bd     = (inv.billingDate || '').replace(/[\/\-]/g, '-').trim()
    const fileName = `${runNum}_${cname}_Invoice_${bd}.pdf`
    const file = new File([blob], fileName, { type: 'application/pdf' })
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: fileName.replace('.pdf', ''), text: 'Please find the attached invoice.' }).catch(() => {})
    } else {
      const msg = `Invoice #${inv.number} from ${cfg.name}\n\nClient: ${inv.name}\nTotal: ${cur} ${fmt(displayTotal)}\n\n${inv.billingDate ? 'Billing Date: ' + inv.billingDate : ''}\n\nPlease find the attached invoice.`
      window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank')
    }
  }

  const bc = { paid: 'b-paid', pending: 'b-pending', overdue: 'b-overdue' }[inv.status] || 'b-pending'

  return (
    <div className="overlay open" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="modal-bar">
          <span className="modal-bar-lbl">Invoice #{inv.number} · {inv.name}</span>
          <div className="modal-bar-acts">
            <button className="btn btn-white btn-sm" onClick={() => window.print()}>🖨 Print</button>
            <button className="btn btn-primary btn-sm" onClick={dlPDF}>⬇ PDF</button>
            <button className="btn btn-white btn-sm" onClick={shareInv}>📤 Share</button>
            <button className="btn btn-white btn-sm" onClick={() => onEdit(inv)}>✎ Edit</button>
            {inv.status !== 'paid' && (
              <button className="btn btn-sm" style={{ background: '#e4f7ee', color: '#0a7a4b', border: '1.5px solid #0a7a4b' }} onClick={() => onMarkPaid(inv)}>✓ Mark as Paid</button>
            )}
            <button className="xbtn" onClick={onClose}>✕</button>
          </div>
        </div>

        <div id="invDoc">
          <div className="inv-hd">
            <div className="inv-brand">
              <div className="inv-logo">
                <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/><path d="M8 13h8v1H8zm0 3h5v1H8z"/></svg>
              </div>
              <div>
                <div className="inv-biz-name">{cfg.name}</div>
                <div className="inv-biz-addr" style={{ whiteSpace: 'pre-line' }}>{bizLines}</div>
              </div>
            </div>
            <div className="inv-numbox">
              <div><span className="inv-num-lbl">Invoice</span><span className="inv-num">#{inv.number}</span></div>
              <div className="inv-num-sub">
                {inv.billingDate && <div>Billing Date: {inv.billingDate}</div>}
                {inv.due && <div>Due: {inv.due}</div>}
              </div>
            </div>
          </div>

          <div className="inv-rule" />

          <div className="inv-parties">
            <div>
              <div className="p-lbl">Billed To</div>
              <div className="p-name">{inv.name || '—'}</div>
              <div className="p-addr" style={{ whiteSpace: 'pre-line' }}>{addrLines || '—'}</div>
              {inv.attn && <div style={{ fontSize: '.88rem', marginTop: '.4rem' }}>ATTN: {inv.attn}</div>}
              <div className="p-status">{mkBadge(inv.status)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="p-lbl">From</div>
              <div className="p-name">{cfg.name}</div>
              <div className="p-addr" style={{ textAlign: 'right', whiteSpace: 'pre-line' }}>{bizLines}</div>
            </div>
          </div>

          <table className="inv-tbl">
            <thead>
              <tr>
                {showDateCol && <th>Date</th>}
                <th>Description</th>
                <th className="c">Qty</th>
                <th className="r">Rate</th>
                <th className="r">Amount</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length ? sorted.map((li, i) => {
                const q = getQty(li), p = getPrice(li), d = getDesc(li), liDate = getLineItemDate(li)
                return (
                  <tr key={li.id ?? i}>
                    {showDateCol && <td className="date-col">{liDate || '—'}</td>}
                    <td style={{ whiteSpace: 'pre-line' }}>{d}</td>
                    <td className="c">{q}</td>
                    <td className="r">{cur} {fmt(p)}</td>
                    <td className="r bold">{cur} {fmt(q * p)}</td>
                  </tr>
                )
              }) : (
                <tr>
                  {showDateCol && <td className="date-col">—</td>}
                  <td style={{ color: 'var(--muted)', fontStyle: 'italic' }}>Invoice total (no line item breakdown)</td>
                  <td className="c">—</td>
                  <td className="r">—</td>
                  <td className="r bold">{cur} {fmt(displayTotal)}</td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="totals-wrap">
            <div className="totals-box">
              <div className="tot-row"><span>Subtotal</span><span>{cur} {fmt(displayTotal)}</span></div>
              <div className="tot-row"><span>Tax (0%)</span><span>{cur} 0.00</span></div>
              <div className="tot-row"><span>Total Due</span><span className="grand">{cur} {fmt(displayTotal)}</span></div>
            </div>
          </div>

          <div className="inv-foot">
            <div className="inv-foot-note">Thank you for your business! Please make payment within 30 days.</div>
            {mkBadge(inv.status)}
          </div>
        </div>
      </div>
    </div>
  )
}
