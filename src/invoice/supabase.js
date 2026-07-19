// Bridge — Invoicing section now shares the single top-level Supabase client
// (see src/lib/supabaseClient.js) instead of creating its own.
export { sb } from '../lib/supabaseClient';
