import { useState } from 'react';
import { useFleet } from '../context/FleetContext';
import { MONTHS, YEARS, CLIENT_CONFIG } from '../lib/constants';
import { getRows, getAllRows } from '../lib/dataLayer';
import { fmt, sumByClient } from '../lib/helpers';
import { useToast } from '../components/Toast';

// ── Design intent ──────────────────────────────────────────────
// Nothing here is guessed or inferred by AI. Every line in the result
// (and in the WhatsApp message) is a plain sum or difference of your own
// recorded rows. "Reasons" shown are the actual client/vehicle/expense
// categories with the biggest S$ swing — not a narrative explanation.
// Two safeguards keep it from being misleading:
//   1. If the selected month is still in progress, both months are
//      compared over the SAME day-of-month range (day 1–18 vs day 1–18),
//      never a partial month against a full one.
//   2. It always reports how many distinct days actually have entries in
//      each period, and warns you if that count is lower than the
//      comparison period — a "dip" caused by missing data-entry days
//      looks identical to a real dip unless you're told to check.
// ─────────────────────────────────────────────────────────────

const now = new Date();

function prevMonthYear(month, year) {
  return month === 0 ? { pm: 11, py: year - 1 } : { pm: month - 1, py: year };
}

function pctStr(delta, prev) {
  if (!prev) return delta === 0 ? '—' : (delta > 0 ? 'new' : '—');
  const p = (delta / prev) * 100;
  return (p >= 0 ? '+' : '') + p.toFixed(1) + '%';
}

function arrow(v) { return v < 0 ? '🔻' : v > 0 ? '🔺' : '➖'; }

function buildWhatsAppText(r, vehicleLabel) {
  const earnDelta = r.totalEarnThis - r.totalEarnPrev;
  const expDelta = r.totalExpThis - r.totalExpPrev;
  const netDelta = r.netThis - r.netPrev;

  const lines = [];
  lines.push('📊 *Fleet P&L Comparison*');
  lines.push(`${vehicleLabel} — ${MONTHS[r.month]} ${r.year} vs ${MONTHS[r.pm]} ${r.py}`);
  if (r.cutoffDay) lines.push(`(${MONTHS[r.month]} is still in progress — comparing day 1–${r.cutoffDay} of both months, like-for-like)`);
  lines.push('');
  lines.push(`Earnings: ${fmt(r.totalEarnThis)} vs ${fmt(r.totalEarnPrev)}  ${arrow(earnDelta)} ${pctStr(earnDelta, r.totalEarnPrev)}`);
  lines.push(`Expenses: ${fmt(r.totalExpThis)} vs ${fmt(r.totalExpPrev)}  ${arrow(expDelta)} ${pctStr(expDelta, r.totalExpPrev)}`);
  lines.push(`Net Profit: ${fmt(r.netThis)} vs ${fmt(r.netPrev)}  ${arrow(netDelta)} ${pctStr(netDelta, r.netPrev)}`);

  const drops = r.clientDeltas.filter(c => c.delta < 0 && (c.this > 0 || c.prev > 0)).slice(0, 3);
  if (drops.length) {
    lines.push('');
    lines.push('📉 Biggest drop, by client (fact: recorded earnings only):');
    drops.forEach(c => lines.push(`- ${c.label}: down ${fmt(Math.abs(c.delta))}`));
  }

  const gains = [...r.clientDeltas].filter(c => c.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 3);
  if (gains.length) {
    lines.push('');
    lines.push('📈 Offsetting gains, by client:');
    gains.forEach(c => lines.push(`- ${c.label}: up ${fmt(c.delta)}`));
  }

  if (r.vehicleDeltas) {
    const vDrops = [...r.vehicleDeltas].filter(v => v.delta < 0).slice(0, 3);
    if (vDrops.length) {
      lines.push('');
      lines.push('🚛 Vehicles with lower earnings:');
      vDrops.forEach(v => lines.push(`- ${v.vehicle}: down ${fmt(Math.abs(v.delta))}`));
    }
  }

  const catUp = [...r.catDeltas].filter(c => c.delta > 0).slice(0, 3);
  if (catUp.length) {
    lines.push('');
    lines.push('⚠️ Expense categories that went up:');
    catUp.forEach(c => lines.push(`- ${c.cat}: up ${fmt(c.delta)}`));
  }

  lines.push('');
  lines.push(`🗓️ Days with entries: ${r.dThis} (this period) vs ${r.dPrev} (comparison period)`);
  if (r.dThis < r.dPrev) {
    lines.push('⚠️ Fewer days have entries logged in this period — the numbers above may reflect missing data entry, not an actual business dip. Please check before drawing conclusions.');
  }

  lines.push('');
  lines.push('_Auto-generated from recorded entries only — please verify before acting._');
  return lines.join('\n');
}

