import { useState, useEffect, useMemo } from 'react';
import { useFleet } from '../context/FleetContext';
import { EXPENSE_TYPES, NAMED_CLIENTS } from '../lib/constants';
import { detectClient } from '../lib/clientDetect';
import { insertRow, getRowsRange } from '../lib/dataLayer';
import { todayStr, fmt, fmtD } from '../lib/helpers';
import { ClientBadge } from '../components/ClientBadge';
import { useToast } from '../components/Toast';

export default function AddEntry() {
  const { vehicles } = useFleet();
  const [entryType, setEntryType] = useState('earning');
  const [vehicle, setVehicle] = useState('');
  const [date, setDate] = useState(todayStr());
  const [amount, setAmount] = useState('');
  const [expType, setExpType] = useState('Toll');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [ToastEl, showToast] = useToast();

  // ── Side panel: what's already been logged for the selected date ──
  const [dayData, setDayData] = useState({ earnings: [], expenses: [], loading: false });

  async function loadDayActivity(d) {
    if (!d) return;
    setDayData(a => ({ ...a, loading: true }));
    try {
      const [earnings, expenses] = await Promise.all([
        getRowsRange('earnings', d, d),
        getRowsRange('expenses', d, d),
      ]);
      setDayData({ earnings, expenses, loading: false });
    } catch {
      setDayData({ earnings: [], expenses: [], loading: false });
    }
  }

  useEffect(() => { loadDayActivity(date); }, [date]);

  const isEarning = entryType === 'earning';
  const noteKeywords = NAMED_CLIENTS.map(c => c.keyword).join(' / ');

  async function saveEntry() {
    const amt = parseFloat(amount);
    if (!vehicle || !amt || !date) {
      showToast('Please fill vehicle, amount and date.', false);
      return;
    }
    setSaving(true);
    try {
      if (isEarning) {
        await insertRow('earnings', { vehicle, amount: amt, note: note.trim(), date });
      } else {
        await insertRow('expenses', { vehicle, amount: amt, expense_type: expType, note: note.trim(), date });
      }
      showToast((isEarning ? 'Earning' : 'Expense') + ' saved!', true);
      setAmount('');
      setNote('');
      loadDayActivity(date); // refresh the side panel with the new entry
    } catch (e) {
      showToast('Error: ' + e.message, false);
    }
    setSaving(false);
  }

  // Filter the panel to the vehicle currently selected in the form, once one is chosen
  const { filteredEarnings, filteredExpenses, totalE, totalX, feed } = useMemo(() => {
    const fe = vehicle ? dayData.earnings.filter(e => e.vehicle === vehicle) : dayData.earnings;
    const fx = vehicle ? dayData.expenses.filter(e => e.vehicle === vehicle) : dayData.expenses;
    const tE = fe.reduce((s, e) => s + Number(e.amount), 0);
    const tX = fx.reduce((s, e) => s + Number(e.amount), 0);
    const combined = [
      ...fe.map(e => ({ kind: 'earning', vehicle: e.vehicle, cat: null, note: e.note, amt: Number(e.amount), id: 'e' + e.id })),
      ...fx.map(e => ({ kind: 'expense', vehicle: e.vehicle, cat: e.expense_type, note: e.note, amt: Number(e.amount), id: 'x' + e.id })),
    ];
    return { filteredEarnings: fe, filteredExpenses: fx, totalE: tE, totalX: tX, feed: combined };
  }, [dayData, vehicle]);

  return (
    <div className="addentry-layout">
      <div className="addentry-form-col">
        <div className="section-card">
          <div className="type-toggle">
            <button
              className={'type-btn' + (isEarning ? ' earn-active' : '')}
              onClick={() => setEntryType('earning')}
            >⬆ Earning</button>
            <button
              className={'type-btn' + (!isEarning ? ' exp-active' : '')}
              onClick={() => setEntryType('expense')}
            >⬇ Expense</button>
          </div>

          <div className="field">
            <label className="label">Vehicle Number</label>
            <select className="select" value={vehicle} onChange={e => setVehicle(e.target.value)}>
              <option value="">Select vehicle...</option>
              {vehicles.map(v => <option key={v} value={v}>{v}</option>)}
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
              style={{ fontSize: 20, fontWeight: 700, color: isEarning ? 'var(--green)' : 'var(--red)' }}
              value={amount} onChange={e => setAmount(e.target.value)}
            />
          </div>

          {!isEarning && (
            <div className="field">
              <label className="label">Expense Category</label>
              <select className="select" value={expType} onChange={e => setExpType(e.target.value)}>
                {EXPENSE_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          )}

          <div className="field">
            <label className="label">
              {isEarning ? `Notes (mention ${noteKeywords} if applicable)` : 'Notes'}
            </label>
            <textarea
              className="textarea" rows={3}
              placeholder={isEarning ? `e.g. ${NAMED_CLIENTS[0]?.keyword} delivery...` : 'Details...'}
              value={note} onChange={e => setNote(e.target.value)}
            />
            {isEarning && note.trim() && (
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)' }}>
                Auto-detected: <ClientBadge clientKey={detectClient(note)} />
              </div>
            )}
          </div>

          <button
            className={'btn-save ' + (isEarning ? 'earn' : 'exp')}
            disabled={saving} onClick={saveEntry}
          >
            {saving ? 'Saving...' : isEarning ? 'Save Earning' : 'Save Expense'}
          </button>
          <ToastEl />
        </div>

        <div className="setup-box" style={{ borderColor: '#f0a50033' }}>
          <div style={{ fontSize: 10, color: 'var(--accent)', letterSpacing: 1, fontWeight: 700 }}>🚛 FLEET CONFIG</div>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.8 }}>
            Vehicles are managed from the database.<br />
            Go to the <b style={{ color: 'var(--accent)' }}>Vehicles</b> tab to add, edit or deactivate vehicles.
          </p>
        </div>
      </div>

      <div className="addentry-side-col">
        <div className="section-card">
          <div className="section-title">
            📅 {fmtD(date)} {vehicle ? `— ${vehicle}` : '— All Vehicles'}
          </div>

          <div className="stat-row" style={{ marginBottom: 14 }}>
            <div className="stat-card">
              <div className="slabel">Earnings</div>
              <div className="sval" style={{ color: 'var(--green)', fontSize: 16 }}>{fmt(totalE)}</div>
            </div>
            <div className="stat-card">
              <div className="slabel">Expenses</div>
              <div className="sval" style={{ color: 'var(--red)', fontSize: 16 }}>{fmt(totalX)}</div>
            </div>
          </div>

          {dayData.loading && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Loading...</div>}

          {!dayData.loading && feed.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>
              Nothing logged yet for this day{vehicle ? ` on ${vehicle}` : ''}.
            </div>
          )}

          {!dayData.loading && feed.length > 0 && (
            <div style={{ maxHeight: 420, overflowY: 'auto' }}>
              {feed.map(item => (
                <div key={item.id} className="entry-row" style={{ padding: '9px 0' }}>
                  <div className="dot" style={{ background: item.kind === 'earning' ? 'var(--green)' : 'var(--red)' }} />
                  <div className="entry-info">
                    <div className="entry-meta">
                      <span className="exp-tag" style={{
                        color: item.kind === 'earning' ? 'var(--green)' : 'var(--red)',
                        background: item.kind === 'earning' ? 'var(--green-dim)' : 'var(--red-dim)',
                        border: `1px solid ${item.kind === 'earning' ? '#22c55e44' : '#ef444444'}`,
                      }}>
                        {item.kind === 'earning' ? '⬆ Earning' : `⬇ ${item.cat}`}
                      </span>
                      {!vehicle && <span style={{ fontSize: 10, color: 'var(--muted)' }}>{item.vehicle}</span>}
                    </div>
                    {item.note && <div className="entry-note">{item.note}</div>}
                  </div>
                  <div className="entry-amt" style={{ color: item.kind === 'earning' ? 'var(--green)' : 'var(--red)', fontSize: 13 }}>
                    {fmt(item.amt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
