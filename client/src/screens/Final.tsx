// Fin de partie : le podium des agents, des confettis, et toutes les manches résumées en une ligne.
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';
import { LogOut, RotateCcw } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { FinalView, RoomView } from '../../../shared/protocol';
import { Avatar, Button, Facade, Logo, Stamp } from '../components/Ui';
import { sfx } from '../lib/sound';
import { WINNER_TITLE } from '../lib/text';
import { cls, reducedMotion } from '../lib/util';
import { leaveRoom, send } from '../net';

const COLORS = ['#86c440', '#12150f', '#f5f0df', '#e5432a', '#2546b8'];

function ranking(final: FinalView) {
  return final.players.map((p) => ({ ...p, pts: final.scores[p.id] ?? 0 })).sort((a, b) => b.pts - a.pts);
}

function useFinale(final: FinalView, me: string) {
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    const rows = ranking(final);
    const top = rows[0]?.pts ?? 0;
    const win = top > 0 && (final.scores[me] ?? 0) === top;
    sfx.finale(win);
    if (reducedMotion() || top === 0) return;
    const t = window.setTimeout(() => {
      void confetti({ particleCount: 150, spread: 100, origin: { y: 0.25 }, colors: COLORS, gravity: 0.7, scalar: 0.9, disableForReducedMotion: true });
    }, 250);
    return () => window.clearTimeout(t);
  }, [final, me]);
}

export function Final({ view }: { view: RoomView }) {
  const final = view.final!;
  const isHost = view.hostId === view.me;
  useFinale(final, view.me);
  const rows = ranking(final);
  const top = rows[0]?.pts ?? 0;
  const winners = rows.filter((r) => r.pts === top && top > 0);
  // Les rangs suivent les points : deux joueurs à égalité partagent la même marche.
  const rankOf = (pts: number) => rows.findIndex((r) => r.pts === pts) + 1;
  const podium = rows.slice(0, 3);

  return (
    <div className="screen final-screen">
      <Facade />
      <div className="final">
        <header className="lobby-top">
          <Logo size="sm" />
          <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
            Quitter
          </Button>
        </header>

        <motion.section className="final-hero" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5 }}>
          <span className="eyebrow">Dossier classé</span>
          <h1 className="final-title">{winners.length === 0 ? 'Partie terminée' : winners.length === 1 ? `${winners[0].id === view.me ? 'Tu l’emportes' : `${winners[0].name} l’emporte`} !` : 'Égalité au sommet !'}</h1>
          <ol className="podium">
            {podium.map((p, i) => (
              <motion.li key={p.id} className={cls('step', `is-${rankOf(p.pts)}`, p.id === view.me && 'is-me')} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 + i * 0.12, type: 'spring', stiffness: 220, damping: 18 }}>
                <Avatar avatar={p.avatar} className="step-face" />
                <span className="step-name">{p.id === view.me ? 'Toi' : p.name}</span>
                <span className="step-block">
                  <b>{p.pts}</b>
                  <small>pts</small>
                </span>
              </motion.li>
            ))}
          </ol>
          {rows.length > 3 && (
            <ol className="standings final-rest" start={4}>
              {rows.slice(3).map((p) => (
                <li key={p.id} className={cls(p.id === view.me && 'is-me')}>
                  <span className="rank">{rankOf(p.pts)}</span>
                  <Avatar avatar={p.avatar} className="mini" />
                  <span className="st-name">{p.id === view.me ? 'Toi' : p.name}</span>
                  <b className="st-pts">{p.pts}</b>
                </li>
              ))}
            </ol>
          )}
        </motion.section>

        <section className="sheet">
          <div className="sheet-head">
            <h3>Les manches</h3>
          </div>
          <ul className="recap">
            {final.rounds.map((r) => {
              const infiltrators = Object.entries(r.roles).filter(([, role]) => role !== 'civil');
              return (
                <li key={r.n} className="recap-item">
                  <span className="recap-n">{r.n}</span>
                  <div className="recap-body">
                    <p className="recap-words">
                      <b>{r.civilWord}</b> <i>contre</i> <b className="is-odd">{r.undercoverWord}</b>
                    </p>
                    <p className="recap-who">
                      {infiltrators.map(([id, role]) => (
                        <span key={id} className="recap-agent">
                          <Stamp role={role} /> {final.players.find((p) => p.id === id)?.name ?? '?'}
                        </span>
                      ))}
                    </p>
                    <p className="muted small">
                      {WINNER_TITLE[r.winner]}
                      {r.authorName ? ` · mots de ${r.authorName}` : ''}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="lobby-cta">
          {isHost ? (
            <Button variant="primary" className="btn-lg btn-wide" icon={<RotateCcw size={20} />} onClick={() => void send('game:restart')}>
              Nouvelle partie
            </Button>
          ) : (
            <p className="waiting" role="status">
              <span className="spinner" /> L'hôte peut relancer une partie.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
