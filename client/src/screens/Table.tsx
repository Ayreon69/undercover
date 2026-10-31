// La table : les dossiers des suspects, son mot secret, et en bas ce qu'il y a à faire à chaque moment de la manche.
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Check, Flag, LogOut, Mic, MoreHorizontal, Send, Shuffle, SkipForward, Smile, Swords, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CLUE_MAX, EMOTES, TAUNTS, WORD_MAX, sameWord, type PlayerView, type RoomView, type RoundView, type SeatView } from '../../../shared/protocol';
import { PairForm } from '../components/PairForm';
import { SecretCard } from '../components/SecretCard';
import { Avatar, Button, Facade, Logo, MaskIcon, Modal, Stamp } from '../components/Ui';
import { sfx } from '../lib/sound';
import { NameOf, WINNER_TITLE, compositionParts, listing, nameOf, pointsLabel, roleName, waitingLine } from '../lib/text';
import { cls, plural, useTick, vibrate } from '../lib/util';
import { leaveRoom, send, socket } from '../net';
import { useStore } from '../store';

// ───────────────────────────── Sons et vibrations ─────────────────────────────

function useStageEffects(view: RoomView) {
  const r = view.game!.round;
  const clues = r.seats.reduce((n, s) => n + (s.clue || s.spoke ? 1 : 0) + (s.duelClue || s.duelSpoke ? 1 : 0), 0);
  const prev = useRef<{ n: number; stage: string; clues: number; speaker: string | null } | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = { n: r.n, stage: r.stage, clues, speaker: r.speaker };
    if (!p) return;
    if (clues > p.clues && p.n === r.n) sfx.clue();
    if (r.speaker === view.me && p.speaker !== view.me) {
      sfx.turn();
      vibrate([30, 60, 30]);
    }
    if (p.stage === r.stage && p.n === r.n) return;
    if (r.stage === 'vote') sfx.suspense();
    else if (r.stage === 'guess' || (r.stage === 'out' && p.stage === 'vote')) {
      const t = window.setTimeout(() => {
        sfx.stamp();
        vibrate(60);
      }, 350);
      return () => window.clearTimeout(t);
    } else if (r.stage === 'end' && r.result) {
      const won = (r.result.points[view.me] ?? 0) > 0;
      sfx.finale(won);
    }
  }, [r.n, r.stage, clues, r.speaker, r.result, view.me]);
}

// ───────────────────────────── Les dossiers ─────────────────────────────

function TimerBar({ endsAt, total }: { endsAt: number; total: number }) {
  const now = useTick(250);
  if (!endsAt) return null;
  const left = Math.max(0, endsAt - now);
  return (
    <div className={cls('timer', left < 10_000 && 'is-low')} role="timer" aria-label={`${Math.ceil(left / 1000)} secondes`}>
      <span style={{ width: `${Math.min(100, (left / total) * 100)}%` }} />
      <b>{Math.ceil(left / 1000)} s</b>
    </div>
  );
}

interface SuspectProps {
  p: PlayerView;
  s: SeatView;
  view: RoomView;
  r: RoundView;
  picked: boolean;
  onPick: (() => void) | null;
}

