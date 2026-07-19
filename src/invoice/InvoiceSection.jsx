import { useState, useEffect, useRef } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { sb } from './supabase'
import Nav from './components/Nav'
import SettingsBar from './components/SettingsBar'
import InvoicesPanel from './pages/InvoicesPanel'
import PayrollPanel from './pages/PayrollPanel'
import QuotationPanel from './pages/QuotationPanel'
import WhatsAppPanel from './pages/WhatsAppPanel'
import InsightsPanel from './pages/InsightsPanel'
import AddInvoicePanel from './pages/AddInvoicePanel'
import ExcelImportHelper from './pages/ExcelImportHelper'
import InvoiceModal from './components/InvoiceModal'
import EditInvoiceModal from './components/EditInvoiceModal'
import ChartModal from './components/ChartModal'
import QuickInvoiceFAB from './components/QuickInvoiceFAB'

const DEFAULT_CFG = {
  name: 'Charan Logistics Pte Ltd',
  addr: '123 Business St, Chennai, India',
  cur: 'SGD',
}

// The Invoicing section — mounted at /invoicing/* by the shared app shell.
// All auth + top-level chrome (sidebar, header, sign-out) now live one level
// up in src/App.jsx; this component owns only invoice-specific state and UI.
export default function InvoiceSection() {
  const navigate = useNavigate()
  const mainRef = useRef(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [cfg, setCfg] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cl_cfg')) || DEFAULT_CFG } catch { return DEFAULT_CFG }
  })

  // Invoice data shared across panels
  const [invoices, setInvoices] = useState([])
  const [lineItemCache, setLineItemCache] = useState({})
  const [invLoading, setInvLoading] = useState(false)

  // Modals
  const [viewInv, setViewInv] = useState(null)
  const [editInv, setEditInv] = useState(null)
  const [chartOpen, setChartOpen] = useState(false)
  const [importPrefill, setImportPrefill] = useState(null)

  const saveCfg = (newCfg) => {
    setCfg(newCfg)
    localStorage.setItem('cl_cfg', JSON.stringify(newCfg))
    setSettingsOpen(false)
    loadInvoices()
  }

  const loadInvoices = async () => {
    setInvLoading(true)
    try {
      let all = []
      let from = 0
      while (true) {
        const { data, error } = await sb.from('clients').select('*').order('updated_at', { ascending: false }).range(from, from + 999)
        if (error) throw error
        all = all.concat(data || [])
        if ((data || []).length < 1000) break
        from += 1000
      }
      setInvoices(all)
    } catch (e) {
      console.error('Load invoices error', e)
    }
    setInvLoading(false)
  }

  const fetchLineItems = async (numbers) => {
    if (!numbers.length) return
    const missing = numbers.filter(n => !lineItemCache[n])
    if (!missing.length) return
    try {
      const { data, error } = await sb.from('line_items').select('*').in('invoice_number', missing).limit(5000)
      if (error) throw error
      const byNum = {}
      ;(data || []).forEach(li => {
        if (!byNum[li.invoice_number]) byNum[li.invoice_number] = []
        byNum[li.invoice_number].push(li)
      })
      setLineItemCache(prev => ({ ...prev, ...byNum }))
    } catch (e) {
      console.error('Line items fetch error', e)
    }
  }

  useEffect(() => { loadInvoices() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div id="invoice-root">
      <Nav />

      <SettingsBar open={settingsOpen} cfg={cfg} onSave={saveCfg} />

      <div className="content-area" ref={mainRef}>
        <Routes>
          <Route path="invoices" element={
            <InvoicesPanel
              invoices={invoices}
              lineItemCache={lineItemCache}
              loading={invLoading}
              cfg={cfg}
              onFetchLineItems={fetchLineItems}
              onViewInv={setViewInv}
              onChartOpen={() => setChartOpen(true)}
              onReload={loadInvoices}
            />
          } />
          <Route path="insights" element={<InsightsPanel invoices={invoices} />} />
          <Route path="payroll" element={<PayrollPanel cfg={cfg} />} />
          <Route path="quotation" element={<QuotationPanel cfg={cfg} />} />
          <Route path="whatsapp" element={<WhatsAppPanel />} />
          <Route path="excelimport" element={
            <ExcelImportHelper
              onSendToInvoice={(data) => {
                setImportPrefill(data)
                navigate('/invoicing/addinvoice')
              }}
            />
          } />
          <Route path="addinvoice" element={
            <AddInvoicePanel
              cfg={cfg}
              onSaved={() => { loadInvoices(); navigate('/invoicing/invoices') }}
              invoices={invoices}
              prefill={importPrefill}
              onPrefillConsumed={() => setImportPrefill(null)}
            />
          } />
          <Route path="*" element={<Navigate to="invoices" replace />} />
        </Routes>
      </div>

      {viewInv && (
        <InvoiceModal
          inv={viewInv}
          cfg={cfg}
          lineItemCache={lineItemCache}
          onClose={() => setViewInv(null)}
          onEdit={(inv) => { setEditInv(inv); setViewInv(null) }}
          onMarkPaid={async (inv) => {
            const displayTotal = (() => {
              const items = lineItemCache[inv.number] || inv.items || []
              const t = items.reduce((s, li) => s + (parseFloat(li.qty || li.quantity || 1)) * (parseFloat(li.unit_price || li.price || li.rate || 0)), 0)
              return t > 0 ? t : (parseFloat(inv.total) || 0)
            })()
            const password = window.prompt(`🔐 Enter your login password to mark Invoice #${inv.number} as Paid:\n\nClient: ${inv.name}\nAmount: S$ ${displayTotal.toFixed(2)}`)
            if (password === null) return
            if (!password.trim()) { window.alert('❌ Password cannot be empty.'); return }
            const { data: { user } } = await sb.auth.getUser()
            if (!user) { window.alert('❌ Session expired. Please log in again.'); return }
            const { error: authError } = await sb.auth.signInWithPassword({ email: user.email, password: password.trim() })
            if (authError) { window.alert('❌ Incorrect password. Access denied.'); return }
            const confirmed = window.confirm(`✅ Password verified!\n\nMark Invoice #${inv.number} (${inv.name}) as PAID?\n\nAmount: S$ ${displayTotal.toFixed(2)}`)
            if (!confirmed) return
            try {
              const { error } = await sb.from('clients').update({ status: 'paid' }).eq('invoice_number', inv.number ?? inv.invoice_number)
              if (error) throw error
              window.alert(`✅ Invoice #${inv.number} marked as Paid!\n\nClient: ${inv.name}\nAmount: S$ ${displayTotal.toFixed(2)}`)
              await loadInvoices()
              setViewInv(null)
            } catch (e) { window.alert('❌ Update failed: ' + e.message) }
          }}
        />
      )}

      {editInv && (
        <EditInvoiceModal
          inv={editInv}
          lineItemCache={lineItemCache}
          cfg={cfg}
          onClose={() => setEditInv(null)}
          onSaved={async () => {
            const invNum = editInv.number ?? editInv.invoice_number
            setLineItemCache(prev => { const n = { ...prev }; delete n[invNum]; return n })
            await loadInvoices()
            setEditInv(null)
          }}
        />
      )}

      {chartOpen && (
        <ChartModal invoices={invoices} cfg={cfg} onClose={() => setChartOpen(false)} />
      )}

      <QuickInvoiceFAB invoices={invoices} cfg={cfg} onSaved={loadInvoices} />
    </div>
  )
}
