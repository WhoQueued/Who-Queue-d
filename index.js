import { useState, useEffect, useRef } from 'react';

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

const DEFAULT_SETTINGS = { correctPts: 1, forfeitPts: 1, skipSelf: true };

export default function Home() {
  const [screen, setScreen] = useState('home');
  const [players, setPlayers] = useState([]);
  const [queue, setQueue] = useState([]);
  const [turnIndex, setTurnIndex] = useState(0);
  const [turnRevealed, setTurnRevealed] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [order, setOrder] = useState([]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [guesses, setGuesses] = useState({});
  const [revealed, setRevealed] = useState(false);
  const [host, setHost] = useState({ connected: false, displayName: null, checked: false });

  useEffect(() => {
    fetch('/api/auth/status')
      .then((r) => r.json())
      .then((data) =>
        setHost({ connected: !!data.connected, displayName: data.displayName || null, checked: true })
      )
      .catch(() => setHost({ connected: false, displayName: null, checked: true }));
  }, []);

  function resetAll() {
    setScreen('home');
    setPlayers([]);
    setQueue([]);
    setTurnIndex(0);
    setTurnRevealed(false);
    setSettings(DEFAULT_SETTINGS);
    setOrder([]);
    setRoundIndex(0);
    setGuesses({});
    setRevealed(false);
  }

  function addPlayer(name) {
    const trimmed = name.trim();
    if (!trimmed) return false;
    if (players.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) return false;
    setPlayers((prev) => [...prev, { id: uid(), name: trimmed, score: 0 }]);
    return true;
  }

  function removePlayer(id) {
    setPlayers((prev) => prev.filter((p) => p.id !== id));
    setQueue((prev) => prev.filter((s) => s.ownerId !== id));
  }

  async function addSongToQueue(track) {
    const player = players[turnIndex];
    const entry = {
      id: uid(),
      title: track.title,
      artist: track.artist,
      uri: track.uri,
      image: track.image,
      ownerId: player.id,
    };
    setQueue((prev) => [...prev, entry]);

    if (host.connected) {
      try {
        await fetch('/api/queue/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trackUri: track.uri }),
        });
      } catch (err) {
        console.error('Failed to add to real playlist', err);
      }
    }
  }

  function removeSong(id) {
    setQueue((prev) => prev.filter((s) => s.id !== id));
  }

  function doneTurn() {
    const next = turnIndex + 1;
    setTurnRevealed(false);
    if (next >= players.length) {
      setScreen('ready');
    } else {
      setTurnIndex(next);
    }
  }

  function startGame() {
    setOrder(shuffle(queue.map((s) => s.id)));
    setRoundIndex(0);
    setGuesses({});
    setRevealed(false);
    setScreen('round');
  }

  function setGuess(guesserId, targetId) {
    setGuesses((prev) => ({ ...prev, [guesserId]: targetId }));
  }

  function revealAnswer() {
    const songId = order[roundIndex];
    const song = queue.find((s) => s.id === songId);
    const owner = players.find((p) => p.id === song.ownerId);
    const guessers = players.filter((p) => !(settings.skipSelf && p.id === owner.id));

    setPlayers((prev) =>
      prev.map((p) => {
        const isGuesser = guessers.some((x) => x.id === p.id);
        if (!isGuesser) return p;
        const correct = guesses[p.id] === owner.id;
        return { ...p, score: p.score + (correct ? settings.correctPts : -settings.forfeitPts) };
      })
    );
    setRevealed(true);
  }

  function nextRound() {
    const next = roundIndex + 1;
    setGuesses({});
    setRevealed(false);
    if (next >= order.length) setScreen('end');
    else setRoundIndex(next);
  }

  function replaySame() {
    setPlayers((prev) => prev.map((p) => ({ ...p, score: 0 })));
    setQueue([]);
    setOrder([]);
    setRoundIndex(0);
    setGuesses({});
    setRevealed(false);
    setTurnIndex(0);
    setTurnRevealed(false);
    setScreen('queueTurn');
  }

  return (
    <div className="app-root">
      {screen === 'home' && <HomeScreen onStart={() => setScreen('players')} />}

      {screen === 'players' && (
        <PlayersScreen
          players={players}
          host={host}
          onAdd={addPlayer}
          onRemove={removePlayer}
          onBack={() => setScreen('home')}
          onNext={() => {
            setTurnIndex(0);
            setTurnRevealed(false);
            setScreen('queueTurn');
          }}
        />
      )}

      {screen === 'queueTurn' && players[turnIndex] && (
        <QueueTurnScreen
          players={players}
          queue={queue}
          turnIndex={turnIndex}
          turnRevealed={turnRevealed}
          host={host}
          onReveal={() => setTurnRevealed(true)}
          onAddSong={addSongToQueue}
          onRemoveSong={removeSong}
          onDone={doneTurn}
        />
      )}

      {screen === 'ready' && (
        <ReadyScreen
          queue={queue}
          players={players}
          settings={settings}
          setSettings={setSettings}
          onBack={() => setScreen('players')}
          onStart={startGame}
        />
      )}

      {screen === 'round' && order.length > 0 && (
        <RoundScreen
          players={players}
          queue={queue}
          order={order}
          roundIndex={roundIndex}
          settings={settings}
          guesses={guesses}
          revealed={revealed}
          onGuess={setGuess}
          onReveal={revealAnswer}
          onNext={nextRound}
        />
      )}

      {screen === 'end' && <EndScreen players={players} onReplay={replaySame} onReset={resetAll} />}
    </div>
  );
}