function Suspect({ p, s, view, r, picked, onPick }: SuspectProps) {
  const emotes = useStore((st) => st.emotes).filter((e) => e.playerId === p.id);
  const me = p.id === view.me;
  const speaking = r.speaker === p.id && r.stage === 'clue';
  const inDuel = !!r.duel?.includes(p.id);
  const voters = r.vote && (r.stage === 'out' || r.stage === 'guess' || (r.stage === 'clue' && r.duel)) ? Object.entries(r.vote.votes).filter(([, t]) => t === p.id).map(([v]) => v) : [];
  const myVote = r.myVote === p.id;
  const showRole = s.role && (!s.alive || r.stage === 'end');
  const Tag = onPick ? 'button' : 'div';
  const searching = view.settings.clues === 'oral' ? 'parle…' : 'cherche…';

  return (
    <motion.li layout="position" className={cls('suspect', speaking && 'is-speaking', !s.alive && 'is-out', me && 'is-me', picked && 'is-picked', myVote && 'is-voted', p.away && 'is-away', inDuel && 'is-duel', onPick && 'is-pickable')}>
      <Tag
        {...(onPick ? { type: 'button' as const, onClick: onPick, 'aria-pressed': picked, 'aria-label': `Désigner ${p.name}` } : {})}
        className="suspect-card"
      >
        <span className="suspect-top">
          <span className="suspect-id">
            <Avatar avatar={p.avatar} className="suspect-face" />
            {((r.stage === 'ready' && s.ready) || s.voted) && (
              <span className="badge is-ok" title={s.voted ? 'A voté' : 'A lu son mot'}>
                <Check size={10} strokeWidth={4} aria-hidden />
              </span>
            )}
          </span>
          <span className="suspect-name">{me ? 'Toi' : p.name}</span>
        </span>
        <span className={cls('suspect-clue', !s.clue && !s.spoke && 'is-empty', s.spoke && 'is-spoke')}>
          {s.clue ? (
            s.clue
          ) : s.spoke ? (
            <>
              <Mic size={13} aria-hidden /> a parlé
            </>
          ) : s.skipped && !inDuel ? (
            'n’a rien dit'
          ) : speaking && !inDuel ? (
            searching
          ) : r.stage === 'ready' ? (
            ''
          ) : (
            '…'
          )}
        </span>
        {inDuel && (
          <span className={cls('suspect-clue is-duel', !s.duelClue && !s.duelSpoke && 'is-empty', s.duelSpoke && 'is-spoke')}>
            <Swords size={13} aria-hidden /> {s.duelClue ?? (s.duelSpoke ? 'a reparlé' : speaking ? searching : s.skipped ? 'n’a rien dit' : '…')}
          </span>
        )}
        {voters.length > 0 && (
          <span className="suspect-votes" aria-label={`${plural(voters.length, 'voix')} : ${voters.map((v) => nameOf(view, v)).join(', ')}`}>
            {voters.map((v) => {
              const voter = view.players.find((x) => x.id === v);
              return <Avatar key={v} avatar={voter?.avatar ?? ''} className="vote-face" />;
            })}
          </span>
        )}
        {speaking && <span className="speaking-tag">Parle</span>}
        {myVote && r.stage === 'vote' && <span className="vote-tag">Ton vote</span>}
        {showRole && <Stamp role={s.role!} className="suspect-stamp" />}
        {p.away && s.alive && <span className="away-tag">absent</span>}
      </Tag>
      <AnimatePresence>
        {emotes.slice(-1).map((e) => (
          <motion.span key={e.id} className={cls('emote', e.emoji.length > 3 && 'is-text')} initial={{ y: 6, scale: 0.6 }} animate={{ y: 0, scale: 1 }} exit={{ opacity: 0 }}>
            {e.emoji}
          </motion.span>
        ))}
      </AnimatePresence>
    </motion.li>
  );
}

