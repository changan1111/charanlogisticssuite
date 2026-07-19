import { useEffect, useState, useCallback } from 'react';
import { useFleet } from '../context/FleetContext';
import { getAllVehicles, insertVehicle, updateVehicle, deleteVehicleRow } from '../lib/dataLayer';
import { useToast } from '../components/Toast';

export default function Vehicles() {
  const { reloadVehicles } = useFleet();
  const [number, setNumber] = useState('');
  const [label, setLabel] = useState('');
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ToastEl, showToast] = useToast();

  const loadVehicleList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await getAllVehicles());
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadVehicleList(); }, [loadVehicleList]);

  async function addVehicle() {
    const num = number.trim().toUpperCase();
    if (!num) { showToast('Vehicle number is required.', false); return; }
    try {
      await insertVehicle({ number: num, label: label.trim(), active: true });
      setNumber('');
      setLabel('');
      showToast(`${num} added to fleet!`, true);
      await reloadVehicles();
      loadVehicleList();
    } catch (e) {
      showToast('Error: ' + e.message, false);
    }
  }

  async function toggleVehicle(id, currentActive) {
    try {
      await updateVehicle(id, { active: !currentActive });
      await reloadVehicles();
      loadVehicleList();
    } catch (e) { alert('Error: ' + e.message); }
  }

  async function deleteVehicle(id, num) {
    if (!confirm(`Remove ${num} from fleet?\nThis does NOT delete its earnings/expenses history.`)) return;
    try {
      await deleteVehicleRow(id);
      await reloadVehicles();
      loadVehicleList();
    } catch (e) { alert('Error: ' + e.message); }
  }

  const active = (rows || []).filter(r => r.active).length;

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <div className="section-card" style={{ borderColor: '#f0a50033', marginBottom: 20 }}>
        <div className="section-title">➕ Add New Vehicle</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 2, minWidth: 160, marginBottom: 0 }}>
            <label className="label">Vehicle Number</label>
            <input
              className="input mono" placeholder="e.g. MH01AB1234" style={{ textTransform: 'uppercase' }}
              value={number} onChange={e => setNumber(e.target.value)}
            />
          </div>
          <div className="field" style={{ flex: 2, minWidth: 160, marginBottom: 0 }}>
            <label className="label">Label / Driver (optional)</label>
            <input
              className="input" placeholder="e.g. Raju — Tata 407"
              value={label} onChange={e => setLabel(e.target.value)}
            />
          </div>
          <div style={{ flexShrink: 0 }}>
            <button
              onClick={addVehicle}
              style={{
                padding: '10px 20px', background: 'var(--accent)', color: '#000', border: 'none',
                borderRadius: 8, fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >Add Vehicle</button>
          </div>
        </div>
        <ToastEl style={{ marginTop: 10 }} />
      </div>

      <div className="section-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{
          padding: '14px 18px', background: 'var(--surface)', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Fleet Vehicles</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            {loading ? 'Loading...' : `${active} active · ${(rows || []).length} total`}
          </div>
        </div>
        <div>
          {loading ? (
            <div className="no-data" style={{ padding: '40px 0' }}>Loading vehicles...</div>
          ) : error ? (
            <div className="no-data" style={{ color: 'var(--red)', padding: '30px 0' }}>Error: {error}</div>
          ) : !(rows || []).length ? (
            <div className="no-data" style={{ padding: '40px 0' }}>No vehicles yet. Add one above.</div>
          ) : (
            rows.map(r => (
              <div
                key={r.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px',
                  borderBottom: '1px solid #1f1f2e55', transition: 'background .15s',
                }}
              >
                <div style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: r.active ? 'var(--green)' : 'var(--muted)', flexShrink: 0,
                }} />
                <div style={{ flex: 1 }}>
                  <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: r.active ? 'var(--accent)' : 'var(--muted)' }}>
                    {r.number}
                    {!r.active && (
                      <span style={{
                        fontSize: 9, background: '#52526a22', color: 'var(--muted)', borderRadius: 3,
                        padding: '1px 6px', marginLeft: 6, fontFamily: 'Syne,sans-serif',
                      }}>INACTIVE</span>
                    )}
                  </div>
                  {r.label && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{r.label}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => toggleVehicle(r.id, r.active)}
                    style={{
                      padding: '5px 12px', borderRadius: 6,
                      border: `1px solid ${r.active ? '#ef444444' : '#22c55e44'}`,
                      background: r.active ? 'var(--red-dim)' : 'var(--green-dim)',
                      color: r.active ? 'var(--red)' : 'var(--green)',
                      fontFamily: 'Syne,sans-serif', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    }}
                  >{r.active ? 'Deactivate' : 'Activate'}</button>
                  <button
                    onClick={() => deleteVehicle(r.id, r.number)}
                    title="Delete vehicle"
                    style={{
                      padding: '5px 10px', borderRadius: 6, border: '1px solid #ef444433',
                      background: 'transparent', color: 'var(--red)',
                      fontFamily: 'Syne,sans-serif', fontSize: 12, cursor: 'pointer',
                    }}
                  >✕</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
