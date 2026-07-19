import { useEffect, useState } from 'react';
import { CASH_TYPES } from '../lib/constants';
import { updateCash } from '../lib/dataLayer';
import { useToast } from './Toast';

// props: row = {id, cash_type, date, amount, note} | null
export default function EditCashModal({ row, onClose, onSaved }) {
  const [type, setType] = useState('Petty Cash');
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [ToastEl, showToast] = useToast();

  useEffect(() => {
    if (!row) return;
    setType(row.cash_type);
    setDate(row.date);
    setAmount(row.amount);
    setNote(row.note || '');
  }, [row]);

  if (!row) return null;

  async function save() {
    const amt = parseFloat(amount);
    if (!date || !amt) { showToast('Please fill date and amount.', false); return; }
    setSaving(true);
    try {
      await updateCash(row.id, { cash_type: type, date, amount: amt, note: note.trim() });
      showToast('Saved!', true);
      setTimeout(() => { onSaved(); onClose(); }, 900);
    } catch (e) {
      showToast('Error: ' + e.message, false);
    }
    setSaving(false);
  }

  return (
    <div className="modal-overlay open" id="cashEditModal" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-title">💵 Edit Cash Entry</div>
        <div className="field">
          <label className="label">Cash Type</label>
          <select className="select" value={type} onChange={e => setType(e.target.value)}>
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
          <textarea className="textarea" rows={3} value={note} onChange={e => setNote(e.target.value)} />
        </div>
        <div className="edit-modal-actions">
          <button className="btn-modal-cancel" onClick={onClose}>Cancel</button>
          <button className="btn-modal-save cash-save" disabled={saving} onClick={save}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
        <ToastEl style={{ marginTop: 10 }} />
      </div>
    </div>
  );
}
