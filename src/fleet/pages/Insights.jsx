import { useEffect, useState, useCallback, useMemo } from 'react';
import { useFleet } from '../context/FleetContext';
import { CLIENT_CONFIG, MONTHS, YEARS } from '../lib/constants';
import { detectClient } from '../lib/clientDetect';
import { getAllRows, getRows } from '../lib/dataLayer';
import { fmt } from '../lib/helpers';
import { useToast } from '../components/Toast';

const now = new Date();

// ═══════════════════════════════════════════════
//  PURE HELPERS — every number here comes straight from a sum of
//  logged rows. Nothing is estimated or inferred.
// ═══════════════════════════════════════════════
function prevMonth(month, year) {
  return month === 0 ? { month: 11, year: year - 1 } : { month: month - 1, year };
}
const sum = rows => rows.reduce((s, r) => s + Number(r.amount), 0);
const arrow = d => (d > 0 ? '▲' : d < 0 ? '▼' : '→');
const pctChange = (prev, cur) => (prev ? ((cur - prev) / prev) * 100 : null); // null = no baseline, never fabricated

function signed(n) {
  const v = Math.abs(n).toFixed(2);
  return (n > 0 ? '+S$ ' : n < 0 ? '-S$ ' : 'S$ ') + Number(v).toLocaleString('en-SG', { minimumFractionDigits: 2 });
}

function buildClientMovements(curE, prevE) {
  return CLIENT_CONFIG.map(c => {
    const curRows = curE.filter(e => detectClient(e.note || '') === c.key);
    const prevRows = prevE.filter(e => detectClient(e.note || '') === c.key);
    const cur = sum(curRows), prev = sum(prevRows);
    return { key: c.key, label: c.label, color: c.color, cur, prev, delta: cur - prev, curCount: curRows.length, prevCount: prevRows.length };
  }).filter(m => m.cur !== 0 || m.prev !== 0);
}

function buildExpenseMovements(curX, prevX) {
  const types = new Set([...curX.map(e => e.expense_type || 'Other'), ...prevX.map(e => e.expense_type || 'Other')]);
  return [...types].map(t => {
    const curRows = curX.filter(e => (e.expense_type || 'Other') === t);
    const prevRows = prevX.filter(e => (e.expense_type || 'Other') === t);
    const cur = sum(curRows), prev = sum(prevRows);
    return { type: t, cur, prev, delta: cur - prev, curCount: curRows.length, prevCount: prevRows.length };
  }).filter(m => m.cur !== 0 || m.prev !== 0);
}

function buildVehicleMovements(curE, curX, prevE, prevX, vehicles) {
  return vehicles.map(v => {
    const ce = sum(curE.filter(e => e.vehicle === v)), cx = sum(curX.filter(e => e.vehicle === v));
    const pe = sum(prevE.filter(e => e.vehicle === v)), px = sum(prevX.filter(e => e.vehicle === v));
    const cn = ce - cx, pn = pe - px;
    return { v, ce, cx, cn, pe, px, pn, netDelta: cn - pn, earnDelta: ce - pe, expDelta: cx - px };
  });
}

