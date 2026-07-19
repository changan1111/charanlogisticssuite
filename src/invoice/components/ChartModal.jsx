import { useState, useEffect, useRef } from 'react'
import { Chart, registerables } from 'chart.js'
import { fmt } from '../utils/helpers'

Chart.register(...registerables)

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function parseYear(inv) {
  const d = inv.billingDate || inv.billing_date || inv.date || ''
  // dd-mm-yyyy or yyyy-mm-dd
  if (d.length >= 7) {
    const parts = d.split(/[-\/]/)
    if (parts[0].length === 4) return parseInt(parts[0])
    if (parts[2]?.length === 4) return parseInt(parts[2])
  }
  return null
}
function parseMonth(inv) {
  const d = inv.billingDate || inv.billing_date || inv.date || ''
  if (d.length >= 7) {
    const parts = d.split(/[-\/]/)
    if (parts[0].length === 4) return parseInt(parts[1]) - 1
    if (parts[2]?.length === 4) return parseInt(parts[1]) - 1
  }
  return null
}

export default function ChartModal({ invoices, cfg, onClose }) {
  const [view, setView]     = useState('bar')
  const [year, setYear]     = useState(new Date().getFullYear())
  const chartRef            = useRef(null)
  const chartInst           = useRef(null)

  const years = [...new Set(invoices.map(parseYear).filter(Boolean))].sort().reverse()

  const monthData = MONTHS.map((m, i) => {
    const mInvs = invoices.filter(inv => parseYear(inv) === year && parseMonth(inv) === i)
    const paid    = mInvs.filter(inv => inv.status === 'paid').reduce((s, inv) => s + parseFloat(inv.total_amount ?? inv.total ?? 0), 0)
    const pending = mInvs.filter(inv => inv.status !== 'paid').reduce((s, inv) => s + parseFloat(inv.total_amount ?? inv.total ?? 0), 0)
    return { month: m, paid, pending, count: mInvs.length }
  })

  const yearTotal = monthData.reduce((s, m) => s + m.paid + m.pending, 0)
  const yearPaid  = monthData.reduce((s, m) => s + m.paid, 0)

  useEffect(() => {
    if (view === 'table' || !chartRef.current) return
    if (chartInst.current) chartInst.current.destroy()
    chartInst.current = new Chart(chartRef.current, {
      type: view === 'line' ? 'line' : 'bar',
      data: {
        labels: MONTHS,
        datasets: [
          { label: 'Paid', data: monthData.map(m => m.paid), backgroundColor: 'rgba(10,122,75,.7)', borderColor: '#0a7a4b', borderWidth: 2, borderRadius: view === 'bar' ? 6 : 0, fill: view === 'line' },
          { label: 'Pending', data: monthData.map(m => m.pending), backgroundColor: 'rgba(184,106,0,.5)', borderColor: '#b86a00', borderWidth: 2, borderRadius: view === 'bar' ? 6 : 0, fill: view === 'line' },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: S$ ${fmt(ctx.raw)}` } } },
        scales: { y: { ticks: { callback: v => 'S$' + fmt(v) }, beginAtZero: true } }
      }
    })
    return () => { if (chartInst.current) { chartInst.current.destroy(); chartInst.current = null } }
  }, [view, year, invoices])

  return (
    <div className="chart-overlay open" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="chart-modal">
        <div className="chart-bar">
          <div className="chart-bar-title">📊 Monthly Performance</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
            <select className="page-size-select" value={year} onChange={e => setYear(Number(e.target.value))} style={{ minWidth: 80 }}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button className="xbtn" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="chart-body">
          <div className="chart-tabs">
            {['bar','line','table'].map(v => (
              <button key={v} className={`chart-tab${view === v ? ' active' : ''}`} onClick={() => setView(v)}>
                {v === 'bar' ? 'Bar Chart' : v === 'line' ? 'Line Chart' : 'Table View'}
              </button>
            ))}
          </div>
          <div className="chart-summary">
            <div className="cs-card"><div className="cs-lbl">Year Total</div><div className="cs-val">S$ {fmt(yearTotal)}</div></div>
            <div className="cs-card"><div className="cs-lbl">Paid</div><div className="cs-val c-paid">S$ {fmt(yearPaid)}</div></div>
          </div>
          {view !== 'table' ? (
            <div className="chart-wrap"><canvas ref={chartRef} /></div>
          ) : (
            <div className="chart-tbl-wrap">
              <table className="chart-tbl">
                <thead><tr><th>Month</th><th className="r">Total</th><th className="r">Invoices</th></tr></thead>
                <tbody>
                  {monthData.filter(m => m.count > 0 || m.paid + m.pending > 0).map((m, i) => (
                    <tr key={i}>
                      <td><b>{m.month}</b></td>
                      <td className="r">S$ {fmt(m.paid + m.pending)}</td>
                      <td className="r">{m.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
