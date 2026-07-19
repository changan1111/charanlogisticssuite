import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { FLEET_ROUTES } from '../fleet/FleetSection';

const INVOICE_ROUTES = [
  { path: 'invoices',    label: '📋 Invoices' },
  { path: 'insights',    label: '🔎 Insights' },
  { path: 'addinvoice',  label: '➕ Add Invoice' },
  { path: 'excelimport', label: '📊 Excel Import' },
  { path: 'payroll',     label: '💰 Payroll' },
  { path: 'quotation',   label: '📄 Quotation' },
  { path: 'whatsapp',    label: '💬 WhatsApp' },
];

export default function Sidebar({ open, onClose, onSignOut, userEmail }) {
  const [fleetOpen, setFleetOpen] = useState(true);
  const [invoiceOpen, setInvoiceOpen] = useState(true);

  return (
    <>
      {open && <div className="sb-overlay show" onClick={onClose} />}
      <nav className={`app-sidebar ${open ? 'open' : ''}`}>
        <div className="sb-brand">
          <div className="sb-brand-title">Charan Logistics</div>
          <div className="sb-brand-sub">Fleet &amp; Invoicing Suite</div>
        </div>

        <div className="sb-scroll">
          <NavLink to="/summary" className={({ isActive }) => 'sb-solo-btn' + (isActive ? ' active' : '')} onClick={onClose}>
            📊 Business Summary
          </NavLink>

          <button className="sb-section-btn" onClick={() => setInvoiceOpen(o => !o)}>
            <span>🧾 Invoicing</span>
            <span className="sb-caret">{invoiceOpen ? '▾' : '▸'}</span>
          </button>
          {invoiceOpen && (
            <div className="sb-sub">
              {INVOICE_ROUTES.map(r => (
                <NavLink key={r.path} to={`/invoicing/${r.path}`} className={({ isActive }) => 'sb-sub-btn' + (isActive ? ' active' : '')} onClick={onClose}>
                  {r.label}
                </NavLink>
              ))}
            </div>
          )}

          <button className="sb-section-btn" onClick={() => setFleetOpen(o => !o)}>
            <span>🚚 Fleet Management</span>
            <span className="sb-caret">{fleetOpen ? '▾' : '▸'}</span>
          </button>
          {fleetOpen && (
            <div className="sb-sub">
              {FLEET_ROUTES.map(r => (
                <NavLink key={r.path} to={`/fleet/${r.path}`} className={({ isActive }) => 'sb-sub-btn' + (isActive ? ' active' : '')} onClick={onClose}>
                  {r.label}
                </NavLink>
              ))}
            </div>
          )}
        </div>

        <div className="sb-footer">
          <div className="sb-user">{userEmail}</div>
          <button className="sb-signout" onClick={onSignOut}>🚪 Sign Out</button>
        </div>
      </nav>
    </>
  );
}