// Deterministic, rule-based WhatsApp summary — states only what the
// numbers show (amount + job-count shift). No speculation about *why*
// a client sent fewer jobs, only *what* changed and by how much.
function buildWhatsAppMessage({ scopeLabel, monthLabel, prevLabel, curE, prevE, curX, prevX, clientMoves, expMoves, vehicleMoves, partial }) {
  const curNet = curE - curX, prevNet = prevE - prevX;
  const earnDelta = curE - prevE, expDelta = curX - prevX, netDelta = curNet - prevNet;

  const lines = [];
  lines.push(`*${scopeLabel} — ${monthLabel} vs ${prevLabel}*`);
  if (partial) lines.push(`⚠️ ${monthLabel} is still in progress — this is a partial-month comparison.`);
  lines.push('');
  lines.push(`Earnings: S$ ${curE.toFixed(2)} (prev S$ ${prevE.toFixed(2)}) ${arrow(earnDelta)} ${signed(earnDelta)}`);
  lines.push(`Expenses: S$ ${curX.toFixed(2)} (prev S$ ${prevX.toFixed(2)}) ${arrow(expDelta)} ${signed(expDelta)}`);
  lines.push(`Net Profit: S$ ${curNet.toFixed(2)} (prev S$ ${prevNet.toFixed(2)}) ${arrow(netDelta)} ${signed(netDelta)}`);
  lines.push('');

  if (netDelta < 0) {
    lines.push(`*Net profit dipped by ${signed(Math.abs(netDelta)).replace('+', '')}. Breakdown:*`);
    const drops = [...clientMoves].filter(m => m.delta < -1).sort((a, b) => a.delta - b.delta);
    const risesOffset = [...clientMoves].filter(m => m.delta > 1).sort((a, b) => b.delta - a.delta);
    const expUps = [...expMoves].filter(m => m.delta > 1).sort((a, b) => b.delta - a.delta);
    const expDowns = [...expMoves].filter(m => m.delta < -1).sort((a, b) => a.delta - b.delta);

    drops.slice(0, 3).forEach(m => {
      lines.push(`- ${m.label} earnings down ${signed(m.delta).replace('-', '-')} (${m.prevCount}→${m.curCount} jobs)`);
    });
    if (expUps.length) {
      expUps.slice(0, 3).forEach(m => {
        lines.push(`- ${m.type} expense up ${signed(m.delta)} (${m.prevCount}→${m.curCount} entries)`);
      });
    }
    if (risesOffset.length) {
      lines.push(`Partly offset by:`);
      risesOffset.slice(0, 2).forEach(m => lines.push(`- ${m.label} earnings up ${signed(m.delta)} (${m.prevCount}→${m.curCount} jobs)`));
    }
    if (expDowns.length) {
      expDowns.slice(0, 2).forEach(m => lines.push(`- ${m.type} expense down ${signed(m.delta)}`));
    }
    if (vehicleMoves && vehicleMoves.length > 1) {
      const worst = [...vehicleMoves].sort((a, b) => a.netDelta - b.netDelta)[0];
      if (worst && worst.netDelta < -1) {
        lines.push(`- Biggest single-vehicle drop: ${worst.v} net ${signed(worst.netDelta)}`);
      }
    }
    if (!drops.length && !expUps.length) {
      lines.push(`- No single client/expense category stands out — the drop is spread thinly across the month.`);
    }
  } else if (netDelta > 0) {
    lines.push(`Net profit improved vs last month — no dip to explain.`);
  } else {
    lines.push(`Net profit is flat vs last month.`);
  }

  lines.push('');
  lines.push(`_Auto-generated from logged entries — figures are exact sums, not estimates._`);
  return lines.join('\n');
}

