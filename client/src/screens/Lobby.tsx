// Salon : partage de la table, joueurs, mots (liste ou perso), undercovers, Mister White, chrono et lancement.
import { motion } from 'framer-motion';
import { BookOpen, Check, Copy, Crown, LogOut, Play, QrCode, Share2, UserX } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { MAX_PLAYERS, MIN_PLAYERS, TIMER_OPTIONS, UNDERCOVER_OPTIONS, composition, type ClueMode, type PlayerView, type RoomView, type TimerSetting, type UndercoverSetting, type WordSource } from '../../../shared/protocol';
import { PairForm } from '../components/PairForm';
import { Avatar, Button, Facade, Logo, MaskIcon, Modal, Pill, Segmented, Toggle } from '../components/Ui';
import { compositionParts } from '../lib/text';
import { cls, shareUrl } from '../lib/util';
import { leaveRoom, send } from '../net';
import { useStore } from '../store';

function PlayerRow({ p, view, i, custom }: { p: PlayerView; view: RoomView; i: number; custom: boolean }) {
  const isHost = view.hostId === view.me;
  return (
    <motion.li className={cls('player-row', p.id === view.me && 'is-me')} initial={{ x: -8, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.03 }}>
      <Avatar avatar={p.avatar} className="player-avatar" />
      <span className="player-name">
        {p.name}
        {p.id === view.me && <span className="muted"> (toi)</span>}
      </span>
      {custom && (
        <span className={cls('pair-dot', p.hasPair && 'is-on')} title={p.hasPair ? 'Paire de mots déposée' : 'Pas encore de paire'}>
          {p.hasPair ? <Check size={12} strokeWidth={3.5} aria-hidden /> : null}
          <span className="sr-only">{p.hasPair ? 'paire déposée' : 'pas de paire'}</span>
        </span>
      )}
      {p.isHost && (
        <Pill tone="ink">
          <Crown size={12} aria-hidden /> Hôte
        </Pill>
      )}
      {!p.connected && <Pill>Hors ligne</Pill>}
      {isHost && p.id !== view.me && (
        <button type="button" className="icon-btn" aria-label={`Retirer ${p.name}`} onClick={() => void send('room:kick', { playerId: p.id })}>
          <UserX size={18} />
        </button>
      )}
    </motion.li>
  );
}

