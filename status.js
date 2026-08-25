import { readSession } from '../../../lib/session';

export default function handler(req, res) {
  const session = readSession(req);
  if (!session) {
    res.status(200).json({ connected: false });
    return;
  }
  res.status(200).json({ connected: true, displayName: session.displayName });
}