function ReactionTray({ onClose }: { onClose: () => void }) {
  const emit = (emoji: string) => {
    socket.emit('emote', { emoji });
    onClose();
  };
  return (
    <motion.div className="reactions" role="menu" aria-label="Réactions" initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
      <div className="reaction-emojis">
        {EMOTES.map((e) => (
          <button key={e} type="button" role="menuitem" onClick={() => emit(e)} aria-label={`Réaction ${e}`}>
            {e}
          </button>
        ))}
      </div>
      <div className="reaction-taunts">
        {TAUNTS.map((t) => (
          <button key={t} type="button" role="menuitem" onClick={() => emit(t)}>
            {t}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

// ───────────────────────────── Ce qu'il y a à faire ─────────────────────────────

function Waiting({ children }: { children: ReactNode }) {
  return (
    <p className="panel-wait" role="status">
      <span className="dots" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      {children}
    </p>
  );
}

function ReadyPanel({ view, r, seat }: { view: RoomView; r: RoundView; seat: SeatView | undefined }) {
  if (!seat) return <Waiting>La manche commence : chacun lit son mot.</Waiting>;
  const waitingFor = r.seats.filter((s) => !s.ready && !view.players.find((p) => p.id === s.id)?.away).map((s) => nameOf(view, s.id));
  return (
    <div className="panel-ready">
      <SecretCard word={r.word} white={r.white} author={r.author} big />
      {seat.ready ? (
        <Waiting>{waitingLine(waitingFor)}…</Waiting>
      ) : (
        <Button variant="primary" className="btn-lg btn-wide" icon={<Check size={20} />} onClick={() => void send('game:ready')}>
          J'ai lu mon mot
        </Button>
      )}
    </div>
  );
}

function CluePanel({ r, total }: { r: RoundView; total: number }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus({ preventScroll: true });
  }, []);
  const own = !!r.word && !!text.trim() && sameWord(text, r.word);
  const submit = async () => {
    if (!text.trim() || own || busy) return;
    setBusy(true);
    const ok = await send('game:clue', { text });
    setBusy(false);
    if (ok) setText('');
  };
  return (
    <form
      className="panel-clue"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label className="panel-title" htmlFor="clue">
        {r.duel ? 'Duel : un indice de plus' : 'À toi ! Ton indice'}
      </label>
      <div className="clue-row">
        <input
          id="clue"
          ref={input}
          className="input input-lg"
          value={text}
          maxLength={CLUE_MAX}
          autoComplete="off"
          autoCapitalize="sentences"
          enterKeyHint="send"
          placeholder={r.white ? 'Improvise…' : 'Un mot, deux au plus'}
          onChange={(e) => {
            setText(e.target.value);
            sfx.key();
          }}
        />
        <Button type="submit" variant="primary" icon={<Send size={20} />} disabled={!text.trim() || own || busy} aria-label="Envoyer l'indice" />
      </div>
      <p className={cls('clue-help', own && 'is-bad')}>{own ? 'Pas ton mot lui-même !' : r.white ? 'Pas de mot : fonds-toi dans les indices des autres.' : 'Ni ton mot, ni un indice déjà donné. Assez clair pour les tiens, assez flou pour l’imposteur.'}</p>
      <TimerBar endsAt={r.endsAt} total={total} />
    </form>
  );
}

/** À l'oral : on dit son indice à voix haute, puis on passe la parole. */
function SpeakPanel({ r, total }: { r: RoundView; total: number }) {
  const [busy, setBusy] = useState(false);
  const done = async () => {
    if (busy) return;
    setBusy(true);
    await send('game:spoke', { speaker: r.speaker, seq: r.seq });
    setBusy(false);
  };
  return (
    <div className="panel-clue panel-speak">
      <p className="panel-title">
        <Mic size={20} aria-hidden /> {r.duel ? 'Duel : redis un indice' : 'À toi ! Dis ton indice'}
      </p>
      <p className="clue-help">{r.white ? 'À voix haute, et pas de mot : fonds-toi dans les indices des autres.' : 'À voix haute : un mot, deux au plus. Ni ton mot, ni un indice déjà donné.'}</p>
      <Button variant="primary" className="btn-lg btn-wide" icon={<Check size={20} />} disabled={busy} onClick={() => void done()}>
        C'est dit, au suivant
      </Button>
      <TimerBar endsAt={r.endsAt} total={total} />
    </div>
  );
}

function VotePanel({ view, r, canVote, picked, total }: { view: RoomView; r: RoundView; canVote: boolean; picked: string | null; total: number }) {
  const waiting = r.seats.filter((s) => s.alive && !s.voted && !view.players.find((p) => p.id === s.id)?.away).map((s) => nameOf(view, s.id));
  return (
    <div className="panel-vote">
      <p className="panel-title">{r.duel ? `Revote : ${listing(r.duel.map((id) => NameOf(view, id)))}` : 'Qui est l’imposteur ?'}</p>
      {canVote ? (
        <>
          {picked && picked !== r.myVote ? (
            <Button variant="danger" className="btn-lg btn-wide" icon={<span className="crosshair" aria-hidden />} onClick={() => void send('game:vote', { target: picked }).then((ok) => ok && sfx.pin())}>
              {r.myVote ? `Changer pour ${nameOf(view, picked)}` : `Désigner ${nameOf(view, picked)}`}
            </Button>
          ) : r.myVote ? (
            <p className="vote-done">
              Tu as désigné <b>{nameOf(view, r.myVote)}</b>. Tu peux changer d'avis tant que tout le monde n'a pas voté.
            </p>
          ) : (
            <p className="vote-help">{r.duel ? 'Touche l’un des ex æquo.' : 'Touche le dossier du joueur que tu soupçonnes.'}</p>
          )}
        </>
      ) : (
        <p className="vote-help">Les joueurs encore en jeu votent…</p>
      )}
      {waiting.length > 0 && <Waiting>{waitingLine(waiting)}</Waiting>}
      <TimerBar endsAt={r.endsAt} total={total} />
    </div>
  );
}

function GuessPanel({ view, r, total }: { view: RoomView; r: RoundView; total: number }) {
  const [text, setText] = useState('');
  const mine = r.out === view.me;
  if (!mine) return <Waiting>{NameOf(view, r.out)} était Mister White ! Dernière chance pour lui : trouver le mot des civils…</Waiting>;
  return (
    <form
      className="panel-clue is-guess"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) void send('game:guess', { text });
      }}
    >
      <label className="panel-title" htmlFor="guess">
        Démasqué ! Quel est le mot des civils ?
      </label>
      <div className="clue-row">
        <input id="guess" className="input input-lg" value={text} maxLength={WORD_MAX} autoComplete="off" autoFocus enterKeyHint="send" placeholder="Le mot des civils" onChange={(e) => setText(e.target.value)} />
        <Button type="submit" variant="primary" icon={<Send size={20} />} disabled={!text.trim()} aria-label="Proposer ce mot" />
      </div>
      <p className="clue-help">Si tu trouves, tu gagnes seul la manche. Une seule tentative.</p>
      <TimerBar endsAt={r.endsAt} total={total} />
    </form>
  );
}