export default function Insights() {
  const { vehicles } = useFleet();
  const [scope, setScope] = useState('ALL'); // 'ALL' or a vehicle number
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ToastEl, showToast] = useToast();

  const pm = prevMonth(month, year);
  const monthLabel = `${MONTHS[month]} ${year}`;
  const prevLabel = `${MONTHS[pm.month]} ${pm.year}`;
  const isPartialMonth = month === now.getMonth() && year === now.getFullYear();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const fetchers = scope === 'ALL'
        ? [getAllRows('earnings', month, year), getAllRows('expenses', month, year), getAllRows('earnings', pm.month, pm.year), getAllRows('expenses', pm.month, pm.year)]
        : [getRows('earnings', scope, month, year), getRows('expenses', scope, month, year), getRows('earnings', scope, pm.month, pm.year), getRows('expenses', scope, pm.month, pm.year)];
      const [curE, curX, prevE, prevX] = await Promise.all(fetchers);
      setData({ curE, curX, prevE, prevX });
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [scope, month, year]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const analysis = useMemo(() => {
    if (!data) return null;
    const { curE, curX, prevE, prevX } = data;
    const curEarn = sum(curE), curExp = sum(curX), prevEarn = sum(prevE), prevExp = sum(prevX);
    const curNet = curEarn - curExp, prevNet = prevEarn - prevExp;
    const clientMoves = buildClientMovements(curE, prevE).sort((a, b) => a.delta - b.delta);
    const expMoves = buildExpenseMovements(curX, prevX).sort((a, b) => b.delta - a.delta);
    const vehicleMoves = scope === 'ALL' ? buildVehicleMovements(curE, curX, prevE, prevX, vehicles).sort((a, b) => a.netDelta - b.netDelta) : null;
    const noBaseline = prevEarn === 0 && prevExp === 0 && (curEarn !== 0 || curExp !== 0);
    return { curEarn, curExp, curNet, prevEarn, prevExp, prevNet, clientMoves, expMoves, vehicleMoves, noBaseline };
  }, [data, scope, vehicles]);

  const scopeLabel = scope === 'ALL' ? 'Whole Fleet' : scope;
  const waMessage = useMemo(() => {
    if (!analysis) return '';
    return buildWhatsAppMessage({
      scopeLabel, monthLabel, prevLabel,
      curE: analysis.curEarn, prevE: analysis.prevEarn, curX: analysis.curExp, prevX: analysis.prevExp,
      clientMoves: analysis.clientMoves, expMoves: analysis.expMoves, vehicleMoves: analysis.vehicleMoves,
      partial: isPartialMonth,
    });
  }, [analysis, scopeLabel, monthLabel, prevLabel, isPartialMonth]);

  function copyMessage() {
    navigator.clipboard.writeText(waMessage)
      .then(() => showToast('Copied — paste it in WhatsApp', true))
      .catch(() => showToast('Could not copy — select and copy manually', false));
  }

  function shareWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(waMessage)}`, '_blank');
  }

  const Badge = ({ diff }) => {
    if (diff === null) return <span className="trend-badge t-fl">N/A — no prior data</span>;
    const rounded = diff.toFixed(1);
    return diff > 0
      ? <span className="trend-badge t-up">▲ {rounded}%</span>
      : diff < 0
        ? <span className="trend-badge t-dn">▼ {Math.abs(rounded)}%</span>
        : <span className="trend-badge t-fl">→ 0%</span>;
  };

  let body = null;
  if (loading) body = <div className="no-data">Loading...</div>;
  else if (error) body = <div className="no-data" style={{ color: 'var(--red)' }}>Error: {error}</div>;
  else if (analysis) {
    const { curEarn, curExp, curNet, prevEarn, prevExp, prevNet, clientMoves, expMoves, vehicleMoves, noBaseline } = analysis;
    const netDipping = curNet < prevNet;

    body = (
      <>
        {isPartialMonth && (
          <div className="section-card" style={{ borderColor: '#f0a50055', background: 'var(--red-dim)', marginBottom: 16 }}>
            <strong style={{ color: 'var(--accent)' }}>⚠️ {monthLabel} is still in progress.</strong>{' '}
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>
              Comparing a partial month against a completed {prevLabel} can look like a false dip just because fewer days have passed. Keep that in mind below.
            </span>
          </div>
        )}
        {noBaseline && (
          <div className="section-card" style={{ borderColor: '#f0a50055', marginBottom: 16 }}>
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>
              No entries found for {prevLabel} — there's no baseline to compare against, so % changes are shown as N/A rather than guessed.
            </span>
          </div>
        )}

        <div className="stat-row">
          <div className="stat-card" style={{ borderColor: '#22c55e33' }}>
            <div className="slabel">Earnings — {monthLabel}</div>
            <div className="sval" style={{ color: 'var(--green)' }}>{fmt(curEarn)}</div>
            <div className="ssub">prev {fmt(prevEarn)} <Badge diff={pctChange(prevEarn, curEarn)} /></div>
          </div>
          <div className="stat-card" style={{ borderColor: '#ef444433' }}>
            <div className="slabel">Expenses — {monthLabel}</div>
            <div className="sval" style={{ color: 'var(--red)' }}>{fmt(curExp)}</div>
            <div className="ssub">prev {fmt(prevExp)} <Badge diff={pctChange(prevExp, curExp)} /></div>
          </div>
          <div className="stat-card" style={{ borderColor: curNet >= 0 ? '#22c55e33' : '#ef444433' }}>
            <div className="slabel">Net Profit — {monthLabel}</div>
            <div className="sval" style={{ color: curNet >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(curNet)}</div>
            <div className="ssub">prev {fmt(prevNet)} <Badge diff={pctChange(prevNet, curNet)} /></div>
          </div>
        </div>

        <div className="section-card">
          <div className="section-title">
            {netDipping ? '📉 What drove the dip — by client' : '📈 Earnings movement — by client'}
          </div>
          <div className="dtable-wrap">
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>{prevLabel}</th>
                  <th>{monthLabel}</th>
                  <th>Change</th>
                  <th>Jobs (prev → cur)</th>
                </tr>
              </thead>
              <tbody>
                {clientMoves.length === 0 && <tr><td colSpan={5} className="no-data">No earnings entries in either month.</td></tr>}
                {clientMoves.map(m => (
                  <tr key={m.key}>
                    <td style={{ color: m.color, fontWeight: 700 }}>{m.label}</td>
                    <td className="mono">{fmt(m.prev)}</td>
                    <td className="mono">{fmt(m.cur)}</td>
                    <td className="mono" style={{ color: m.delta < 0 ? 'var(--red)' : m.delta > 0 ? 'var(--green)' : 'var(--muted)', fontWeight: 700 }}>
                      {arrow(m.delta)} {signed(m.delta)}
                    </td>
                    <td className="mono">{m.prevCount} → {m.curCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="section-card">
          <div className="section-title">💸 Expense movement — by type</div>
          <div className="dtable-wrap">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>{prevLabel}</th>
                  <th>{monthLabel}</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                {expMoves.length === 0 && <tr><td colSpan={4} className="no-data">No expense entries in either month.</td></tr>}
                {expMoves.map(m => (
                  <tr key={m.type}>
                    <td style={{ fontWeight: 700 }}>{m.type}</td>
                    <td className="mono">{fmt(m.prev)}</td>
                    <td className="mono">{fmt(m.cur)}</td>
                    <td className="mono" style={{ color: m.delta > 0 ? 'var(--red)' : m.delta < 0 ? 'var(--green)' : 'var(--muted)', fontWeight: 700 }}>
                      {arrow(m.delta)} {signed(m.delta)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {vehicleMoves && (
          <div className="section-card">
            <div className="section-title">🚛 Net profit movement — by vehicle</div>
            <div className="dtable-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>{prevLabel} Net</th>
                    <th>{monthLabel} Net</th>
                    <th>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicleMoves.map(m => (
                    <tr key={m.v}>
                      <td className="mono" style={{ color: 'var(--accent)', fontWeight: 700 }}>{m.v}</td>
                      <td className="mono">{fmt(m.pn)}</td>
                      <td className="mono">{fmt(m.cn)}</td>
                      <td className="mono" style={{ color: m.netDelta < 0 ? 'var(--red)' : m.netDelta > 0 ? 'var(--green)' : 'var(--muted)', fontWeight: 700 }}>
                        {arrow(m.netDelta)} {signed(m.netDelta)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="section-card" style={{ borderColor: '#25d36655' }}>
          <div className="section-title" style={{ color: '#25d366' }}>💬 WhatsApp-ready summary</div>
          <textarea
            readOnly
            value={waMessage}
            rows={12}
            style={{
              width: '100%', background: 'var(--input-bg)', border: '1.5px solid var(--input-border)',
              borderRadius: 8, color: 'var(--text)', padding: 12, fontFamily: "'JetBrains Mono',monospace",
              fontSize: 12.5, lineHeight: 1.5, resize: 'vertical', marginBottom: 12,
            }}
          />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={shareWhatsApp}
              style={{ flex: 1, minWidth: 160, padding: 12, background: '#25d366', color: '#04140c', border: 'none', borderRadius: 10, fontFamily: "'Syne',sans-serif", fontWeight: 800, cursor: 'pointer' }}
            >
              📲 Share on WhatsApp
            </button>
            <button
              onClick={copyMessage}
              style={{ flex: 1, minWidth: 160, padding: 12, background: 'transparent', color: 'var(--text)', border: '1.5px solid var(--border)', borderRadius: 10, fontFamily: "'Syne',sans-serif", fontWeight: 700, cursor: 'pointer' }}
            >
              📋 Copy Text
            </button>
          </div>
          <ToastEl style={{ marginTop: 10, position: 'static' }} />
        </div>
      </>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <select className="select" style={{ flex: 2, minWidth: 140 }} value={scope} onChange={e => setScope(e.target.value)}>
          <option value="ALL">Whole Fleet</option>
          {vehicles.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select className="select" style={{ flex: 1, minWidth: 110 }} value={month} onChange={e => setMonth(parseInt(e.target.value))}>
          {MONTHS.map((mo, i) => <option key={mo} value={i}>{mo}</option>)}
        </select>
        <select className="select" style={{ flex: 1, minWidth: 80 }} value={year} onChange={e => setYear(parseInt(e.target.value))}>
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 16 }}>
        Comparing <strong style={{ color: 'var(--text)' }}>{monthLabel}</strong> against the month right before it — <strong style={{ color: 'var(--text)' }}>{prevLabel}</strong>.
      </div>
      {body}
    </>
  );
}
