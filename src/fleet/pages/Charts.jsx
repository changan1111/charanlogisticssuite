import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import Chart from 'chart.js/auto';
import { useFleet } from '../context/FleetContext';
import { CLIENT_CONFIG, MONTHS, MONTHS_S, VCOLS, YEARS } from '../lib/constants';
import { detectClient } from '../lib/clientDetect';
import { getYear } from '../lib/dataLayer';
import { fmt, fmtK } from '../lib/helpers';

const now = new Date();

// Shared Chart.js options (same as v1 `CD`)
const CD = {
  responsive: true,
  maintainAspectRatio: true,
  plugins: {
    legend: { labels: { color: '#e4e4f0', font: { family: "'Syne',sans-serif", size: 11 }, boxWidth: 12, padding: 14 } },
    tooltip: {
      backgroundColor: '#14141e', borderColor: '#1f1f2e', borderWidth: 1,
      titleColor: '#f0a500', bodyColor: '#e4e4f0', padding: 10,
      titleFont: { family: "'Syne',sans-serif", weight: 'bold', size: 12 },
      bodyFont: { family: "'JetBrains Mono',monospace", size: 11 },
      callbacks: { label: ctx => ' ' + fmtK(ctx.raw) },
    },
  },
  scales: {
    x: { ticks: { color: '#52526a', font: { family: "'Syne',sans-serif", size: 10 } }, grid: { color: '#1f1f2e' } },
    y: { ticks: { color: '#52526a', font: { family: "'JetBrains Mono',monospace", size: 10 }, callback: v => fmtK(v) }, grid: { color: '#1f1f2e' } },
  },
};

// Mounts a Chart.js chart on a canvas, destroys on unmount / config change
function ChartCanvas({ config }) {
  const ref = useRef(null);
  useEffect(() => {
    const chart = new Chart(ref.current, config);
    return () => chart.destroy();
  }, [config]);
  return <canvas ref={ref} />;
}

export default function Charts() {
  const { vehicles } = useFleet();
  const [year, setYear] = useState(now.getFullYear());
  const [view, setView] = useState('individual');
  const [activeVehicle, setActiveVehicle] = useState(null);
  const [md, setMd] = useState(null); // vehicle -> 12 x {earn,exp,net,<clientKey>...}
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadCharts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [yearE, yearX] = await Promise.all([getYear('earnings', year), getYear('expenses', year)]);
      const m = {};
      vehicles.forEach(v => {
        m[v] = Array.from({ length: 12 }, () => {
          const d = { earn: 0, exp: 0, net: 0 };
          CLIENT_CONFIG.forEach(c => (d[c.key] = 0));
          return d;
        });
      });
      yearE.forEach(e => {
        const mi = parseInt(e.date.split('-')[1]) - 1;
        if (!m[e.vehicle]) return;
        const cKey = detectClient(e.note);
        const a = Number(e.amount);
        m[e.vehicle][mi].earn += a;
        m[e.vehicle][mi][cKey] = (m[e.vehicle][mi][cKey] || 0) + a;
      });
      yearX.forEach(e => {
        const mi = parseInt(e.date.split('-')[1]) - 1;
        if (!m[e.vehicle]) return;
        m[e.vehicle][mi].exp += Number(e.amount);
      });
      vehicles.forEach(v => { for (let i = 0; i < 12; i++) m[v][i].net = m[v][i].earn - m[v][i].exp; });
      setMd(m);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [year, vehicles]);

  useEffect(() => { loadCharts(); }, [loadCharts]);

  // Keep activeVehicle valid
  useEffect(() => {
    if (!activeVehicle || !vehicles.includes(activeVehicle)) setActiveVehicle(vehicles[0] || null);
  }, [vehicles, activeVehicle]);

  const content = useMemo(() => {
    if (loading) return <div className="no-data">Loading data...</div>;
    if (error) return <div className="no-data" style={{ color: 'var(--red)' }}>Error: {error}</div>;
    if (!md) return <div className="no-data">Select a view to load charts</div>;

    if (view === 'individual') {
      if (!activeVehicle || !md[activeVehicle]) return <div className="no-data">No vehicle data.</div>;
      return <IndividualView vehicle={activeVehicle} year={year} data={md[activeVehicle]} />;
    }
    if (view === 'compare') return <CompareView year={year} md={md} vehicles={vehicles} />;
    return <ClientTrendView year={year} md={md} vehicles={vehicles} />;
  }, [loading, error, md, view, activeVehicle, year, vehicles]);

  return (
    <>
      <div className="chart-controls">
        <div className="field">
          <label className="label">Year</label>
          <select className="select" value={year} onChange={e => setYear(parseInt(e.target.value))}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="label">View Mode</label>
          <select className="select" value={view} onChange={e => setView(e.target.value)}>
            <option value="individual">Per Vehicle — Month-wise</option>
            <option value="compare">Compare All Vehicles</option>
            <option value="clients">Client Earnings Trend</option>
          </select>
        </div>
      </div>

      {view === 'individual' && (
        <div className="v-tab-strip">
          {vehicles.map(v => (
            <button
              key={v}
              className={'v-tab' + (v === activeVehicle ? ' active' : '')}
              onClick={() => setActiveVehicle(v)}
            >{v}</button>
          ))}
        </div>
      )}

      <div>{content}</div>
    </>
  );
}

