// ═══════════════════════════════════════════════
//  SHARED SUPABASE CLIENT
//  One client, one session, used by BOTH the Fleet section
//  (raw REST calls via authToken()) and the Invoicing section
//  (supabase-js query builder via `sb`).
//  Credentials injected at build time (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
// ═══════════════════════════════════════════════
import { createClient } from '@supabase/supabase-js';

export const SB_URL = import.meta.env.VITE_SUPABASE_URL;
export const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const sb = createClient(SB_URL, SB_KEY);

// Session is held here so the Fleet section's raw REST data layer
// can use the user's access_token instead of the anon key.
let _session = null;
export function setSession(s) { _session = s; }
export function getSession() { return _session; }
export function authToken() { return _session?.access_token || SB_KEY; }
