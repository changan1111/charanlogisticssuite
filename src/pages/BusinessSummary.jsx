import { useEffect, useState, useMemo } from 'react'
import { sb } from '../lib/supabaseClient'
import { getAllRows } from '../fleet/lib/dataLayer'
import { CLIENT_CONFIG, MONTHS, YEARS } from '../fleet/lib/constants'
import { detectClient } from '../fleet/lib/clientDetect'
import '../styles/summary.css'

// ═══════════════════════════════════════════════
//  BUSINESS SUMMARY — the one consolidated page.
//  Three perspectives as tabs: Combined | Invoicing | Fleet.
//  Every figure is an exact sum of logged rows; movement amounts are
//  shown as IMPACT on the month, so green always = helped and
//  red always = hurt (an expense increase shows as a red minus).
//  Invoiced revenue and fleet earnings are never added together —
//  they can describe the same jobs.
// ═══════════════════════════════════════════════

const now = new Date()

// ── invoice row helpers (same conventions as InsightsPanel) ──
function parseYM(inv) {
  const d = inv.billing_date ?? inv.date ?? ''
  if (!d || String(d).length < 7) return null
  const parts = String(d).split(/[-\/]/)
  let y, m
  if (parts[0].length === 4) { y = parseInt(parts[0]); m = parseInt(parts[1]) - 1 }
  else if (parts[2]?.length === 4) { y = parseInt(parts[2]); m = parseInt(parts[1]) - 1 }
  if (!y || isNaN(m)) return null
  return { y, m }
}
const invTotal  = inv => parseFloat(inv.total_amount ?? inv.total ?? inv.amount ?? 0) || 0
const invClient = inv => (inv.client_name ?? inv.name ?? 'Unknown').trim() || 'Unknown'
const invStatus = inv => (['paid', 'pending', 'overdue'].includes(inv.status) ? inv.status : 'pending')

const sum = rows => rows.reduce((s, r) => s + Number(r.amount), 0)
const fmt = n => Number(n || 0).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const signed = n => (n > 0 ? '+S$ ' : n < 0 ? '−S$ ' : 'S$ ') + fmt(Math.abs(n))
const pct = (prev, cur) => (prev ? ((cur - prev) / prev) * 100 : null) // null = no baseline, never guessed
const prevOf = (m, y) => (m === 0 ? { m: 11, y: y - 1 } : { m: m - 1, y })

function groupDelta(curRows, prevRows, keyFn, valFn) {
  const val = valFn || (rows => sum(rows))
  const keys = new Set([...curRows.map(keyFn), ...prevRows.map(keyFn)])
  return [...keys].map(k => {
    const c = curRows.filter(r => keyFn(r) === k)
    const p = prevRows.filter(r => keyFn(r) === k)
    const cur = val(c), prev = val(p)
    return { key: k, cur, prev, delta: cur - prev, curCount: c.length, prevCount: p.length }
  }).filter(m => m.cur !== 0 || m.prev !== 0)
}

const fleetClientLabel = k => (CLIENT_CONFIG.find(c => c.key === k)?.label || k)