function OutPanel({ view, r, member }: { view: RoomView; r: RoundView; member: boolean }) {
  const seat = r.seats.find((s) => s.id === r.out);
  const lines: string[] = [];
  if (r.vote?.draw) lines.push(`Encore égalité entre ${listing(r.vote.draw.map((id) => nameOf(view, id)))} : le sort a tranché.`);
  if (r.guess) {
    if (r.guess.text === null) lines.push('Mister White n’a rien proposé à temps.');
    else lines.push(`Mister White a proposé « ${r.guess.text} » : ${r.guess.correct ? 'c’était bien ça !' : 'raté.'}`);
  }
  return (
    <div className="panel-out">
      {r.out && seat?.role ? (
        <div className="out-card">
          <Avatar avatar={view.players.find((p) => p.id === r.out)?.avatar ?? ''} className="out-face" />
          <div className="out-text">
            <b>{NameOf(view, r.out)}</b>
            <span>{r.out === view.me ? 'Tu sors de la manche.' : 'sort de la manche.'}</span>
          </div>
          <motion.span className="out-stamp" initial={{ scale: 2.6, opacity: 0, rotate: 0 }} animate={{ scale: 1, opacity: 1, rotate: -10 }} transition={{ delay: 0.35, type: 'spring', stiffness: 420, damping: 16 }}>
            <Stamp role={seat.role} />
          </motion.span>
        </div>
      ) : (
        <p className="panel-title">Personne n’a voté : personne ne sort.</p>
      )}
      {lines.map((l) => (
        <p key={l} className="out-note">
          {l}
        </p>
      ))}
      {r.over ? <p className="out-over">{WINNER_TITLE[r.over]}</p> : <p className="out-note">La manche continue : nouveau tour d’indices.</p>}
      {member ? (
        <Button variant="primary" className="btn-lg btn-wide" onClick={() => void send('game:next', { seq: r.seq })}>
          {r.over ? 'Voir le bilan' : 'Tour suivant'}
        </Button>
      ) : (
        <Waiting>La suite arrive…</Waiting>
      )}
    </div>
  );
}

function Standings({ view, scores, gained }: { view: RoomView; scores: Record<string, number>; gained?: Record<string, number> }) {
  const rows = Object.entries(scores)
    .map(([id, pts]) => ({ id, pts, p: view.players.find((x) => x.id === id) }))
    .filter((x) => x.p)
    .sort((a, b) => b.pts - a.pts);
  return (
    <ol className="standings">
      {rows.map((row, i) => (
        <li key={row.id} className={cls(row.id === view.me && 'is-me')}>
          <span className="rank">{i + 1}</span>
          <Avatar avatar={row.p!.avatar} className="mini" />
          <span className="st-name">{row.id === view.me ? 'Toi' : row.p!.name}</span>
          {gained?.[row.id] ? <span className="st-gain">{pointsLabel(gained[row.id])}</span> : null}
          <b className="st-pts">{row.pts}</b>
        </li>
      ))}
    </ol>
  );
}

