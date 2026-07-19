import { useMemo, useState } from 'react'
import { fmt } from '../utils/helpers'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

// ── Parse date + amount straight off the raw row — no line-item lookups,
//    so this works across ALL invoices, not just the ones on-screen. ──
function parseYM(inv) {
  const d = inv.billing_date ?? inv.date ?? ''
  if (!d || d.length < 7) return null
  const parts = String(d).split(/[-\/]/)
  let y, m
  if (parts[0].length === 4) { y = parseInt(parts[0]); m = parseInt(parts[1]) - 1 }
  else if (parts[2]?.length === 4) { y = parseInt(parts[2]); m = parseInt(parts[1]) - 1 }
  if (!y || isNaN(m)) return null
  return { y, m }
}
const getTotal  = inv => parseFloat(inv.total_amount ?? inv.total ?? inv.amount ?? 0) || 0
const getClient = inv => (inv.client_name ?? inv.name ?? 'Unknown').trim() || 'Unknown'
const getStatus = inv => inv.status ?? 'pending'

function prevMonth(m, y) { return m === 0 ? { m: 11, y: y - 1 } : { m: m - 1, y } }
const arrow  = d => (d > 0 ? '▲' : d < 0 ? '▼' : '→')
const signed = n => (n > 0 ? '+S$ ' : n < 0 ? '-S$ ' : 'S$ ') + fmt(Math.abs(n))
const pctChange = (prev, cur) => (prev ? ((cur - prev) / prev) * 100 : null) // null = no baseline — never guessed

function byClient(rows) {
  const map = {}
  rows.forEach(inv => {
    const c = getClient(inv)
    if (!map[c]) map[c] = { client: c, total: 0, count: 0 }
    map[c].total += getTotal(inv)
    map[c].count += 1
  })
  return Object.values(map)
}

function byStatus(rows) {
  const s = { paid: 0, pending: 0, overdue: 0 }
  const c = { paid: 0, pending: 0, overdue: 0 }
  rows.forEach(inv => {
    const st = getStatus(inv) in s ? getStatus(inv) : 'pending'
    s[st] += getTotal(inv)
    c[st] += 1
  })
  return { totals: s, counts: c }
}

function buildWhatsApp({ monthLabel, prevLabel, curRows, prevRows, curTotal, prevTotal, clientMoves, curStatus, prevStatus, outstandingFromPrev, partial }) {
  const lines = []
  lines.push(`*Charan Logistics — Monthly Invoice Summary*`)
  lines.push(`${monthLabel} vs ${prevLabel}`)
  if (partial) lines.push(`⚠️ ${monthLabel} is still ongoing — figures will grow as more invoices are billed this month.`)
  lines.push('')
  lines.push(`Total Invoiced: S$ ${fmt(curTotal)} (prev S$ ${fmt(prevTotal)}) ${arrow(curTotal - prevTotal)} ${signed(curTotal - prevTotal)}`)
  lines.push(`Invoices raised: ${curRows.length} (prev ${prevRows.length})`)
  lines.push('')
  lines.push(`Status as of today —`)
  lines.push(`Paid: S$ ${fmt(curStatus.totals.paid)} (${curStatus.counts.paid}) | Pending: S$ ${fmt(curStatus.totals.pending)} (${curStatus.counts.pending}) | Overdue: S$ ${fmt(curStatus.totals.overdue)} (${curStatus.counts.overdue})`)
  lines.push('')

  const delta = curTotal - prevTotal
  if (delta < 0) {
    lines.push(`*Why billing is down ${signed(Math.abs(delta)).replace('+', '')}:*`)
    const drops = clientMoves.filter(m => m.delta < -1).sort((a, b) => a.delta - b.delta)
    const rises = clientMoves.filter(m => m.delta > 1).sort((a, b) => b.delta - a.delta)
    drops.slice(0, 3).forEach(m => lines.push(`- ${m.client} billed down ${signed(m.delta)} (${m.prevCount}→${m.curCount} invoices)`))
    if (rises.length) {
      lines.push(`Partly offset by:`)
      rises.slice(0, 2).forEach(m => lines.push(`- ${m.client} billed up ${signed(m.delta)} (${m.prevCount}→${m.curCount} invoices)`))
    }
    if (!drops.length) lines.push(`- No single client stands out — the drop is spread thinly across the month.`)
  } else if (delta > 0) {
    lines.push(`Billing is up vs last month — no dip to explain.`)
  } else {
    lines.push(`Billing is flat vs last month.`)
  }

  if (outstandingFromPrev.count > 0) {
    lines.push('')
    lines.push(`Note: ${outstandingFromPrev.count} invoice(s) from ${prevLabel} totalling S$ ${fmt(outstandingFromPrev.total)} are still Pending/Overdue as of today — that's a separate reason collections can feel lower than what was actually billed.`)
  }

  lines.push('')
  lines.push(`_Auto-generated from invoice records — figures are exact sums, not estimates._`)
  lines.push('')
  lines.push(`*Charan Logistics Pte Ltd*`)
  lines.push(`📞 +65 9185 8511`)
  return lines.join('\n')
}

