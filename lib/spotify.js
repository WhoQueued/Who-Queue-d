const SPOTIFY_ACCOUNTS = 'https://accounts.spotify.com';
const SPOTIFY_API = 'https://api.spotify.com/v1';

// --- Auth: PKCE code exchange (host login) ---

export async function exchangeCodeForToken({ code, codeVerifier, redirectUri }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: process.env.SPOTIFY_CLIENT_ID,
    code_verifier: codeVerifier,
  });

  const res = await fetch(`${SPOTIFY_ACCOUNTS}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  return res.json();
}

export async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: process.env.SPOTIFY_CLIENT_ID,
  });

  const res = await fetch(`${SPOTIFY_ACCOUNTS}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  return res.json();
}

// --- Auth: Client Credentials (app-only, powers search with no user login) ---

let clientCredentialsCache = { token: null, expiresAt: 0 };

export async function getClientCredentialsToken() {
  if (clientCredentialsCache.token && Date.now() < clientCredentialsCache.expiresAt) {
    return clientCredentialsCache.token;
  }

  const body = new URLSearchParams({ grant_type: 'client_credentials' });
  const basic = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch(`${SPOTIFY_ACCOUNTS}/api/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    body,
  });

  if (!res.ok) throw new Error(`Client credentials failed: ${res.status}`);
  const data = await res.json();

  // Cache in memory for the life of this serverless instance; re-fetched
  // on cold starts or once it's within 60s of expiring.
  clientCredentialsCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };

  return data.access_token;
}

// --- Catalog search (no user login required) ---

export async function searchTracks(query, limit = 8) {
  const token = await getClientCredentialsToken();
  const url = `${SPOTIFY_API}/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);

  const data = await res.json();
  return data.tracks.items.map((t) => ({
    id: t.id,
    uri: t.uri,
    title: t.name,
    artist: t.artists.map((a) => a.name).join(', '),
    album: t.album.name,
    image:
      (t.album.images[2] || t.album.images[t.album.images.length - 1] || t.album.images[0] || {})
        .url || null,
  }));
}

// --- Playlist writes (require the host's authenticated access token) ---

// NOTE: Spotify's February 2026 Web API migration removed the old
// POST /users/{id}/playlists and POST /playlists/{id}/tracks endpoints for
// Development Mode apps. These now use their replacements: /me/playlists
// and /playlists/{id}/items. See:
// https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide
export async function getOrCreatePlaylist({ accessToken, playlistName }) {
  const res = await fetch(`${SPOTIFY_API}/me/playlists`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: playlistName || "Who Queue'd?",
      description: "Party queue for Who Queue'd? \u2014 who added what?",
      public: false,
    }),
  });

  if (!res.ok) throw new Error(`Create playlist failed: ${res.status}`);
  const data = await res.json();
  return data.id;
}

export async function addTrackToPlaylist({ accessToken, playlistId, trackUri }) {
  const res = await fetch(`${SPOTIFY_API}/playlists/${playlistId}/items`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ uris: [trackUri] }),
  });

  if (!res.ok) throw new Error(`Add track failed: ${res.status}`);
  return res.json();
}

export async function getCurrentUser(accessToken) {
  const res = await fetch(`${SPOTIFY_API}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Get user failed: ${res.status}`);
  return res.json();
}
