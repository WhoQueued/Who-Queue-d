import { supabaseAdmin } from './supabaseAdmin';
import { refreshAccessToken } from './spotify';

// Excludes visually ambiguous characters (0/O, 1/I).
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomCode(length = 5) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
}

export function defaultGameState() {
  return {
    screen: 'lobby', // 'lobby' | 'round' | 'end'
    players: [],
    queue: [],
    settings: { correctPts: 1, forfeitPts: 1, skipSelf: true },
    order: [],
    roundIndex: 0,
    guesses: {},
    revealed: false,
  };
}

// Creates a room with a unique code, storing the host's Spotify tokens
// server-side in room_secrets (never sent to any browser) and public game
// state in rooms (synced live to every player's device).
export async function createRoom({ hostSession }) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();

    const { error: roomError } = await supabaseAdmin.from('rooms').insert({
      code,
      game_state: defaultGameState(),
    });

    // Primary key collision -- extremely unlikely with a 5-char code, but
    // just try again with a new one rather than fail the whole request.
    if (roomError) {
      if (roomError.code === '23505') continue;
      throw new Error(`Failed to create room: ${roomError.message}`);
    }

    const { error: secretError } = await supabaseAdmin.from('room_secrets').insert({
      code,
      host_session: hostSession,
    });
    if (secretError) throw new Error(`Failed to store host session: ${secretError.message}`);

    return code;
  }

  throw new Error('Could not generate a unique room code, please try again.');
}

// Returns a valid (non-expired) host access token for a room, refreshing
// and persisting it first if needed. Returns null if the room has no host
// session at all (shouldn't normally happen -- every room is created with
// one).
export async function getValidHostSession(code) {
  const { data, error } = await supabaseAdmin
    .from('room_secrets')
    .select('host_session')
    .eq('code', code)
    .single();

  if (error || !data) return null;
  const session = data.host_session;
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

  await supabaseAdmin
    .from('room_secrets')
    .update({ host_session: updated, updated_at: new Date().toISOString() })
    .eq('code', code);

  return updated;
}

export async function getPlaylistId(code) {
  const { data } = await supabaseAdmin
    .from('room_secrets')
    .select('playlist_id')
    .eq('code', code)
    .single();
  return data ? data.playlist_id : null;
}

export async function savePlaylistId(code, playlistId) {
  await supabaseAdmin
    .from('room_secrets')
    .update({ playlist_id: playlistId, updated_at: new Date().toISOString() })
    .eq('code', code);
}