export default function BusinessSummary() {
  const [month, setMonth] = useState(now.getMonth())
  const [year, setYear] = useState(now.getFullYear())
  const [tab, setTab] = useState('combined')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError('')
      try {
        const p = prevOf(month, year)
        const [curFE, curFX, prevFE, prevFX] = await Promise.all([
          getAllRows('earnings', month, year),
          getAllRows('expenses', month, year),
          getAllRows('earnings', p.m, p.y),
          getAllRows('expenses', p.m, p.y),
        ])
        let invoices = []
        let from = 0
        while (true) {
          const { data: batch, error: e } = await sb.from('clients').select('*').range(from, from + 999)
          if (e) throw e
          invoices = invoices.concat(batch || [])
          if ((batch || []).length < 1000) break
          from += 1000
        }
        const inMonth = (inv, m, y) => { const d = parseYM(inv); return d && d.m === m && d.y === y }
        const curInv = invoices.filter(i => inMonth(i, month, year))
        const prevInv = invoices.filter(i => inMonth(i, p.m, p.y))
        if (!cancelled) setData({ curFE, curFX, prevFE, prevFX, curInv, prevInv })
      } catch (e) {
        if (!cancelled) setError(e.message || String(e))
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [month, year])

  const view = useMemo(() => {
    if (!data) return null
    const { curFE, curFX, prevFE, prevFX, curInv, prevInv } = data
    const invSum = rows => rows.reduce((s, r) => s + invTotal(r), 0)

    const lanes = {
      inv:  { cur: invSum(curInv), prev: invSum(prevInv) },
      earn: { cur: sum(curFE), prev: sum(prevFE) },
      exp:  { cur: sum(curFX), prev: sum(prevFX) },
    }
    lanes.net = { cur: lanes.earn.cur - lanes.exp.cur, prev: lanes.earn.prev - lanes.exp.prev }
    for (const l of Object.values(lanes)) { l.delta = l.cur - l.prev; l.pct = pct(l.prev, l.cur) }

    // ── movers, all expressed as IMPACT (green helps, red hurts) ──
    const invMoves  = groupDelta(curInv, prevInv, invClient, invSum)
      .map(m => ({ lane: 'Invoicing', label: m.key, impact: m.delta, detail: `${m.prevCount} → ${m.curCount} invoices` }))
    const earnMoves = groupDelta(curFE, prevFE, r => detectClient(r.note || ''))
      .map(m => ({ lane: 'Fleet earnings', label: fleetClientLabel(m.key), impact: m.delta, detail: `${m.prevCount} → ${m.curCount} jobs` }))
    const expMoves  = groupDelta(curFX, prevFX, r => (r.expense_type || 'Other'))
      .map(m => ({ lane: 'Fleet expense', label: `${m.key} — spend ${m.delta > 0 ? 'up' : 'down'}`, impact: -m.delta, detail: `${m.prevCount} → ${m.curCount} entries` }))
    const vehMoves  = groupDelta(curFE, prevFE, r => r.vehicle || '?')
      .map(m => ({ lane: 'Vehicle', label: m.key, impact: m.delta, detail: `${m.prevCount} → ${m.curCount} jobs` }))

    const bySize = arr => [...arr].filter(m => Math.abs(m.impact) >= 1).sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
    const combined = bySize([...invMoves, ...earnMoves, ...expMoves])
    const helped = combined.filter(m => m.impact > 0)
    const hurt   = combined.filter(m => m.impact < 0)

    // status split for invoicing tab
    const status = { paid: 0, pending: 0, overdue: 0 }
    const statusCount = { paid: 0, pending: 0, overdue: 0 }
    curInv.forEach(i => { const st = invStatus(i); status[st] += invTotal(i); statusCount[st] += 1 })

    // deterministic headline
    let headline
    if (!combined.length) headline = 'Nothing moved meaningfully vs last month.'
    else {
      const parts = []
      if (Math.abs(lanes.net.delta) > 1)
        parts.push(`Fleet net is ${lanes.net.delta > 0 ? 'up' : 'down'} S$ ${fmt(Math.abs(lanes.net.delta))}`)
      if (Math.abs(lanes.inv.delta) > 1)
        parts.push(`invoicing is ${lanes.inv.delta > 0 ? 'up' : 'down'} S$ ${fmt(Math.abs(lanes.inv.delta))}`)
      const top = combined[0]
      headline = (parts.join(' and ') || 'Broadly flat vs last month')
        + ` — biggest single factor: ${top.label} (${top.lane.toLowerCase()}) ${top.impact > 0 ? 'helped' : 'hurt'} by S$ ${fmt(Math.abs(top.impact))}.`
    }

    const unbilledGap = lanes.earn.cur - lanes.inv.cur

    return { lanes, invMoves: bySize(invMoves), earnMoves: bySize(earnMoves), expMoves: bySize(expMoves), vehMoves: bySize(vehMoves), helped, hurt, headline, unbilledGap, status, statusCount, curInvCount: curInv.length, prevInvCount: prevInv.length }
  }, [data])

  const monthLabel = `${MONTHS[month]} ${year}`
  const p = prevOf(month, year)
  const prevLabel = `${MONTHS[p.m]} ${p.y}`
  const isPartial = year === now.getFullYear() && month === now.getMonth()
  const [copied, setCopied] = useState(false)

  // WhatsApp text of the combined summary — same figures as on screen,
  // built fresh at send time. Not shown on the page.
  function buildWaMessage() {
    if (!view) return ''
    const L = []
    L.push(`*Charan Logistics — Business Summary*`)
    L.push(`${monthLabel} vs ${prevLabel}`)
    if (isPartial) L.push(`⚠️ ${monthLabel} is still in progress — partial-month comparison.`)
    L.push('')
    L.push(view.headline)
    L.push('')
    const lane = (name, l) => `${name}: S$ ${fmt(l.cur)} (prev S$ ${fmt(l.prev)}) ${l.delta > 1 ? '▲' : l.delta < -1 ? '▼' : '→'} ${signed(l.delta)}`
    L.push(lane('Invoiced', view.lanes.inv))
    L.push(lane('Fleet earnings', view.lanes.earn))
    L.push(lane('Fleet expenses', view.lanes.exp))
    L.push(lane('Fleet net', view.lanes.net))
    if (Math.abs(view.unbilledGap) >= 1) {
      L.push('')
      L.push(view.unbilledGap > 0
        ? `Gap: S$ ${fmt(view.unbilledGap)} of logged jobs not yet billed.`
        : `Billed S$ ${fmt(Math.abs(view.unbilledGap))} above logged jobs (advance / prior-month billing).`)
    }
    if (view.hurt.length) {
      L.push('')
      L.push('*What hurt the month:*')
      view.hurt.slice(0, 4).forEach(m => L.push(`- ${m.label} (${m.lane.toLowerCase()}) ${signed(m.impact)} — ${m.detail}`))
    }
    if (view.helped.length) {
      L.push('')
      L.push('*What helped the month:*')
      view.helped.slice(0, 4).forEach(m => L.push(`- ${m.label} (${m.lane.toLowerCase()}) ${signed(m.impact)} — ${m.detail}`))
    }
    L.push('')
    L.push('_Exact sums of logged entries — nothing estimated. Green helped, red hurt._')
    return L.join('\n')
  }
  const sendWhatsApp = () => window.open(`https://wa.me/?text=${encodeURIComponent(buildWaMessage())}`, '_blank')
  const copyMsg = async () => {
    try { await navigator.clipboard.writeText(buildWaMessage()); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch {}
  }

  return (
    <div className="bsum">
      <div className="bsum-head">
        <div>
          <h1 className="bsum-title">Business Summary</h1>
          <div className="bsum-sub">{monthLabel} compared with {prevLabel}</div>
        </div>
        <div className="bsum-pickers">
          <select value={month} onChange={e => setMonth(+e.target.value)}>
            {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(+e.target.value)}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button className="bsum-wa-btn" onClick={sendWhatsApp} disabled={loading || !!error || !view} title="Send this summary on WhatsApp">📲 WhatsApp</button>
          <button className="bsum-copy-btn" onClick={copyMsg} disabled={loading || !!error || !view} title="Copy summary text">{copied ? '✓ Copied' : '📋 Copy'}</button>
        </div>
      </div>

      <div className="bsum-tabs">
        {[['combined', '⚖ Combined'], ['invoicing', '🧾 Invoicing'], ['fleet', '🚚 Fleet']].map(([k, l]) => (
          <button key={k} className={'bsum-tab' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {isPartial && <div className="bsum-note">⚠️ {monthLabel} is still in progress — figures will grow as the month is logged.</div>}
      {loading && <div className="bsum-loading">Adding up the month…</div>}
      {error && <div className="bsum-error">Could not load: {error}</div>}

      {!loading && !error && view && tab === 'combined' && (
        <>
          <div className={`bsum-verdict ${view.lanes.net.delta > 1 ? 'up' : view.lanes.net.delta < -1 ? 'down' : ''}`}>{view.headline}</div>

          <div className="bsum-cards">
            <LaneCard title="Invoiced to clients" lane={view.lanes.inv} upIsGood />
            <LaneCard title="Fleet earnings (logged jobs)" lane={view.lanes.earn} upIsGood />
            <LaneCard title="Fleet expenses" lane={view.lanes.exp} upIsGood={false} />
            <LaneCard title="Fleet net profit" lane={view.lanes.net} upIsGood bold />
          </div>

          <div className="bsum-gap">
            Jobs logged this month total <b>S$ {fmt(view.lanes.earn.cur)}</b>, invoiced <b>S$ {fmt(view.lanes.inv.cur)}</b>
            {Math.abs(view.unbilledGap) >= 1 && (
              <> — a gap of <b className={view.unbilledGap > 0 ? 'neg' : 'pos'}>S$ {fmt(Math.abs(view.unbilledGap))}</b> {view.unbilledGap > 0 ? 'logged but not yet billed' : 'billed above logged jobs (advance / prior-month billing)'}</>
            )}.
          </div>

          {view.hurt.length > 0 && (
            <div className="bsum-block">
              <div className="bsum-block-title neg">▼ What hurt the month</div>
              {view.hurt.slice(0, 7).map((m, i) => <WhyRow key={'h' + i} m={m} />)}
            </div>
          )}
          {view.helped.length > 0 && (
            <div className="bsum-block">
              <div className="bsum-block-title pos">▲ What helped the month</div>
              {view.helped.slice(0, 7).map((m, i) => <WhyRow key={'g' + i} m={m} />)}
            </div>
          )}
          {view.helped.length === 0 && view.hurt.length === 0 && <div className="bsum-empty">No meaningful movement vs last month.</div>}
        </>
      )}

      {!loading && !error && view && tab === 'invoicing' && (
        <>
          <div className="bsum-cards">
            <LaneCard title={`Invoiced — ${monthLabel}`} lane={view.lanes.inv} upIsGood bold />
            <div className="bsum-card">
              <div className="bsum-card-title">Invoices raised</div>
              <div className="bsum-card-value">{view.curInvCount}</div>
              <div className="bsum-card-prev">last month {view.prevInvCount}</div>
            </div>
            <div className="bsum-card">
              <div className="bsum-card-title">Status — {monthLabel}</div>
              <div className="bsum-status">
                <div><span className="pos">● Paid</span><b>S$ {fmt(view.status.paid)}</b><i>{view.statusCount.paid}</i></div>
                <div><span className="amb">● Pending</span><b>S$ {fmt(view.status.pending)}</b><i>{view.statusCount.pending}</i></div>
                <div><span className="neg">● Overdue</span><b>S$ {fmt(view.status.overdue)}</b><i>{view.statusCount.overdue}</i></div>
              </div>
            </div>
          </div>

          <div className="bsum-block">
            <div className="bsum-block-title">Client billing vs {prevLabel}</div>
            {view.invMoves.length === 0 && <div className="bsum-empty in-block">No invoices in either month.</div>}
            {view.invMoves.map((m, i) => <WhyRow key={i} m={m} />)}
          </div>
        </>
      )}

      {!loading && !error && view && tab === 'fleet' && (
        <>
          <div className="bsum-cards">
            <LaneCard title="Fleet earnings" lane={view.lanes.earn} upIsGood />
            <LaneCard title="Fleet expenses" lane={view.lanes.exp} upIsGood={false} />
            <LaneCard title="Net profit" lane={view.lanes.net} upIsGood bold />
          </div>

          <div className="bsum-block">
            <div className="bsum-block-title">Earnings by job source vs {prevLabel}</div>
            {view.earnMoves.length === 0 && <div className="bsum-empty in-block">No earnings entries in either month.</div>}
            {view.earnMoves.map((m, i) => <WhyRow key={'e' + i} m={m} />)}
          </div>

          <div className="bsum-block">
            <div className="bsum-block-title">Expenses by type vs {prevLabel} <span className="bsum-hint">(red = spent more)</span></div>
            {view.expMoves.length === 0 && <div className="bsum-empty in-block">No expense entries in either month.</div>}
            {view.expMoves.map((m, i) => <WhyRow key={'x' + i} m={m} />)}
          </div>

          <div className="bsum-block">
            <div className="bsum-block-title">Earnings by vehicle vs {prevLabel}</div>
            {view.vehMoves.length === 0 && <div className="bsum-empty in-block">No vehicle entries in either month.</div>}
            {view.vehMoves.map((m, i) => <WhyRow key={'v' + i} m={m} />)}
          </div>
        </>
      )}

      {!loading && !error && view && (
        <div className="bsum-foot">Every figure is an exact sum of logged entries — nothing is estimated. Amounts in the lists are the <b className="pos">impact</b> on the month: green helped, red hurt.</div>
      )}
    </div>
  )
}

function LaneCard({ title, lane, upIsGood, bold }) {
  const good = upIsGood ? lane.delta > 0 : lane.delta < 0
  const flat = Math.abs(lane.delta) <= 1
  const cls = flat ? '' : good ? 'pos' : 'neg'
  return (
    <div className={`bsum-card ${bold ? 'bold' : ''}`}>
      <div className="bsum-card-title">{title}</div>
      <div className={`bsum-card-value ${cls}`}>S$ {fmt(lane.cur)}</div>
      <div className="bsum-card-prev">last month S$ {fmt(lane.prev)}</div>
      <div className={`bsum-chip ${cls}`}>
        {flat ? '→ flat' : `${lane.delta > 0 ? '▲' : '▼'} ${signed(lane.delta)}`}
        {lane.pct !== null && !flat && <span className="bsum-chip-pct">({lane.pct > 0 ? '+' : ''}{lane.pct.toFixed(1)}%)</span>}
      </div>
    </div>
  )
}

function WhyRow({ m }) {
  return (
    <div className="bsum-row">
      <div className="bsum-row-main">
        <span className="bsum-row-label">{m.label}</span>
        <span className="bsum-row-lane">{m.lane}</span>
      </div>
      <div className="bsum-row-side">
        <span className="bsum-row-detail">{m.detail}</span>
        <span className={`bsum-row-delta ${m.impact > 0 ? 'pos' : m.impact < 0 ? 'neg' : ''}`}>{signed(m.impact)}</span>
      </div>
    </div>
  )
}
