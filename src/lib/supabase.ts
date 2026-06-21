import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Surfaces clearly in the build/console rather than failing silently on every query.
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Set both in Netlify env vars.');
}

// The anon key is public-safe (RLS is the real gate). Both values still live in
// env vars by convention, never in the repo.
export const supabase = createClient(url, anonKey);
