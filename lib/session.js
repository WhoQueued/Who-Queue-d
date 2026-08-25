import { refreshAccessToken } from './spotify';
import { appendCookie } from './cookies';

// The session cookie holds the host's tokens as base64-encoded JSON.
// It's httpOnly (never readable by client-side JS) but not encrypted --
// fine for a personal project you deploy and run yourself, not hardened
// for handling other people's Spotify credentials at scale.

export function readSession(req) {
  const raw = req.cookies.spotify_session;
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

// Returns a session with a valid (non-expired) access token, refreshing
// it first if needed. Returns null if there's no session at all.
export async function getValidAccessToken(req, res) {
  const session = readSession(req);
  if (!session) return null;

  if (Date.now() < session.expiresAt - 30000) {
    return session;
  }

  const refreshed = await refreshAccessToken(session.refreshToken);
  const updated = {
    ...session,
    accessToken: refreshed.access_token,
    expiresAt: Date.now() + refreshed.expires_in * 1000,
    refreshToken: refreshed.refresh_token || session.refreshToken,
  };

  appendCookie(
    res,
    `spotify_session=${Buffer.from(JSON.stringify(updated)).toString(
      'base64'
    )}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax`
  );

  return updated;
}
