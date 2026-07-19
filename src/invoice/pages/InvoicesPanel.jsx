import { useState, useEffect, useMemo } from 'react'
import { fmt, cap, shortAddr } from '../utils/helpers'
import { makeInvoicePDF } from '../utils/pdfGen'

const PAGE_SIZES = [10, 25, 50, 100]

function mkBadge(s) {
  const cls = { paid: 'b-paid', pending: 'b-pending', overdue: 'b-overdue' }[s] || 'b-pending'
  return <span className={`badge ${cls}`}><span className="bdot" />{cap(s)}</span>
}

function buildInvoice(raw, lineItemCache) {
  const invKey = raw.number ?? raw.invoice_number ?? raw.id
  const items = lineItemCache[invKey] || []
  const itemsTotal = items.reduce((s, li) => s + (parseFloat(li.qty ?? li.quantity ?? 1) || 1) * (parseFloat(li.price ?? li.rate ?? 0) || 0), 0)
  const rawTotal = parseFloat(raw.total_amount ?? raw.total ?? raw.amount ?? 0)
  // Use items total only if items exist AND total > 0, else fall back to raw total
  const total = (items.length > 0 && itemsTotal > 0) ? itemsTotal : rawTotal
  return {
    ...raw,
    number:      raw.number ?? raw.invoice_number ?? raw.id,
    name:        raw.client_name ?? raw.name ?? '',
    addr:        raw.client_address ?? raw.address ?? raw.addr ?? '',
    attn:        raw.attn ?? raw.attention ?? '',
    status:      raw.status ?? 'pending',
    billingDate: raw.billing_date ?? raw.date ?? '',
    due:         raw.due_date ?? raw.due ?? '',
    total,
    items,
  }
}

