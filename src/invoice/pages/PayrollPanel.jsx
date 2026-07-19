import { useState, useEffect } from 'react'
import { sb } from '../supabase'
import { prMf, prFmtMonth, todayStr } from '../utils/helpers'
import { makePayrollPDF } from '../utils/pdfGen'

const empty = () => ({
  name:'', nric:'', desig:'', month: new Date().toISOString().slice(0,7),
  paydate: todayStr(), ref:'',
  basic:'', ot:'', comm:'', allow:'', earn_other:'',
  cpf:'', sdl:'', ded_other:''
})

export default function PayrollPanel() {
  const [tab,      setTab]      = useState('slip')
  const [form,     setForm]     = useState(empty())
  const [records,  setRecords]  = useState([])
  const [loading,  setLoading]  = useState(false)
  const [editId,   setEditId]   = useState(null)
  const [saving,   setSaving]   = useState(false)
  const [syncMsg,  setSyncMsg]  = useState('')
  const [filters,  setFilters]  = useState({ name:'', month:'', year:'' })
  const [sort,     setSort]     = useState({ col:'month', asc: false })

  const nv = (k) => parseFloat(form[k]) || 0
  const earn = nv('basic') + nv('ot') + nv('comm') + nv('allow') + nv('earn_other')
  const ded  = nv('cpf') + nv('sdl') + nv('ded_other')
  const net  = earn - ded

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const fetchRecords = async (manual = false) => {
    setSyncMsg('Loading…')
    setLoading(true)
    try {
      const { data, error } = await sb.from('salary_records').select('*').order('id', { ascending: false })
      if (error) throw error
      setRecords((data || []).map(r => ({
        id: r.id, name: r.name, nric: r.nric, desig: r.desig,
        month: r.month, paydate: r.paydate, ref: r.ref,
        basic: +r.basic, ot: +r.ot, comm: +r.comm, allow: +r.allow, oe: +r.earn_other,
        cpf: +r.cpf, sdl: +r.sdl, od: +r.ded_other,
        earn: +r.earn, ded: +r.ded, net: +r.net,
        savedAt: r.saved_at || '',
      })))
      setSyncMsg(manual ? '✓ Refreshed' : `Live · ${(data||[]).length} records`)
    } catch(e) {
      setSyncMsg('Load failed: ' + (e.message || 'error'))
    }
    setLoading(false)
  }

  useEffect(() => { fetchRecords() }, [])

  const save = async () => {
    if (!form.name.trim()) { alert('Employee Name is required'); return }
    if (!form.month) { alert('Salary Month is required'); return }
    if (!form.basic || parseFloat(form.basic) <= 0) { alert('Basic Pay is required'); return }

    const id = editId || String(Date.now())
    const record = {
      id, name: form.name.trim(), nric: form.nric.trim(), desig: form.desig.trim(),
      month: form.month.slice(0,7), paydate: form.paydate, ref: form.ref.trim(),
      basic: nv('basic'), ot: nv('ot'), comm: nv('comm'), allow: nv('allow'), earn_other: nv('earn_other'),
      cpf: nv('cpf'), sdl: nv('sdl'), ded_other: nv('ded_other'),
      earn, ded, net,
      saved_at: new Date().toLocaleDateString('en-GB'),
    }
    setSaving(true)
    try {
      const { error } = await sb.from('salary_records').upsert(record, { onConflict: 'id' })
      if (error) throw error
      alert('✅ ' + (editId ? 'Updated' : 'Saved') + ': ' + form.name + ' — ' + prFmtMonth(form.month))
      clearForm()
      fetchRecords()
    } catch(e) {
      alert('❌ Save failed: ' + (e.message || 'error'))
    }
    setSaving(false)
  }

  const clearForm = () => { setForm(empty()); setEditId(null) }

  const loadRec = (r) => {
    setForm({
      name: r.name||'', nric: r.nric||'', desig: r.desig||'',
      month: (r.month||'').slice(0,7), paydate: r.paydate||'', ref: r.ref||'',
      basic: r.basic||'', ot: r.ot||'', comm: r.comm||'', allow: r.allow||'',
      earn_other: r.oe||'', cpf: r.cpf||'', sdl: r.sdl||'', ded_other: r.od||''
    })
    setEditId(String(r.id))
    setTab('slip')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const pdfRec = async (r) => { const blob = await makePayrollPDF(r); dlBlob(blob, `Payslip_${r.name}_${r.month}.pdf`) }
  const pdfForm = async () => {
    if (!form.name || !form.month || !form.basic) { alert('Fill name, month, and basic pay first'); return }
    const r = { id: editId||'tmp', name: form.name.trim()||'—', nric: form.nric.trim()||'—', desig: form.desig.trim()||'—', month: form.month, paydate: form.paydate||'—', ref: form.ref.trim()||'—', basic: nv('basic'), ot: nv('ot'), comm: nv('comm'), allow: nv('allow'), oe: nv('earn_other'), cpf: nv('cpf'), sdl: nv('sdl'), od: nv('ded_other'), earn, ded, net }
    const blob = await makePayrollPDF(r)
    dlBlob(blob, `Payslip_${form.name}_${form.month}.pdf`)
  }
  const dlBlob = (blob, name) => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url) }

  // Filtered/sorted records
  const years = [...new Set(records.map(r => (r.month||'').slice(0,4)).filter(Boolean))].sort().reverse()
  const filtered = records.filter(r => {
    if (filters.name && !String(r.name||'').toLowerCase().includes(filters.name.toLowerCase())) return false
    if (filters.month && r.month !== filters.month) return false
    if (filters.year && !(r.month||'').startsWith(filters.year)) return false
    return true
  }).sort((a,b) => {
    let va, vb
    if (sort.col === 'month') { va = a.month; vb = b.month }
    else if (sort.col === 'name') { va = (a.name||'').toLowerCase(); vb = (b.name||'').toLowerCase() }
    else if (sort.col === 'earn') { va = a.earn; vb = b.earn }
    else { va = a.net; vb = b.net }
    return sort.asc ? (va < vb ? -1 : 1) : (va > vb ? -1 : 1)
  })

  const sortBy = (col) => setSort(s => ({ col, asc: s.col === col ? !s.asc : false }))
  const ok = !!(import.meta.env.VITE_SUPABASE_URL && !import.meta.env.VITE_SUPABASE_URL.includes('%%'))

  return (
    <div className="page">
      {!ok && <div className="pr-warn-note">⚠️ Supabase credentials not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.</div>}

      <div className="pr-tabs">
        <button className={`pr-tab${tab==='slip' ? ' active' : ''}`} onClick={() => setTab('slip')}>💰 Payslip Entry</button>
        <button className={`pr-tab${tab==='hist' ? ' active' : ''}`} onClick={() => setTab('hist')}>📋 History</button>
      </div>

      {tab === 'slip' && (
        <>
          {editId && (
            <div className="pr-edit-banner show">
              <div><div className="pr-edit-banner-text">✏ Editing: {form.name} — {prFmtMonth(form.month)}</div><div className="pr-edit-banner-sub">Changes won't be saved until you click Update.</div></div>
              <button className="btn btn-outline btn-sm" onClick={clearForm}>✕ Cancel Edit</button>
            </div>
          )}
          <div className="pr-card">
            <div className="pr-card-title">Employee Details</div>
            <div className="pr-form-grid">
              {[['name','Employee Name','text','e.g. Ramesh Kumar'],['nric','NRIC / FIN','text','e.g. S1234567A'],['desig','Designation','text','e.g. Driver'],['month','Salary Month','month',''],['paydate','Payment Date','date',''],['ref','Reference No.','text','e.g. PR-2025-001']].map(([k,lbl,type,ph]) => (
                <div className="pr-field" key={k}>
                  <label>{lbl}</label>
                  <input type={type} value={form[k]} placeholder={ph} onChange={e => f(k, e.target.value)} />
                </div>
              ))}
            </div>
          </div>

          <div className="pr-card">
            <div className="pr-card-title">Earnings</div>
            <div className="pr-form-grid three">
              {[['basic','Basic Pay'],['ot','Overtime Pay'],['comm','Commission'],['allow','Allowance'],['earn_other','Other Earnings']].map(([k,lbl]) => (
                <div className="pr-field" key={k}>
                  <label>{lbl} (S$)</label>
                  <input type="number" value={form[k]} min="0" step="0.01" onChange={e => f(k, e.target.value)} />
                </div>
              ))}
            </div>
          </div>

          <div className="pr-card">
            <div className="pr-card-title">Deductions</div>
            <div className="pr-form-grid three">
              {[['cpf','CPF Deduction'],['sdl','SDL'],['ded_other','Other Deductions']].map(([k,lbl]) => (
                <div className="pr-field" key={k}>
                  <label>{lbl} (S$)</label>
                  <input type="number" value={form[k]} min="0" step="0.01" onChange={e => f(k, e.target.value)} />
                </div>
              ))}
            </div>
          </div>

          <div className="pr-card">
            <div className="pr-summary-row">
              <div className="pr-sum-item"><div className="pr-sum-label">Total Earnings</div><div className="pr-sum-val">{prMf(earn)}</div></div>
              <div className="pr-sum-item"><div className="pr-sum-label">Total Deductions</div><div className="pr-sum-val" style={{color:'#c0392b'}}>−{prMf(ded)}</div></div>
              <div className="pr-sum-item"><div className="pr-sum-label">Net Pay</div><div className="pr-sum-val gold">{prMf(net)}</div></div>
            </div>
          </div>

          <div className="pr-actions">
            <button className="btn btn-outline" onClick={clearForm}>✕ Clear</button>
            <button className="btn btn-dark" onClick={pdfForm}>⬇ Download PDF</button>
            <button className="btn btn-gold" onClick={save} disabled={saving} id="pr-btn-save">
              {saving ? <><span className="spinner-sm" />Saving…</> : editId ? '💾 Update Record' : '💾 Save'}
            </button>
          </div>
        </>
      )}

      {tab === 'hist' && (
        <>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12,fontSize:'.78rem',color:'var(--muted)'}}>
            <span className={`pr-sdot ${loading ? 'spin-dot' : 'ok'}`} />
            <span>{syncMsg}</span>
          </div>

          <div className="pr-hist-stats">
            {[
              ['ph_records','Total Records', records.length],
              ['ph_emp','Employees', new Set(records.map(r=>r.name).filter(Boolean)).size],
              ['ph_paid','Total Paid', 'S$ ' + records.reduce((s,r) => s+(+r.net||0),0).toLocaleString('en',{maximumFractionDigits:0})],
              ['ph_latest','Latest Month', records[0] ? prFmtMonth(records[0].month) : '—']
            ].map(([id,lbl,val]) => (
              <div className="pr-hstat" key={id}>
                <div className="pr-hstat-val">{val}</div>
                <div className="pr-hstat-lbl">{lbl}</div>
              </div>
            ))}
          </div>

          <div className="pr-card">
            <div className="pr-filter-row">
              <div className="pr-field"><label>Employee Name</label><input type="text" value={filters.name} onChange={e => setFilters(f=>({...f,name:e.target.value}))} placeholder="Search…"/></div>
              <div className="pr-field"><label>Month</label><input type="month" value={filters.month} onChange={e => setFilters(f=>({...f,month:e.target.value}))}/></div>
              <div className="pr-field"><label>Year</label>
                <select value={filters.year} onChange={e => setFilters(f=>({...f,year:e.target.value}))}>
                  <option value="">All Years</option>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <button className="btn btn-white btn-sm" onClick={() => setFilters({name:'',month:'',year:''})}>✕ Clear</button>
              <button className="btn btn-white btn-sm" onClick={() => fetchRecords(true)}>🔄 Refresh</button>
            </div>
          </div>

          {loading ? <div className="state"><div className="spin"/><div className="state-title">Loading…</div></div> : (
            <div className="tcard">
              <div style={{overflowX:'auto'}}>
                <table className="pr-hist-table">
                  <thead>
                    <tr>
                      {[['month','Month'],['name','Employee'],['','Designation'],['','Ref'],['earn','Earnings'],['','Deductions'],['net','Net Pay'],['','']].map(([col,lbl],i) => (
                        <th key={i} onClick={col ? () => sortBy(col) : undefined} style={col?{}:{cursor:'default'}}>
                          {lbl}{col && sort.col===col ? (sort.asc?' ↑':' ↓') : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length ? filtered.map(r => (
                      <tr key={r.id}>
                        <td><span className="pr-month-pill">{r.month||''}</span><br/><small style={{color:'#aaa',fontSize:'.68rem'}}>{prFmtMonth(r.month)}</small></td>
                        <td><strong>{r.name||''}</strong><br/><small style={{color:'#999',fontSize:'.68rem'}}>{r.nric||''}</small></td>
                        <td style={{color:'#666'}}>{r.desig||'—'}</td>
                        <td style={{color:'#666',fontSize:'.78rem'}}>{r.ref||'—'}</td>
                        <td style={{textAlign:'right'}}>{prMf(r.earn)}</td>
                        <td style={{textAlign:'right',color:'#c0392b'}}>−{prMf(r.ded)}</td>
                        <td style={{textAlign:'right',fontWeight:700,color:'var(--sage)'}}>{prMf(r.net)}</td>
                        <td style={{textAlign:'center',whiteSpace:'nowrap'}}>
                          <button className="pr-ha-btn pr-ha-edit" onClick={() => loadRec(r)}>✏ Edit</button>
                          <button className="pr-ha-btn pr-ha-pdf"  onClick={() => pdfRec(r)}>⬇ PDF</button>
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={8} style={{textAlign:'center',padding:20,color:'#bbb'}}>No records match filter</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="pr-totals-bar">
                <span>{filtered.length} records</span>
                <span>Earnings: <strong className="g">{prMf(filtered.reduce((s,r)=>s+(+r.earn||0),0))}</strong></span>
                <span>Net Pay: <strong className="g">{prMf(filtered.reduce((s,r)=>s+(+r.net||0),0))}</strong></span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
