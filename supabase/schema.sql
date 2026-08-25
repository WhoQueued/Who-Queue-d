-- Run this in Supabase's SQL Editor (Project -> SQL Editor -> New query).
--
-- Two tables, deliberately split by sensitivity:
--
--   rooms          Public game state (players, queue, scores, round info).
--                  Readable and writable by the anon key, because every
--                  player's phone needs to read and update it directly for
--                  real-time sync.
--
--   room_secrets   The host's Spotify tokens and the playlist id. NEVER
--                  exposed to the anon key -- only touched by Next.js API
--                  routes using the service role key. This is what lets
--                  any player's phone trigger a real playlist write
--                  without ever seeing the host's Spotify credentials.

create table if not exists rooms (
  code text primary key,
  game_state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists room_secrets (
  code text primary key references rooms(code) on delete cascade,
  host_session jsonb not null,
  playlist_id text,
  updated_at timestamptz not null default now()
);

-- Row Level Security
alter table rooms enable row level security;
alter table room_secrets enable row level security;

-- rooms: open to the anon key (this app has no per-user accounts --
-- anyone with a room code can read/update that room's game state, same
-- trust model as a Kahoot/Jackbox-style room code).
create policy "rooms are readable by anyone with the code"
  on rooms for select
  using (true);

create policy "rooms are writable by anyone with the code"
  on rooms for insert
  with check (true);

create policy "rooms are updatable by anyone with the code"
  on rooms for update
  using (true);

-- room_secrets: NO policies for the anon key at all. Only the service
-- role key (used server-side only, in lib/supabaseAdmin.js) can read or
-- write this table -- the service role key bypasses RLS entirely, which
-- is exactly why it must never be sent to the browser.

-- Realtime: let Supabase broadcast changes to the rooms table so every
-- connected phone gets live updates.
alter publication supabase_realtime add table rooms;
