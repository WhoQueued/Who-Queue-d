import { getValidAccessToken } from '../../../lib/session';
import { getOrCreatePlaylist, addTrackToPlaylist } from '../../../lib/spotify';
import { appendCookie } from '../../../lib/cookies';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = await getValidAccessToken(req, res);
  if (!session) {
    res.status(401).json({ error: 'host_not_connected' });
    return;
  }

  const { trackUri } = req.body || {};
  if (!trackUri) {
    res.status(400).json({ error: 'missing_track_uri' });
    return;
  }

  try {
    // Reuse the same playlist for the whole game/night. It's created once
    // and its id is cached in a cookie (not in server memory -- serverless
    // functions don't reliably share memory between invocations).
    let playlistId = req.cookies.whoqueued_playlist_id;

    if (!playlistId) {
      playlistId = await getOrCreatePlaylist({
        accessToken: session.accessToken,
        userId: session.userId,
        playlistName: "Who Queue'd?",
      });
      appendCookie(
        res,
        `whoqueued_playlist_id=${playlistId}; Path=/; Max-Age=2592000; SameSite=Lax`
      );
    }

    await addTrackToPlaylist({
      accessToken: session.accessToken,
      playlistId,
      trackUri,
    });

    res.status(200).json({ ok: true, playlistId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'add_failed' });
  }
}