export function Lobby({ view }: { view: RoomView }) {
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const isHost = view.hostId === view.me;
  const seated = view.players.filter((p) => p.status !== 'spectator');
  const spectators = view.players.filter((p) => p.status === 'spectator');
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState(false);
  const url = shareUrl(view.code);
  const host = view.players.find((p) => p.id === view.hostId);
  const s = view.settings;
  const custom = s.words === 'custom';
  const comp = composition(seated.length, s.undercovers, s.white);
  const auto = composition(Math.max(seated.length, MIN_PLAYERS), 0, s.white);
  let problem: string | null = typeof comp === 'string' ? comp : null;
  if (!problem && custom && view.pairs === 0) problem = 'Il faut au moins une paire de mots';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      useStore.getState().showToast(`Lien : ${url}`, 'info');
    }
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Undercover', text: `Rejoins ma table d'Undercover (code ${view.code}) !`, url });
      } catch {
        /* partage annulé */
      }
    } else void copy();
  };

  return (
    <div className="screen lobby-screen">
      <Facade />
      <div className="lobby">
        <header className="lobby-top">
          <Logo size="sm" />
          <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
            Quitter
          </Button>
        </header>

        <motion.section className="code-panel" initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          <span className="eyebrow">Code de la table</span>
          <div className="big-code" aria-label={`Code ${view.code.split('').join(' ')}`}>
            {view.code.split('').map((c, i) => (
              <motion.span key={i} initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.06, type: 'spring', stiffness: 260, damping: 16 }}>
                {c}
              </motion.span>
            ))}
          </div>
          <div className="share-row">
            <Button variant="primary" icon={<Share2 size={18} />} onClick={share}>
              Inviter des amis
            </Button>
            <Button icon={copied ? <Check size={18} /> : <Copy size={18} />} onClick={copy}>
              {copied ? 'Lien copié !' : 'Copier le lien'}
            </Button>
            <Button icon={<QrCode size={18} />} onClick={() => setQr(true)} aria-label="Afficher le QR code">
              QR
            </Button>
          </div>
        </motion.section>

        <div className="lobby-cols">
          <section className="sheet">
            <div className="sheet-head">
              <h3>
                Joueurs <span className="muted">{seated.length}/{MAX_PLAYERS}</span>
              </h3>
              {custom && (
                <span className="muted small">
                  {view.pairs} paire{view.pairs > 1 ? 's' : ''} déposée{view.pairs > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <ul className="player-list">
              {seated.map((p, i) => (
                <PlayerRow key={p.id} p={p} view={view} i={i} custom={custom} />
              ))}
              {seated.length < MIN_PLAYERS &&
                Array.from({ length: MIN_PLAYERS - seated.length }, (_, i) => (
                  <li key={`empty${i}`} className="player-row is-empty">
                    <span className="player-ghost">?</span>
                    <span className="player-name muted">En attente d'un joueur…</span>
                  </li>
                ))}
            </ul>
            {spectators.length > 0 && <p className="muted small">Spectateurs : {spectators.map((p) => p.name).join(', ')}</p>}
          </section>

          <div className="lobby-settings">
            <section className="sheet">
              <div className="sheet-head">
                <h3>Les indices</h3>
              </div>
              <Segmented<ClueMode>
                label="Comment se donnent les indices"
                value={s.clues}
                disabled={!isHost}
                onChange={(clues) => void send('room:settings', { clues })}
                options={[
                  { value: 'oral', label: 'À voix haute', sub: 'en vrai ou en appel' },
                  { value: 'written', label: 'À l’écrit', sub: 'chacun tape le sien' },
                ]}
              />
              <p className="muted small lobby-note">
                {s.clues === 'oral'
                  ? 'L’appli donne la parole à tour de rôle : on dit son indice à voix haute, puis on passe au suivant. Le vote, lui, reste secret dans l’appli.'
                  : 'Chacun tape son indice à son tour : il reste affiché sur son dossier jusqu’au vote.'}
              </p>
            </section>

            <section className="sheet">
              <div className="sheet-head">
                <h3>Les mots</h3>
                {!isHost && <span className="muted small">choisis par {host?.name ?? "l'hôte"}</span>}
              </div>
              <Segmented<WordSource>
                label="Origine des mots"
                value={s.words}
                disabled={!isHost}
                onChange={(words) => void send('room:settings', { words })}
                options={[
                  { value: 'list', label: 'Liste du jeu', sub: 'plus de 300 paires' },
                  { value: 'custom', label: 'Mots perso', sub: 'chacun en propose 2' },
                ]}
              />
              {custom && (
                <div className="pair-box">
                  <PairForm key={view.myPair ? view.myPair.join('|') : 'none'} pair={view.myPair} />
                  <p className="muted small">À chaque manche, le jeu prend la paire d'un joueur. Au hasard, l'un des mots va aux civils, l'autre à l'undercover. Son auteur connaît les deux, mais pas son camp.</p>
                </div>
              )}
            </section>

            <section className="sheet">
              <div className="sheet-head">
                <h3>Les infiltrés</h3>
              </div>
              <span className="field-label">Undercovers</span>
              <Segmented<UndercoverSetting>
                label="Nombre d'undercovers"
                value={s.undercovers}
                disabled={!isHost}
                onChange={(undercovers) => void send('room:settings', { undercovers })}
                options={UNDERCOVER_OPTIONS.map((n) => ({
                  value: n,
                  label: n === 0 ? 'Auto' : String(n),
                  sub: n === 0 && typeof auto !== 'string' ? `${auto.undercover} ici` : undefined,
                }))}
              />
              <Toggle on={s.white} disabled={!isHost} label="Mister White" onChange={(white) => void send('room:settings', { white })}>
                <MaskIcon blank className="toggle-mask" />
                <span>
                  <b>Mister White</b>
                  <small>Un joueur sans mot, qui improvise. Démasqué, il peut encore gagner en devinant le mot.</small>
                </span>
              </Toggle>
              <p className={cls('composition', typeof comp === 'string' && 'is-bad')} role="status">
                {typeof comp === 'string' ? comp : compositionParts(comp).join(' · ')}
              </p>
            </section>

            <section className="sheet">
              <div className="sheet-head">
                <h3>Chrono</h3>
              </div>
              <Segmented<TimerSetting>
                label="Temps pour donner son indice"
                value={s.timer}
                disabled={!isHost}
                onChange={(timer) => void send('room:settings', { timer })}
                options={TIMER_OPTIONS.map((t) => ({ value: t, label: t === 0 ? 'Sans limite' : `${t} s` }))}
              />
              <p className="muted small lobby-note">{s.timer
                  ? s.clues === 'oral'
                    ? `${s.timer} secondes de parole chacun, puis on passe au suivant. Une minute pour voter.`
                    : `${s.timer} secondes pour taper son indice, sinon on passe son tour. Une minute pour voter.`
                  : 'On prend le temps de soupçonner tout le monde.'}</p>
            </section>
          </div>
        </div>

        <div className="lobby-cta">
          {isHost ? (
            <Button variant="primary" className="btn-lg btn-wide" icon={<Play size={20} />} disabled={!!problem} onClick={() => void send('game:start')}>
              {problem ?? `Lancer la partie (${seated.length} joueurs)`}
            </Button>
          ) : (
            <div className="waiting" role="status">
              <span className="spinner" /> En attente que {host?.name ?? "l'hôte"} lance la partie…
            </div>
          )}
          <Button variant="ghost" icon={<BookOpen size={18} />} onClick={() => setRulesOpen(true)}>
            Nouveau ? Les règles en 2 minutes
          </Button>
        </div>

        <Modal open={qr} onClose={() => setQr(false)} title={`Table ${view.code}`}>
          <div className="qr-box">
            <QRCodeSVG value={url} size={220} bgColor="#f5f0df" fgColor="#12150f" level="M" includeMargin />
            <p className="muted small">Scanne pour rejoindre la table directement.</p>
            <code className="url-code">{url}</code>
          </div>
        </Modal>
      </div>
    </div>
  );
}
