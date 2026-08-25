import { searchTracks } from '../../lib/spotify';

export default async function handler(req, res) {
  const q = (req.query.q || '').trim();

  if (!q) {
    res.status(200).json({ tracks: [] });
    return;
  }

  try {
    const tracks = await searchTracks(q, 8);
    res.status(200).json({ tracks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'search_failed' });
  }
}
