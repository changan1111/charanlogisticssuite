import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useFleet } from './context/FleetContext';

import AddEntry from './pages/AddEntry';
import DayEntry from './pages/DayEntry';
import History from './pages/History';
import Dashboard from './pages/Dashboard';
import Charts from './pages/Charts';
import CashOnHand from './pages/CashOnHand';
import CashMeter from './pages/CashMeter';
import Vehicles from './pages/Vehicles';
import Report from './pages/Report';
import SettleDriver from './pages/SettleDriver';
import Trips from './pages/Trips';
import Insights from './pages/Insights';
import CompareMonths from './pages/CompareMonths';

// Route list also drives the "Fleet" submenu in the shared sidebar
// (see src/components/Sidebar.jsx) — keep the two in sync.
export const FLEET_ROUTES = [
  { path: 'add',       label: '➕ Add Entry',      element: <AddEntry /> },
  { path: 'dayentry',  label: '🗓️ Day Entry',      element: <DayEntry /> },
  { path: 'history',   label: '📋 History',        element: <History /> },
  { path: 'dashboard', label: '📊 Dashboard',      element: <Dashboard /> },
  { path: 'charts',    label: '📈 Charts',         element: <Charts /> },
  { path: 'compare',   label: '📉 Compare Months', element: <CompareMonths /> },
  { path: 'insights',  label: '🔎 Insights',       element: <Insights /> },
  { path: 'cash',      label: '💵 Cash on Hand',   element: <CashOnHand /> },
  { path: 'cashmeter', label: '⛽ Cash Meter',      element: <CashMeter /> },
  { path: 'vehicles',  label: '🚛 Vehicles',       element: <Vehicles /> },
  { path: 'report',    label: '🖨️ Report',         element: <Report /> },
  { path: 'settle',    label: '🧾 Settle Driver',  element: <SettleDriver /> },
  { path: 'trips',     label: '🗺️ Trips',          element: <Trips /> },
];

// The Fleet section — mounted at /fleet/* by the shared app shell.
// Auth + top-level chrome (sidebar, header, sign-out) live one level up
// in src/App.jsx; this component owns only fleet sub-page routing.
export default function FleetSection() {
  const { reloadVehicles } = useFleet();

  useEffect(() => { reloadVehicles(); }, [reloadVehicles]);

  return (
    <div id="fleet-root">
      <div className="main" style={{ padding: '20px 0 80px' }}>
        <div className="fleet-page-body">
          <Routes>
            {FLEET_ROUTES.map(r => (
              <Route key={r.path} path={r.path} element={r.element} />
            ))}
            <Route path="*" element={<Navigate to="add" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