function IndividualView({ vehicle, year, data }) {
  const nowM = new Date().getMonth();
  const pe = data[nowM > 0 ? nowM - 1 : 0].earn, ce = data[nowM].earn;
  const pn = data[nowM > 0 ? nowM - 1 : 0].net, cn = data[nowM].net;
  const pctChg = (prev, curr) => (prev > 0 ? (((curr - prev) / prev) * 100).toFixed(1) : null);
  const Badge = ({ diff, lbl }) => {
    if (diff === null) return <span className="trend-badge t-fl">— N/A</span>;
    return diff > 0
      ? <span className="trend-badge t-up">▲ {diff}% {lbl}</span>
      : <span className="trend-badge t-dn">▼ {Math.abs(diff)}% {lbl}</span>;
  };
  const ytdE = data.reduce((s, d) => s + d.earn, 0);
  const ytdX = data.reduce((s, d) => s + d.exp, 0);
  const ytdN = data.reduce((s, d) => s + d.net, 0);
  const bestM = data.reduce((b, d, i) => (d.earn > data[b].earn ? i : b), 0);

  const eeConfig = useMemo(() => ({
    type: 'bar',
    data: {
      labels: MONTHS_S,
      datasets: [
        { label: 'Earnings', data: data.map(d => d.earn), backgroundColor: '#22c55e55', borderColor: '#22c55e', borderWidth: 1.5, borderRadius: 4 },
        { label: 'Expenses', data: data.map(d => d.exp), backgroundColor: '#ef444455', borderColor: '#ef4444', borderWidth: 1.5, borderRadius: 4 },
      ],
    },
    options: { ...CD },
  }), [data]);

  const netConfig = useMemo(() => ({
    type: 'line',
    data: {
      labels: MONTHS_S,
      datasets: [{
        label: 'Net Profit', data: data.map(d => d.net), borderColor: '#f0a500', backgroundColor: '#f0a50020',
        pointBackgroundColor: data.map(d => (d.net >= 0 ? '#22c55e' : '#ef4444')), pointBorderColor: '#09090d',
        pointRadius: 5, tension: 0.35, fill: true, borderWidth: 2,
      }],
    },
    options: { ...CD },
  }), [data]);

  const cliConfig = useMemo(() => ({
    type: 'bar',
    data: {
      labels: MONTHS_S,
      datasets: CLIENT_CONFIG.map(c => ({
        label: c.label, data: data.map(d => d[c.key] || 0),
        backgroundColor: c.hex + '99', borderColor: c.hex, borderWidth: 1, borderRadius: 2,
      })),
    },
    options: { ...CD, scales: { x: { ...CD.scales.x, stacked: true }, y: { ...CD.scales.y, stacked: true } } },
  }), [data]);

  return (
    <>
      <div className="stat-row">
        <div className="stat-card" style={{ borderColor: '#22c55e33' }}>
          <div className="slabel">YTD Earnings</div>
          <div className="sval" style={{ color: 'var(--green)' }}>{fmtK(ytdE)}</div>
          <div className="ssub"><Badge diff={pctChg(pe, ce)} lbl="vs prev month" /></div>
        </div>
        <div className="stat-card" style={{ borderColor: '#ef444433' }}>
          <div className="slabel">YTD Expenses</div>
          <div className="sval" style={{ color: 'var(--red)' }}>{fmtK(ytdX)}</div>
        </div>
        <div className="stat-card" style={{ borderColor: ytdN >= 0 ? '#22c55e33' : '#ef444433' }}>
          <div className="slabel">YTD Net Profit</div>
          <div className="sval" style={{ color: ytdN >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtK(ytdN)}</div>
          <div className="ssub"><Badge diff={pctChg(pn, cn)} lbl="vs prev month" /></div>
        </div>
        <div className="stat-card" style={{ borderColor: 'var(--accent)33' }}>
          <div className="slabel">Best Month</div>
          <div className="sval" style={{ color: 'var(--accent)', fontSize: 16 }}>{MONTHS_S[bestM]}</div>
          <div className="ssub">{fmtK(data[bestM].earn)}</div>
        </div>
      </div>
      <div className="chart-wrap">
        <div className="chart-title">Earnings vs Expenses — {vehicle} · {year}</div>
        <ChartCanvas config={eeConfig} />
      </div>
      <div className="chart-wrap">
        <div className="chart-title">Net Profit Trend — {vehicle} · {year}</div>
        <ChartCanvas config={netConfig} />
      </div>
      <div className="chart-wrap">
        <div className="chart-title">Client Earnings Breakdown — {vehicle} · {year}</div>
        <ChartCanvas config={cliConfig} />
      </div>
    </>
  );
}

function CompareView({ year, md, vehicles }) {
  const totals = useMemo(() => vehicles.map((v, i) => {
    const t = { v, col: VCOLS[i % VCOLS.length], earn: 0, exp: 0, net: 0 };
    CLIENT_CONFIG.forEach(c => (t[c.key] = 0));
    md[v].forEach(d => {
      t.earn += d.earn; t.exp += d.exp; t.net += d.net;
      CLIENT_CONFIG.forEach(c => (t[c.key] += d[c.key] || 0));
    });
    return t;
  }), [md, vehicles]);

  const earnConfig = useMemo(() => ({
    type: 'bar',
    data: {
      labels: totals.map(t => t.v),
      datasets: [{
        label: 'Total Earnings', data: totals.map(t => t.earn),
        backgroundColor: VCOLS.map(c => c + '88'), borderColor: VCOLS, borderWidth: 1.5, borderRadius: 6,
      }],
    },
    options: { ...CD },
  }), [totals]);

  const netConfig = useMemo(() => ({
    type: 'bar',
    data: {
      labels: totals.map(t => t.v),
      datasets: [{
        label: 'Net Profit', data: totals.map(t => t.net),
        backgroundColor: totals.map(t => (t.net >= 0 ? '#22c55e88' : '#ef444488')),
        borderColor: totals.map(t => (t.net >= 0 ? '#22c55e' : '#ef4444')),
        borderWidth: 1.5, borderRadius: 6,
      }],
    },
    options: { ...CD },
  }), [totals]);

  const linesConfig = useMemo(() => ({
    type: 'line',
    data: {
      labels: MONTHS_S,
      datasets: vehicles.map((v, i) => ({
        label: v, data: md[v].map(d => d.earn),
        borderColor: VCOLS[i % VCOLS.length], backgroundColor: 'transparent',
        pointBackgroundColor: VCOLS[i % VCOLS.length], pointRadius: 3, tension: 0.35, borderWidth: 2,
      })),
    },
    options: { ...CD },
  }), [md, vehicles]);

  return (
    <>
      <div className="chart-wrap">
        <div className="chart-title">Earnings Comparison — All Vehicles · {year}</div>
        <ChartCanvas config={earnConfig} />
      </div>
      <div className="chart-wrap">
        <div className="chart-title">Net Profit Comparison — All Vehicles · {year}</div>
        <ChartCanvas config={netConfig} />
      </div>
      <div className="chart-wrap">
        <div className="chart-title">Month-wise Earnings Trend</div>
        <ChartCanvas config={linesConfig} />
      </div>
    </>
  );
}

function ClientTrendView({ year, md, vehicles }) {
  const config = useMemo(() => {
    const fleetByClient = {};
    CLIENT_CONFIG.forEach(c => (fleetByClient[c.key] = Array(12).fill(0)));
    vehicles.forEach(v => {
      for (let m = 0; m < 12; m++) {
        CLIENT_CONFIG.forEach(c => { fleetByClient[c.key][m] += md[v][m][c.key] || 0; });
      }
    });
    return {
      type: 'line',
      data: {
        labels: MONTHS_S,
        datasets: CLIENT_CONFIG.map(c => ({
          label: c.label, data: fleetByClient[c.key],
          borderColor: c.hex, backgroundColor: c.hex + '28', fill: true, tension: 0.4, borderWidth: 2,
        })),
      },
      options: { ...CD },
    };
  }, [md, vehicles]);

  return (
    <div className="chart-wrap">
      <div className="chart-title">Fleet Client Earnings Trend — {year}</div>
      <ChartCanvas config={config} />
    </div>
  );
}
