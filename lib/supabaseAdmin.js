import { createClient } from '@supabase/supabase-js';

// SERVER-ONLY. The service role key bypasses Row Level Security entirely,
// which is what lets it read/write `room_secrets` (host Spotify tokens).
// It must only ever be used inside pages/api/** routes -- never imported
// into a component that ships to the browser, and SUPABASE_SERVICE_ROLE_KEY
// must NOT have the NEXT_PUBLIC_ prefix in .env.local / Vercel.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
