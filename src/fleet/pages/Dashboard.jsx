import { useEffect, useState, useCallback } from 'react';
import { useFleet } from '../context/FleetContext';
import { CLIENT_CONFIG, MONTHS, YEARS, TARGET } from '../lib/constants';
import { getAllRows } from '../lib/dataLayer';
import { fmt, sumByClient } from '../lib/helpers';

const now = new Date();

export default function Dashboard() {
  const { vehicles } = useFleet();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState(null); // { allE, allX }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [allE, allX] = await Promise.all([
        getAllRows('earnings', month, year),
        getAllRows('expenses', month, year),
      ]);
      setData({ allE, allX });
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [month, year]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  let body = null;
  if (loading) body = <div className="no-data">Loading...</div>;
  else if (error) body = <div className="no-data" style={{ color: 'var(--red)' }}>Error: {error}</div>;
  else if (data) {
    const { allE, allX } = data;
    const grandE = allE.reduce((s, e) => s + Number(e.amount), 0);
    const grandX = allX.reduce((s, e) => s + Number(e.amount), 0);
    const grandNet = grandE - grandX;
    const grandClientTotals = sumByClient(allE);

    const rows = vehicles.map(v => {
      const ve = allE.filter(e => e.vehicle === v);
      const vx = allX.filter(e => e.vehicle === v);
      const te = ve.reduce((s, e) => s + Number(e.amount), 0);
      const tx = vx.reduce((s, e) => s + Number(e.amount), 0);
      const vClientTotals = sumByClient(ve);
      let incentive = 0, deduction = 0;
      if (te >= TARGET) incentive = (te - TARGET) * 0.5;
      else deduction = ((TARGET - te) * 3000) / TARGET;
      return { v, te, tx, net: te - tx, clientTotals: vClientTotals, incentive, deduction };
    });
    const totalIncentive = rows.reduce((s, r) => s + r.incentive, 0);
    const totalDeduction = rows.reduce((s, r) => s + r.deduction, 0);
    const pct = v => (grandE > 0 ? ((v / grandE) * 100).toFixed(1) : '0.0');

    body = (
      <>
        <div className="stat-row">
          <div className="stat-card" style={{ borderColor: '#22c55e33' }}>
            <div className="slabel">Fleet Earnings</div>
            <div className="sval" style={{ color: 'var(--green)' }}>{fmt(grandE)}</div>
          </div>
          <div className="stat-card" style={{ borderColor: '#ef444433' }}>
            <div className="slabel">Fleet Expenses</div>
            <div className="sval" style={{ color: 'var(--red)' }}>{fmt(grandX)}</div>
          </div>
          <div className="stat-card" style={{ borderColor: grandNet >= 0 ? '#22c55e33' : '#ef444433' }}>
            <div className="slabel">Net Profit</div>
            <div className="sval" style={{ color: grandNet >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(grandNet)}</div>
          </div>
        </div>

        <div className="section-card">
          <div className="section-title">Fleet Client Earnings — {MONTHS[month]} {year}</div>
          <div className="client-grid">
            {CLIENT_CONFIG.map(c => (
              <div key={c.key} className="client-box" style={{ borderColor: c.hex + '33' }}>
                <div className="clabel" style={{ color: c.color }}>
                  {c.label}<span className="cpct">{pct(grandClientTotals[c.key] || 0)}%</span>
                </div>
                <div className="cval" style={{ color: c.color }}>{fmt(grandClientTotals[c.key] || 0)}</div>
                <div className="cbar-bg">
                  <div className="cbar" style={{ width: pct(grandClientTotals[c.key] || 0) + '%', background: c.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="section-card">
          <div className="section-title">Vehicle-wise Summary — {MONTHS[month]} {year}</div>
          <div className="dtable-wrap">
            <table>
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th style={{ color: 'var(--green)' }}>Earnings</th>
                  {CLIENT_CONFIG.map(c => <th key={c.key} style={{ color: c.color }}>{c.label.toUpperCase()}</th>)}
                  <th style={{ color: 'var(--red)' }}>Expenses</th>
                  <th>Net</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.v}>
                    <td className="mono" style={{ color: 'var(--accent)', fontWeight: 700 }}>{r.v}</td>
                    <td className="mono" style={{ color: 'var(--green)' }}>{fmt(r.te)}</td>
                    {CLIENT_CONFIG.map(c => (
                      <td key={c.key} className="mono" style={{ color: c.color }}>{fmt(r.clientTotals[c.key] || 0)}</td>
                    ))}
                    <td className="mono" style={{ color: 'var(--red)' }}>{fmt(r.tx)}</td>
                    <td className="mono" style={{ color: r.net >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>{fmt(r.net)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid var(--border)' }}>
                  <td style={{ fontWeight: 700, color: 'var(--muted)' }}>TOTAL</td>
                  <td className="mono" style={{ color: 'var(--green)', fontWeight: 700 }}>{fmt(grandE)}</td>
                  {CLIENT_CONFIG.map(c => (
                    <td key={c.key} className="mono" style={{ color: c.color, fontWeight: 700 }}>{fmt(grandClientTotals[c.key] || 0)}</td>
                  ))}
                  <td className="mono" style={{ color: 'var(--red)', fontWeight: 700 }}>{fmt(grandX)}</td>
                  <td className="mono" style={{ color: grandNet >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>{fmt(grandNet)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="section-card" style={{ borderColor: '#f0a50033' }}>
          <div className="section-title" style={{ color: 'var(--accent)' }}>
            ⚡ Performance vs Target — {MONTHS[month]} {year} &nbsp;
            <span style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 0, fontWeight: 400, textTransform: 'none' }}>
              Target per vehicle: S$ 6,500
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 140, background: 'var(--green-dim)', border: '1px solid #22c55e33', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 9, color: 'var(--green)', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Total Incentive Earned</div>
              <div className="mono" style={{ fontSize: 20, fontWeight: 800, color: 'var(--green)' }}>{fmt(totalIncentive)}</div>
            </div>
            <div style={{ flex: 1, minWidth: 140, background: 'var(--red-dim)', border: '1px solid #ef444433', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 9, color: 'var(--red)', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Total Deduction</div>
              <div className="mono" style={{ fontSize: 20, fontWeight: 800, color: 'var(--red)' }}>{fmt(totalDeduction)}</div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <select className="select" style={{ flex: 1, minWidth: 110 }} value={month} onChange={e => setMonth(parseInt(e.target.value))}>
          {MONTHS.map((mo, i) => <option key={mo} value={i}>{mo}</option>)}
        </select>
        <select className="select" style={{ flex: 1, minWidth: 80 }} value={year} onChange={e => setYear(parseInt(e.target.value))}>
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      {body}
    </>
  );
}
