import { useState } from 'react';
import * as XLSX from 'xlsx';
import { useFleet } from '../context/FleetContext';
import { CLIENT_CONFIG, MONTHS, YEARS } from '../lib/constants';
import { detectClient } from '../lib/clientDetect';
import { getRows, getCashRows } from '../lib/dataLayer';
import { fmt, fmtN, fmtD, fmtDL } from '../lib/helpers';
import { useToast } from '../components/Toast';

const now = new Date();

export default function Report() {
  const { vehicles } = useFleet();
  const [vehicle, setVehicle] = useState('');
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null); // { vehicle, monthLabel, rows, totals... }
  const [ToastEl, showToast] = useToast();

  async function generateReport() {
    if (!vehicle) { showToast('Please select a vehicle.', false); return; }
    setBusy(true);
    try {
      const [earnings, expenses, cashRows] = await Promise.all([
        getRows('earnings', vehicle, month, year),
        getRows('expenses', vehicle, month, year),
        getCashRows(month, year, vehicle),
      ]);
      const monthLabel = MONTHS[month] + ' ' + year;
      const allDates = [...new Set([
        ...earnings.map(e => e.date),
        ...expenses.map(e => e.date),
        ...cashRows.map(e => e.date),
      ])].sort();

      const dayMap = {};
      allDates.forEach(d => {
        const entry = { date: d, totalRev: 0, totalExp: 0, totalCash: 0, expNotes: [], cashNotes: [] };
        CLIENT_CONFIG.forEach(c => (entry[c.key] = 0));
        dayMap[d] = entry;
      });
      earnings.forEach(e => {
        const cKey = detectClient(e.note || '');
        const a = Number(e.amount);
        dayMap[e.date].totalRev += a;
        dayMap[e.date][cKey] = (dayMap[e.date][cKey] || 0) + a;
      });
      expenses.forEach(e => {
        dayMap[e.date].totalExp += Number(e.amount);
        if (e.expense_type) dayMap[e.date].expNotes.push(e.expense_type);
      });
      cashRows.forEach(c => {
        dayMap[c.date].totalCash += Number(c.amount);
        if (c.cash_type) dayMap[c.date].cashNotes.push(c.cash_type);
      });

      const rows = allDates.map(d => dayMap[d]);
      const totalRev = rows.reduce((s, r) => s + r.totalRev, 0);
      const totalExp = rows.reduce((s, r) => s + r.totalExp, 0);
      const totalCash = rows.reduce((s, r) => s + r.totalCash, 0);
      const netProfit = totalRev - totalExp;
      const clientTotalsReport = {};
      CLIENT_CONFIG.forEach(c => {
        clientTotalsReport[c.key] = rows.reduce((s, r) => s + (r[c.key] || 0), 0);
      });

      setPreview({ vehicle, monthLabel, rows, totalRev, totalExp, totalCash, netProfit, clientTotalsReport });
      buildXlsx(vehicle, month, year, monthLabel, rows, totalRev, totalExp, totalCash, netProfit, clientTotalsReport);
      showToast(`Report for ${vehicle} — ${monthLabel} downloaded!`, true);
    } catch (e) {
      showToast('Error: ' + e.message, false);
    }
    setBusy(false);
  }

  function buildXlsx(vehicle, month, year, monthLabel, rows, totalRev, totalExp, totalCash, netProfit, clientTotalsReport) {
    const wb = XLSX.utils.book_new();
    const wsData = [];
    wsData.push([`MONTHLY VEHICLE REPORT — ${vehicle}`]);
    wsData.push([`Period: ${monthLabel}   |   Generated: ${new Date().toLocaleDateString('en-SG')}`]);
    wsData.push([]);
    wsData.push(['DATE', 'REVENUE ($)', ...CLIENT_CONFIG.map(c => c.label + ' ($)'), 'EXPENSES ($)', 'EXPENSE DETAILS', 'CASH OUT ($)', 'CASH DETAILS']);
    rows.forEach(r => {
      wsData.push([
        fmtDL(r.date), r.totalRev || '',
        ...CLIENT_CONFIG.map(c => r[c.key] || ''),
        r.totalExp || '', [...new Set(r.expNotes)].join(', '),
        r.totalCash || '', [...new Set(r.cashNotes)].join(', '),
      ]);
    });
    wsData.push([]);
    wsData.push([
      'TOTAL', totalRev,
      ...CLIENT_CONFIG.map(c => clientTotalsReport[c.key] || 0),
      totalExp, `Net Profit: ${netProfit >= 0 ? '' : '-'}${Math.abs(netProfit).toFixed(2)}`,
      totalCash, '',
    ]);
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 16 }, { wch: 14 }, ...CLIENT_CONFIG.map(() => ({ wch: 14 })), { wch: 14 }, { wch: 28 }, { wch: 13 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Monthly Report');
    XLSX.writeFile(wb, `Report_${vehicle}_${MONTHS[month]}_${year}.xlsx`);
  }

  // Preview table cell styles (same visual output as v1 inline styles)
  const th = align => ({
    padding: '9px 11px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px',
    fontWeight: 700, background: 'var(--surface)', borderBottom: '2px solid var(--border)',
    whiteSpace: 'nowrap', textAlign: align,
  });
  const td = { padding: '7px 11px', borderTop: '1px solid var(--border)' };
  const tdNote = {
    ...td, fontSize: 10, color: 'var(--muted)', maxWidth: 130,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  };
  const badge = (bg, color, border) => ({
    background: bg, color, border: `1px solid ${border}`, borderRadius: 6,
    padding: '4px 10px', fontSize: 11, fontWeight: 700,
  });

  return (
    <div style={{ maxWidth: preview ? 'none' : 560, margin: '0 auto' }}>
      <div className="section-card" style={{ borderColor: '#f0a50033', marginBottom: 20, maxWidth: 560, marginLeft: 'auto', marginRight: 'auto' }}>
        <div className="section-title">🖨️ Generate Monthly Vehicle Report</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          <div className="field" style={{ flex: 2, minWidth: 160, marginBottom: 0 }}>
            <label className="label">Vehicle</label>
            <select className="select" value={vehicle} onChange={e => setVehicle(e.target.value)}>
              <option value="">Select vehicle...</option>
              {vehicles.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 110, marginBottom: 0 }}>
            <label className="label">Month</label>
            <select className="select" value={month} onChange={e => setMonth(parseInt(e.target.value))}>
              {MONTHS.map((mo, i) => <option key={mo} value={i}>{mo}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 80, marginBottom: 0 }}>
            <label className="label">Year</label>
            <select className="select" value={year} onChange={e => setYear(parseInt(e.target.value))}>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <button
          disabled={busy} onClick={generateReport}
          style={{
            width: '100%', padding: 14, background: 'var(--accent)', color: '#000', border: 'none',
            borderRadius: 10, fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 800,
            cursor: 'pointer', transition: 'opacity .2s,transform .1s', letterSpacing: '.3px',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? '⏳ Loading data...' : '⬇ Download Excel Report'}
        </button>
        <ToastEl />
      </div>

      {preview && (
        <div>
          <div className="section-card" style={{ borderColor: '#22c55e33', padding: 0, overflow: 'hidden' }}>
            <div style={{
              padding: '14px 18px', background: 'var(--surface)', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
            }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--accent)', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700 }}>Report Preview</div>
                <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{preview.vehicle} — {preview.monthLabel}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span style={badge('var(--green-dim)', 'var(--green)', '#22c55e44')}>Revenue {fmt(preview.totalRev)}</span>
                {CLIENT_CONFIG.map(c => (
                  <span key={c.key} style={badge(c.hex + '22', c.color, c.hex + '44')}>
                    {c.label} {fmt(preview.clientTotalsReport[c.key] || 0)}
                  </span>
                ))}
                <span style={badge('var(--red-dim)', 'var(--red)', '#ef444433')}>Expenses {fmt(preview.totalExp)}</span>
                <span style={badge(
                  preview.netProfit >= 0 ? 'var(--green-dim)' : 'var(--red-dim)',
                  preview.netProfit >= 0 ? 'var(--green)' : 'var(--red)',
                  preview.netProfit >= 0 ? '#22c55e44' : '#ef444433'
                )}>Net {fmt(preview.netProfit)}</span>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ ...th('left'), color: 'var(--muted)' }}>DATE</th>
                    <th style={{ ...th('right'), color: 'var(--green)' }}>REVENUE</th>
                    {CLIENT_CONFIG.map(c => (
                      <th key={c.key} style={{ ...th('right'), color: c.color }}>{c.label.toUpperCase()}</th>
                    ))}
                    <th style={{ ...th('right'), color: 'var(--red)' }}>EXPENSES</th>
                    <th style={{ ...th('left'), color: 'var(--muted)' }}>EXP DETAILS</th>
                    <th style={{ ...th('right'), color: '#06b6d4' }}>CASH OUT</th>
                    <th style={{ ...th('left'), color: 'var(--muted)' }}>CASH DETAILS</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map(r => (
                    <tr key={r.date}>
                      <td style={{ ...td, color: 'var(--accent)', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtD(r.date)}</td>
                      <td className="mono" style={{ ...td, color: 'var(--green)', fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }}>{r.totalRev ? fmtN(r.totalRev) : '-'}</td>
                      {CLIENT_CONFIG.map(c => (
                        <td key={c.key} className="mono" style={{ ...td, color: c.color, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {r[c.key] ? fmtN(r[c.key]) : '-'}
                        </td>
                      ))}
                      <td className="mono" style={{ ...td, color: 'var(--red)', fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }}>{r.totalExp ? fmtN(r.totalExp) : '-'}</td>
                      <td style={tdNote}>{[...new Set(r.expNotes)].join(', ')}</td>
                      <td className="mono" style={{ ...td, color: '#06b6d4', fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }}>{r.totalCash ? fmtN(r.totalCash) : '-'}</td>
                      <td style={tdNote}>{[...new Set(r.cashNotes)].join(', ')}</td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--surface)' }}>
                    <td style={{ padding: '9px 11px', borderTop: '2px solid var(--accent)', color: 'var(--accent)', fontWeight: 800, fontSize: 12 }}>TOTAL</td>
                    <td className="mono" style={{ padding: '9px 11px', borderTop: '2px solid var(--accent)', color: 'var(--green)', fontWeight: 800, textAlign: 'right' }}>{fmtN(preview.totalRev)}</td>
                    {CLIENT_CONFIG.map(c => (
                      <td key={c.key} className="mono" style={{ padding: '9px 11px', borderTop: '2px solid var(--accent)', color: c.color, fontWeight: 700, textAlign: 'right' }}>
                        {fmtN(preview.clientTotalsReport[c.key] || 0)}
                      </td>
                    ))}
                    <td className="mono" style={{ padding: '9px 11px', borderTop: '2px solid var(--accent)', color: 'var(--red)', fontWeight: 800, textAlign: 'right' }}>{fmtN(preview.totalExp)}</td>
                    <td style={{ padding: '9px 11px', borderTop: '2px solid var(--accent)', fontSize: 11, color: 'var(--muted)' }}>
                      Net: <span className="mono" style={{ color: preview.netProfit >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 800 }}>{fmtN(preview.netProfit)}</span>
                    </td>
                    <td className="mono" style={{ padding: '9px 11px', borderTop: '2px solid var(--accent)', color: '#06b6d4', fontWeight: 800, textAlign: 'right' }}>{fmtN(preview.totalCash)}</td>
                    <td style={{ padding: '9px 11px', borderTop: '2px solid var(--accent)' }} />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
