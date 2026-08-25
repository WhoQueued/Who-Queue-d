import { getValidHostSession, getPlaylistId, savePlaylistId } from '../../../lib/rooms';
import { getOrCreatePlaylist, addTrackToPlaylist } from '../../../lib/spotify';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const { roomCode, trackUri } = req.body || {};
  if (!roomCode || !trackUri) {
    res.status(400).json({ error: 'missing_fields' });
    return;
  }

  const session = await getValidHostSession(roomCode);
  if (!session) {
    res.status(401).json({ error: 'host_not_connected' });
    return;
  }

  try {
    let playlistId = await getPlaylistId(roomCode);

    if (!playlistId) {
      playlistId = await getOrCreatePlaylist({
        accessToken: session.accessToken,
        playlistName: "Who Queue'd?",
      });
      await savePlaylistId(roomCode, playlistId);
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
