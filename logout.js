import { appendCookie } from '../../../lib/cookies';

export default function handler(req, res) {
  appendCookie(res, 'spotify_session=; Path=/; Max-Age=0');
  appendCookie(res, 'whoqueued_playlist_id=; Path=/; Max-Age=0');
  res.redirect('/');
}
