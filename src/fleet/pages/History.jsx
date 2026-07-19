import { useEffect, useState, useCallback } from 'react';
import { useFleet } from '../context/FleetContext';
import { CLIENT_CONFIG, MONTHS, YEARS } from '../lib/constants';
import { detectClient } from '../lib/clientDetect';
import { getRows, getTripRows, deleteEntry } from '../lib/dataLayer';
import { fmt, sumByClient } from '../lib/helpers';
import { ClientBadge } from '../components/ClientBadge';
import EditEntryModal from '../components/EditEntryModal';

const now = new Date();

export default function History() {
  const { vehicles } = useFleet();
  const [vehicle, setVehicle] = useState('');
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState(null);       // { earnings, expenses, tripMap }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // { table, row }
  const [openDays, setOpenDays] = useState({}); // day -> collapsed?

  const loadHistory = useCallback(async () => {
    if (!vehicle) { setData(null); return; }
    setLoading(true);
    setError('');
    try {
      const [earnings, expenses, tripData] = await Promise.all([
        getRows('earnings', vehicle, month, year),
        getRows('expenses', vehicle, month, year),
        getTripRows(vehicle, month, year).catch(() => []),
      ]);
      const tripMap = {};
      tripData.forEach(t => {
        if (!tripMap[t.date]) tripMap[t.date] = { trips: 0, km: 0 };
        tripMap[t.date].trips += Number(t.trip || 0);
        tripMap[t.date].km += Number(t.km || 0);
      });
      setData({ earnings, expenses, tripMap });
      setOpenDays({});
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [vehicle, month, year]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function handleDelete(table, id) {
    if (!confirm('Delete this entry? This cannot be undone.')) return;
    try {
      await deleteEntry(table, id);
      loadHistory();
    } catch (e) { alert('Error: ' + e.message); }
  }

  // ── Derived values ──
  let body = null;
  if (!vehicle) {
    body = <div className="no-data">← Select a vehicle to view history</div>;
  } else if (loading) {
    body = <div className="no-data">Loading...</div>;
  } else if (error) {
    body = <div className="no-data" style={{ color: 'var(--red)' }}>Error: {error}</div>;
  } else if (data) {
    const { earnings, expenses, tripMap } = data;
    const totalE = earnings.reduce((s, e) => s + Number(e.amount), 0);
    const totalX = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const net = totalE - totalX;
    const clientTotals = sumByClient(earnings);
    const expByType = {};
    expenses.forEach(e => (expByType[e.expense_type] = (expByType[e.expense_type] || 0) + Number(e.amount)));

    const byDay = {};
    earnings.forEach(e => { if (!byDay[e.date]) byDay[e.date] = { earn: [], exp: [] }; byDay[e.date].earn.push(e); });
    expenses.forEach(e => { if (!byDay[e.date]) byDay[e.date] = { earn: [], exp: [] }; byDay[e.date].exp.push(e); });
    const days = Object.keys(byDay).sort().reverse();
    const pct = v => (totalE > 0 ? ((v / totalE) * 100).toFixed(1) : '0.0');

    body = (
      <>
        <div className="stat-row">
          <div className="stat-card" style={{ borderColor: '#22c55e33' }}>
            <div className="slabel">Total Earnings</div>
            <div className="sval" style={{ color: 'var(--green)' }}>{fmt(totalE)}</div>
          </div>
          <div className="stat-card" style={{ borderColor: '#ef444433' }}>
            <div className="slabel">Total Expenses</div>
            <div className="sval" style={{ color: 'var(--red)' }}>{fmt(totalX)}</div>
          </div>
          <div className="stat-card" style={{ borderColor: net >= 0 ? '#22c55e33' : '#ef444433' }}>
            <div className="slabel">Net Profit</div>
            <div className="sval" style={{ color: net >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(net)}</div>
          </div>
        </div>

        <div className="section-card">
          <div className="section-title">Earnings by Client</div>
          <div className="client-grid">
            {CLIENT_CONFIG.map(c => (
              <div key={c.key} className="client-box" style={{ borderColor: c.hex + '33' }}>
                <div className="clabel" style={{ color: c.color }}>
                  {c.label}<span className="cpct">{pct(clientTotals[c.key] || 0)}%</span>
                </div>
                <div className="cval" style={{ color: c.color }}>{fmt(clientTotals[c.key] || 0)}</div>
                <div className="cbar-bg">
                  <div className="cbar" style={{ width: pct(clientTotals[c.key] || 0) + '%', background: c.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {Object.keys(expByType).length > 0 && (
          <div className="section-card">
            <div className="section-title">Expense by Category</div>
            {Object.entries(expByType).sort((a, b) => b[1] - a[1]).map(([t, a]) => (
              <div key={t} className="exp-row">
                <div className="exp-name">{t}</div>
                <div className="exp-bar-bg">
                  <div className="exp-bar" style={{ width: (totalX > 0 ? ((a / totalX) * 100).toFixed(1) : 0) + '%' }} />
                </div>
                <div className="exp-amt">{fmt(a)}</div>
              </div>
            ))}
          </div>
        )}

        {!days.length ? (
          <div className="no-data">No entries found.</div>
        ) : (
          days.map(day => {
            const { earn, exp } = byDay[day];
            const dE = earn.reduce((s, e) => s + Number(e.amount), 0);
            const dX = exp.reduce((s, e) => s + Number(e.amount), 0);
            const dNet = dE - dX;
            const dl = new Date(day + 'T00:00:00').toLocaleDateString('en-SG', { weekday: 'short', day: '2-digit', month: 'short' });
            const td = tripMap[day];
            const collapsed = openDays[day] === false;

            return (
              <div key={day} className="day-card">
                <div className="day-header" onClick={() => setOpenDays(o => ({ ...o, [day]: collapsed }))}>
                  <span className="day-label">
                    {dl}
                    {td && (
                      <span className="trip-inline-pill">
                        🗺️ {td.trips} trip{td.trips !== 1 ? 's' : ''} · {Number(td.km).toFixed(1)} km
                      </span>
                    )}
                  </span>
                  <div className="day-amounts">
                    {dE > 0 && <span className="mono" style={{ fontSize: 12, color: 'var(--green)' }}>+{fmt(dE)}</span>}
                    {dX > 0 && <span className="mono" style={{ fontSize: 12, color: 'var(--red)' }}>-{fmt(dX)}</span>}
                    <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: dNet >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(dNet)}</span>
                  </div>
                </div>
                {!collapsed && (
                  <div className="day-body">
                    {earn.map(e => (
                      <div key={e.id} className="entry-row">
                        <div className="dot" style={{ background: 'var(--green)' }} />
                        <div className="entry-info">
                          <div className="entry-meta">
                            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Earning</span>
                            <ClientBadge clientKey={detectClient(e.note)} />
                          </div>
                          {e.note && <div className="entry-note">{e.note}</div>}
                        </div>
                        <span className="entry-amt" style={{ color: 'var(--green)' }}>{fmt(e.amount)}</span>
                        <div className="row-actions">
                          <button className="btn-edit-row" onClick={() => setEditing({ table: 'earnings', row: e })}>✏️</button>
                          <button className="btn-del-row" onClick={() => handleDelete('earnings', e.id)}>🗑</button>
                        </div>
                      </div>
                    ))}
                    {exp.map(e => (
                      <div key={e.id} className="entry-row">
                        <div className="dot" style={{ background: 'var(--red)' }} />
                        <div className="entry-info">
                          <div className="entry-meta"><span className="exp-tag">{e.expense_type}</span></div>
                          {e.note && <div className="entry-note">{e.note}</div>}
                        </div>
                        <span className="entry-amt" style={{ color: 'var(--red)' }}>-{fmt(e.amount)}</span>
                        <div className="row-actions">
                          <button className="btn-edit-row" onClick={() => setEditing({ table: 'expenses', row: e })}>✏️</button>
                          <button className="btn-del-row" onClick={() => handleDelete('expenses', e.id)}>🗑</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        {/* id kept for the Playwright keep-alive workflow */}
        <select
          className="select" id="histVehicle" style={{ flex: 2, minWidth: 150 }}
          value={vehicle} onChange={e => setVehicle(e.target.value)}
        >
          <option value="">Select Vehicle</option>
          {vehicles.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select className="select" style={{ flex: 1, minWidth: 110 }} value={month} onChange={e => setMonth(parseInt(e.target.value))}>
          {MONTHS.map((mo, i) => <option key={mo} value={i}>{mo}</option>)}
        </select>
        <select className="select" style={{ flex: 1, minWidth: 80 }} value={year} onChange={e => setYear(parseInt(e.target.value))}>
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {body}

      <EditEntryModal entry={editing} onClose={() => setEditing(null)} onSaved={loadHistory} />
    </>
  );
}