function HomeScreen({ onStart }) {
  return (
    <div className="scene scene-home">
      <div className="spotlight" aria-hidden="true" />
      <div className="card card-cover">
        <p className="eyebrow">A PARTY WHODUNIT FOR YOUR PLAYLIST</p>
        <h1 className="wordmark">
          WHO
          <br />
          QUEUE&apos;D?
        </h1>
        <div className="vinyl" aria-hidden="true">
          <div className="vinyl-label" />
        </div>
        <ol className="rules">
          <li>
            <span className="rules-num">01</span>Connect the host&apos;s Spotify so the app can
            build a real party playlist.
          </li>
          <li>
            <span className="rules-num">02</span>Everyone searches and queues songs, secretly,
            under their own name.
          </li>
          <li>
            <span className="rules-num">03</span>Shuffle, hit play on the speaker, and open a
            case each time a new track drops.
          </li>
          <li>
            <span className="rules-num">04</span>Guess who queue&apos;d it. Right hunches score
            points, wrong ones cost you.
          </li>
        </ol>
        <button className="btn btn-primary btn-block" onClick={onStart} type="button">
          Open a New Case
        </button>
      </div>
    </div>
  );
}

function PlayersScreen({ players, host, onAdd, onRemove, onBack, onNext }) {
  const [name, setName] = useState('');
  const inputRef = useRef(null);

  function submit() {
    if (onAdd(name)) {
      setName('');
      inputRef.current?.focus();
    } else {
      inputRef.current?.classList.add('shake');
      setTimeout(() => inputRef.current?.classList.remove('shake'), 400);
    }
  }

  return (
    <div className="scene">
      <PageHeader title="Suspect Roster" sub="Round up your players" />

      {host.checked && !host.connected && (
        <div className="card card-notice">
          <p>
            Connect the host&apos;s Spotify to write songs into a real playlist. You can still
            set up players first and connect later.
          </p>
          <a className="btn btn-amber btn-block" href="/api/auth/login">
            Connect Spotify
          </a>
        </div>
      )}

      {host.connected && (
        <div className="card card-notice card-notice-ok">
          <p>
            Connected as <strong>{host.displayName}</strong>. Songs added below will land in a
            real &quot;Who Queue&apos;d?&quot; playlist in this account.
          </p>
        </div>
      )}

      <div className="card">
        <div className="field-row">
          <input
            ref={inputRef}
            className="input"
            placeholder={'Type a name\u2026'}
            maxLength={20}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
          />
          <button className="btn btn-amber" onClick={submit} type="button">
            Add
          </button>
        </div>
        {players.length === 0 ? (
          <EmptyState title="No suspects yet." sub="Add at least 2 to open the case." />
        ) : (
          <ul className="chiplist">
            {players.map((p, i) => (
              <li className="chip" key={p.id}>
                <span className="chip-num">#{i + 1}</span>
                <span className="chip-label">{p.name}</span>
                <button
                  className="chip-remove"
                  onClick={() => onRemove(p.id)}
                  type="button"
                  aria-label={`Remove ${p.name}`}
                >
                  {'\u00d7'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="nav-row">
        <button className="btn btn-ghost" onClick={onBack} type="button">
          Back
        </button>
        <button
          className="btn btn-primary"
          onClick={onNext}
          type="button"
          disabled={players.length < 2}
        >
          Queue the Songs {'\u2192'}
        </button>
      </div>
    </div>
  );
}

function QueueTurnScreen({
  players,
  queue,
  turnIndex,
  turnRevealed,
  host,
  onReveal,
  onAddSong,
  onRemoveSong,
  onDone,
}) {
  const player = players[turnIndex];
  const mySongs = queue.filter((s) => s.ownerId === player.id);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

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

  function pick(track) {
    onAddSong(track);
    setQuery('');
    setResults([]);
  }

  if (!turnRevealed) {
    return (
      <div className="scene scene-home">
        <PageHeader title="Case File Handoff" />
        <div className="card card-gate">
          <p className="gate-pass">Pass the phone to</p>
          <h2 className="gate-name">{player.name}</h2>
          <p className="gate-hint">
            Everyone else, look away {'\u2014'} this suspect is about to queue songs in secret.
          </p>
          <button className="btn btn-primary btn-block" onClick={onReveal} type="button">
            I&apos;m {player.name} {'\u2014'} Show My Form
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="scene">
      <PageHeader title={`${player.name}'s Turn`} sub={`Suspect ${turnIndex + 1} of ${players.length}`} />
      <div className="card">
        <div className="field-col">
          <input
            className="input"
            placeholder={'Search a song or artist\u2026'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {searching && <p className="hint">Searching{'\u2026'}</p>}
          {!searching && query.trim() && results.length === 0 && (
            <p className="hint">No matches yet {'\u2014'} keep typing.</p>
          )}
          {results.length > 0 && (
            <ul className="search-results">
              {results.map((track) => (
                <li key={track.id} className="search-result" onClick={() => pick(track)}>
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
          {!host.connected && (
            <p className="hint hint-warn">
              Host isn&apos;t connected to Spotify {'\u2014'} songs will show here but won&apos;t be
              added to a real playlist.
            </p>
          )}
        </div>

        {mySongs.length === 0 ? (
          <EmptyState title="No songs logged yet." sub="Search and pick at least one before passing on." />
        ) : (
          <ul className="evidence-list">
            {mySongs.map((s) => (
              <li className="evidence" key={s.id}>
                <div className="evidence-text">
                  <span>{s.title}</span>
                  {s.artist && <span className="evidence-artist"> {'\u2014'} {s.artist}</span>}
                </div>
                <button
                  className="chip-remove"
                  onClick={() => onRemoveSong(s.id)}
                  type="button"
                  aria-label="Remove"
                >
                  {'\u00d7'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="nav-row">
        <button
          className="btn btn-primary btn-block"
          onClick={onDone}
          type="button"
          disabled={mySongs.length === 0}
        >
          Done {'\u2014'} Pass It On
        </button>
      </div>
    </div>
  );
}

function ReadyScreen({ queue, players, settings, setSettings, onBack, onStart }) {
  return (
    <div className="scene">
      <PageHeader title="The Case Is Set" />
      <div className="card card-ready">
        <p className="ready-count">{queue.length}</p>
        <p className="ready-label">
          songs in the queue from {players.length} suspects
        </p>
        <p className="reminder">
          {'\u261d\ufe0f'} If the host is connected, these are already in your real Spotify playlist
          {'\u2014'} just shuffle it and hit play on the speaker.
        </p>
        <details className="settings">
          <summary>Case Settings</summary>
          <div className="settings-row">
            <label>Points for a correct guess</label>
            <div className="stepper">
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, correctPts: Math.max(1, s.correctPts - 1) }))}
              >
                {'\u2212'}
              </button>
              <span>{settings.correctPts}</span>
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, correctPts: Math.min(5, s.correctPts + 1) }))}
              >
                +
              </button>
            </div>
          </div>
          <div className="settings-row">
            <label>Forfeit for a wrong guess</label>
            <div className="stepper">
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, forfeitPts: Math.max(0, s.forfeitPts - 1) }))}
              >
                {'\u2212'}
              </button>
              <span>{settings.forfeitPts}</span>
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, forfeitPts: Math.min(5, s.forfeitPts + 1) }))}
              >
                +
              </button>
            </div>
          </div>
          <div className="settings-row">
            <label>Skip the owner&apos;s own song</label>
            <button
              className={`toggle ${settings.skipSelf ? 'toggle-on' : ''}`}
              type="button"
              role="switch"
              aria-checked={settings.skipSelf}
              onClick={() => setSettings((s) => ({ ...s, skipSelf: !s.skipSelf }))}
            />
          </div>
        </details>
      </div>
      <div className="nav-row">
        <button className="btn btn-ghost" onClick={onBack} type="button">
          Back to Roster
        </button>
        <button
          className="btn btn-primary"
          onClick={onStart}
          type="button"
          disabled={queue.length < 2}
        >
          Shuffle &amp; Start {'\u2192'}
        </button>
      </div>
    </div>
  );
}

function RoundScreen({
  players,
  queue,
  order,
  roundIndex,
  settings,
  guesses,
  revealed,
  onGuess,
  onReveal,
  onNext,
}) {
  const songId = order[roundIndex];
  const song = queue.find((s) => s.id === songId);
  const owner = players.find((p) => p.id === song.ownerId);
  const guessers = players.filter((p) => !(settings.skipSelf && p.id === owner.id));
  const allAnswered = guessers.every((p) => guesses[p.id]);
  const waitingOn = guessers.filter((p) => !guesses[p.id]).map((p) => p.name).join(', ');
  const sortedScores = players.slice().sort((a, b) => b.score - a.score);

  return (
    <div className="scene">
      <PageHeader title={`Round ${roundIndex + 1} of ${order.length}`} />
      <div className="scorestrip">
        {sortedScores.map((p) => (
          <span className="scorepill" key={p.id}>
            {p.name} <b>{p.score}</b>
          </span>
        ))}
      </div>

      <div className="card card-track">
        <div className={`vinyl ${revealed ? '' : 'vinyl-spin'}`} aria-hidden="true">
          <div className="vinyl-label" />
        </div>
        <p className="eyebrow">NOW PLAYING</p>
        <h2 className="track-title">{song.title}</h2>
        {song.artist && <p className="track-artist">{song.artist}</p>}
      </div>

      {!revealed ? (
        <div className="card">
          <p className="section-label">Who queue&apos;d it?</p>
          <div className="suspects">
            {guessers.map((g) => (
              <div className="suspect-block" key={g.id}>
                <p className="suspect-block-name">{g.name}&apos;s guess</p>
                <div className="suspect-options">
                  {players.map((target) => (
                    <button
                      key={target.id}
                      type="button"
                      className={`suspect-chip ${
                        guesses[g.id] === target.id ? 'suspect-chip-selected' : ''
                      }`}
                      onClick={() => onGuess(g.id, target.id)}
                    >
                      {target.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button
            className="btn btn-primary btn-block"
            onClick={onReveal}
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
              const correct = guesses[g.id] === owner.id;
              const guessedName = players.find((p) => p.id === guesses[g.id]);
              return (
                <li key={g.id} className={`verdict ${correct ? 'verdict-hit' : 'verdict-miss'}`}>
                  <span>
                    {g.name} guessed {guessedName ? guessedName.name : '\u2014'}
                  </span>
                  <span className="verdict-pts">
                    {correct ? `+${settings.correctPts}` : `\u2212${settings.forfeitPts}`}
                  </span>
                </li>
              );
            })}
          </ul>
          <button className="btn btn-primary btn-block" onClick={onNext} type="button">
            {roundIndex + 1 >= order.length ? 'Close the Case \u2192' : 'Next Song \u2192'}
          </button>
        </div>
      )}
    </div>
  );
}

function EndScreen({ players, onReplay, onReset }) {
  const sorted = players.slice().sort((a, b) => b.score - a.score);
  const top = sorted.length ? sorted[0].score : 0;

  return (
    <div className="scene scene-home">
      <div className="spotlight" aria-hidden="true" />
      <div className="card card-cover">
        <p className="eyebrow">CASE CLOSED</p>
        <h1 className="wordmark wordmark-sm">
          FINAL
          <br />
          VERDICT
        </h1>
        <ul className="leaderboard">
          {sorted.map((p, i) => (
            <li key={p.id} className={`leaderboard-row ${p.score === top ? 'leaderboard-row-top' : ''}`}>
              <span className="leaderboard-rank">{i + 1}</span>
              <span className="leaderboard-name">
                {p.name}
                {p.score === top ? ' \ud83d\udc51' : ''}
              </span>
              <span className="leaderboard-score">{p.score}</span>
            </li>
          ))}
        </ul>
        <div className="nav-row nav-row-stack">
          <button className="btn btn-primary btn-block" onClick={onReplay} type="button">
            Same Suspects, New Case
          </button>
          <button className="btn btn-ghost btn-block" onClick={onReset} type="button">
            Start Fresh
          </button>
        </div>
      </div>
    </div>
  );
}

function PageHeader({ title, sub }) {
  return (
    <div className="pageheader">
      <p className="pageheader-brand">WHO QUEUE&apos;D?</p>
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
