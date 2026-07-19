import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { sb, setSession } from './lib/supabaseClient';
import Sidebar from './components/Sidebar';
import { FleetProvider } from './fleet/context/FleetContext';
import FleetSection from './fleet/FleetSection';
import InvoiceSection from './invoice/InvoiceSection';
import BusinessSummary from './pages/BusinessSummary';

function Shell({ user }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const toggleSidebar = () => setSidebarOpen(o => !o);

  async function signOut() {
    await sb.auth.signOut();
    // onAuthStateChange below redirects to login.html
  }

  return (
    <div className="app-shell">
      {/* Company banner — shown on every page of both sections */}
      <div className="header-banner">
        <img
          src={`${import.meta.env.BASE_URL}header-slim.png`}
          alt="Charan Logistics"
          onError={e => { e.target.style.display = 'none'; }}
        />
      </div>

      <div className="app-body-row">
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onSignOut={signOut}
          userEmail={user.email}
        />

        <main className="app-main">
          <Routes>
            <Route path="/summary" element={<BusinessSummary />} />
            <Route path="/invoicing/*" element={<InvoiceSection />} />
            <Route path="/fleet/*" element={<FleetSection />} />
            <Route path="*" element={<Navigate to="/invoicing/invoices" replace />} />
          </Routes>
        </main>
      </div>

      {/* Mobile-only menu button — bottom-left, away from the logo and the invoice FAB */}
      <button className="mobile-menu-pill" onClick={toggleSidebar} aria-label="Open menu">☰ Menu</button>
    </div>
  );
}

// ═══════════════════════════════════════════════
//  AUTH GATE — login.html flow
//  No session → redirect to public/login.html (branded page,
//  credentials injected at deploy). Session → Shell.
// ═══════════════════════════════════════════════
export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    sb.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        window.location.replace('./login.html');
        return;
      }
      setSession(session);
      setUser(session.user);
      setLoading(false);
    });

    const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === 'SIGNED_OUT') window.location.replace('./login.html');
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading || !user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b82a8', fontSize: 13 }}>
        Checking access...
      </div>
    );
  }

  return (
    <FleetProvider>
      <Shell user={user} />
    </FleetProvider>
  );
}
