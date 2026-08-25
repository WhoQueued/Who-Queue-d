import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';

function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id' + Math.random().toString(36).slice(2, 10);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function Room() {
  const router = useRouter();
  const { code } = router.query;

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [gameState, setGameState] = useState(null);

  const [myPlayerId, setMyPlayerId] = useState(null);
  const [myPlayerName, setMyPlayerName] = useState(null);
  const [nameInput, setNameInput] = useState('');
  const [joinError, setJoinError] = useState('');

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [addError, setAddError] = useState('');
  const debounceRef = useRef(null);

  // Load any existing identity for this room from this device.
  useEffect(() => {
    if (!code) return;
    const savedId = localStorage.getItem(`whoqueued_${code}_playerId`);
    const savedName = localStorage.getItem(`whoqueued_${code}_playerName`);
    if (savedId && savedName) {
      setMyPlayerId(savedId);
      setMyPlayerName(savedName);
    }
  }, [code]);

  // Initial fetch + realtime subscription.
  useEffect(() => {
    if (!code) return;
    let channel;

    async function init() {
      const { data, error } = await supabase
        .from('rooms')
        .select('game_state')
        .eq('code', code)
        .single();

      if (error || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setGameState(data.game_state);
      setLoading(false);

      channel = supabase
        .channel(`room-${code}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `code=eq.${code}` },
          (payload) => setGameState(payload.new.game_state)
        )
        .subscribe();
    }

    init();
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [code]);

  // Fetch-then-write helper: pulls the freshest state right before writing,
  // to shrink (not fully eliminate) the window for two devices clobbering
  // each other's changes. Fine for a friend-group party game; see README.
  const pushUpdate = useCallback(
    async (mutator) => {
      const { data, error } = await supabase
        .from('rooms')
        .select('game_state')
        .eq('code', code)
        .single();
      if (error || !data) return;

      const next = mutator(data.game_state);
      if (!next) return;

      setGameState(next);
      await supabase
        .from('rooms')
        .update({ game_state: next, updated_at: new Date().toISOString() })
        .eq('code', code);
    },
    [code]
  );

  async function joinAsPlayer() {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    setJoinError('');

    const { data, error } = await supabase
      .from('rooms')
      .select('game_state')
      .eq('code', code)
      .single();
    if (error || !data) {
      setJoinError('Something went wrong joining — try again.');
      return;
    }

    const fresh = data.game_state;
    if (fresh.players.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
      setJoinError('Someone already took that name in this case.');
      return;
    }

    const id = uid();
    const next = { ...fresh, players: [...fresh.players, { id, name: trimmed, score: 0 }] };
    setGameState(next);
    await supabase
      .from('rooms')
      .update({ game_state: next, updated_at: new Date().toISOString() })
      .eq('code', code);

    localStorage.setItem(`whoqueued_${code}_playerId`, id);
    localStorage.setItem(`whoqueued_${code}_playerName`, trimmed);
    setMyPlayerId(id);
    setMyPlayerName(trimmed);
  }

  // --- Song search (client-credentials, no login needed) ---
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return undefined;
    }
    setSearching(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data.tracks || []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  async function pickSong(track) {
    setQuery('');
    setResults([]);
    setAddError('');

    await pushUpdate((fresh) => {
      const entry = {
        id: uid(),
        title: track.title,
        artist: track.artist,
        uri: track.uri,
        image: track.image,
        ownerId: myPlayerId,
      };
      return { ...fresh, queue: [...fresh.queue, entry] };
    });

    try {
      const res = await fetch('/api/queue/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: code, trackUri: track.uri }),
      });
      if (!res.ok) {
        setAddError("Added here, but couldn't write it to the real Spotify playlist.");
      }
    } catch {
      setAddError("Added here, but couldn't reach the server to update the real playlist.");
    }
  }

  function removeMySong(id) {
    pushUpdate((fresh) => ({ ...fresh, queue: fresh.queue.filter((s) => s.id !== id) }));
  }

  function updateSettings(patch) {
    pushUpdate((fresh) => ({ ...fresh, settings: { ...fresh.settings, ...patch } }));
  }

  function startGame() {
    pushUpdate((fresh) => {
      if (fresh.queue.length < 2 || fresh.players.length < 2) return null;
      return {
        ...fresh,
        order: shuffle(fresh.queue.map((s) => s.id)),
        roundIndex: 0,
        guesses: {},
        revealed: false,
        screen: 'round',
      };
    });
  }

  function submitGuess(targetId) {
    pushUpdate((fresh) => {
      if (fresh.revealed) return null;
      return { ...fresh, guesses: { ...fresh.guesses, [myPlayerId]: targetId } };
    });
  }

  function revealAnswer() {
    pushUpdate((fresh) => {
      const songId = fresh.order[fresh.roundIndex];
      const song = fresh.queue.find((s) => s.id === songId);
      const owner = fresh.players.find((p) => p.id === song.ownerId);
      const guessers = fresh.players.filter(
        (p) => !(fresh.settings.skipSelf && p.id === owner.id)
      );
      const allAnswered = guessers.every((p) => fresh.guesses[p.id]);
      if (!allAnswered) return null;

      const players = fresh.players.map((p) => {
        const isGuesser = guessers.some((g) => g.id === p.id);
        if (!isGuesser) return p;
        const correct = fresh.guesses[p.id] === owner.id;
        return {
          ...p,
          score: p.score + (correct ? fresh.settings.correctPts : -fresh.settings.forfeitPts),
        };
      });

      return { ...fresh, players, revealed: true };
    });
  }

  function nextRound() {
    pushUpdate((fresh) => {
      const next = fresh.roundIndex + 1;
      const done = next >= fresh.order.length;
      return {
        ...fresh,
        roundIndex: next,
        guesses: {},
        revealed: false,
        screen: done ? 'end' : 'round',
      };
    });
  }

  function replaySame() {
    pushUpdate((fresh) => ({
      ...fresh,
      players: fresh.players.map((p) => ({ ...p, score: 0 })),
      queue: [],
      order: [],
      roundIndex: 0,
      guesses: {},
      revealed: false,
      screen: 'lobby',
    }));
  }

  // --- Render ---

  if (loading) {
    return (
      <div className="scene scene-home">
        <PageHeader title="Opening the Case File…" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="scene scene-home">
        <div className="card card-cover">
          <p className="eyebrow">CASE NOT FOUND</p>
          <p className="reminder">We couldn't find a case with that code. Double check it, or head back and start a new one.</p>
          <a className="btn btn-primary btn-block" href="/">Back Home</a>
        </div>
      </div>
    );
  }

  if (!myPlayerId) {
    return (
      <div className="scene scene-home">
        <PageHeader title="Join the Case" sub={`Room code ${code}`} />
        <div className="card card-gate">
          <p className="gate-pass">Playing as</p>
          <div className="field-row">
            <input
              className="input"
              placeholder={'Your name…'}
              maxLength={20}
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') joinAsPlayer();
              }}
            />
          </div>
          {joinError && <p className="hint hint-warn">{joinError}</p>}
          <button className="btn btn-primary btn-block" onClick={joinAsPlayer} type="button">
            Join
          </button>
          {gameState.players.length > 0 && (
            <p className="hint" style={{ marginTop: 14 }}>
              Already in this case: {gameState.players.map((p) => p.name).join(', ')}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (gameState.screen === 'lobby') {
    const mySongs = gameState.queue.filter((s) => s.ownerId === myPlayerId);
    return (
      <div className="scene">
        <PageHeader title="The Case File" sub={`Room code ${code}`} />

        <div className="card card-notice card-notice-ok">
          <p>Playing as <strong>{myPlayerName}</strong>. Songs you add go straight into a real Spotify playlist.</p>
        </div>

        <div className="card">
          <p className="section-label">Detectives in this case</p>
          <ul className="chiplist">
            {gameState.players.map((p, i) => (
              <li className="chip" key={p.id}>
                <span className="chip-num">#{i + 1}</span>
                <span className="chip-label">{p.name}{p.id === myPlayerId ? ' (you)' : ''}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <p className="section-label">Add a song</p>
          <div className="field-col">
            <input
              className="input"
              placeholder={'Search a song or artist…'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {searching && <p className="hint">Searching…</p>}
            {!searching && query.trim() && results.length === 0 && (
              <p className="hint">No matches yet — keep typing.</p>
            )}
            {results.length > 0 && (
              <ul className="search-results">
                {results.map((track) => (
                  <li key={track.id} className="search-result" onClick={() => pickSong(track)}>
                    {track.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={track.image} alt="" className="search-result-art" />
                    )}
                    <div className="search-result-text">
                      <span className="search-result-title">{track.title}</span>
                      <span className="search-result-artist">{track.artist}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {addError && <p className="hint hint-warn">{addError}</p>}
          </div>

          {mySongs.length === 0 ? (
            <EmptyState title="You haven't queued anything yet." sub="Search above and pick a song." />
          ) : (
            <ul className="evidence-list">
              {mySongs.map((s) => (
                <li className="evidence" key={s.id}>
                  <div className="evidence-text">
                    <span>{s.title}</span>
                    {s.artist && <span className="evidence-artist"> — {s.artist}</span>}
                  </div>
                  <button className="chip-remove" onClick={() => removeMySong(s.id)} type="button" aria-label="Remove">×</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card card-ready">
          <p className="ready-count">{gameState.queue.length}</p>
          <p className="ready-label">songs total from {gameState.players.length} detectives</p>
          <details className="settings">
            <summary>Case Settings</summary>
            <div className="settings-row">
              <label>Points for a correct guess</label>
              <div className="stepper">
                <button type="button" onClick={() => updateSettings({ correctPts: Math.max(1, gameState.settings.correctPts - 1) })}>−</button>
                <span>{gameState.settings.correctPts}</span>
                <button type="button" onClick={() => updateSettings({ correctPts: Math.min(5, gameState.settings.correctPts + 1) })}>+</button>
              </div>
            </div>
            <div className="settings-row">
              <label>Forfeit for a wrong guess</label>
              <div className="stepper">
                <button type="button" onClick={() => updateSettings({ forfeitPts: Math.max(0, gameState.settings.forfeitPts - 1) })}>−</button>
                <span>{gameState.settings.forfeitPts}</span>
                <button type="button" onClick={() => updateSettings({ forfeitPts: Math.min(5, gameState.settings.forfeitPts + 1) })}>+</button>
              </div>
            </div>
            <div className="settings-row">
              <label>Skip the owner's own song</label>
              <button
                className={`toggle ${gameState.settings.skipSelf ? 'toggle-on' : ''}`}
                type="button"
                role="switch"
                aria-checked={gameState.settings.skipSelf}
                onClick={() => updateSettings({ skipSelf: !gameState.settings.skipSelf })}
              />
            </div>
          </details>
        </div>

        <button
          className="btn btn-primary btn-block"
          onClick={startGame}
          type="button"
          disabled={gameState.queue.length < 2 || gameState.players.length < 2}
        >
          Shuffle &amp; Start the Case →
        </button>
      </div>
    );
  }

  if (gameState.screen === 'round') {
    const songId = gameState.order[gameState.roundIndex];
    const song = gameState.queue.find((s) => s.id === songId);
    const owner = gameState.players.find((p) => p.id === song.ownerId);
    const guessers = gameState.players.filter(
      (p) => !(gameState.settings.skipSelf && p.id === owner.id)
    );
    const allAnswered = guessers.every((p) => gameState.guesses[p.id]);
    const waitingOn = guessers.filter((p) => !gameState.guesses[p.id]).map((p) => p.name).join(', ');
    const iAmGuesser = guessers.some((p) => p.id === myPlayerId);
    const myGuess = gameState.guesses[myPlayerId];
    const sortedScores = gameState.players.slice().sort((a, b) => b.score - a.score);

    return (
      <div className="scene">
        <PageHeader title={`Round ${gameState.roundIndex + 1} of ${gameState.order.length}`} />
        <div className="scorestrip">
          {sortedScores.map((p) => (
            <span className="scorepill" key={p.id}>{p.name} <b>{p.score}</b></span>
          ))}
        </div>

        <div className="card card-track">
          <div className={`vinyl ${gameState.revealed ? '' : 'vinyl-spin'}`} aria-hidden="true">
            <div className="vinyl-label" />
          </div>
          <p className="eyebrow">NOW PLAYING</p>
          <h2 className="track-title">{song.title}</h2>
          {song.artist && <p className="track-artist">{song.artist}</p>}
        </div>

        {!gameState.revealed ? (
          <div className="card">
            {!iAmGuesser ? (
              <p className="section-label">It's your song — sit this one out.</p>
            ) : myGuess ? (
              <>
                <p className="section-label">Your guess: locked in</p>
                <div className="suspect-options">
                  {gameState.players.map((target) => (
                    <button
                      key={target.id}
                      type="button"
                      className={`suspect-chip ${myGuess === target.id ? 'suspect-chip-selected' : ''}`}
                      onClick={() => submitGuess(target.id)}
                    >
                      {target.name}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="section-label">Who queue'd it?</p>
                <div className="suspect-options">
                  {gameState.players.map((target) => (
                    <button
                      key={target.id}
                      type="button"
                      className="suspect-chip"
                      onClick={() => submitGuess(target.id)}
                    >
                      {target.name}
                    </button>
                  ))}
                </div>
              </>
            )}

            <button
              className="btn btn-primary btn-block"
              style={{ marginTop: 16 }}
              onClick={revealAnswer}
              type="button"
              disabled={!allAnswered}
            >
              {allAnswered ? "Reveal the Queue'r" : `Waiting on ${waitingOn}`}
            </button>
          </div>
        ) : (
          <div className="card card-reveal">
            <div className="spotlight spotlight-reveal" aria-hidden="true" />
            <p className="reveal-caption">IT WAS</p>
            <h3 className="reveal-name">{owner.name}</h3>
            <ul className="verdicts">
              {guessers.map((g) => {
                const correct = gameState.guesses[g.id] === owner.id;
                const guessedName = gameState.players.find((p) => p.id === gameState.guesses[g.id]);
                return (
                  <li key={g.id} className={`verdict ${correct ? 'verdict-hit' : 'verdict-miss'}`}>
                    <span>{g.name} guessed {guessedName ? guessedName.name : '—'}</span>
                    <span className="verdict-pts">{correct ? `+${gameState.settings.correctPts}` : `−${gameState.settings.forfeitPts}`}</span>
                  </li>
                );
              })}
            </ul>
            <button className="btn btn-primary btn-block" onClick={nextRound} type="button">
              {gameState.roundIndex + 1 >= gameState.order.length ? 'Close the Case →' : 'Next Song →'}
            </button>
          </div>
        )}
      </div>
    );
  }

  // screen === 'end'
  const sorted = gameState.players.slice().sort((a, b) => b.score - a.score);
  const top = sorted.length ? sorted[0].score : 0;
  return (
    <div className="scene scene-home">
      <div className="spotlight" aria-hidden="true" />
      <div className="card card-cover">
        <p className="eyebrow">CASE CLOSED</p>
        <h1 className="wordmark wordmark-sm">FINAL<br />VERDICT</h1>
        <ul className="leaderboard">
          {sorted.map((p, i) => (
            <li key={p.id} className={`leaderboard-row ${p.score === top ? 'leaderboard-row-top' : ''}`}>
              <span className="leaderboard-rank">{i + 1}</span>
              <span className="leaderboard-name">{p.name}{p.score === top ? ' 👑' : ''}</span>
              <span className="leaderboard-score">{p.score}</span>
            </li>
          ))}
        </ul>
        <div className="nav-row nav-row-stack">
          <button className="btn btn-primary btn-block" onClick={replaySame} type="button">Same Suspects, New Case</button>
          <a className="btn btn-ghost btn-block" href="/">Back Home</a>
        </div>
      </div>
    </div>
  );
}

function PageHeader({ title, sub }) {
  return (
    <div className="pageheader">
      <p className="pageheader-brand">WHO QUEUE'D?</p>
      <h2 className="pageheader-title">{title}</h2>
      {sub && <p className="pageheader-sub">{sub}</p>}
    </div>
  );
}

function EmptyState({ title, sub }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      <p className="empty-sub">{sub}</p>
    </div>
  );
}
