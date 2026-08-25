# Who Queue'd?

A party whodunit for your playlist. One host connects Spotify; everyone
else searches the real catalog and secretly queues songs under their
name; the app shuffles playback order and runs the guessing/scoring game
while the actual music plays from a real Spotify playlist.

## How the pieces fit together

- **Only the host logs into Spotify.** That's the one account whose
  token can write to a playlist.
- **Search works for everyone, with no login**, using an app-level
  ("Client Credentials") token — that's what powers the live dropdown
  as each player types.
- When a player picks a track, it's added to a real playlist owned by
  the host, authenticated on the server using the host's stored token.

## 1. Local setup

```bash
npm install
cp .env.local.example .env.local
```

Fill in `.env.local` with values from your Spotify app (see below), then:

```bash
npm run dev
```

Open http://127.0.0.1:3000.

## 2. Create your Spotify app

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   and click **Create app**.
2. Add a Redirect URI: `http://127.0.0.1:3000/api/auth/callback` for
   local dev. Add your production URL too once you have it (you can
   register more than one).
3. Under APIs used, check **Web API**.
4. Save, then copy the **Client ID** and **Client Secret** from the
   app's Settings page into `.env.local`.

## 3. Environment variables

| Key | Value |
|---|---|
| `SPOTIFY_CLIENT_ID` | from the Spotify dashboard |
| `SPOTIFY_CLIENT_SECRET` | from the Spotify dashboard |
| `SPOTIFY_REDIRECT_URI` | must exactly match a URI registered in the dashboard — `http://127.0.0.1:3000/api/auth/callback` locally, `https://your-domain.vercel.app/api/auth/callback` in production |

## 4. Deploying to Vercel

1. Push this project to a GitHub repo.
2. Import the repo in Vercel (Next.js is auto-detected).
3. Add the same three environment variables in Vercel's Project
   Settings.
4. Deploy, then update `SPOTIFY_REDIRECT_URI` to your real
   `https://...vercel.app/api/auth/callback` URL — both in Vercel's env
   vars and in the Spotify dashboard's Redirect URIs — and redeploy.

## Playing a round

1. On the **Suspect Roster** screen, the host taps **Connect Spotify**
   and logs in once.
2. Add players.
3. The phone is passed around; each player searches for songs and taps
   to add them — they're logged locally under that player's name *and*
   written into a real "Who Queue'd?" playlist in the host's account.
4. Once everyone's queued songs, shuffle the real playlist, hit play on
   a speaker, and start the round in the app.
5. Each time a new track drops, guess who queue'd it in the app, reveal,
   score, repeat.

## Known limitations

- **Single host only.** One Spotify account owns the playlist for the
  whole game. This isn't built for multiple simultaneous games.
- **Cookies, not a database.** Session and playlist identity live in
  httpOnly cookies on the host's browser — simple and fine for a
  personal project, but not hardened for handling other people's
  credentials at scale.
- **One device, passed around.** This still uses the original
  "pass the phone" turn structure. Letting every guest use their own
  phone at once would need shared real-time state (e.g. Supabase or
  Firebase) — a bigger addition covered separately in the earlier
  roadmap.
- **New playlist per browser session.** The playlist ID is cached in a
  cookie the first time a track is added; clearing cookies or switching
  browsers starts a new playlist rather than reusing the old one.
