// ═══════════════════════════════════════════════
//  CLIENT CONFIG
// ═══════════════════════════════════════════════
export const CLIENT_CONFIG = [
  { key: 'KAIRA',       label: 'KAIRA',       keyword: 'KAIRA',       color: '#f59e0b', hex: '#f59e0b' },
  { key: 'JIT',         label: 'JIT',         keyword: 'JIT',         color: '#06b6d4', hex: '#06b6d4' },
  { key: 'LIVING_MENU', label: 'Living Menu', keyword: 'LIVING MENU', color: '#10b981', hex: '#10b981' },
  { key: 'SYRMATECH',   label: 'SYRMATECH',   keyword: 'SYRMATECH',   color: '#f0c911', hex: '#f0c911' },
  { key: 'DKSH',        label: 'DKSH',        keyword: 'DKSH',        color: '#c0c911', hex: '#c0c911' },
  { key: 'OTHER',       label: 'Others',      keyword: null,          color: '#a78bfa', hex: '#a78bfa' },
];

export const NAMED_CLIENTS = CLIENT_CONFIG.filter(c => c.keyword !== null);
export const OTHER_CLIENT  = CLIENT_CONFIG.find(c => c.key === 'OTHER');

// ═══════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════
export const MONTHS   = ['January','February','March','April','May','June','July','August','September','October','November','December'];
export const MONTHS_S = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const VCOLS    = ['#22c55e','#f59e0b','#06b6d4','#a78bfa','#f87171','#34d399'];
export const YEARS    = [2024, 2025, 2026, 2027, 2028, 2029, 2030];

export const EXPENSE_TYPES = [
  'Toll','Parking','Fuel','Vehicle FC/Registration','Medical','Other',
  'Vehicle Expenses','Helper Paid','CASH CARD','RENT','SALARY','INCENTIVE',
];

export const CASH_TYPES = ['Petty Cash','Cash Order','Advance Salary','LALAMOVE','Other'];

export const CASH_TYPE_STYLE = {
  'Petty Cash':     { color: 'var(--kaira)', bg: '#f59e0b22', border: '#f59e0b44' },
  'Cash Order':     { color: 'var(--other)', bg: '#a78bfa22', border: '#a78bfa44' },
  'Advance Salary': { color: 'var(--green)', bg: '#22c55e18', border: '#22c55e44' },
  'Other':          { color: '#06b6d4',      bg: '#06b6d422', border: '#06b6d444' },
};
export const cashStyle = type => CASH_TYPE_STYLE[type] || CASH_TYPE_STYLE['Other'];

// Settle Driver
export const STL_EXP_TYPES  = ['Toll','Parking','Fuel','Medical','CASH CARD','Other','Vehicle Expenses'];
export const STL_CASH_TYPES = ['Petty Cash','Cash Order','Advance Salary','Other','LALAMOVE','Personal cash'];

// Performance target per vehicle (Dashboard + Salary Calculator)
export const TARGET = 6500;
