import { useEffect, useState } from 'react';
import { EXPENSE_TYPES } from '../lib/constants';
import { updateEntry } from '../lib/dataLayer';
import { useToast } from './Toast';

// Edit modal for earnings & expenses.
// props: entry = { table:'earnings'|'expenses', row:{id,date,amount,note,expense_type} } | null
export default function EditEntryModal({ entry, onClose, onSaved }) {
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [expType, setExpType] = useState('Toll');
  const [saving, setSaving] = useState(false);
  const [ToastEl, showToast] = useToast();

  useEffect(() => {
    if (!entry) return;
    setDate(entry.row.date);
    setAmount(entry.row.amount);
    setNote(entry.row.note || '');
    if (entry.table === 'expenses' && entry.row.expense_type) setExpType(entry.row.expense_type);
  }, [entry]);

  if (!entry) return null;
  const isExp = entry.table === 'expenses';

  async function save() {
    const amt = parseFloat(amount);
    if (!date || !amt) { showToast('Please fill date and amount.', false); return; }
    setSaving(true);
    try {
      const body = { date, amount: amt, note: note.trim() };
      if (isExp) body.expense_type = expType;
      await updateEntry(entry.table, entry.row.id, body);
      showToast('Saved!', true);
      setTimeout(() => { onSaved(); onClose(); }, 900);
    } catch (e) {
      showToast('Error: ' + e.message, false);
    }
    setSaving(false);
  }

  return (
    <div className="modal-overlay open" id="editModal" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-title">{isExp ? '✏️ Edit Expense' : '✏️ Edit Earning'}</div>
        <div className="field">
          <label className="label">Date</label>
          <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label className="label">Amount (S$)</label>
          <input
            type="number" className="input mono" placeholder="0.00"
            style={{ fontSize: 20, fontWeight: 700, color: isExp ? 'var(--red)' : 'var(--green)' }}
            value={amount} onChange={e => setAmount(e.target.value)}
          />
        </div>
        {isExp && (
          <div className="field">
            <label className="label">Expense Category</label>
            <select className="select" value={expType} onChange={e => setExpType(e.target.value)}>
              {EXPENSE_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
        )}
        <div className="field">
          <label className="label">Notes</label>
          <textarea className="textarea" rows={3} value={note} onChange={e => setNote(e.target.value)} />
        </div>
        <div className="edit-modal-actions">
          <button className="btn-modal-cancel" onClick={onClose}>Cancel</button>
          <button className="btn-modal-save" disabled={saving} onClick={save}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
        <ToastEl style={{ marginTop: 10 }} />
      </div>
    </div>
  );
}
