import { useState } from 'react'

const TEMPLATES = {
  payment_reminder: (name, ref, amount) => `Hello ${name||'[Client]'},\n\nThis is a gentle reminder that Invoice ${ref||'[Ref]'} for ${amount||'[Amount]'} is due for payment.\n\nKindly arrange for the payment at your earliest convenience.\n\n*Charan Logistics Pte Ltd*\n📞 +65 9185 8511`,
  invoice_sent:     (name, ref, amount) => `Hello ${name||'[Client]'},\n\nPlease find attached Invoice ${ref||'[Ref]'} for ${amount||'[Amount]'}.\n\nKindly acknowledge receipt and arrange payment by the due date.\n\n*Charan Logistics Pte Ltd*\n📞 +65 9185 8511`,
  thank_you:        (name, ref, amount) => `Hello ${name||'[Client]'},\n\nThank you for your payment of ${amount||'[Amount]'} for Invoice ${ref||'[Ref]'}.\n\nWe appreciate your prompt settlement.\n\n*Charan Logistics Pte Ltd*\n📞 +65 9185 8511`,
  quotation:        (name, ref, amount) => `Hello ${name||'[Client]'},\n\nI hope this message finds you well. I wanted to follow up on Quotation ${ref||'[Ref]'} for ${amount||'[Amount]'} that we sent over.\n\nPlease let us know if you have any questions or need any adjustments.\n\n*Charan Logistics Pte Ltd*\n📞 +65 9185 8511`,
}

export default function WhatsAppPanel() {
  const [phone,  setPhone]  = useState('')
  const [name,   setName]   = useState('')
  const [ref,    setRef]    = useState('')
  const [amount, setAmount] = useState('')
  const [msg,    setMsg]    = useState('')

  const applyTemplate = (type) => {
    const tpl = TEMPLATES[type]
    if (tpl) setMsg(tpl(name, ref, amount))
  }

  const send = () => {
    const ph = phone.trim().replace(/[\s\-\+\(\)]/g, '')
    if (!ph) { alert('Please enter a WhatsApp number'); return }
    if (!msg.trim()) { alert('Please enter a message'); return }
    window.open(`https://wa.me/${ph}?text=${encodeURIComponent(msg.trim())}`, '_blank')
  }

  const clear = () => { setPhone(''); setName(''); setRef(''); setAmount(''); setMsg('') }

  const quickBtns = [
    { key: 'payment_reminder', icon: '🔔', title: 'Payment Reminder', sub: 'Send a polite reminder' },
    { key: 'invoice_sent',     icon: '📋', title: 'Invoice Sent',      sub: 'Notify invoice is shared' },
    { key: 'thank_you',        icon: '🙏', title: 'Thank You',         sub: 'Payment received' },
    { key: 'quotation',        icon: '📄', title: 'Quotation Follow-up', sub: 'Follow up on quote' },
  ]

  return (
    <div className="page">
      <div className="wa-container">
        <div className="wa-hero">
          <div className="wa-hero-ico">💬</div>
          <h2>WhatsApp Quick Send</h2>
          <p>Send invoices, payment reminders, and custom messages instantly via WhatsApp.</p>
        </div>

        <div className="wa-quick-btns">
          {quickBtns.map(btn => (
            <button key={btn.key} className="wa-qbtn" onClick={() => applyTemplate(btn.key)}>
              <div className="wa-qbtn-ico">{btn.icon}</div>
              <div>
                <div className="wa-qbtn-title">{btn.title}</div>
                <div className="wa-qbtn-sub">{btn.sub}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="wa-compose">
          <h3>Compose Message</h3>
          <div className="wa-field"><label>WhatsApp Number (with country code)</label><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 6591858511 (no + or spaces)" /></div>
          <div className="wa-field"><label>Client / Company Name</label><input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Mr. Dean / ABC Pte Ltd" /></div>
          <div className="wa-field"><label>Invoice / Reference No. (optional)</label><input type="text" value={ref} onChange={e => setRef(e.target.value)} placeholder="e.g. INV-2025-001" /></div>
          <div className="wa-field"><label>Amount (optional)</label><input type="text" value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. S$ 5,750.00" /></div>
          <div className="wa-field"><label>Message</label><textarea value={msg} onChange={e => setMsg(e.target.value)} rows={5} placeholder="Type your message…" /></div>
          {msg && <div className="wa-preview show">{msg}</div>}
          <div style={{ display: 'flex', gap: '.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <button className="wa-send-btn" onClick={send}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>
              Send via WhatsApp
            </button>
            <button className="btn btn-white" onClick={clear}>✕ Clear</button>
          </div>
        </div>
      </div>
    </div>
  )
}
