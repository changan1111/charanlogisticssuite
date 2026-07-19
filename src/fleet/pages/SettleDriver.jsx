import { useEffect, useState, useCallback } from 'react';
import { useFleet } from '../context/FleetContext';
import { MONTHS, YEARS, STL_EXP_TYPES, STL_CASH_TYPES, TARGET } from '../lib/constants';
import { getRows, getCashRows } from '../lib/dataLayer';
import { fmt } from '../lib/helpers';
import { useToast } from '../components/Toast';

const now = new Date();

export default function SettleDriver() {
  const { vehicles } = useFleet();
  const [vehicle, setVehicle] = useState('');
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [expSel, setExpSel] = useState(new Set(STL_EXP_TYPES));
  const [cashSel, setCashSel] = useState(new Set(STL_CASH_TYPES));
  const [expHints, setExpHints] = useState({});
  const [cashHints, setCashHints] = useState({});
  const [result, setResult] = useState(null); // settlement result object
  const [calcBusy, setCalcBusy] = useState(false);
  const [ToastEl, showToast] = useToast();

  // Salary calculator injected cash adjustment
  const [scData, setScData] = useState({ cashAdj: 0, cashDir: 'zero' });

  // Load per-type hint totals when vehicle/month/year changes
  const loadHints = useCallback(async () => {
    if (!vehicle) return;
    try {
      const [expenses, cashRows] = await Promise.all([
        getRows('expenses', vehicle, month, year),
        getCashRows(month, year, vehicle),
      ]);
      const eh = {};
      expenses.forEach(e => (eh[e.expense_type] = (eh[e.expense_type] || 0) + Number(e.amount)));
      const ch = {};
      cashRows.forEach(c => (ch[c.cash_type] = (ch[c.cash_type] || 0) + Number(c.amount)));
      setExpHints(eh);
      setCashHints(ch);
    } catch (e) { /* same as v1 — silent */ }
  }, [vehicle, month, year]);

  useEffect(() => { loadHints(); }, [loadHints]);

  function toggle(set, setSet, type) {
    const next = new Set(set);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    setSet(next);
  }

  async function runSettlement() {
    if (!vehicle) { showToast('Please select a vehicle.', false); return; }
    setCalcBusy(true);
    try {
      const [expenses, cashRows] = await Promise.all([
        getRows('expenses', vehicle, month, year),
        getCashRows(month, year, vehicle),
      ]);
      const selExp = expenses.filter(e => expSel.has(e.expense_type));
      const selCash = cashRows.filter(c => cashSel.has(c.cash_type));
      const totalExp = selExp.reduce((s, e) => s + Number(e.amount), 0);
      const totalCash = selCash.reduce((s, c) => s + Number(c.amount), 0);
      const diff = totalCash - totalExp;

      const expByType = {};
      selExp.forEach(e => (expByType[e.expense_type] = (expByType[e.expense_type] || 0) + Number(e.amount)));
      const cashByType = {};
      selCash.forEach(c => (cashByType[c.cash_type] = (cashByType[c.cash_type] || 0) + Number(c.amount)));

      const allItems = [
        ...selExp.map(e => ({ date: e.date, type: 'exp', cat: e.expense_type, note: e.note || '', amt: Number(e.amount) })),
        ...selCash.map(c => ({ date: c.date, type: 'cash', cat: c.cash_type, note: c.note || '', amt: Number(c.amount) })),
      ].sort((a, b) => a.date.localeCompare(b.date));

      setResult({ totalExp, totalCash, diff, expByType, cashByType, allItems });
      // inject into salary calculator (same as v1 scInjectSettlement)
      setScData({ cashAdj: Math.abs(diff), cashDir: diff > 0 ? 'deduct' : diff < 0 ? 'add' : 'zero' });
    } catch (e) {
      showToast('Error: ' + e.message, false);
    }
    setCalcBusy(false);
  }

  // ── Verdict helpers ──
  const diff = result?.diff ?? 0;
  const verdictClass = diff > 0 ? 'pos' : diff < 0 ? 'neg' : 'zero';

  return (
    <>
      <div className="stl-wrap">
        <div>
          <div className="stl-panel">
            <div className="stl-panel-title">🧾 Settle Driver</div>
            <div className="field">
              <label className="label">Vehicle</label>
              <select className="select" value={vehicle} onChange={e => setVehicle(e.target.value)}>
                <option value="">Select vehicle...</option>
                {vehicles.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="field" style={{ flex: 2, marginBottom: 12 }}>
                <label className="label">Month</label>
                <select className="select" value={month} onChange={e => setMonth(parseInt(e.target.value))}>
                  {MONTHS.map((mo, i) => <option key={mo} value={i}>{mo}</option>)}
                </select>
              </div>
              <div className="field" style={{ flex: 1, marginBottom: 12 }}>
                <label className="label">Year</label>
                <select className="select" value={year} onChange={e => setYear(parseInt(e.target.value))}>
                  {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
            <div className="stl-div" />
            <div className="stl-chk-section-label">Expenses to include</div>
            <div className="stl-chk-list">
              {STL_EXP_TYPES.map(t => {
                const checked = expSel.has(t);
                return (
                  <div
                    key={t}
                    className={'stl-chk-item' + (checked ? ' is-checked' : '')}
                    onClick={() => toggle(expSel, setExpSel, t)}
                  >
                    <div className="stl-chk-box">{checked ? '✓' : ''}</div>
                    <span className="stl-chk-name">{t}</span>
                    <span className="stl-chk-hint">{expHints[t] ? fmt(expHints[t]) : '—'}</span>
                  </div>
                );
              })}
            </div>
            <div className="stl-div" />
            <div className="stl-chk-section-label">Cash paid out to include</div>
            <div className="stl-chk-list">
              {STL_CASH_TYPES.map(t => {
                const checked = cashSel.has(t);
                return (
                  <div
                    key={t}
                    className={'stl-chk-item is-cash' + (checked ? ' is-checked' : '')}
                    onClick={() => toggle(cashSel, setCashSel, t)}
                  >
                    <div className="stl-chk-box">{checked ? '✓' : ''}</div>
                    <span className="stl-chk-name">{t}</span>
                    <span className="stl-chk-hint">{cashHints[t] ? fmt(cashHints[t]) : '—'}</span>
                  </div>
                );
              })}
            </div>
            <button className="stl-run-btn" disabled={calcBusy} onClick={runSettlement}>
              {calcBusy ? 'Calculating...' : 'Calculate →'}
            </button>
            <ToastEl />
            <div style={{
              marginTop: 14, background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 9, padding: '12px 14px', fontSize: 11, color: 'var(--muted)', lineHeight: 1.85,
            }}>
              <b style={{ color: 'var(--text)' }}>Logic:</b><br />
              <b style={{ color: '#06b6d4' }}>Cash Out</b> − <b style={{ color: 'var(--red)' }}>Expenses</b> = Difference<br />
              <span style={{ color: 'var(--red)' }}>+ve</span> → driver has our cash → <b>deduct from salary</b><br />
              <span style={{ color: 'var(--green)' }}>−ve</span> → driver out of pocket → <b>pay extra with salary</b>
            </div>
          </div>
        </div>

        {result && (
          <div className="stl-result on">
            <div className="stl-eq-bar">
              <div className="stl-eq-chip" style={{ background: '#06b6d415', color: '#06b6d4', border: '1px solid #06b6d433' }}>
                <span style={{ fontSize: 10, fontWeight: 600, fontFamily: "'Syne',sans-serif" }}>CASH OUT</span>
                <span>{fmt(result.totalCash)}</span>
              </div>
              <span className="stl-eq-op">−</span>
              <div className="stl-eq-chip" style={{ background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid #ef444433' }}>
                <span style={{ fontSize: 10, fontWeight: 600, fontFamily: "'Syne',sans-serif" }}>EXPENSES</span>
                <span>{fmt(result.totalExp)}</span>
              </div>
              <span className="stl-eq-eq">=</span>
              <div className="stl-eq-chip" style={{
                background: diff > 0 ? '#ef444418' : diff < 0 ? '#22c55e15' : 'var(--surface)',
                border: `1px solid ${diff > 0 ? '#ef444444' : diff < 0 ? '#22c55e44' : 'var(--border)'}`,
              }}>
                <span style={{ fontSize: 15, color: diff > 0 ? 'var(--red)' : diff < 0 ? 'var(--green)' : 'var(--muted)' }}>
                  {(diff >= 0 ? '' : '-') + fmt(Math.abs(diff))}
                </span>
              </div>
            </div>

            <div className={'stl-verdict ' + verdictClass}>
              <div className="stl-v-icon">{diff > 0 ? '⬇️' : diff < 0 ? '⬆️' : '✅'}</div>
              <div>
                <span className="stl-v-tag">
                  {diff > 0 ? 'DEDUCT FROM SALARY' : diff < 0 ? 'PAY EXTRA WITH SALARY' : 'BALANCED'}
                </span>
              </div>
              <div className="stl-v-amt">{fmt(Math.abs(diff))}</div>
              <div className="stl-v-action">
                {diff > 0 ? `Deduct ${fmt(diff)} from salary`
                  : diff < 0 ? `Add ${fmt(Math.abs(diff))} to salary`
                  : 'No adjustment needed'}
              </div>
              <div className="stl-v-sub">
                {diff > 0
                  ? `Cash paid out (${fmt(result.totalCash)}) exceeded expenses (${fmt(result.totalExp)}). Driver holds ${fmt(diff)} of our cash.`
                  : diff < 0
                    ? `Expenses (${fmt(result.totalExp)}) exceeded cash paid out (${fmt(result.totalCash)}). Driver spent ${fmt(Math.abs(diff))} of own money.`
                    : 'Cash paid out exactly matches expenses.'}
              </div>
            </div>

            <div className="stl-cols">
              <div className="stl-col-card exp-col">
                <div className="stl-col-hdr">🔴 Expenses (selected)</div>
                <div>
                  {Object.keys(result.expByType).length ? (
                    Object.entries(result.expByType).sort((a, b) => b[1] - a[1]).map(([t, a]) => (
                      <div key={t} className="stl-col-line">
                        <span className="stl-col-line-name">{t}</span>
                        <span className="stl-col-line-amt">{fmt(a)}</span>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: 11, color: 'var(--muted)', padding: '6px 0' }}>No matching expenses.</div>
                  )}
                </div>
                <div className="stl-col-total">
                  <span className="stl-col-total-label">TOTAL</span>
                  <span className="stl-col-total-amt">{fmt(result.totalExp)}</span>
                </div>
              </div>
              <div className="stl-col-card cash-col">
                <div className="stl-col-hdr">💵 Cash Paid Out (selected)</div>
                <div>
                  {Object.keys(result.cashByType).length ? (
                    Object.entries(result.cashByType).sort((a, b) => b[1] - a[1]).map(([t, a]) => (
                      <div key={t} className="stl-col-line">
                        <span className="stl-col-line-name">{t}</span>
                        <span className="stl-col-line-amt">{fmt(a)}</span>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: 11, color: 'var(--muted)', padding: '6px 0' }}>No matching cash entries.</div>
                  )}
                </div>
                <div className="stl-col-total">
                  <span className="stl-col-total-label">TOTAL</span>
                  <span className="stl-col-total-amt">{fmt(result.totalCash)}</span>
                </div>
              </div>
            </div>

            <div className="stl-ledger">
              <div className="stl-ledger-hdr">Full Transaction Ledger <span>{result.allItems.length} entries</span></div>
              <div>
                {!result.allItems.length ? (
                  <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 30, fontSize: 13 }}>
                    No transactions for the selected filters.
                  </div>
                ) : (
                  result.allItems.map((item, i) => {
                    const d = new Date(item.date + 'T00:00:00');
                    const ds = `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleDateString('en-SG', { month: 'short' })}`;
                    return (
                      <div key={i} className="stl-l-row">
                        <span className="stl-l-date">{ds}</span>
                        <span className={'stl-l-badge ' + item.type}>{item.cat}</span>
                        <span className="stl-l-note">{item.note || '—'}</span>
                        <span className={'stl-l-amt ' + item.type}>
                          {item.type === 'exp' ? '−' : '+'}{fmt(item.amt)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <SalaryCalculator
        scData={scData}
        setScData={setScData}
        vehicle={vehicle}
        month={month}
        year={year}
        expSel={expSel}
        cashSel={cashSel}
      />
    </>
  );
}

// ═══════════════════════════════════════════════
//  SALARY CALCULATOR (same logic as v1)
// ═══════════════════════════════════════════════
function SalaryCalculator({ scData, setScData, vehicle, month, year, expSel, cashSel }) {
  const [salary, setSalary] = useState('');
  const [perfVal, setPerfVal] = useState('');
  const [perfType, setPerfType] = useState('incentive');
  const [cashHint, setCashHint] = useState('Click Fetch or run settlement above');
  const [perfHint, setPerfHint] = useState('Fetch or enter manually');
  const [fetchingCash, setFetchingCash] = useState(false);
  const [fetchingPerf, setFetchingPerf] = useState(false);
  const [breakdown, setBreakdown] = useState(null);

  const { cashAdj, cashDir } = scData;

  // Hint text mirrors scInjectSettlement
  useEffect(() => {
    if (cashDir === 'deduct' && cashAdj > 0) setCashHint('Driver holds S$ ' + cashAdj.toFixed(2) + ' of our cash → deduct');
    else if (cashDir === 'add' && cashAdj > 0) setCashHint('Driver paid S$ ' + cashAdj.toFixed(2) + ' out of pocket → add');
    else if (cashDir === 'zero' && (cashAdj === 0)) setCashHint(prev => prev.startsWith('Click') ? prev : 'Balanced — no cash adjustment');
    setBreakdown(null);
  }, [cashAdj, cashDir]);

  async function fetchCash() {
    if (!vehicle) { setCashHint('Select a vehicle in Settle Driver first'); return; }
    setFetchingCash(true);
    try {
      const [expenses, cashRows] = await Promise.all([
        getRows('expenses', vehicle, month, year),
        getCashRows(month, year, vehicle),
      ]);
      const selExp = expenses.filter(e => expSel.has(e.expense_type));
      const selCash = cashRows.filter(c => cashSel.has(c.cash_type));
      const totalExp = selExp.reduce((s, e) => s + Number(e.amount), 0);
      const totalCash = selCash.reduce((s, c) => s + Number(c.amount), 0);
      const diff = totalCash - totalExp;
      setScData({ cashAdj: Math.abs(diff), cashDir: diff > 0 ? 'deduct' : diff < 0 ? 'add' : 'zero' });
      if (diff === 0) setCashHint('Balanced — no cash adjustment');
    } catch (e) {
      setCashHint('Error: ' + e.message);
    }
    setFetchingCash(false);
  }

  async function fetchPerf() {
    if (!vehicle) { setPerfHint('Select a vehicle in Settle Driver first'); return; }
    setFetchingPerf(true);
    try {
      const allE = await getRows('earnings', vehicle, month, year);
      const te = allE.reduce((s, e) => s + Number(e.amount), 0);
      if (te >= TARGET) {
        const inc = (te - TARGET) * 0.5;
        setPerfVal(inc.toFixed(2));
        setPerfType('incentive');
        setPerfHint('Target met — incentive S$ ' + inc.toFixed(2) + ' (editable)');
      } else {
        const ded = (TARGET - te) * (3000 / TARGET);
        setPerfVal(ded.toFixed(2));
        setPerfType('deduction');
        setPerfHint('Below target — deduction S$ ' + ded.toFixed(2) + ' (editable)');
      }
      setBreakdown(null);
    } catch (e) {
      setPerfHint('Error: ' + e.message);
    }
    setFetchingPerf(false);
  }

  function calc() {
    const sal = parseFloat(salary) || 0;
    if (!sal) return;
    const pv = parseFloat(perfVal) || 0;
    const isInc = perfType === 'incentive';
    const inc = isInc ? pv : 0;
    const ded = !isInc ? pv : 0;
    const cashEffect = cashDir === 'deduct' ? -cashAdj : cashDir === 'add' ? +cashAdj : 0;
    const final = sal + cashEffect + inc - ded;
    setBreakdown({ sal, pv, isInc, cashAdj, cashDir, final });
  }

  const sal = parseFloat(salary) || 0;

  return (
    <div style={{ maxWidth: 600, margin: '32px auto 0' }}>
      <div style={{ background: 'var(--card)', border: '1px solid #f0a50033', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{
          padding: '14px 18px', background: 'var(--surface)', borderBottom: '1px solid var(--border)',
          fontSize: 10, color: 'var(--accent)', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 700,
        }}>
          🧮 Salary Calculator
        </div>
        <div style={{ padding: 20 }}>
          <div className="field">
            <label className="label">Base Salary (S$)</label>
            <input
              type="number" className="input mono" placeholder="Enter base salary..."
              style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}
              value={salary} onChange={e => { setSalary(e.target.value); setBreakdown(null); }}
            />
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
            <div style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700, marginBottom: 12 }}>Adjustments</div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #1f1f2e44', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 120 }}>
                <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>Cash Adjustment</div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{cashHint}</div>
              </div>
              <span className="mono" style={{
                fontSize: 15, fontWeight: 700,
                color: cashDir === 'deduct' && cashAdj > 0 ? 'var(--red)' : cashDir === 'add' && cashAdj > 0 ? 'var(--green)' : 'var(--muted)',
              }}>
                {cashDir === 'deduct' && cashAdj > 0 ? '− S$ ' + cashAdj.toFixed(2)
                  : cashDir === 'add' && cashAdj > 0 ? '+ S$ ' + cashAdj.toFixed(2)
                  : cashAdj === 0 && cashHint.startsWith('Click') ? '—' : 'S$ 0.00'}
              </span>
              <button
                onClick={fetchCash} disabled={fetchingCash}
                style={{
                  padding: '6px 12px', background: 'var(--surface)', border: '1px solid #06b6d444', borderRadius: 6,
                  color: '#06b6d4', fontFamily: "'Syne',sans-serif", fontSize: 11, fontWeight: 700,
                  cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >{fetchingCash ? '...' : '⟳ Fetch'}</button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 120 }}>
                <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>Incentive / Deduction</div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{perfHint}</div>
                <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted)', cursor: 'pointer' }}>
                    <input
                      type="radio" name="sc_perf_type" value="incentive"
                      checked={perfType === 'incentive'}
                      onChange={() => setPerfType('incentive')}
                      style={{ accentColor: 'var(--green)' }}
                    /> Incentive
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted)', cursor: 'pointer' }}>
                    <input
                      type="radio" name="sc_perf_type" value="deduction"
                      checked={perfType === 'deduction'}
                      onChange={() => setPerfType('deduction')}
                      style={{ accentColor: 'var(--red)' }}
                    /> Deduction
                  </label>
                </div>
              </div>
              <input
                type="number" placeholder="0.00"
                value={perfVal} onChange={e => { setPerfVal(e.target.value); setBreakdown(null); }}
                style={{
                  width: 120, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
                  color: perfType === 'incentive' ? 'var(--green)' : 'var(--red)',
                  fontFamily: "'JetBrains Mono',monospace", fontSize: 15, fontWeight: 700,
                  padding: '8px 10px', textAlign: 'right', outline: 'none', flexShrink: 0,
                }}
              />
              <button
                onClick={fetchPerf} disabled={fetchingPerf}
                style={{
                  padding: '6px 12px', background: 'var(--surface)', border: '1px solid #f0a50044', borderRadius: 6,
                  color: 'var(--accent)', fontFamily: "'Syne',sans-serif", fontSize: 11, fontWeight: 700,
                  cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >{fetchingPerf ? '...' : '⟳ Fetch'}</button>
            </div>
          </div>

          {sal > 0 && (
            <button
              onClick={calc}
              style={{
                width: '100%', padding: 13, background: 'var(--accent)', color: '#000', border: 'none',
                borderRadius: 10, fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 800,
                cursor: 'pointer', marginBottom: 14, letterSpacing: '.3px',
              }}
            >Calculate Final Salary →</button>
          )}

          {breakdown && (
            <div>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #1f1f2e44', fontSize: 12 }}>
                  <span style={{ color: 'var(--muted)' }}>Base salary</span>
                  <span className="mono" style={{ color: 'var(--text)' }}>S$ {breakdown.sal.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #1f1f2e44', fontSize: 12 }}>
                  <span style={{ color: 'var(--muted)' }}>
                    {breakdown.cashDir === 'deduct' && breakdown.cashAdj > 0 ? 'Cash deduction (driver holds our cash)'
                      : breakdown.cashDir === 'add' && breakdown.cashAdj > 0 ? 'Driver reimbursement (paid out of pocket)'
                      : 'Cash adjustment'}
                  </span>
                  <span className="mono" style={{
                    color: breakdown.cashDir === 'deduct' && breakdown.cashAdj > 0 ? 'var(--red)'
                      : breakdown.cashDir === 'add' && breakdown.cashAdj > 0 ? 'var(--green)' : 'var(--muted)',
                  }}>
                    {breakdown.cashDir === 'deduct' && breakdown.cashAdj > 0 ? '− S$ ' + breakdown.cashAdj.toFixed(2)
                      : breakdown.cashDir === 'add' && breakdown.cashAdj > 0 ? '+ S$ ' + breakdown.cashAdj.toFixed(2)
                      : 'S$ 0.00'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 12 }}>
                  <span style={{ color: 'var(--muted)' }}>
                    {breakdown.pv > 0 ? (breakdown.isInc ? 'Incentive (target met)' : 'Deduction (below target)') : 'No incentive / deduction'}
                  </span>
                  <span className="mono" style={{
                    color: breakdown.pv > 0 ? (breakdown.isInc ? 'var(--green)' : 'var(--red)') : 'var(--muted)',
                  }}>
                    {breakdown.pv > 0 ? (breakdown.isInc ? '+ ' : '− ') + 'S$ ' + breakdown.pv.toFixed(2) : 'S$ 0.00'}
                  </span>
                </div>
              </div>
              <div style={{
                marginTop: 12, padding: '18px 20px', borderRadius: 10,
                background: breakdown.final >= 0 ? 'var(--green-dim)' : 'var(--red-dim)',
                border: `1px solid ${breakdown.final >= 0 ? '#22c55e44' : '#ef444433'}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Final Salary to Pay</span>
                <span className="mono" style={{ fontSize: 28, fontWeight: 800, color: breakdown.final >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  S$ {Math.abs(breakdown.final).toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
