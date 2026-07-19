// Bridge — Fleet section now shares the single top-level Supabase client
// (see src/lib/supabaseClient.js) instead of creating its own.
export { sb, SB_URL, SB_KEY, setSession, getSession, authToken } from '../../lib/supabaseClient';
