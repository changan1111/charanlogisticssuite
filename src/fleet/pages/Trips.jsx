import { useEffect, useState, useCallback } from 'react';
import { useFleet } from '../context/FleetContext';
import { MONTHS, YEARS } from '../lib/constants';
import { getTripRows, getRows, insertTripRow, deleteTripRow } from '../lib/dataLayer';
import { fmt, todayStr } from '../lib/helpers';
import { useToast } from '../components/Toast';

const now = new Date();

export default function Trips() {
  const { vehicles } = useFleet();

  // ── Viewer filters ──
  const [vehicle, setVehicle] = useState('');
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState(null); // { trips, earnings, expenses }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ── Entry form ──
  const [entryVehicle, setEntryVehicle] = useState('');
  const [entryDate, setEntryDate] = useState(todayStr());
  const [entryTrips, setEntryTrips] = useState('');
  const [entryKm, setEntryKm] = useState('');
  const [entryNote, setEntryNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [ToastEl, showToast] = useToast();

  const loadTrips = useCallback(async () => {
    if (!vehicle) { setData(null); return; }
    setLoading(true);
    setError('');
    try {
      const [trips, earnings, expenses] = await Promise.all([
        getTripRows(vehicle, month, year),
        getRows('earnings', vehicle, month, year),
        getRows('expenses', vehicle, month, year),
      ]);
      setData({ trips, earnings, expenses });
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [vehicle, month, year]);

  useEffect(() => { loadTrips(); }, [loadTrips]);

  async function saveTripEntry() {
    const trips = parseFloat(entryTrips);
    const km = parseFloat(entryKm);
    if (!entryVehicle) { showToast('Please select a vehicle.', false); return; }
    if (!entryDate) { showToast('Please select a date.', false); return; }
    if (isNaN(trips) && isNaN(km)) { showToast('Enter at least trips or KM.', false); return; }
    setSaving(true);
    try {
      await insertTripRow({
        vehicle: entryVehicle,
        date: entryDate,
        trip: isNaN(trips) ? 0 : trips,
        km: isNaN(km) ? 0 : km,
        notes: entryNote.trim(),
      });
      showToast('Trip log saved!', true);
      setEntryTrips('');
      setEntryKm('');
      setEntryNote('');
      // Jump the viewer to what was just saved (same as v1)
      setVehicle(entryVehicle);
      const [y, m] = entryDate.split('-');
      setYear(parseInt(y));
      setMonth(parseInt(m) - 1);
    } catch (e) {
      showToast('Error: ' + e.message, false);
    }
    setSaving(false);
  }

  async function deleteTripEntry(id) {
    if (!confirm('Delete this trip entry?')) return;
    try {
      await deleteTripRow(id);
      loadTrips();
    } catch (e) { alert('Error: ' + e.message); }
  }

  // ── Trip content ──
  let content;
  if (!vehicle) {
    content = <div className="no-data">← Select a vehicle to view trip log</div>;
  } else if (loading) {
    content = <div className="no-data">Loading...</div>;
  } else if (error) {
    content = <div className="no-data" style={{ color: 'var(--red)' }}>Error: {error}</div>;
  } else if (data) {
    const { trips, earnings, expenses } = data;
    const totTrips = trips.reduce((s, t) => s + Number(t.trip || 0), 0);
    const totKm = trips.reduce((s, t) => s + Number(t.km || 0), 0);
    const totEarn = earnings.reduce((s, e) => s + Number(e.amount), 0);
    const totExp = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const avgKmPerTrip = totTrips > 0 ? (totKm / totTrips).toFixed(1) : '—';
    const fuelExp = expenses.filter(e => e.expense_type === 'Fuel');
    const totFuel = fuelExp.reduce((s, e) => s + Number(e.amount), 0);
    const costPerKm = totKm > 0 && totFuel > 0 ? (totFuel / totKm).toFixed(3) : null;
    const earnPerKm = totKm > 0 && totEarn > 0 ? (totEarn / totKm).toFixed(2) : null;

    content = (
      <>
        <div className="stat-row">
          <div className="stat-card" style={{ borderColor: '#06b6d433' }}>
            <div className="slabel">Total Trips</div>
            <div className="sval" style={{ color: '#06b6d4' }}>{totTrips || '—'}</div>
          </div>
          <div className="stat-card" style={{ borderColor: '#06b6d433' }}>
            <div className="slabel">Total KM</div>
            <div className="sval" style={{ color: '#06b6d4' }}>{totKm ? totKm.toFixed(1) + ' km' : '—'}</div>
          </div>
          <div className="stat-card" style={{ borderColor: '#a78bfa33' }}>
            <div className="slabel">Avg KM / Trip</div>
            <div className="sval" style={{ color: '#a78bfa' }}>{avgKmPerTrip}</div>
          </div>
          <div className="stat-card" style={{ borderColor: '#ef444433' }}>
            <div className="slabel">Fuel Cost</div>
            <div className="sval" style={{ color: 'var(--red)' }}>{totFuel ? fmt(totFuel) : '—'}</div>
            <div className="ssub">{fuelExp.length} entr{fuelExp.length === 1 ? 'y' : 'ies'}</div>
          </div>
          <div className="stat-card" style={{ borderColor: '#ef444466' }}>
            <div className="slabel">Cost / KM</div>
            <div className="sval" style={{ color: 'var(--red)' }}>{costPerKm ? 'S$ ' + costPerKm : '—'}</div>
            <div className="ssub">{earnPerKm ? `S$ ${earnPerKm} earned/km` : 'log KM + fuel to see'}</div>
          </div>
          <div className="stat-card" style={{ borderColor: '#22c55e33' }}>
            <div className="slabel">Earnings</div>
            <div className="sval" style={{ color: 'var(--green)' }}>{fmt(totEarn)}</div>
          </div>
          <div className="stat-card" style={{ borderColor: '#ef444433' }}>
            <div className="slabel">Total Expenses</div>
            <div className="sval" style={{ color: 'var(--red)' }}>{fmt(totExp)}</div>
          </div>
        </div>

        {!trips.length ? (
          <div className="section-card" style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🗺️</div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>No trip entries yet</div>
            <div style={{ fontSize: 11 }}>
              Use the form on the left to log your first trip for {vehicle} — {MONTHS[month]} {year}
            </div>
          </div>
        ) : (
          <div className="section-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{
              padding: '13px 18px', background: 'var(--surface)', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
            }}>
              <div className="section-title" style={{ marginBottom: 0 }}>
                Trip Log — {MONTHS[month]} {year} · {vehicle}
              </div>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                {trips.length} entr{trips.length === 1 ? 'y' : 'ies'}
              </span>
            </div>
            <div className="dtable-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th style={{ color: '#06b6d4', textAlign: 'right' }}>Trips</th>
                    <th style={{ color: '#06b6d4', textAlign: 'right' }}>KM Run</th>
                    <th style={{ color: '#a78bfa', textAlign: 'right' }}>KM / Trip</th>
                    <th style={{ color: 'var(--muted)' }}>Notes</th>
                    <th style={{ textAlign: 'center', color: 'var(--muted)' }}>Del</th>
                  </tr>
                </thead>
                <tbody>
                  {trips.map(t => {
                    const kpt = Number(t.trip) > 0 ? (Number(t.km) / Number(t.trip)).toFixed(1) : '—';
                    const dl = new Date(t.date + 'T00:00:00').toLocaleDateString('en-SG', { weekday: 'short', day: '2-digit', month: 'short' });
                    return (
                      <tr key={t.id}>
                        <td style={{ color: 'var(--accent)', fontWeight: 700, whiteSpace: 'nowrap' }}>{dl}</td>
                        <td className="mono" style={{ color: '#06b6d4', textAlign: 'right', fontWeight: 700 }}>{t.trip || '—'}</td>
                        <td className="mono" style={{ color: '#06b6d4', textAlign: 'right' }}>{Number(t.km) ? Number(t.km).toFixed(1) + ' km' : '—'}</td>
                        <td className="mono" style={{ color: '#a78bfa', textAlign: 'right' }}>{kpt}</td>
                        {/* DB column tolerance: v1 inserted `notes` but displayed `note` */}
                        <td style={{ color: 'var(--muted)', fontSize: 11 }}>{t.note || t.notes || '—'}</td>
                        <td style={{ textAlign: 'center' }}>
                          <button className="trip-del-btn" onClick={() => deleteTripEntry(t.id)}>✕</button>
                        </td>
                      </tr>
                    );
                  })}
                  <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface)' }}>
                    <td style={{ fontWeight: 800, color: 'var(--muted)' }}>TOTAL</td>
                    <td className="mono" style={{ color: '#06b6d4', textAlign: 'right', fontWeight: 800 }}>{totTrips}</td>
                    <td className="mono" style={{ color: '#06b6d4', textAlign: 'right', fontWeight: 800 }}>{totKm.toFixed(1)} km</td>
                    <td className="mono" style={{ color: '#a78bfa', textAlign: 'right' }}>{avgKmPerTrip}</td>
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <select className="select" style={{ flex: 2, minWidth: 150 }} value={vehicle} onChange={e => setVehicle(e.target.value)}>
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

      <div className="trips-layout">
        <div>
          <div className="trips-form-card">
            <div className="trips-form-title">Log Trip / KM</div>
            <div className="field">
              <label className="label">Vehicle</label>
              <select className="select" value={entryVehicle} onChange={e => setEntryVehicle(e.target.value)}>
                <option value="">Select vehicle...</option>
                {vehicles.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label">Date</label>
              <input type="date" className="input" value={entryDate} onChange={e => setEntryDate(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="field" style={{ flex: 1 }}>
                <label className="label">No. of Trips</label>
                <input
                  type="number" className="input mono" placeholder="0" min="0"
                  style={{ fontSize: 20, fontWeight: 700, color: '#06b6d4' }}
                  value={entryTrips} onChange={e => setEntryTrips(e.target.value)}
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label className="label">KM Run</label>
                <input
                  type="number" className="input mono" placeholder="0.0" min="0" step="0.1"
                  style={{ fontSize: 20, fontWeight: 700, color: '#a78bfa' }}
                  value={entryKm} onChange={e => setEntryKm(e.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label className="label">Notes (optional)</label>
              <input
                type="text" className="input" placeholder="e.g. KAIRA route, highway..."
                value={entryNote} onChange={e => setEntryNote(e.target.value)}
              />
            </div>
            <button className="btn-trip-save" disabled={saving} onClick={saveTripEntry}>
              {saving ? 'Saving...' : 'Save Trip Log'}
            </button>
            <ToastEl />
            <div style={{
              marginTop: 14, background: 'var(--bg)', border: '1px solid #06b6d422', borderRadius: 9,
              padding: '12px 14px', fontSize: 11, color: 'var(--muted)', lineHeight: 1.85,
            }}>
              <b style={{ color: '#06b6d4' }}>ℹ️ How it works</b><br />
              Log trips and KM per day per vehicle.<br />
              This data appears in the <b style={{ color: 'var(--text)' }}>History</b> view on each day card and in the trip summary table below.
            </div>
          </div>
        </div>
        <div>{content}</div>
      </div>
    </>
  );
}
