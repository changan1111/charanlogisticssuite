import { useEffect, useState, useMemo } from 'react'
import { sb } from '../lib/supabaseClient'
import { getAllRows } from '../fleet/lib/dataLayer'
import { CLIENT_CONFIG, MONTHS, YEARS } from '../fleet/lib/constants'
import { detectClient } from '../fleet/lib/clientDetect'
import '../styles/summary.css'

// ═══════════════════════════════════════════════
//  BUSINESS SUMMARY — invoicing + fleet in one view.
//  Every figure is an exact sum of logged rows. The "why" lists are
//  the actual biggest movers vs last month — nothing is estimated.
//  Invoiced revenue and fleet earnings are shown side by side but
//  never added together (they can describe the same jobs).
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

const sum = rows => rows.reduce((s, r) => s + Number(r.amount), 0)
const fmt = n => Number(n || 0).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const signed = n => (n > 0 ? '+S$ ' : n < 0 ? '−S$ ' : 'S$ ') + fmt(Math.abs(n))
const pct = (prev, cur) => (prev ? ((cur - prev) / prev) * 100 : null) // null = no baseline, never guessed
const prevOf = (m, y) => (m === 0 ? { m: 11, y: y - 1 } : { m: m - 1, y })

function groupDelta(curRows, prevRows, keyFn) {
  const keys = new Set([...curRows.map(keyFn), ...prevRows.map(keyFn)])
  return [...keys].map(k => {
    const c = curRows.filter(r => keyFn(r) === k)
    const p = prevRows.filter(r => keyFn(r) === k)
    return { key: k, cur: sum(c), prev: sum(p), delta: sum(c) - sum(p), curCount: c.length, prevCount: p.length }
  }).filter(m => m.cur !== 0 || m.prev !== 0)
}

// invoice totals are not `amount`-shaped rows, so a dedicated grouper
function groupInvDelta(curRows, prevRows) {
  const keys = new Set([...curRows.map(invClient), ...prevRows.map(invClient)])
  return [...keys].map(k => {
    const c = curRows.filter(r => invClient(r) === k)
    const p = prevRows.filter(r => invClient(r) === k)
    const cur = c.reduce((s, r) => s + invTotal(r), 0)
    const prev = p.reduce((s, r) => s + invTotal(r), 0)
    return { key: k, cur, prev, delta: cur - prev, curCount: c.length, prevCount: p.length }
  }).filter(m => m.cur !== 0 || m.prev !== 0)
}

const fleetClientLabel = k => (CLIENT_CONFIG.find(c => c.key === k)?.label || k)