function EndPanel({ view, r }: { view: RoomView; r: RoundView }) {
  const g = view.game!;
  const res = r.result!;
  const isHost = view.hostId === view.me;
  const host = view.players.find((p) => p.id === view.hostId);
  const mine = r.seats.find((s) => s.id === view.me);
  const custom = view.settings.words === 'custom';
  const noPairs = custom && g.pairsLeft === 0;
  const gain = res.points[view.me] ?? 0;
  return (
    <div className="panel-end">
      <motion.div className={cls('verdict', `is-${res.winner}`)} initial={{ scale: 0.7, rotate: -6, opacity: 0 }} animate={{ scale: 1, rotate: -2, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 15 }}>
        <b>{WINNER_TITLE[res.winner]}</b>
        {mine?.role && <span>{gain ? `Tu étais ${roleName(mine.role).toLowerCase()} : ${pointsLabel(gain)}` : `Tu étais ${roleName(mine.role).toLowerCase()} : pas de points cette fois`}</span>}
      </motion.div>
      <div className="words-reveal">
        <div className="word-pane is-civil">
          <span>Le mot des civils</span>
          <b>{res.civilWord}</b>
        </div>
        <div className="word-pane is-undercover">
          <span>Celui de l’undercover</span>
          <b>{res.undercoverWord}</b>
        </div>
      </div>
      {res.author && <p className="out-note">Mots proposés par {nameOf(view, res.author)}.</p>}
      <h3 className="end-h">Les points</h3>
      <Standings view={view} scores={g.scores} gained={res.points} />
      {custom && (
        <div className="pair-box">
          <p className="muted small">
            Mots perso : {g.pairsLeft === 0 ? 'plus aucune paire en réserve.' : `${plural(g.pairsLeft, 'paire')} en réserve.`} Dépose la tienne pour une prochaine manche.
          </p>
          <PairForm key={view.myPair ? view.myPair.join('|') : 'none'} pair={view.myPair} compact />
        </div>
      )}
      {isHost ? (
        <div className="end-actions">
          {noPairs ? (
            <Button variant="primary" className="btn-lg btn-wide" icon={<Shuffle size={20} />} onClick={() => void send('game:manche', { fromList: true })}>
              Piocher dans la liste du jeu
            </Button>
          ) : (
            <Button variant="primary" className="btn-lg btn-wide" onClick={() => void send('game:manche')}>
              Manche suivante
            </Button>
          )}
          <Button variant="ghost" icon={<Flag size={18} />} onClick={() => void send('game:finish')}>
            Terminer la partie
          </Button>
        </div>
      ) : (
        <Waiting>{host?.name ?? 'L’hôte'} lance la manche suivante…</Waiting>
      )}
    </div>
  );
}

// ───────────────────────────── La table ─────────────────────────────

function headline(view: RoomView, r: RoundView): string {
  switch (r.stage) {
    case 'ready':
      return 'Chacun lit son mot';
    case 'clue':
      if (r.duel) return `Duel : ${listing(r.duel.map((id) => NameOf(view, id)))}`;
      return r.speaker === view.me ? 'À toi de parler' : `${NameOf(view, r.speaker)} parle`;
    case 'vote':
      return 'Le vote';
    case 'guess':
      return 'Mister White démasqué';
    case 'out':
      return 'Le verdict';
    default:
      return 'Fin de la manche';
  }
}

