# Who Queue'd?

A party whodunit for your playlist, playable from everyone's own phone.
One person hosts (connecting Spotify), everyone else joins with a room
code, and the app runs a live, shared game: search the real catalog,
secretly queue songs under your name, then guess who queue'd each track
as it plays.

## How the pieces fit together

- **Only the host logs into Spotify**, once, to create a room. Their
  tokens are stored server-side, keyed by room code -- not in a cookie on
  their phone. That's what lets *any* player's device trigger a real
  playlist write later, not just the host's.
- **Search needs no login at all** -- it uses an app-level ("Client
  Credentials") token, so the search dropdown works for everyone the
  moment they join.
- **Game state (players, queue, scores, round) lives in Supabase** and
  syncs live to every connected phone via Supabase's realtime feature --
  no one device is "in charge" of the UI; they're all just windows onto
  the same shared room.
- The Spotify tokens and Supabase's realtime state are deliberately kept
  in **separate tables with different access rules** -- see the security
  note below.

## 1. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. Open the SQL Editor and run everything in `supabase/schema.sql` from
   this project -- it creates the two tables, their security policies,
   and turns on realtime for the public one.
3. Go to Project Settings -> API and copy three values: the **Project
   URL**, the **anon public key**, and the **service_role key**.

## 2. Set up your Spotify app

Same as before:

1. [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) -> **Create app**.
2. Add a Redirect URI: `http://127.0.0.1:3000/api/auth/callback` locally,
   plus your real production URL once you have it.
3. Check **Web API** under APIs used.
4. Copy the **Client ID** and **Client Secret**.

## 3. Environment variables

```bash
npm install
cp .env.local.example .env.local
```

| Key | Value |
|---|---|
| `SPOTIFY_CLIENT_ID` | from the Spotify dashboard |
| `SPOTIFY_CLIENT_SECRET` | from the Spotify dashboard |
| `SPOTIFY_REDIRECT_URI` | must exactly match a URI registered in the Spotify dashboard |
| `NEXT_PUBLIC_SUPABASE_URL` | your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon public key (safe to expose -- see security note) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key -- **secret**, server-only, never `NEXT_PUBLIC_` |

Then:

```bash
npm run dev
```

Open http://127.0.0.1:3000.

## 4. Deploying to Vercel

1. Push to GitHub, import the repo in Vercel (Next.js auto-detected).
2. Add all six environment variables above in Vercel's Project Settings.
3. Deploy, then update `SPOTIFY_REDIRECT_URI` to your real
   `https://...vercel.app/api/auth/callback` -- both in Vercel's env vars
   and the Spotify dashboard's Redirect URIs -- and redeploy.

## Playing a round

1. The host opens the app and taps **Host a New Case**, which sends them
   through Spotify login once and lands them in a new room with a short
   code (like `7F3KX`).
2. Everyone else opens the app on their own phone, taps **Join a Case**,
   and enters that code plus their own name.
3. From here, every player's phone shows the same live lobby: everyone
   searches and adds their own songs whenever they want, no turns or
   passing a device around. Each pick lands in a real Spotify playlist
   immediately.
4. Once there are enough songs, anyone can tap **Shuffle & Start** --
   shuffle the real playlist too, and hit play on a speaker.
5. Each round, everyone who isn't the song's owner picks their guess from
   their own phone. Once everyone's answered, anyone can tap **Reveal**,
   and every phone updates with the result and new scores at once.

## Security note: why two Supabase tables

`room_secrets` (the host's Spotify tokens, the playlist id) has **no
Row Level Security policies for the public anon key at all** -- it can
only be read or written using the service role key, which lives only in
Vercel's server-side environment variables and inside `pages/api/**`
routes. `rooms` (players, queue, scores) is deliberately open to the anon
key, because every player's phone needs to read and write it directly for
real-time sync. If you ever add anything sensitive to a room, put it in
`room_secrets`, not `rooms`.

## Known limitations

- **Requires the host to have Spotify Premium**, per Spotify's February
  2026 Development Mode changes.
- **Up to 5 users on the Spotify app itself** -- a Spotify Developer
  Dashboard limit on new apps. This is separate from how many people can
  play the game; it only matters if you want more than a few different
  Spotify accounts able to *host* across different sessions.
- **Last-write-wins concurrency.** Each action re-reads the room's state
  right before writing, which shrinks the window for two people's
  changes colliding, but it isn't a database transaction. In practice,
  for a friend-group party game where actions land a second or more
  apart, this is fine; it's not built for a high-frequency multiplayer
  scenario.
- **Rooms aren't automatically cleaned up.** Old rooms just sit in your
  Supabase database. Fine at hobby scale (Supabase's free tier storage
  limit is generous relative to how small this data is), but there's no
  expiry logic if you want to tidy up later.
- **No moderation.** Anyone with a room code can join, rename the game
  settings, or trigger reveals -- there's no "only the host can do X"
  restriction. Reasonable for a private party with people you trust in
  the room; not something to hand out publicly.

## A note on Spotify API changes

Spotify migrated several Web API endpoints in February 2026 for apps in
Development Mode. Playlist creation moved from
`POST /users/{id}/playlists` to `POST /me/playlists`, and adding tracks
moved from `POST /playlists/{id}/tracks` to `POST /playlists/{id}/items`
-- this codebase already uses the current endpoints. If you start seeing
403s in the future, check Spotify's
[migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide)
for what moved.
