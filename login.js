import crypto from 'crypto';
import { generateCodeVerifier, generateCodeChallenge } from '../../../lib/pkce';
import { appendCookie } from '../../../lib/cookies';

// Only these scopes: we're writing to playlists, nothing else.
const SCOPES = ['playlist-modify-private', 'playlist-modify-public'].join(' ');

export default function handler(req, res) {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = crypto.randomBytes(16).toString('hex');

  // Short-lived cookies just to survive the round trip to Spotify and back.
  appendCookie(
    res,
    `spotify_verifier=${codeVerifier}; HttpOnly; Path=/; Max-Age=600; SameSite=Lax`
  );
  appendCookie(res, `spotify_state=${state}; HttpOnly; Path=/; Max-Age=600; SameSite=Lax`);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.SPOTIFY_CLIENT_ID,
    scope: SCOPES,
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    state,
  });

  res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
}