export default function InvoicesPanel({ invoices, lineItemCache, loading, cfg, onFetchLineItems, onViewInv, onChartOpen, onReload }) {
  const [search,  setSearch]  = useState('')
  const [filter,  setFilter]  = useState('all')
  const [page,    setPage]    = useState(1)
  const [pgSize,  setPgSize]  = useState(25)

  const all = useMemo(() => invoices.map(r => buildInvoice(r, lineItemCache)), [invoices, lineItemCache])

  const shown = useMemo(() => {
    const q = search.toLowerCase()
    return all.filter(inv => {
      if (filter !== 'all' && inv.status !== filter) return false
      if (q && !(
        (inv.number ?? '').toLowerCase().includes(q) ||
        (inv.name   ?? '').toLowerCase().includes(q) ||
        (inv.addr   ?? '').toLowerCase().includes(q)
      )) return false
      return true
    }).sort((a, b) => {
      // Sort by invoice number descending e.g. 2026/00162 > 2026/00001
      const numA = parseInt((a.number ?? '').split('/').pop() || '0')
      const numB = parseInt((b.number ?? '').split('/').pop() || '0')
      return numB - numA
    })
  }, [all, search, filter])

  // Stats
  const paid    = all.filter(i => i.status === 'paid')
  const pending = all.filter(i => i.status === 'pending')
  const totalVal = all.reduce((s, i) => s + (i.total || 0), 0)
  const paidVal  = paid.reduce((s, i) => s + (i.total || 0), 0)
  const pendVal  = pending.reduce((s, i) => s + (i.total || 0), 0)

  const totalPages = Math.max(1, Math.ceil(shown.length / pgSize))
  const curPage    = Math.min(page, totalPages)
  const start      = (curPage - 1) * pgSize
  const pageItems  = shown.slice(start, start + pgSize)

  useEffect(() => setPage(1), [search, filter, pgSize])

  // Preload line items for page
  useEffect(() => {
    const nums = pageItems.map(i => i.number).filter(Boolean)
    if (nums.length) onFetchLineItems(nums)
  }, [curPage, pgSize, shown.length])

  const handleView = async (inv) => {
    await onFetchLineItems([inv.number])
    // rebuild with fresh cache after fetch — parent will re-render
    onViewInv(buildInvoice(invoices.find(r => (r.number ?? r.invoice_number ?? r.id) == inv.number) || inv, lineItemCache))
  }

  const handlePDF = async (inv) => {
    await onFetchLineItems([inv.number])
    const full = buildInvoice(invoices.find(r => (r.number ?? r.invoice_number ?? r.id) == inv.number) || inv, lineItemCache)
    const blob = await makeInvoicePDF(full, cfg)
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    const runNum = (full.number || '').split('/').pop() || '0000'
    const cname  = (full.name || 'Client').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_').trim()
    const bd     = (full.billingDate || '').replace(/[\/\-]/g, '-').trim()
    a.download   = `${runNum}_${cname}_Invoice_${bd}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  function PageRange() {
    const pages = []
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else if (curPage <= 4) {
      for (let i = 1; i <= 5; i++) pages.push(i)
      pages.push('...')
      pages.push(totalPages)
    } else if (curPage >= totalPages - 3) {
      pages.push(1); pages.push('...')
      for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1); pages.push('...')
      for (let i = curPage - 1; i <= curPage + 1; i++) pages.push(i)
      pages.push('...'); pages.push(totalPages)
    }
    return pages.map((p, i) =>
      p === '...'
        ? <span key={i} style={{ padding: '0 .2rem', color: 'var(--muted)', fontSize: '.78rem' }}>…</span>
        : <button key={i} className={`page-btn${p === curPage ? ' active' : ''}`} onClick={() => setPage(p)}>{p}</button>
    )
  }

  return (
    <div className="page">
      {/* Stats */}
      <div className="stats">
        <div className="stat" style={{ animationDelay: '.05s' }}>
          <div className="stat-lbl">Total Invoices</div>
          <div className="stat-val">{all.length}</div>
        </div>
        <div className="stat" style={{ animationDelay: '.1s' }}>
          <div className="stat-lbl">Total Value</div>
          <div className="stat-val">S$ {fmt(totalVal)}</div>
        </div>
        <div className="stat" style={{ animationDelay: '.15s' }}>
          <div className="stat-lbl">Paid</div>
          <div className="stat-val c-paid">{paid.length}</div>
          <div className="stat-sub">S$ {fmt(paidVal)}</div>
        </div>
        <div className="stat" style={{ animationDelay: '.2s' }}>
          <div className="stat-lbl">Pending</div>
          <div className="stat-val c-pend">{pending.length}</div>
          <div className="stat-sub">S$ {fmt(pendVal)}</div>
        </div>
        <div className="stat stat-perf" style={{ animationDelay: '.3s' }} onClick={onChartOpen}>
          <div className="stat-perf-ico">📊</div>
          <div className="stat-perf-lbl">Monthly Performance</div>
          <div className="stat-perf-sub">Click to view chart</div>
        </div>
      </div>

      {/* Table head */}
      <div className="dhead">
        <div className="dhead-title">All Invoices</div>
        <div className="dhead-right">
          <div className="search">
            <span className="search-ico">🔍</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search invoice, client…"
            />
          </div>
          <div className="pills">
            {['all','paid','pending','overdue'].map(f => (
              <button key={f} className={`pill${filter === f ? ' a-' + f : ''}`} onClick={() => setFilter(f)}>
                {cap(f)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="tcard">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Client</th>
              <th>Date</th>
              <th className="r">Amount</th>
              <th>Status</th>
              <th className="c">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6}><div className="state"><div className="spin" /><div className="state-title">Loading…</div><div className="state-msg">Fetching your invoices</div></div></td></tr>
            ) : !pageItems.length ? (
              <tr><td colSpan={6}><div className="state"><div className="state-ico">🔍</div><div className="state-title">No Invoices Found</div><div className="state-msg">No invoices match the current filter or search term.</div></div></td></tr>
            ) : pageItems.map((inv, i) => (
              <tr key={inv.id ?? inv.number ?? i} style={{ animationDelay: `${i * 0.04}s` }} onClick={() => handleView(inv)}>
                <td><span className="inum">#{inv.number}</span></td>
                <td>
                  <span className="cname">{inv.name || '—'}</span>
                  <span className="caddr">{shortAddr(inv.addr)}</span>
                </td>
                <td style={{ color: 'var(--muted)', fontSize: '.81rem' }}>{inv.billingDate}</td>
                <td style={{ textAlign: 'right' }}><span className="amtcell">S$ {fmt(
                  (() => {
                    const its = lineItemCache[inv.number] || inv.items || []
                    const it = its.reduce((s, li) => s + (parseFloat(li.qty ?? li.quantity ?? 1) || 1) * (parseFloat(li.price ?? li.rate ?? 0) || 0), 0)
                    return it > 0 ? it : (parseFloat(inv.total) || 0)
                  })()
                )}</span></td>
                <td>{mkBadge(inv.status)}</td>
                <td onClick={e => e.stopPropagation()}>
                  <div className="acts">
                    <button className="btn btn-sm btn-white" onClick={() => handleView(inv)}>View</button>
                    <button className="btn btn-sm btn-primary" onClick={() => handlePDF(inv)}>PDF</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {shown.length > 0 && (
          <div className="pagination-bar" id="paginationBar">
            <span className="pagination-info">
              Showing {start + 1}–{Math.min(start + pgSize, shown.length)} of {shown.length} invoices
            </span>
            <div className="pagination-controls">
              <button className="page-btn" onClick={() => setPage(p => p - 1)} disabled={curPage === 1}>‹</button>
              <PageRange />
              <button className="page-btn" onClick={() => setPage(p => p + 1)} disabled={curPage === totalPages}>›</button>
            </div>
            <div className="page-size-wrap">
              Per page:
              <select className="page-size-select" value={pgSize} onChange={e => setPgSize(Number(e.target.value))}>
                {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
