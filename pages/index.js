import { useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

export default function Home() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [checking, setChecking] = useState(false);

  async function handleJoin() {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;

    setChecking(true);
    setJoinError('');

    const { data, error } = await supabase
      .from('rooms')
      .select('code')
      .eq('code', code)
      .single();

    setChecking(false);

    if (error || !data) {
      setJoinError("Can't find a case with that code \u2014 double check it and try again.");
      return;
    }

    router.push(`/room/${code}`);
  }

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
            <span className="rules-num">01</span>One person connects Spotify and hosts a new
            case, which makes a room code.
          </li>
          <li>
            <span className="rules-num">02</span>Everyone else joins from their own phone with
            that code and adds songs, live.
          </li>
          <li>
            <span className="rules-num">03</span>Shuffle, hit play on the speaker, and open a
            case each time a new track drops.
          </li>
          <li>
            <span className="rules-num">04</span>Guess who queue&apos;d it from your own phone.
            Right hunches score points, wrong ones cost you.
          </li>
        </ol>

        <a className="btn btn-primary btn-block" href="/api/auth/login">
          Host a New Case
        </a>

        <div className="or-divider">or</div>

        <div className="field-col">
          <input
            className="input"
            placeholder={'Enter a room code\u2026'}
            maxLength={5}
            value={joinCode}
            onChange={(e) => {
              setJoinCode(e.target.value.toUpperCase());
              setJoinError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleJoin();
            }}
          />
          {joinError && <p className="hint hint-warn">{joinError}</p>}
          <button
            className="btn btn-amber btn-block"
            onClick={handleJoin}
            type="button"
            disabled={!joinCode.trim() || checking}
          >
            {checking ? 'Checking\u2026' : 'Join a Case'}
          </button>
        </div>
      </div>
    </div>
  );
}