export function Table({ view }: { view: RoomView }) {
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const [menu, setMenu] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [react, setReact] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  useTick(500);
  useStageEffects(view);
  const g = view.game!;
  const r = g.round;
  const mySeat = r.seats.find((s) => s.id === view.me);
  const member = !!mySeat;
  const isHost = view.hostId === view.me;
  const canVote = r.stage === 'vote' && !!mySeat?.alive;
  const timer = view.settings.timer * 1000;

  useEffect(() => setPicked(null), [r.n, r.stage, r.seq]);

  const pickable = (s: SeatView) => canVote && s.alive && s.id !== view.me && (!r.duel || r.duel.includes(s.id));

  return (
    <div className={cls('screen table-screen', `stage-${r.stage}`)}>
      <Facade />
      <header className="table-top">
        <span className="table-logo">
          <Logo size="sm" />
        </span>
        <div className="round-info">
          <b>Manche {r.n}</b>
          {r.tour > 0 && r.stage !== 'end' && <span>Tour {r.tour}</span>}
        </div>
        <div className="table-tools">
          <button type="button" className="icon-btn" aria-label="Les règles" onClick={() => setRulesOpen(true)}>
            <BookOpen size={20} />
          </button>
          <button type="button" className={cls('icon-btn', react && 'is-on')} aria-label="Réagir" aria-expanded={react} onClick={() => setReact((x) => !x)}>
            <Smile size={20} />
          </button>
          <button type="button" className="icon-btn" aria-label="Menu" onClick={() => setMenu(true)}>
            <MoreHorizontal size={20} />
          </button>
        </div>
        {react && <ReactionTray onClose={() => setReact(false)} />}
      </header>

      <div className="table-body">
        <div className="table-main">
          <div className="case-head">
            <h1 className="case-title">{headline(view, r)}</h1>
            <p className="case-comp">
              {compositionParts(r.composition).map((part) => (
                <span key={part}>{part}</span>
              ))}
            </p>
          </div>
          <ul className={cls('suspects', `n-${r.seats.length}`)}>
            {r.seats.map((s) => {
              const p = view.players.find((x) => x.id === s.id);
              if (!p) return null;
              return (
                <Suspect
                  key={s.id}
                  p={p}
                  s={s}
                  view={view}
                  r={r}
                  picked={picked === s.id}
                  onPick={
                    pickable(s)
                      ? () => {
                          sfx.tap();
                          setPicked(s.id);
                        }
                      : null
                  }
                />
              );
            })}
          </ul>
        </div>

        <aside className="table-side">
          {member && r.stage !== 'ready' && r.stage !== 'end' && <SecretCard word={r.word} white={r.white} author={r.author} />}
          {!member && <p className="spectator-note">Tu regardes cette manche : tu joueras à la suivante.</p>}
          {member && !mySeat.alive && r.stage !== 'end' && (
            <p className="dead-note">
              <MaskIcon blank className="dead-mask" /> Hors jeu pour cette manche : tu peux encore réagir, mais plus voter.
            </p>
          )}
          <section className={cls('dock', `dock-${r.stage}`)} aria-live="polite">
            {r.stage === 'ready' && <ReadyPanel view={view} r={r} seat={mySeat} />}
            {r.stage === 'clue' && r.duel && r.vote && (
              <p className="duel-note">
                <Swords size={18} aria-hidden /> Égalité ! {listing(r.duel.map((id) => NameOf(view, id)))} redonnent un indice, puis on revote entre eux.
              </p>
            )}
            {r.stage === 'clue' &&
              (r.speaker !== view.me ? (
                <ClueWait view={view} r={r} total={timer} />
              ) : view.settings.clues === 'oral' ? (
                <SpeakPanel r={r} total={timer} />
              ) : (
                <CluePanel key={`${r.n}-${r.tour}-${r.duel ? 'd' : 't'}`} r={r} total={timer} />
              ))}
            {r.stage === 'vote' && <VotePanel view={view} r={r} canVote={canVote} picked={picked} total={60_000} />}
            {r.stage === 'guess' && <GuessPanel view={view} r={r} total={45_000} />}
            {r.stage === 'out' && <OutPanel view={view} r={r} member={member} />}
            {r.stage === 'end' && r.result && <EndPanel view={view} r={r} />}
          </section>
        </aside>
      </div>

      <Modal
        open={menu}
        onClose={() => {
          setMenu(false);
          setConfirmStop(false);
        }}
        title="Menu"
      >
        <div className="menu-list">
          <p className="muted small">
            Table <b>{view.code}</b> · {plural(r.seats.length, 'joueur')}
          </p>
          <Standings view={view} scores={g.scores} />
          <Button icon={prefs.sound ? <Volume2 size={18} /> : <VolumeX size={18} />} onClick={() => setPrefs({ sound: !prefs.sound })}>
            Son : {prefs.sound ? 'activé' : 'coupé'}
          </Button>
          <Button
            icon={<BookOpen size={18} />}
            onClick={() => {
              setMenu(false);
              setRulesOpen(true);
            }}
          >
            Les règles
          </Button>
          {isHost && (
            <Button
              variant="danger"
              icon={<Flag size={18} />}
              onClick={() => {
                // Deux appuis : un geste malheureux ne doit pas couper la partie de toute la table.
                if (!confirmStop) {
                  setConfirmStop(true);
                  return;
                }
                setConfirmStop(false);
                setMenu(false);
                void send('game:finish');
              }}
            >
              {confirmStop ? 'Confirmer : terminer pour tout le monde' : 'Terminer la partie'}
            </Button>
          )}
          <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
            Quitter la table
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function ClueWait({ view, r, total }: { view: RoomView; r: RoundView; total: number }) {
  const oral = view.settings.clues === 'oral';
  const name = NameOf(view, r.speaker);
  return (
    <div className="panel-wait-clue">
      <Waiting>{oral ? `${name} parle : écoute bien.` : `${name} cherche son indice…`}</Waiting>
      {/* Si celui qui parle oublie de passer la parole, l'hôte s'en charge. */}
      {oral && view.hostId === view.me && (
        <Button variant="ghost" icon={<SkipForward size={18} />} onClick={() => void send('game:spoke', { speaker: r.speaker, seq: r.seq })}>
          {name} a parlé, au suivant
        </Button>
      )}
      <TimerBar endsAt={r.endsAt} total={total} />
    </div>
  );
}
