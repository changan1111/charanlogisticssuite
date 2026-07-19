import { useState } from 'react';
import { useFleet } from '../context/FleetContext';
import { EXPENSE_TYPES, CASH_TYPES } from '../lib/constants';
import { insertRow, insertCash } from '../lib/dataLayer';
import { todayStr, fmt } from '../lib/helpers';
import { useToast } from '../components/Toast';

// Nothing is saved to the database until "Submit All" is pressed.
// Each row is then inserted into its own table (earnings / expenses /
// cash_on_hand) as its own separate row — same as adding them one at a
// time on separate tabs, just batched into one click.

let uid = 0;
const nextId = () => ++uid;

function blankRow() {
  return {
    localId: nextId(),
    type: 'earning',
    expType: EXPENSE_TYPES[0],
    cashType: CASH_TYPES[0],
    amount: '',
    note: '',
    status: 'pending', // pending | saving | saved | error
    errorMsg: '',
  };
}

const TYPE_COLOR = { earning: 'var(--green)', expense: 'var(--red)', cash: '#06b6d4' };

export default function DayEntry() {
  const { vehicles } = useFleet();

  const [date, setDate] = useState(todayStr());
  const [vehicle, setVehicle] = useState('');
  const [rows, setRows] = useState([blankRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [ToastEl, showToast] = useToast();

  function updateRow(localId, patch) {
    setRows(rs => rs.map(r => (r.localId === localId ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows(rs => [...rs, blankRow()]);
  }

  function removeRow(localId) {
    setRows(rs => (rs.length === 1 ? [blankRow()] : rs.filter(r => r.localId !== localId)));
  }

  const totals = rows.reduce(
    (acc, r) => {
      const amt = Number(r.amount) || 0;
      if (r.type === 'earning') acc.earning += amt;
      if (r.type === 'expense') acc.expense += amt;
      if (r.type === 'cash') acc.cash += amt;
      return acc;
    },
    { earning: 0, expense: 0, cash: 0 }
  );

  const filledCount = rows.filter(r => parseFloat(r.amount) > 0).length;

  async function submitAll() {
    if (!vehicle) { showToast('Select a vehicle first.', false); return; }
    if (!date) { showToast('Select a date first.', false); return; }

    const toSubmit = rows.filter(r => parseFloat(r.amount) > 0);
    if (!toSubmit.length) { showToast('Enter an amount on at least one row.', false); return; }

    setSubmitting(true);
    let okCount = 0, failCount = 0;

    for (const row of toSubmit) {
      updateRow(row.localId, { status: 'saving', errorMsg: '' });
      const amt = parseFloat(row.amount);
      try {
        if (row.type === 'earning') {
          await insertRow('earnings', { vehicle, amount: amt, note: row.note.trim(), date });
        } else if (row.type === 'expense') {
          await insertRow('expenses', { vehicle, amount: amt, expense_type: row.expType, note: row.note.trim(), date });
        } else {
          await insertCash({ vehicle, cash_type: row.cashType, amount: amt, note: row.note.trim(), date });
        }
        okCount++;
        updateRow(row.localId, { status: 'saved' });
      } catch (e) {
        failCount++;
        updateRow(row.localId, { status: 'error', errorMsg: e.message });
      }
    }

    setSubmitting(false);
    if (failCount) {
      showToast(`${okCount} saved, ${failCount} failed. Fix and submit again.`, false);
      setRows(rs => {
        const remaining = rs.filter(r => r.status !== 'saved');
        return remaining.length ? remaining : [blankRow()];
      });
    } else {
      showToast(`All ${okCount} entries for ${vehicle} on ${date} saved!`, true);
      setRows([blankRow()]);
    }
  }

  return (
    <div>
      <div className="section-card">
        <div className="section-title">📅 Day &amp; Vehicle (applies to every row below)</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}>
            <label className="label">Date</label>
            <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}>
            <label className="label">Vehicle Number</label>
            <select className="select" value={vehicle} onChange={e => setVehicle(e.target.value)}>
              <option value="">Select vehicle...</option>
              {vehicles.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="section-card">
        <div className="section-title">🧾 Entry Details — one row per item, add as many as you need</div>

        <div className="batch-wrap">
          <div className="batch-grid">
            <div className="batch-head">#</div>
            <div className="batch-head">Type</div>
            <div className="batch-head">Category</div>
            <div className="batch-head">Amount ($)</div>
            <div className="batch-head">Notes</div>
            <div className="batch-head"></div>

            {rows.map((row, idx) => (
              <RowFields
                key={row.localId}
                row={row}
                index={idx + 1}
                submitting={submitting}
                canRemove={rows.length > 1 || !!row.amount}
                onChange={patch => updateRow(row.localId, patch)}
                onRemove={() => removeRow(row.localId)}
              />
            ))}
          </div>
        </div>

        <button className="btn-add-row" onClick={addRow} disabled={submitting}>+ Add Entry</button>
      </div>

      <div className="section-card">
        <div className="stat-row" style={{ marginBottom: 16 }}>
          <div className="stat-card">
            <div className="slabel">Earnings</div>
            <div className="sval" style={{ color: 'var(--green)' }}>{fmt(totals.earning)}</div>
          </div>
          <div className="stat-card">
            <div className="slabel">Expenses</div>
            <div className="sval" style={{ color: 'var(--red)' }}>{fmt(totals.expense)}</div>
          </div>
          <div className="stat-card">
            <div className="slabel">Cash</div>
            <div className="sval" style={{ color: '#06b6d4' }}>{fmt(totals.cash)}</div>
          </div>
        </div>
        <button className="btn-save earn" disabled={submitting || !filledCount} onClick={submitAll}>
          {submitting ? 'Submitting...' : `Submit All (${filledCount})`}
        </button>
        <ToastEl />
      </div>
    </div>
  );
}

function RowFields({ row, index, submitting, canRemove, onChange, onRemove }) {
  const rowClass = 'batch-type-' + row.type;
  return (
    <>
      <div className={'batch-num ' + rowClass}>{index}</div>

      <div className="batch-cell">
        <select
          className={'batch-select ' + rowClass}
          value={row.type}
          disabled={submitting}
          onChange={e => onChange({ type: e.target.value })}
        >
          <option value="earning">⬆ Earning</option>
          <option value="expense">⬇ Expense</option>
          <option value="cash">💵 Cash</option>
        </select>
      </div>

      <div className="batch-cell">
        {row.type === 'expense' && (
          <select className="batch-select" value={row.expType} disabled={submitting} onChange={e => onChange({ expType: e.target.value })}>
            {EXPENSE_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        )}
        {row.type === 'cash' && (
          <select className="batch-select" value={row.cashType} disabled={submitting} onChange={e => onChange({ cashType: e.target.value })}>
            {CASH_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        {row.type === 'earning' && <div className="batch-dash">—</div>}
      </div>

      <div className="batch-cell">
        <input
          type="number" className="batch-input" placeholder="0.00"
          style={{ color: TYPE_COLOR[row.type], fontWeight: 700 }}
          value={row.amount} disabled={submitting}
          onChange={e => onChange({ amount: e.target.value })}
        />
      </div>

      <div className="batch-cell">
        <input
          type="text" className="batch-input" placeholder="Optional details..."
          style={{ fontWeight: 400 }}
          value={row.note} disabled={submitting}
          onChange={e => onChange({ note: e.target.value })}
        />
      </div>

      <button className="batch-row-remove" onClick={onRemove} disabled={submitting || !canRemove} title="Remove row">✕</button>

      {row.status === 'saving' && <div className="batch-status-row saving">Saving...</div>}
      {row.status === 'error' && <div className="batch-status-row error">Failed: {row.errorMsg}</div>}
    </>
  );
}
