import { CLIENT_CONFIG } from './constants';
import { detectClient } from './clientDetect';

// ═══════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════
export const pad      = n => String(n).padStart(2, '0');
export const fmt      = n => 'S$ ' + Number(n || 0).toLocaleString('en-SG', { minimumFractionDigits: 2 });
export const fmtK     = n => n >= 100000 ? 'S$ ' + (n / 100000).toFixed(1) + 'L' : n >= 1000 ? 'S$ ' + (n / 1000).toFixed(1) + 'K' : 'S$ ' + n;
export const todayStr = () => new Date().toISOString().slice(0, 10);
export const lastDay  = (year, month) => new Date(year, month + 1, 0).getDate();

// Report formatters
export const fmtN  = v => v ? Number(v).toLocaleString('en-SG', { minimumFractionDigits: 2 }) : '-';
export const fmtD  = d => new Date(d + 'T00:00:00').toLocaleDateString('en-SG', { day: '2-digit', month: 'short' });
export const fmtDL = d => new Date(d + 'T00:00:00').toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' });

export function sumByClient(earningRows) {
  const result = {};
  CLIENT_CONFIG.forEach(c => (result[c.key] = 0));
  earningRows.forEach(e => {
    const key = detectClient(e.note || '');
    result[key] = (result[key] || 0) + Number(e.amount);
  });
  return result;
}