export default function BusinessSummary() {
  const [month, setMonth] = useState(now.getMonth())
  const [year, setYear] = useState(now.getFullYear())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError('')
      try {
        const p = prevOf(month, year)

        // fleet rows for both months (server-side month filter)
        const [curFE, curFX, prevFE, prevFX] = await Promise.all([
          getAllRows('earnings', month, year),
          getAllRows('expenses', month, year),
          getAllRows('earnings', p.m, p.y),
          getAllRows('expenses', p.m, p.y),
        ])

        // all invoices (date formats vary, so filter client-side like InsightsPanel)
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

        if (!cancelled) setData({ curFE, curFX, prevFE, prevFX, curInv, prevInv, p })
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

    const lanes = {
      inv:  { cur: curInv.reduce((s, r) => s + invTotal(r), 0), prev: prevInv.reduce((s, r) => s + invTotal(r), 0) },
      earn: { cur: sum(curFE), prev: sum(prevFE) },
      exp:  { cur: sum(curFX), prev: sum(prevFX) },
    }
    lanes.net = { cur: lanes.earn.cur - lanes.exp.cur, prev: lanes.earn.prev - lanes.exp.prev }
    for (const l of Object.values(lanes)) { l.delta = l.cur - l.prev; l.pct = pct(l.prev, l.cur) }

    // movers per lane
    const invMoves   = groupInvDelta(curInv, prevInv)
    const earnMoves  = groupDelta(curFE, prevFE, r => detectClient(r.note || '')).map(m => ({ ...m, label: fleetClientLabel(m.key) }))
    const expMoves   = groupDelta(curFX, prevFX, r => r.expense_type || 'Other')
    const vehMoves   = groupDelta(curFE, prevFE, r => r.vehicle || '?')

    // one combined "why" list, biggest impact first.
    // good = green: revenue up, expense down. bad = red: revenue down, expense up.
    const why = [
      ...invMoves.map(m => ({ lane: 'Invoicing', label: m.key, delta: m.delta, good: m.delta > 0, detail: `${m.prevCount} → ${m.curCount} invoices` })),
      ...earnMoves.map(m => ({ lane: 'Fleet earnings', label: m.label, delta: m.delta, good: m.delta > 0, detail: `${m.prevCount} → ${m.curCount} jobs` })),
      ...expMoves.map(m => ({ lane: 'Fleet expense', label: m.key, delta: m.delta, good: m.delta < 0, detail: `${m.prevCount} → ${m.curCount} entries` })),
    ].filter(m => Math.abs(m.delta) >= 1).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

    const worstVehicle = [...vehMoves].sort((a, b) => a.delta - b.delta)[0]
    const bestVehicle  = [...vehMoves].sort((a, b) => b.delta - a.delta)[0]

    // deterministic headline built from the top movers
    const good = why.filter(m => m.good)
    const bad  = why.filter(m => !m.good)
    let headline
    if (!why.length) {
      headline = 'Nothing moved meaningfully vs last month.'
    } else {
      const parts = []
      if (lanes.net.delta < -1)      parts.push(`Fleet net is down ${signed(lanes.net.delta).replace('−S$', 'S$')}`)
      else if (lanes.net.delta > 1)  parts.push(`Fleet net is up ${signed(lanes.net.delta).replace('+S$', 'S$')}`)
      if (lanes.inv.delta < -1)      parts.push(`invoicing is down ${signed(lanes.inv.delta).replace('−S$', 'S$')}`)
      else if (lanes.inv.delta > 1)  parts.push(`invoicing is up ${signed(lanes.inv.delta).replace('+S$', 'S$')}`)
      const driver = bad[0] || good[0]
      const driverTxt = driver
        ? ` — biggest single factor: ${driver.label} (${driver.lane.toLowerCase()}) ${driver.delta > 0 ? 'up' : 'down'} ${signed(driver.delta).replace(/^[+−]/, '')}`
        : ''
      headline = (parts.join(' and ') || 'Broadly flat vs last month') + driverTxt + '.'
    }

    const unbilledGap = lanes.earn.cur - lanes.inv.cur

    return { lanes, why, good, bad, worstVehicle, bestVehicle, headline, unbilledGap }
  }, [data])

  const monthLabel = `${MONTHS[month]} ${year}`
  const p = prevOf(month, year)
  const prevLabel = `${MONTHS[p.m]} ${p.y}`
  const isPartial = year === now.getFullYear() && month === now.getMonth()

  return (
    <div className="bsum">
      <div className="bsum-head">
        <div>
          <h1 className="bsum-title">Business Summary</h1>
          <div className="bsum-sub">{monthLabel} compared with {prevLabel} — invoicing and fleet together</div>
        </div>
        <div className="bsum-pickers">
          <select value={month} onChange={e => setMonth(+e.target.value)}>
            {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(+e.target.value)}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {isPartial && (
        <div className="bsum-note">⚠️ {monthLabel} is still in progress — this is a partial-month comparison and figures will grow.</div>
      )}

      {loading && <div className="bsum-loading">Adding up the month…</div>}
      {error && <div className="bsum-error">Could not load: {error}</div>}

      {!loading && !error && view && (
        <>
          {/* ── Headline verdict ── */}
          <div className={`bsum-verdict ${view.lanes.net.delta > 1 ? 'up' : view.lanes.net.delta < -1 ? 'down' : ''}`}>
            {view.headline}
          </div>

          {/* ── The four lanes ── */}
          <div className="bsum-cards">
            <LaneCard title="Invoiced to clients" lane={view.lanes.inv} upIsGood />
            <LaneCard title="Fleet earnings (logged jobs)" lane={view.lanes.earn} upIsGood />
            <LaneCard title="Fleet expenses" lane={view.lanes.exp} upIsGood={false} />
            <LaneCard title="Fleet net profit" lane={view.lanes.net} upIsGood bold />
          </div>

          {/* ── Billed vs logged ── */}
          <div className="bsum-gap">
            Jobs logged this month total <b>S$ {fmt(view.lanes.earn.cur)}</b>, invoiced <b>S$ {fmt(view.lanes.inv.cur)}</b>
            {Math.abs(view.unbilledGap) >= 1 && (
              <> — a gap of <b className={view.unbilledGap > 0 ? 'neg' : 'pos'}>S$ {fmt(Math.abs(view.unbilledGap))}</b> {view.unbilledGap > 0 ? 'logged but not yet billed' : 'billed above logged jobs (advance / prior-month billing)'}</>
            )}.
          </div>

          {/* ── Why it moved ── */}
          <h2 className="bsum-h2">Why it moved</h2>
          {view.why.length === 0 && <div className="bsum-empty">No meaningful movement vs last month.</div>}

          {view.bad.length > 0 && (
            <div className="bsum-block">
              <div className="bsum-block-title neg">▼ Pulling the month down</div>
              {view.bad.slice(0, 6).map((m, i) => <WhyRow key={'b' + i} m={m} />)}
            </div>
          )}

          {view.good.length > 0 && (
            <div className="bsum-block">
              <div className="bsum-block-title pos">▲ Lifting the month up</div>
              {view.good.slice(0, 6).map((m, i) => <WhyRow key={'g' + i} m={m} />)}
            </div>
          )}

          {/* ── Vehicle callouts ── */}
          {(view.worstVehicle || view.bestVehicle) && (
            <div className="bsum-vehicles">
              {view.bestVehicle && view.bestVehicle.delta > 1 && (
                <div className="bsum-veh pos">🚛 Best mover: <b>{view.bestVehicle.key}</b> earnings {signed(view.bestVehicle.delta)}</div>
              )}
              {view.worstVehicle && view.worstVehicle.delta < -1 && (
                <div className="bsum-veh neg">🚛 Biggest drop: <b>{view.worstVehicle.key}</b> earnings {signed(view.worstVehicle.delta)}</div>
              )}
            </div>
          )}

          <div className="bsum-foot">Every figure is an exact sum of logged entries — nothing here is estimated.</div>
        </>
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
        <span className={`bsum-row-delta ${m.good ? 'pos' : 'neg'}`}>{signed(m.delta)}</span>
      </div>
    </div>
  )
}
