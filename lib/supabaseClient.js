import { createClient } from '@supabase/supabase-js';

// Safe to expose to the browser: the anon key can only do what the RLS
// policies in supabase/schema.sql allow (read/write the public `rooms`
// table -- it has no access to `room_secrets`).
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
