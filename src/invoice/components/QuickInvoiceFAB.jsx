import { useState, useRef, useEffect } from 'react'
import { sb } from '../supabase'
import { fmt, todayStr } from '../utils/helpers'

const initState = () => ({ step: 0, data: {} })

export default function QuickInvoiceFAB({ invoices, cfg, onSaved }) {
  const [open,  setOpen]  = useState(false)
  const [msgs,  setMsgs]  = useState([])
  const [input, setInput] = useState('')
  const [inputVisible, setInputVisible] = useState(false)
  const [inputType, setInputType] = useState('text')
  const [inputPlaceholder, setInputPlaceholder] = useState('Type here…')
  const [badge, setBadge] = useState(true)
  const [fabPos, setFabPos] = useState(null)
  const qRef = useRef(initState())
  const msgsRef = useRef(null)
  const inputRef = useRef(null)
  const fabRef = useRef(null)
  const dragState = useRef({ active: false, moved: false, startX: 0, startY: 0, origX: 0, origY: 0 })

  const scrollBottom = () => setTimeout(() => { if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight }, 60)

  const addBot  = (text) => { setMsgs(m => [...m, { from: 'bot',  text, id: Date.now() + Math.random() }]); scrollBottom() }
  const addUser = (text) => { setMsgs(m => [...m, { from: 'user', text, id: Date.now() + Math.random() }]); scrollBottom() }
  const addMsg  = (msg)  => { setMsgs(m => [...m, { ...msg, id: Date.now() + Math.random() }]); scrollBottom() }
  const showInput = (type = 'text', ph = 'Type here…') => {
    setInputType(type); setInputPlaceholder(ph); setInputVisible(true)
    setTimeout(() => inputRef.current?.focus(), 100)
  }
  const hideInput = () => setInputVisible(false)

  const start = () => {
    setBadge(false); setMsgs([]); qRef.current = initState()
    setTimeout(() => {
      addBot('👋 Welcome! Let\'s create an invoice quickly.\n\nWhat\'s the <strong>client name</strong>?')
      showInput('text', 'e.g. ABC Pte Ltd')
    }, 100)
  }

  const restart = () => { setMsgs([]); qRef.current = initState(); start() }
  useEffect(() => { if (open && msgs.length === 0) start() }, [open])
  const handleSend = () => { const val = input.trim(); if (!val) return; setInput(''); process(val) }

  const saveFabPos = (pos) => {
    setFabPos(pos)
  }

  const clampPos = (x, y, width, height) => {
    const maxX = Math.max(0, window.innerWidth - width)
    const maxY = Math.max(0, window.innerHeight - height)
    return { x: Math.min(Math.max(0, x), maxX), y: Math.min(Math.max(0, y), maxY) }
  }

  const handlePointerDown = (e) => {
    if (e.button !== 0) return
    const rect = fabRef.current?.getBoundingClientRect()
    if (!rect) return
    dragState.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      origX: rect.left,
      origY: rect.top,
    }
    fabRef.current.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e) => {
    if (!dragState.current.active) return
    const dx = e.clientX - dragState.current.startX
    const dy = e.clientY - dragState.current.startY
    if (!dragState.current.moved && Math.hypot(dx, dy) < 6) return
    dragState.current.moved = true
    const rect = fabRef.current?.getBoundingClientRect()
    if (!rect) return
    const next = clampPos(dragState.current.origX + dx, dragState.current.origY + dy, rect.width, rect.height)
    setFabPos(next)
  }

  const handlePointerUp = (e) => {
    if (!dragState.current.active) return
    dragState.current.active = false
    fabRef.current?.releasePointerCapture(e.pointerId)
    if (dragState.current.moved) {
      saveFabPos(fabPos || { x: 0, y: 0 })
    }
  }

  const handlePointerCancel = (e) => {
    if (!dragState.current.active) return
    dragState.current.active = false
    fabRef.current?.releasePointerCapture(e.pointerId)
  }

  const handleClick = () => {
    if (dragState.current.moved) {
      dragState.current.moved = false
      return
    }
    setOpen(o => !o)
  }

  // Called when user picks a client name from the suggestion list
  const pickClient = async (name) => {
    addUser(name)
    qRef.current.data.clientName = name

    try {
      const { data } = await sb.from('clients')
        .select('address')
        .eq('name', name)
        .not('address', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(50)

      // Distinct non-empty addresses only
      const uniqueAddrs = [...new Set(
        (data || []).map(r => (r.address || '').trim()).filter(Boolean)
      )]

      if (uniqueAddrs.length === 0) {
        qRef.current.data.clientAddr = ''
        addBot('No address on record. Enter address manually or skip:')
        addMsg({ from: 'bot', addrOptions: [], allowManual: true })

      } else if (uniqueAddrs.length === 1) {
        qRef.current.data.clientAddr = uniqueAddrs[0]
        addBot(`📍 Address: <em>${uniqueAddrs[0]}</em>`)
        addBot('What\'s the <strong>description</strong> for this invoice?')
        showInput('text', 'e.g. Logistics Service — Jan 2026')
        qRef.current.step = 1

      } else {
        addBot('Pick an address or enter manually:')
        addMsg({ from: 'bot', addrOptions: uniqueAddrs.map(a => ({ name, addr: a })), allowManual: true })
      }
    } catch {
      qRef.current.data.clientAddr = ''
      addBot('Could not fetch address. Enter manually or skip:')
      addMsg({ from: 'bot', addrOptions: [], allowManual: true })
    }
  }

  // Pick client+address together from one card click
  const pickClientAddr = (name, addr) => {
    qRef.current.data.clientName = name
    qRef.current.data.clientAddr = addr
    qRef.current.step = 1
    addUser(name + (addr ? `\n📍 ${addr}` : ''))
    addBot('What\'s the <strong>description</strong> for this invoice?')
    showInput('text', 'e.g. Logistics Service — Jan 2026')
  }

  const enterManualAddress = () => {
    addBot('Enter the address:')
    showInput('text', 'e.g. 10 Anson Road, Singapore 079903')
    qRef.current.step = 'addr'
  }

  const pickDate = (d, isDelivery = false) => {
    const [y, mo, dd] = d.split('-')
    const display = `${dd}-${mo}-${y}`
    if (!isDelivery) {
      qRef.current.data.billingDate = d
      qRef.current.data.billingDateDisplay = display
      qRef.current.step = 3
      addUser(display)
      addBot('What\'s the <strong>status</strong>?')
      addMsg({ from: 'bot', opts: [
        { label: '✅ Paid', val: 'paid' },
        { label: '⏳ Pending', val: 'pending' },
        { label: '🔴 Overdue', val: 'overdue' }
      ], onOpt: (v) => pickStatus(v) })
    } else {
      qRef.current.data.deliveryDate = d
      qRef.current.data.deliveryDateDisplay = display
      qRef.current.step = 5
      addUser(display)
      addBot('How many? <em style="font-size:.75rem;color:var(--muted)">(Qty)</em>')
      showInput('number', 'e.g. 1')
    }
  }

  const pickStatus = (v) => {
    qRef.current.data.status = v
    qRef.current.step = 4
    addUser(v)
    addBot('Delivery date? (same as billing or pick another)')
    addMsg({ from: 'bot', dateInput: true, isDelivery: true,
      defaultDate: qRef.current.data.billingDate,
      sameAsBtn: qRef.current.data.billingDateDisplay })
  }

  const process = async (val) => {
    const q = qRef.current
    const step = q.step

    if (step === 'addr') {
      addUser(val); hideInput()
      qRef.current.data.clientAddr = val
      qRef.current.step = 1
      addBot('What\'s the <strong>description</strong> for this invoice?')
      showInput('text', 'e.g. Logistics Service — Jan 2026')

    } else if (step === 0) {
      addUser(val); hideInput()
      q.data.clientName = val

      try {
        const { data } = await sb.from('clients')
          .select('name, address')
          .ilike('name', `%${val}%`)
          .order('updated_at', { ascending: false })
          .limit(50)

        // Deduplicate by name+address combo
        const seen = new Set()
        const combos = (data || []).filter(r => {
          const key = (r.name||'').trim() + '||' + (r.address||'').trim()
          if (seen.has(key) || !(r.name||'').trim()) return false
          seen.add(key); return true
        }).slice(0, 6)

        if (combos.length === 0) {
          q.data.clientName = val
          q.step = 'addr'
          addBot('No existing client found. Enter address:')
          addMsg({ from: 'bot', addrOptions: [], allowManual: true })
        } else if (combos.length === 1) {
          pickClientAddr(combos[0].name, combos[0].address || '')
        } else {
          addMsg({ from: 'bot', text: `Found ${combos.length} matching clients. Which one?`, clientCombos: combos })
          addMsg({ from: 'bot', noneOfThese: true, clientName: val })
        }
      } catch {
        q.data.clientName = val; q.step = 'addr'
        addBot('Enter address manually:')
        addMsg({ from: 'bot', addrOptions: [], allowManual: true })
      }

    } else if (step === 1) {
      addUser(val); hideInput()
      q.data.desc = val; q.step = 2
      addBot('Billing <strong>date</strong>?')
      addMsg({ from: 'bot', dateInput: true, isDelivery: false, defaultDate: todayStr() })

    } else if (step === 5) {
      addUser(val); hideInput()
      q.data.qty = parseFloat(val) || 1; q.step = 6
      addBot('Rate per unit? <em style="font-size:.75rem;color:var(--muted)">(S$)</em>')
      showInput('number', 'e.g. 500.00')

    } else if (step === 6) {
      addUser(val); hideInput()
      q.data.rate = parseFloat(val) || 0
      q.data.total = q.data.qty * q.data.rate
      q.step = 7
      addMsg({ from: 'bot', summary: {
        'Client':        q.data.clientName,
        'Address':       q.data.clientAddr || '—',
        'Description':   q.data.desc,
        'Billing Date':  q.data.billingDateDisplay,
        'Delivery Date': q.data.deliveryDateDisplay,
        'Qty':           q.data.qty,
        'Rate':          'S$ ' + fmt(q.data.rate),
        'Status':        q.data.status,
      }, total: 'S$ ' + fmt(q.data.total) })
      addMsg({ from: 'bot', text: 'Ready to save?', opts: [
        { label: '✅ Save Invoice', val: '__SAVE__' }, { label: '✕ Cancel', val: '__CANCEL__' }
      ], onOpt: (v) => process(v) })

    } else if (val === '__SAVE__') {
      addUser('Save Invoice')
      const data = { ...q.data }
      const lastNums = invoices.map(i => {
        const parts = String(i.number || i.invoice_number || '').split('/')
        return parseInt(parts[parts.length - 1]) || 0
      }).filter(n => !isNaN(n))
      const year = new Date().getFullYear()
      const next = lastNums.length ? Math.max(...lastNums) + 1 : 1
      const invNum = `${year}/${String(next).padStart(5, '0')}`
      try {
        const { error: e1 } = await sb.from('clients').upsert({
          invoice_number: invNum,
          billing_date: data.billingDateDisplay,
          status: data.status,
          name: data.clientName,
          address: data.clientAddr || '',
          total: data.total,
        }, { onConflict: 'invoice_number' })
        if (e1) throw e1
        const { error: e2 } = await sb.from('line_items').insert({
          invoice_number: invNum,
          date: data.deliveryDateDisplay,
          description: data.desc,
          qty: data.qty,
          unit_price: data.rate,
        })
        if (e2) throw e2
        addMsg({ from: 'bot', text: `✅ Invoice <strong>#${invNum}</strong> saved!`, success: true })
        onSaved()
      } catch(e) {
        addBot('❌ Error: ' + (e.message || 'save failed'))
      }

    } else if (val === '__CANCEL__') {
      addUser('Cancel')
      addBot('Cancelled. Click Start fresh to begin again.')
    }
  }

  return (
    <>
      <button
        id="qic-fab"
        ref={fabRef}
        draggable="false"
        onDragStart={e => e.preventDefault()}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onClick={handleClick}
        title="Quick Invoice"
        style={fabPos ? { left: fabPos.x, top: fabPos.y, right: 'auto', bottom: 'auto' } : undefined}
      >
        🧾
        {badge && <span className="qic-badge">1</span>}
      </button>

      <div id="qic-panel" className={open ? 'open' : ''}>
        <div className="qic-head">
          <div className="qic-head-ico">🧾</div>
          <div className="qic-head-info">
            <div className="qic-head-title">Quick Invoice</div>
            <div className="qic-head-sub">Create invoice in seconds</div>
          </div>
          <button className="qic-head-close" onClick={() => setOpen(false)}>✕</button>
        </div>
        <div className="qic-disclaimer">⚠️ <span>Quick mode supports <strong>one line item</strong> only. For multiple items use Add Invoice.</span></div>

        <div className="qic-messages" ref={msgsRef}>
          {msgs.map(m => (
            <div key={m.id} className={`qic-msg ${m.from}`}>
              {m.text && <div className="qic-bubble" dangerouslySetInnerHTML={{ __html: m.text }} />}

              {m.summary && (
                <div className="qic-summary">
                  {Object.entries(m.summary).map(([k, v]) => (
                    <div key={k} className="qic-summary-row"><span className="lbl">{k}</span><span><strong>{v}</strong></span></div>
                  ))}
                  <div className="qic-summary-total"><span>Total</span><span>{m.total}</span></div>
                </div>
              )}

              {/* Client + Address combined cards */}
              {m.clientCombos && (
                <div className="qic-matches">
                  {m.clientCombos.map((c, i) => (
                    <div key={i} className="qic-match-item" onClick={() => pickClientAddr(c.name, c.address || '')}
                      style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 700, fontSize: '.88rem', marginBottom: 3 }}>{c.name}</div>
                      {c.address && <div style={{ fontSize: '.76rem', color: '#555' }}>📍 {c.address}</div>}
                    </div>
                  ))}
                </div>
              )}

              {/* None of these — create new */}
              {m.noneOfThese && (
                <div className="qic-matches">
                  <div className="qic-match-item" onClick={() => {
                    qRef.current.data.clientName = m.clientName
                    qRef.current.step = 'addr'
                    addUser('+ None of these — create new')
                    addBot(`New client: <strong>${m.clientName}</strong>. Enter address or skip:`)
                    addMsg({ from: 'bot', addrOptions: [], allowManual: true })
                  }} style={{ color: 'var(--sky)', fontWeight: 600 }}>
                    + None of these — create new
                  </div>
                </div>
              )}

              {/* Address options (manual entry fallback) */}
              {m.addrOptions !== undefined && (
                <div className="qic-matches">
                  {m.allowManual && (
                    <div className="qic-match-item" onClick={enterManualAddress} style={{ color: 'var(--sky)', fontWeight: 600 }}>
                      ✏️ Enter address manually
                    </div>
                  )}
                  <div className="qic-match-item" onClick={() => {
                    qRef.current.data.clientAddr = ''
                    qRef.current.step = 1
                    addUser('Skip')
                    addBot('What\'s the <strong>description</strong>?')
                    showInput('text', 'e.g. Logistics Service — Jan 2026')
                  }} style={{ color: '#999' }}>
                    Skip address
                  </div>
                </div>
              )}

              {m.dateInput && (
                <div className="qic-date-wrap">
                  {m.sameAsBtn && (
                    <button className="qic-opt" onClick={() => pickDate(qRef.current.data.billingDate, true)}>
                      📋 Same as billing — {m.sameAsBtn}
                    </button>
                  )}
                  <DatePicker defaultDate={m.defaultDate} onConfirm={(d) => pickDate(d, m.isDelivery)} />
                </div>
              )}

              {m.opts && !m.clientMatches && (
                <div className="qic-opts">
                  {m.opts.map((o, i) => (
                    <button key={i} className="qic-opt" onClick={() => m.onOpt ? m.onOpt(o.val) : process(o.val)}>{o.label}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className={`qic-input-area${inputVisible ? ' visible' : ''}`}>
          <input
            ref={inputRef}
            type={inputType}
            placeholder={inputPlaceholder}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
          />
          <button className="qic-send" onClick={handleSend}>➤</button>
        </div>

        <div className="qic-restart"><a onClick={restart}>🔄 Start fresh</a></div>
      </div>
    </>
  )
}

function DatePicker({ defaultDate, onConfirm }) {
  const [val, setVal] = useState(defaultDate || '')
  return (
    <>
      <input type="date" className="qic-date-input" value={val} onChange={e => setVal(e.target.value)} />
      <button className="qic-opt" onClick={() => { if (val) onConfirm(val) }}>✅ Confirm Date</button>
    </>
  )
}
