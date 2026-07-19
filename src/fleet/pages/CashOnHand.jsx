import { useEffect, useState, useCallback } from 'react';
import { useFleet } from '../context/FleetContext';
import { CASH_TYPES, MONTHS, YEARS, cashStyle } from '../lib/constants';
import { getCashRows, insertCash, deleteCash } from '../lib/dataLayer';
import { fmt, pad, todayStr } from '../lib/helpers';
import { useToast } from '../components/Toast';
import EditCashModal from '../components/EditCashModal';

const now = new Date();

export default function CashOnHand() {
  const { vehicles } = useFleet();

  // ── Form state ──
  const [vehicle, setVehicle] = useState('');
  const [cashType, setCashType] = useState('Petty Cash');
  const [date, setDate] = useState(todayStr());
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [ToastEl, showToast] = useToast();

  // ── Ledger state ──
  const [ledgerVehicle, setLedgerVehicle] = useState('');
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);

  const loadCash = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await getCashRows(month, year, ledgerVehicle);
      setRows(r);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [month, year, ledgerVehicle]);

  useEffect(() => { loadCash(); }, [loadCash]);

  async function saveCash() {
    const amt = parseFloat(amount);
    if (!vehicle) { showToast('Please select a vehicle.', false); return; }
    if (!amt || !date) { showToast('Please fill amount and date.', false); return; }
    setSaving(true);
    try {
      await insertCash({ vehicle, cash_type: cashType, amount: amt, note: note.trim(), date });
      showToast('Cash entry saved!', true);
      setVehicle('');
      setAmount('');
      setNote('');
      loadCash();
    } catch (e) {
      showToast('Error: ' + e.message, false);
    }
    setSaving(false);
  }

  async function handleDelete(id) {
    if (!confirm('Delete this cash entry? This cannot be undone.')) return;
    try {
      await deleteCash(id);
      loadCash();
    } catch (e) { alert('Error: ' + e.message); }
  }

  // ── Summary + running totals ──
  const total    = (rows || []).reduce((s, r) => s + Number(r.amount), 0);
  const petty    = (rows || []).filter(r => r.cash_type === 'Petty Cash').reduce((s, r) => s + Number(r.amount), 0);
  const orders   = (rows || []).filter(r => r.cash_type === 'Cash Order').reduce((s, r) => s + Number(r.amount), 0);
  const advances = (rows || []).filter(r => r.cash_type === 'Advance Salary').reduce((s, r) => s + Number(r.amount), 0);

  let withRunning = [];
  if (rows && rows.length) {
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    let running = 0;
    withRunning = sorted.map(r => { running += Number(r.amount); return { ...r, running }; });
    withRunning.reverse();
  }

  return (
    <div className="cash-layout">
      <div className="cash-form-col">
        <div className="cash-form-card">
          <div className="cash-form-title">💵 Record Cash Payment</div>
          <div className="field">
            <label className="label">Vehicle No.</label>
            <select className="select" value={vehicle} onChange={e => setVehicle(e.target.value)}>
              <option value="">Select vehicle...</option>
              {vehicles.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label">Cash Type</label>
            <select className="select" value={cashType} onChange={e => setCashType(e.target.value)}>
              {CASH_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label">Date</label>
            <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Amount (S$)</label>
            <input
              type="number" className="input mono" placeholder="0.00"
              style={{ fontSize: 20, fontWeight: 700, color: '#06b6d4' }}
              value={amount} onChange={e => setAmount(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label">Notes / Purpose</label>
            <textarea
              className="textarea" rows={3}
              placeholder="e.g. Advance to Raju driver, petrol advance..."
              value={note} onChange={e => setNote(e.target.value)}
            />
          </div>
          <button className="btn-cash-save" disabled={saving} onClick={saveCash}>
            {saving ? 'Saving...' : 'Record Cash Payment'}
          </button>
          <ToastEl />
        </div>
      </div>

      <div className="cash-ledger-col">
        <div className="cash-ledger">
          <div className="cash-ledger-header">
            <div className="cash-ledger-title">Cash Ledger</div>
            <div className="cash-filter-row">
              <select id="cashLedgerVehicle" value={ledgerVehicle} onChange={e => setLedgerVehicle(e.target.value)}>
                <option value="">All Vehicles</option>
                {vehicles.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
              <select value={month} onChange={e => setMonth(parseInt(e.target.value))}>
                {MONTHS.map((mo, i) => <option key={mo} value={i}>{mo}</option>)}
              </select>
              <select value={year} onChange={e => setYear(parseInt(e.target.value))}>
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          <div className="cash-summary-strip">
            <div className="cash-summary-cell">
              <div className="csc-label">Total Paid Out</div>
              <div className="csc-val" style={{ color: '#06b6d4' }}>{fmt(total)}</div>
            </div>
            <div className="cash-summary-cell">
              <div className="csc-label">Petty Cash</div>
              <div className="csc-val" style={{ color: 'var(--kaira)' }}>{fmt(petty)}</div>
            </div>
            <div className="cash-summary-cell">
              <div className="csc-label">Cash Orders</div>
              <div className="csc-val" style={{ color: 'var(--other)' }}>{fmt(orders)}</div>
            </div>
            <div className="cash-summary-cell">
              <div className="csc-label">Advances</div>
              <div className="csc-val" style={{ color: 'var(--green)' }}>{fmt(advances)}</div>
            </div>
          </div>

          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
            <div className="salary-box">
              <div>
                <div className="sb-label">Salary Adjustment This Month</div>
                <div className="sb-note">
                  {ledgerVehicle ? `${ledgerVehicle} — deduct from salary` : 'Select a vehicle to see per-driver deduction'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>Total to deduct</div>
                <div className="mono" style={{ fontSize: 22, fontWeight: 800, color: '#06b6d4' }}>{fmt(total)}</div>
              </div>
            </div>
          </div>

          <div>
            {loading ? (
              <div className="cash-empty">Loading...</div>
            ) : error ? (
              <div className="cash-empty" style={{ color: 'var(--red)' }}>Error: {error}</div>
            ) : !withRunning.length ? (
              <div className="cash-empty">
                {ledgerVehicle ? `No cash entries for ${ledgerVehicle} this month.` : 'No cash entries this month.'}
              </div>
            ) : (
              withRunning.map(r => {
                const d = new Date(r.date + 'T00:00:00');
                const day = d.getDate();
                const mon = d.toLocaleDateString('en-SG', { month: 'short' });
                const st = cashStyle(r.cash_type);
                return (
                  <div key={r.id} className="cash-entry-row">
                    <div className="cash-date-col">
                      <div className="cash-date-day">{pad(day)}</div>
                      <div className="cash-date-mon">{mon}</div>
                    </div>
                    <div className="cash-body">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                        <span className="cash-type-badge" style={{ color: st.color, background: st.bg, border: `1px solid ${st.border}` }}>
                          {r.cash_type}
                        </span>
                        {r.vehicle && (
                          <span className="mono" style={{
                            fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-dim)',
                            border: '1px solid #f0a50033', borderRadius: 4, padding: '1px 7px',
                          }}>{r.vehicle}</span>
                        )}
                      </div>
                      {r.note && <div className="cash-note">{r.note}</div>}
                    </div>
                    <div className="cash-amt-col">
                      <div className="cash-amt">{fmt(r.amount)}</div>
                      <div className="cash-running">Cumul: {fmt(r.running)}</div>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', marginTop: 5 }}>
                        <button className="btn-edit-row" onClick={() => setEditing(r)}>✏️</button>
                        <button className="btn-del-row" onClick={() => handleDelete(r.id)}>🗑</button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <EditCashModal row={editing} onClose={() => setEditing(null)} onSaved={loadCash} />
    </div>
  );
}