export default function CompareMonths() {
  const { vehicles } = useFleet();
  const [vehicleSel, setVehicleSel] = useState('');
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [ToastEl, showToast] = useToast();

  async function runCompare() {
    setLoading(true);
    try {
      const { pm, py } = prevMonthYear(month, year);
      const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
      const cutoffDay = isCurrentMonth ? now.getDate() : null;

      const fetchBoth = async table => vehicleSel
        ? Promise.all([getRows(table, vehicleSel, month, year), getRows(table, vehicleSel, pm, py)])
        : Promise.all([getAllRows(table, month, year), getAllRows(table, pm, py)]);

      const [[earnThis, earnPrev], [expThis, expPrev]] = await Promise.all([
        fetchBoth('earnings'), fetchBoth('expenses'),
      ]);

      const cut = rows => (cutoffDay ? rows.filter(r => parseInt(r.date.slice(8, 10), 10) <= cutoffDay) : rows);
      const eT = cut(earnThis), eP = cut(earnPrev), xT = cut(expThis), xP = cut(expPrev);

      const sum = rows => rows.reduce((s, r) => s + Number(r.amount), 0);
      const totalEarnThis = sum(eT), totalEarnPrev = sum(eP);
      const totalExpThis = sum(xT), totalExpPrev = sum(xP);
      const netThis = totalEarnThis - totalExpThis, netPrev = totalEarnPrev - totalExpPrev;

      const clientThis = sumByClient(eT), clientPrev = sumByClient(eP);
      const clientDeltas = CLIENT_CONFIG.map(c => ({
        key: c.key, label: c.label, color: c.color,
        this: clientThis[c.key] || 0, prev: clientPrev[c.key] || 0,
        delta: (clientThis[c.key] || 0) - (clientPrev[c.key] || 0),
      })).sort((a, b) => a.delta - b.delta);

      let vehicleDeltas = null;
      if (!vehicleSel) {
        const byVeh = rows => rows.reduce((acc, r) => { acc[r.vehicle] = (acc[r.vehicle] || 0) + Number(r.amount); return acc; }, {});
        const vT = byVeh(eT), vP = byVeh(eP);
        const vSet = new Set([...Object.keys(vT), ...Object.keys(vP)]);
        vehicleDeltas = [...vSet].map(v => ({ vehicle: v, this: vT[v] || 0, prev: vP[v] || 0, delta: (vT[v] || 0) - (vP[v] || 0) }))
          .sort((a, b) => a.delta - b.delta);
      }

      const byCat = rows => rows.reduce((acc, r) => { acc[r.expense_type] = (acc[r.expense_type] || 0) + Number(r.amount); return acc; }, {});
      const catT = byCat(xT), catP = byCat(xP);
      const catSet = new Set([...Object.keys(catT), ...Object.keys(catP)]);
      const catDeltas = [...catSet].map(c => ({ cat: c, this: catT[c] || 0, prev: catP[c] || 0, delta: (catT[c] || 0) - (catP[c] || 0) }))
        .sort((a, b) => b.delta - a.delta);

      const daysWithData = rows => new Set(rows.map(r => r.date)).size;
      const dThis = daysWithData([...eT, ...xT]);
      const dPrev = daysWithData([...eP, ...xP]);

      setResult({
        month, year, pm, py, cutoffDay,
        totalEarnThis, totalEarnPrev, totalExpThis, totalExpPrev, netThis, netPrev,
        clientDeltas, vehicleDeltas, catDeltas, dThis, dPrev,
      });
    } catch (e) {
      showToast('Error: ' + e.message, false);
    }
    setLoading(false);
  }

  const vehicleLabel = vehicleSel || 'All Vehicles (Fleet)';
  const waText = result ? buildWhatsAppText(result, vehicleLabel) : '';

  async function copyText() {
    try {
      await navigator.clipboard.writeText(waText);
      showToast('Copied — paste it into WhatsApp.', true);
    } catch {
      showToast('Could not copy — select and copy manually.', false);
    }
  }

  function sendWhatsApp() {
    window.open('https://wa.me/?text=' + encodeURIComponent(waText), '_blank');
  }

  const earnDelta = result ? result.totalEarnThis - result.totalEarnPrev : 0;
  const netDelta = result ? result.netThis - result.netPrev : 0;
  const isDip = result && (earnDelta < 0 || netDelta < 0);
  const isFlat = result && earnDelta === 0 && netDelta === 0;

  return (
    <div>
      <div className="section-card">
        <div className="section-title">📉 Compare Months — sums only, no guesswork</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}>
            <label className="label">Vehicle</label>
            <select className="select" value={vehicleSel} onChange={e => setVehicleSel(e.target.value)}>
              <option value="">All Vehicles (Fleet)</option>
              {vehicles.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 140, marginBottom: 0 }}>
            <label className="label">Month</label>
            <select className="select" value={month} onChange={e => setMonth(parseInt(e.target.value))}>
              {MONTHS.map((mo, i) => <option key={mo} value={i}>{mo}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 100, marginBottom: 0 }}>
            <label className="label">Year</label>
            <select className="select" value={year} onChange={e => setYear(parseInt(e.target.value))}>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
          Automatically compared against the month right before it.
        </div>
        <button className="stl-run-btn" disabled={loading} onClick={runCompare} style={{ marginTop: 14 }}>
          {loading ? 'Comparing...' : 'Compare →'}
        </button>
        <ToastEl />
      </div>

      {result && (
        <>
          <div className="section-card">
            <div className="section-title" style={{ marginBottom: 4 }}>
              {vehicleLabel} — {MONTHS[result.month]} {result.year} vs {MONTHS[result.pm]} {result.py}
            </div>
            {result.cutoffDay && (
              <div style={{ fontSize: 11, color: 'var(--accent)', marginBottom: 14 }}>
                {MONTHS[result.month]} is still in progress — comparing day 1–{result.cutoffDay} of both months, like-for-like.
              </div>
            )}

            <div style={{
              textAlign: 'center', padding: '16px 0', borderRadius: 12, marginBottom: 16,
              background: isDip ? 'var(--red-dim)' : isFlat ? 'var(--surface)' : 'var(--green-dim)',
              border: `1px solid ${isDip ? '#ef444444' : isFlat ? 'var(--border)' : '#22c55e44'}`,
            }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>
                {isDip ? 'Dip Detected' : isFlat ? 'No Change' : 'Growth'}
              </div>
              <div className="mono" style={{ fontSize: 24, fontWeight: 800, color: isDip ? 'var(--red)' : isFlat ? 'var(--text)' : 'var(--green)' }}>
                Earnings {arrow(earnDelta)} {pctStr(earnDelta, result.totalEarnPrev)}
              </div>
            </div>

            <div className="stat-row">
              <div className="stat-card">
                <div className="slabel">Earnings ({pctStr(earnDelta, result.totalEarnPrev)})</div>
                <div className="sval" style={{ color: 'var(--green)', fontSize: 16 }}>{fmt(result.totalEarnThis)}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>prev {fmt(result.totalEarnPrev)}</div>
              </div>
              <div className="stat-card">
                <div className="slabel">Expenses ({pctStr(result.totalExpThis - result.totalExpPrev, result.totalExpPrev)})</div>
                <div className="sval" style={{ color: 'var(--red)', fontSize: 16 }}>{fmt(result.totalExpThis)}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>prev {fmt(result.totalExpPrev)}</div>
              </div>
              <div className="stat-card">
                <div className="slabel">Net Profit ({pctStr(netDelta, result.netPrev)})</div>
                <div className="sval" style={{ color: netDelta < 0 ? 'var(--red)' : 'var(--green)', fontSize: 16 }}>{fmt(result.netThis)}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>prev {fmt(result.netPrev)}</div>
              </div>
            </div>
          </div>

          <div className="section-card">
            <div className="section-title">Where the change came from — by client</div>
            {result.clientDeltas.filter(c => c.this || c.prev).map(c => (
              <DeltaRow key={c.key} label={c.label} color={c.color} val={c.delta} thisV={c.this} prevV={c.prev} />
            ))}
          </div>

          {result.vehicleDeltas && (
            <div className="section-card">
              <div className="section-title">Where the change came from — by vehicle</div>
              {result.vehicleDeltas.map(v => (
                <DeltaRow key={v.vehicle} label={v.vehicle} color="var(--accent)" val={v.delta} thisV={v.this} prevV={v.prev} />
              ))}
            </div>
          )}

          <div className="section-card">
            <div className="section-title">Expense categories — biggest increases first</div>
            {result.catDeltas.filter(c => c.this || c.prev).map(c => (
              <DeltaRow key={c.cat} label={c.cat} color="var(--red)" val={c.delta} thisV={c.this} prevV={c.prev} invert />
            ))}
          </div>

          <div className="section-card">
            <div className="section-title">⚠️ Data completeness check</div>
            <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 6 }}>
              Days with at least one entry: <b>{result.dThis}</b> (this period) vs <b>{result.dPrev}</b> (comparison period)
            </div>
            {result.dThis < result.dPrev && (
              <div style={{ fontSize: 12, color: 'var(--red)', background: 'var(--red-dim)', border: '1px solid #ef444444', borderRadius: 8, padding: '8px 12px' }}>
                Fewer days have entries logged in this period. Part of any drop above could be missing data entry, not an actual business dip — check before concluding.
              </div>
            )}
            {result.dThis >= result.dPrev && (
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Entry coverage looks consistent between the two periods.</div>
            )}
          </div>

          <div className="section-card">
            <div className="section-title">💬 WhatsApp-ready summary</div>
            <textarea
              className="textarea" readOnly rows={14}
              style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, whiteSpace: 'pre-wrap' }}
              value={waText}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              <button className="btn-save" style={{ flex: 1, minWidth: 160, background: '#25D366', color: '#000' }} onClick={sendWhatsApp}>
                💬 Send via WhatsApp
              </button>
              <button className="btn-save" style={{ flex: 1, minWidth: 160, background: 'var(--surface)', color: 'var(--text)', border: '1.5px solid var(--input-border)' }} onClick={copyText}>
                📋 Copy Text
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DeltaRow({ label, color, val, thisV, prevV, invert }) {
  const good = invert ? val <= 0 : val >= 0;
  return (
    <div className="cmp-delta-row">
      <div className="cmp-delta-label">
        <span className="cmp-delta-dot" style={{ background: color }} />
        <span className="cmp-delta-name">{label}</span>
      </div>
      <div className="cmp-delta-values">
        <span className="cmp-delta-sub mono">{fmt(thisV)} <span style={{ opacity: .6 }}>(prev {fmt(prevV)})</span></span>
        <span className="cmp-delta-amt mono" style={{ color: good ? 'var(--green)' : 'var(--red)' }}>
          {val >= 0 ? '+' : '−'}{fmt(Math.abs(val))}
        </span>
      </div>
    </div>
  );
}