export default function InsightsPanel({ invoices }) {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth())
  const [year, setYear]   = useState(now.getFullYear())
  const [copied, setCopied] = useState(false)

  const years = useMemo(() => {
    const set = new Set(invoices.map(parseYM).filter(Boolean).map(x => x.y))
    set.add(now.getFullYear())
    return [...set].sort((a, b) => b - a)
  }, [invoices]) // eslint-disable-line react-hooks/exhaustive-deps

  const pm = prevMonth(month, year)
  const monthLabel = `${MONTHS[month]} ${year}`
  const prevLabel  = `${MONTHS[pm.m]} ${pm.y}`
  const isPartial  = month === now.getMonth() && year === now.getFullYear()

  const analysis = useMemo(() => {
    const curRows  = invoices.filter(inv => { const p = parseYM(inv); return p && p.y === year && p.m === month })
    const prevRows = invoices.filter(inv => { const p = parseYM(inv); return p && p.y === pm.y && p.m === pm.m })
    const curTotal  = curRows.reduce((s, i) => s + getTotal(i), 0)
    const prevTotal = prevRows.reduce((s, i) => s + getTotal(i), 0)

    const curByClient  = byClient(curRows)
    const prevByClient = byClient(prevRows)
    const clientNames = new Set([...curByClient.map(c => c.client), ...prevByClient.map(c => c.client)])
    const clientMoves = [...clientNames].map(name => {
      const c = curByClient.find(x => x.client === name) || { total: 0, count: 0 }
      const p = prevByClient.find(x => x.client === name) || { total: 0, count: 0 }
      return { client: name, cur: c.total, prev: p.total, delta: c.total - p.total, curCount: c.count, prevCount: p.count }
    }).sort((a, b) => a.delta - b.delta)

    const curStatus  = byStatus(curRows)
    const prevStatus = byStatus(prevRows)

    const outstandingRows = prevRows.filter(inv => getStatus(inv) !== 'paid')
    const outstandingFromPrev = { count: outstandingRows.length, total: outstandingRows.reduce((s, i) => s + getTotal(i), 0) }

    const noBaseline = prevRows.length === 0 && curRows.length > 0

    return { curRows, prevRows, curTotal, prevTotal, clientMoves, curStatus, prevStatus, outstandingFromPrev, noBaseline }
  }, [invoices, month, year, pm.m, pm.y])

  const waMessage = useMemo(() => buildWhatsApp({
    monthLabel, prevLabel, curRows: analysis.curRows, prevRows: analysis.prevRows,
    curTotal: analysis.curTotal, prevTotal: analysis.prevTotal, clientMoves: analysis.clientMoves,
    curStatus: analysis.curStatus, prevStatus: analysis.prevStatus,
    outstandingFromPrev: analysis.outstandingFromPrev, partial: isPartial,
  }), [analysis, monthLabel, prevLabel, isPartial])

  const copyMsg = () => {
    navigator.clipboard.writeText(waMessage).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    }).catch(() => alert('Could not copy — please select and copy the text manually.'))
  }
  const sendWhatsApp = () => window.open(`https://wa.me/?text=${encodeURIComponent(waMessage)}`, '_blank')

  const delta = analysis.curTotal - analysis.prevTotal
  const selStyle = { background: 'white', border: '1.5px solid var(--border)', borderRadius: 8, padding: '.5rem .7rem', fontFamily: "'Outfit', sans-serif", fontSize: '.85rem', color: 'var(--ink)', cursor: 'pointer' }

  return (
    <div className="page">
      <div className="wa-container" style={{ maxWidth: 760 }}>
        <div className="wa-hero">
          <div className="wa-hero-ico">🔎</div>
          <h2>Monthly Insights</h2>
          <p>Compare invoiced revenue against the month before it, see exactly what moved, and send a clear summary on WhatsApp.</p>
        </div>

        <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', marginBottom: '1.25rem', justifyContent: 'center' }}>
          <select style={selStyle} value={month} onChange={e => setMonth(parseInt(e.target.value))}>
            {MONTHS.map((mo, i) => <option key={mo} value={i}>{mo}</option>)}
          </select>
          <select style={selStyle} value={year} onChange={e => setYear(parseInt(e.target.value))}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {isPartial && (
          <div style={{ background: 'var(--pend-bg, #fff3cd)', color: 'var(--pend-tx, #7a5c00)', borderRadius: 10, padding: '.8rem 1rem', fontSize: '.8rem', marginBottom: '1rem' }}>
            ⚠️ {monthLabel} is still in progress. Comparing a partial month against a completed {prevLabel} can look like a false dip just because fewer days have passed.
          </div>
        )}
        {analysis.noBaseline && (
          <div style={{ background: 'var(--pale)', borderRadius: 10, padding: '.8rem 1rem', fontSize: '.8rem', marginBottom: '1rem', color: 'var(--muted)' }}>
            No invoices found for {prevLabel} — there's no baseline to compare against, so this is shown as new activity rather than a guessed % change.
          </div>
        )}

        <div className="chart-summary" style={{ marginBottom: '1.5rem' }}>
          <div className="cs-card">
            <div className="cs-lbl">Total Invoiced — {monthLabel}</div>
            <div className="cs-val">S$ {fmt(analysis.curTotal)}</div>
            <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: '.25rem' }}>
              prev S$ {fmt(analysis.prevTotal)} · {arrow(delta)} {signed(delta)}
              {pctChange(analysis.prevTotal, analysis.curTotal) !== null && ` (${pctChange(analysis.prevTotal, analysis.curTotal).toFixed(1)}%)`}
            </div>
          </div>
          <div className="cs-card">
            <div className="cs-lbl">Paid / Pending / Overdue</div>
            <div className="cs-val" style={{ fontSize: '1rem' }}>
              <span className="c-paid">S$ {fmt(analysis.curStatus.totals.paid)}</span>
              {' / S$ '}{fmt(analysis.curStatus.totals.pending)}
              {' / S$ '}{fmt(analysis.curStatus.totals.overdue)}
            </div>
            <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: '.25rem' }}>
              {analysis.curStatus.counts.paid} paid · {analysis.curStatus.counts.pending} pending · {analysis.curStatus.counts.overdue} overdue
            </div>
          </div>
        </div>

        <div className="wa-compose" style={{ marginBottom: '1.5rem' }}>
          <h3>{delta < 0 ? '📉 What drove the dip — by client' : '📈 Billing movement — by client'}</h3>
          <div className="chart-tbl-wrap">
            <table className="chart-tbl">
              <thead>
                <tr><th>Client</th><th className="r">{prevLabel}</th><th className="r">{monthLabel}</th><th className="r">Change</th><th className="r">Invoices</th></tr>
              </thead>
              <tbody>
                {analysis.clientMoves.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: '1rem' }}>No invoices in either month.</td></tr>
                )}
                {analysis.clientMoves.map(m => (
                  <tr key={m.client}>
                    <td><b>{m.client}</b></td>
                    <td className="r">S$ {fmt(m.prev)}</td>
                    <td className="r">S$ {fmt(m.cur)}</td>
                    <td className="r" style={{ color: m.delta < 0 ? 'var(--over-tx, #b3261e)' : m.delta > 0 ? 'var(--paid-tx, #0a7a4b)' : 'var(--muted)' }}>
                      {arrow(m.delta)} {signed(m.delta)}
                    </td>
                    <td className="r">{m.prevCount} → {m.curCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {analysis.outstandingFromPrev.count > 0 && (
          <div style={{ background: 'var(--over-bg, #fdeceb)', color: 'var(--over-tx, #b3261e)', borderRadius: 10, padding: '.8rem 1rem', fontSize: '.8rem', marginBottom: '1.5rem' }}>
            💡 {analysis.outstandingFromPrev.count} invoice(s) from {prevLabel} totalling S$ {fmt(analysis.outstandingFromPrev.total)} are still Pending/Overdue as of today — worth a follow-up.
          </div>
        )}

        <div className="wa-compose">
          <h3>💬 WhatsApp-ready summary</h3>
          <div className="wa-preview show" style={{ marginTop: 0, marginBottom: '1rem' }}>{waMessage}</div>
          <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
            <button className="wa-send-btn" onClick={sendWhatsApp}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>
              Send via WhatsApp
            </button>
            <button className="btn btn-white" onClick={copyMsg}>{copied ? '✓ Copied' : '📋 Copy Text'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
