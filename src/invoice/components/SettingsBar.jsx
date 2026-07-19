import { useState, useEffect } from 'react'

export default function SettingsBar({ open, cfg, onSave }) {
  const [form, setForm] = useState(cfg)
  useEffect(() => setForm(cfg), [cfg])

  return (
    <div className={`cfg-panel ${open ? '' : 'hidden'}`}>
      <div className="cfg-inner">
        <div className="cfg-head">
          <h3>⚙ Display Settings</h3>
          <p>Customise how invoices are displayed and printed.</p>
        </div>
        <div className="cfg-grid">
          <div className="cfg-field">
            <label>Business Name</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Your Company Name" />
          </div>
          <div className="cfg-field">
            <label>Business Address</label>
            <input value={form.addr} onChange={e => setForm(f => ({ ...f, addr: e.target.value }))} placeholder="123 Main St, City" />
          </div>
          <div className="cfg-field" style={{ maxWidth: 100 }}>
            <label>Currency</label>
            <input value={form.cur} onChange={e => setForm(f => ({ ...f, cur: e.target.value }))} placeholder="SGD" />
          </div>
        </div>
        <div className="cfg-row">
          <button className="btn btn-primary" onClick={() => onSave(form)}>✓ Save &amp; Load</button>
        </div>
      </div>
    </div>
  )
}
