// ═══════════════════════════════════════════════
//  DATA LAYER — raw Supabase REST (same pattern as v1)
// ═══════════════════════════════════════════════
import { SB_URL, SB_KEY, authToken } from './supabaseClient';
import { pad, lastDay } from './helpers';

async function sbGet(path) {
  const r = await fetch(SB_URL + path, {
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + authToken() },
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function sbPost(path, body) {
  const r = await fetch(SB_URL + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SB_KEY,
      Authorization: 'Bearer ' + authToken(),
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function sbPatch(path, body) {
  const r = await fetch(SB_URL + path, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: SB_KEY,
      Authorization: 'Bearer ' + authToken(),
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function sbDelete(path) {
  const r = await fetch(SB_URL + path, {
    method: 'DELETE',
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + authToken() },
  });
  if (!r.ok) throw new Error(await r.text());
}

// ── Earnings / Expenses ──
export async function insertRow(table, row) {
  const rows = await sbPost(`/rest/v1/${table}`, row);
  return rows[0];
}

export async function getRows(table, vehicle, month, year) {
  const ym = `${year}-${pad(month + 1)}`;
  const last = lastDay(year, month);
  return sbGet(`/rest/v1/${table}?vehicle=eq.${encodeURIComponent(vehicle)}&date=gte.${ym}-01&date=lte.${ym}-${pad(last)}&order=date.asc`);
}

export async function getAllRows(table, month, year) {
  const ym = `${year}-${pad(month + 1)}`;
  const last = lastDay(year, month);
  return sbGet(`/rest/v1/${table}?date=gte.${ym}-01&date=lte.${ym}-${pad(last)}`);
}

export async function getYear(table, year) {
  return sbGet(`/rest/v1/${table}?date=gte.${year}-01-01&date=lte.${year}-12-31&order=date.asc`);
}

// Fetch rows across an open-ended date range (no month boundary) —
// used by the Cash Meter, where a driver's balance can span many months.
// from/to are optional 'YYYY-MM-DD' strings; omit either for an open end.
export async function getRowsRange(table, from, to) {
  let url = `/rest/v1/${table}?order=date.asc`;
  if (from) url += `&date=gte.${from}`;
  if (to) url += `&date=lte.${to}`;
  return sbGet(url);
}

export async function getCashRowsRange(from, to) {
  let url = `/rest/v1/cash_on_hand?order=date.asc`;
  if (from) url += `&date=gte.${from}`;
  if (to) url += `&date=lte.${to}`;
  return sbGet(url);
}

export async function updateEntry(table, id, body) {
  return sbPatch(`/rest/v1/${table}?id=eq.${id}`, body);
}

export async function deleteEntry(table, id) {
  return sbDelete(`/rest/v1/${table}?id=eq.${id}`);
}

// ── Cash on Hand ──
export async function getCashRows(month, year, vehicle = '') {
  const ym = `${year}-${pad(month + 1)}`;
  const last = lastDay(year, month);
  let url = `/rest/v1/cash_on_hand?date=gte.${ym}-01&date=lte.${ym}-${pad(last)}&order=date.desc,created_at.desc`;
  if (vehicle) url += `&vehicle=eq.${encodeURIComponent(vehicle)}`;
  return sbGet(url);
}

export async function insertCash(row) {
  const rows = await sbPost(`/rest/v1/cash_on_hand`, row);
  return rows[0];
}

export async function updateCash(id, body) {
  return sbPatch(`/rest/v1/cash_on_hand?id=eq.${id}`, body);
}

export async function deleteCash(id) {
  return sbDelete(`/rest/v1/cash_on_hand?id=eq.${id}`);
}

// ── Trip Details ──
export async function getTripRows(vehicle, month, year) {
  const ym = `${year}-${pad(month + 1)}`;
  const last = lastDay(year, month);
  return sbGet(`/rest/v1/tripdetails?vehicle=eq.${encodeURIComponent(vehicle)}&date=gte.${ym}-01&date=lte.${ym}-${pad(last)}&order=date.desc`);
}

export async function insertTripRow(row) {
  const rows = await sbPost(`/rest/v1/tripdetails`, row);
  return rows[0];
}

export async function deleteTripRow(id) {
  return sbDelete(`/rest/v1/tripdetails?id=eq.${id}`);
}

// ── Vehicles ──
export async function getActiveVehicles() {
  return sbGet('/rest/v1/vehicles?active=eq.true&order=created_at.asc');
}

export async function getAllVehicles() {
  return sbGet('/rest/v1/vehicles?order=created_at.asc');
}

export async function insertVehicle(row) {
  return sbPost('/rest/v1/vehicles', row);
}

export async function updateVehicle(id, body) {
  return sbPatch('/rest/v1/vehicles?id=eq.' + id, body);
}

export async function deleteVehicleRow(id) {
  return sbDelete('/rest/v1/vehicles?id=eq.' + id);
}
