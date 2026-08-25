import { exchangeCodeForToken, getCurrentUser } from '../../../lib/spotify';
import { appendCookie } from '../../../lib/cookies';

export default async function handler(req, res) {
  const { code, state, error } = req.query;

  if (error) {
    res.redirect(`/?auth_error=${encodeURIComponent(error)}`);
    return;
  }

  const savedState = req.cookies.spotify_state;
  const codeVerifier = req.cookies.spotify_verifier;

  if (!state || state !== savedState || !codeVerifier) {
    res.redirect('/?auth_error=state_mismatch');
    return;
  }

  try {
    const tokenData = await exchangeCodeForToken({
      code,
      codeVerifier,
      redirectUri: process.env.SPOTIFY_REDIRECT_URI,
    });

    const user = await getCurrentUser(tokenData.access_token);

    const session = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
      userId: user.id,
      displayName: user.display_name || user.id,
    };

    appendCookie(
      res,
      `spotify_session=${Buffer.from(JSON.stringify(session)).toString(
        'base64'
      )}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax`
    );
    // Clean up the short-lived PKCE cookies now that we're done with them.
    appendCookie(res, 'spotify_verifier=; Path=/; Max-Age=0');
    appendCookie(res, 'spotify_state=; Path=/; Max-Age=0');

    res.redirect('/?connected=1');
  } catch (err) {
    console.error(err);
    res.redirect('/?auth_error=token_exchange_failed');
  }
}
