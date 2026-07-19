import { useState } from 'react';
import { useFleet } from '../context/FleetContext';
import { EXPENSE_TYPES, CASH_TYPES } from '../lib/constants';
import { getRowsRange, getCashRowsRange } from '../lib/dataLayer';
import { fmt, fmtD } from '../lib/helpers';
import { useToast } from '../components/Toast';

// "Cash given to driver" = selected cash_on_hand types (Petty Cash, Cash Order, etc.)
// "Cash spent by driver" = selected expense types (Toll, Fuel, CASH CARD, etc.)
// Balance = given − spent = what's still in the driver's hand right now.
// Everything is summed across ALL time by default (no month boundary) since
// a driver's cash float carries over between months unless you narrow the
// date range yourself.

// Only these are actually paid out of the driver's own cash in hand by
// default — Salary/Incentive/Rent/etc. are company-side costs, never the
// driver's pocket money, so they start unchecked. Anything else can still
// be added, but only after confirming it really was driver-paid.
const DEFAULT_DRIVER_EXP_TYPES = ['Toll', 'Parking', 'Fuel', 'CASH CARD'];

export default function CashMeter() {
  const { vehicles } = useFleet();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [cashSel, setCashSel] = useState(new Set(CASH_TYPES));
  const [expSel, setExpSel] = useState(new Set(DEFAULT_DRIVER_EXP_TYPES));
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null); // { byVehicle: {vehicle: {given,spent,items[]}} }
  const [activeVehicle, setActiveVehicle] = useState(null);
  const [ToastEl, showToast] = useToast();

  function toggle(set, setSet, val) {
    const next = new Set(set);
    if (next.has(val)) next.delete(val); else next.add(val);
    setSet(next);
  }

  // Expense types get an extra confirmation step when *adding* one that
  // isn't a default driver-paid category — unchecking never needs it.
  function toggleExpense(val) {
    const isAdding = !expSel.has(val);
    if (isAdding && !DEFAULT_DRIVER_EXP_TYPES.includes(val)) {
      const ok = window.confirm(
        `Is "${val}" actually paid by the driver out of his own cash in hand?\n\n` +
        `Only include it here if it reduces what he's currently holding. ` +
        `Company-paid costs (salary, rent, incentives, etc.) should stay unchecked.`
      );
      if (!ok) return;
    }
    toggle(expSel, setExpSel, val);
  }

  async function calculate() {
    setLoading(true);
    try {
      const [expenses, cashRows] = await Promise.all([
        getRowsRange('expenses', from || null, to || null),
        getCashRowsRange(from || null, to || null),
      ]);

      const byVehicle = {};
      const ensure = v => (byVehicle[v] ||= { given: 0, spent: 0, items: [] });

      cashRows.filter(c => cashSel.has(c.cash_type)).forEach(c => {
        const b = ensure(c.vehicle);
        b.given += Number(c.amount);
        b.items.push({ date: c.date, kind: 'given', cat: c.cash_type, note: c.note || '', amt: Number(c.amount) });
      });
      expenses.filter(e => expSel.has(e.expense_type)).forEach(e => {
        const b = ensure(e.vehicle);
        b.spent += Number(e.amount);
        b.items.push({ date: e.date, kind: 'spent', cat: e.expense_type, note: e.note || '', amt: Number(e.amount) });
      });

      Object.values(byVehicle).forEach(b => b.items.sort((a, z) => a.date.localeCompare(z.date)));

      setData({ byVehicle });
      setActiveVehicle(null);
    } catch (e) {
      showToast('Error: ' + e.message, false);
    }
    setLoading(false);
  }

  const vehicleList = data ? Object.keys(data.byVehicle).sort() : [];
  const detail = activeVehicle && data ? data.byVehicle[activeVehicle] : null;

  return (
    <div>
      <div className="section-card">
        <div className="section-title">⛽ Cash Meter — money given vs. money spent, per driver</div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div className="field" style={{ flex: 1, minWidth: 150, marginBottom: 0 }}>
            <label className="label">From (optional)</label>
            <input type="date" className="input" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 150, marginBottom: 0 }}>
            <label className="label">To (optional)</label>
            <input type="date" className="input" value={to} onChange={e => setTo(e.target.value)} />
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: -8, marginBottom: 16 }}>
          Leave both blank to include everything ever recorded.
        </div>

        <div className="stl-chk-section-label">Counted as cash given to driver</div>
        <div className="stl-chk-list">
          {CASH_TYPES.map(t => {
            const checked = cashSel.has(t);
            return (
              <div key={t} className={'stl-chk-item is-cash' + (checked ? ' is-checked' : '')} onClick={() => toggle(cashSel, setCashSel, t)}>
                <div className="stl-chk-box">{checked ? '✓' : ''}</div>
                <span className="stl-chk-name">{t}</span>
              </div>
            );
          })}
        </div>

        <div className="stl-div" />
        <div className="stl-chk-section-label">Counted as spent by driver</div>
        <div className="stl-chk-list">
          {EXPENSE_TYPES.map(t => {
            const checked = expSel.has(t);
            const isDefault = DEFAULT_DRIVER_EXP_TYPES.includes(t);
            return (
              <div key={t} className={'stl-chk-item' + (checked ? ' is-checked' : '')} onClick={() => toggleExpense(t)}>
                <div className="stl-chk-box">{checked ? '✓' : ''}</div>
                <span className="stl-chk-name">{t}</span>
                {!isDefault && (
                  <span style={{ fontSize: 9, color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px', marginLeft: 6 }}>
                    confirm to add
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <button className="stl-run-btn" disabled={loading} onClick={calculate} style={{ marginTop: 16 }}>
          {loading ? 'Calculating...' : 'Calculate →'}
        </button>
        <ToastEl />
      </div>

      {data && !activeVehicle && (
        <div className="section-card">
          <div className="section-title">🚛 All Vehicles — tap one for details</div>
          {vehicleList.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13 }}>No cash or expense records found for this range.</div>}
          {vehicleList.map(v => {
            const b = data.byVehicle[v];
            const balance = b.given - b.spent;
            const pctSpent = b.given > 0 ? Math.min(100, (b.spent / b.given) * 100) : (b.spent > 0 ? 100 : 0);
            const meterColor = balance < 0 ? 'var(--red)' : pctSpent > 80 ? 'var(--accent)' : 'var(--green)';
            return (
              <div
                key={v}
                onClick={() => setActiveVehicle(v)}
                style={{
                  cursor: 'pointer', padding: '14px 16px', borderRadius: 10, marginBottom: 10,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span className="mono" style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 14 }}>{v}</span>
                  <span className="mono" style={{ fontWeight: 800, fontSize: 16, color: balance < 0 ? 'var(--red)' : 'var(--green)' }}>
                    {balance < 0 ? '− ' : ''}{fmt(Math.abs(balance))} {balance < 0 ? 'owed by driver' : 'in hand'}
                  </span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: 'var(--input-bg)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: pctSpent + '%', background: meterColor, transition: 'width .3s' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--muted)' }}>
                  <span>Given: {fmt(b.given)}</span>
                  <span>Spent: {fmt(b.spent)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data && activeVehicle && detail && (
        <>
          <div className="section-card">
            <button
              onClick={() => setActiveVehicle(null)}
              style={{ background: 'transparent', border: 'none', color: 'var(--accent)', fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 12, cursor: 'pointer', marginBottom: 14, padding: 0 }}
            >
              ← All Vehicles
            </button>

            <div className="section-title" style={{ marginTop: 0 }}>⛽ {activeVehicle}</div>

            {(() => {
              const balance = detail.given - detail.spent;
              const pctSpent = detail.given > 0 ? Math.min(100, (detail.spent / detail.given) * 100) : (detail.spent > 0 ? 100 : 0);
              const meterColor = balance < 0 ? 'var(--red)' : pctSpent > 80 ? 'var(--accent)' : 'var(--green)';
              return (
                <>
                  <div style={{
                    textAlign: 'center', padding: '20px 0 16px', background: 'var(--surface)',
                    border: '1px solid var(--border)', borderRadius: 12, marginBottom: 16,
                  }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>
                      {balance < 0 ? 'Driver Owes' : 'Cash Currently in Hand'}
                    </div>
                    <div className="mono" style={{ fontSize: 32, fontWeight: 800, color: balance < 0 ? 'var(--red)' : 'var(--green)' }}>
                      {fmt(Math.abs(balance))}
                    </div>
                    <div style={{ height: 12, borderRadius: 6, background: 'var(--input-bg)', overflow: 'hidden', margin: '14px 24px 0' }}>
                      <div style={{ height: '100%', width: pctSpent + '%', background: meterColor, transition: 'width .3s' }} />
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
                      {pctSpent.toFixed(0)}% of cash given has been spent
                    </div>
                  </div>

                  <div className="stat-row">
                    <div className="stat-card">
                      <div className="slabel">Total Given</div>
                      <div className="sval" style={{ color: 'var(--green)' }}>{fmt(detail.given)}</div>
                    </div>
                    <div className="stat-card">
                      <div className="slabel">Total Spent</div>
                      <div className="sval" style={{ color: 'var(--red)' }}>{fmt(detail.spent)}</div>
                    </div>
                    <div className="stat-card">
                      <div className="slabel">Balance</div>
                      <div className="sval" style={{ color: balance < 0 ? 'var(--red)' : 'var(--green)' }}>{fmt(balance)}</div>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>

          <div className="section-card">
            <div className="section-title">📜 Ledger — running balance over time</div>
            <div className="day-card">
              <div className="day-body" style={{ paddingTop: 10 }}>
                {(() => {
                  let running = 0;
                  return detail.items.map((it, i) => {
                    running += it.kind === 'given' ? it.amt : -it.amt;
                    return (
                      <div className="entry-row" key={i}>
                        <div className="dot" style={{ background: it.kind === 'given' ? 'var(--green)' : 'var(--red)' }} />
                        <div className="entry-info">
                          <div className="entry-meta">
                            <span className="exp-tag" style={{
                              color: it.kind === 'given' ? 'var(--green)' : 'var(--red)',
                              background: it.kind === 'given' ? 'var(--green-dim)' : 'var(--red-dim)',
                              border: `1px solid ${it.kind === 'given' ? '#22c55e44' : '#ef444444'}`,
                            }}>
                              {it.kind === 'given' ? '⬆' : '⬇'} {it.cat}
                            </span>
                            <span style={{ fontSize: 10, color: 'var(--muted)' }}>{fmtD(it.date)}</span>
                          </div>
                          {it.note && <div className="entry-note">{it.note}</div>}
                        </div>
                        <div className="entry-amt" style={{ color: it.kind === 'given' ? 'var(--green)' : 'var(--red)' }}>
                          {it.kind === 'given' ? '+' : '−'}{fmt(it.amt)}
                        </div>
                        <div style={{ minWidth: 90, textAlign: 'right', fontSize: 12 }} className="mono">
                          <span style={{ color: running < 0 ? 'var(--red)' : 'var(--text)' }}>{fmt(running)}</span>
                        </div>
                      </div>
                    );
                  });
                })()}
                {detail.items.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13, padding: '10px 0' }}>No records in this range.</div>}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
