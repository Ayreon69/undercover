// Accueil : le titre sur la façade, une petite scène qui montre le principe, pseudo + avatar, créer / rejoindre une table, règles.
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, House, LogIn, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AVATARS } from '../../../shared/protocol';
import { AVATAR_EMOJI, AVATAR_LABELS, Button, Facade, Logo, Stamp } from '../components/Ui';
import { cls, reducedMotion } from '../lib/util';
import { codeFromUrl, createRoom, joinRoom } from '../net';
import { useStore } from '../store';

const DEMOS = [
  { civil: 'Chat', odd: 'Chien', at: 2, faces: ['🦊', '🦉', '🐺', '🎩'] },
  { civil: 'Raclette', odd: 'Fondue', at: 0, faces: ['🕶️', '🌹', '🦎', '🍸'] },
  { civil: 'Plage', odd: 'Piscine', at: 3, faces: ['🗝️', '🕵️', '💼', '🎭'] },
  { civil: 'Croissant', odd: 'Pain au chocolat', at: 1, faces: ['🎩', '🦊', '🌹', '🦉'] },
];

/** Le principe en image : quatre dossiers, le même mot… sauf un, qui finit tamponné. */
function Demo() {
  const [i, setI] = useState(0);
  const [step, setStep] = useState(0);
  const demo = DEMOS[i];
  useEffect(() => {
    if (reducedMotion()) {
      setStep(2);
      return;
    }
    setStep(0);
    const timers = [window.setTimeout(() => setStep(1), 700), window.setTimeout(() => setStep(2), 2600), window.setTimeout(() => setI((x) => (x + 1) % DEMOS.length), 5600)];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [i]);

  return (
    <div className="demo" aria-hidden>
      {demo.faces.map((face, k) => {
        const odd = k === demo.at;
        return (
          <motion.div key={`${i}-${k}`} className={cls('demo-card', odd && step === 2 && 'is-caught')} initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: k * 0.08 }}>
            <span className="demo-face">{face}</span>
            <span className="demo-word">{step >= 1 ? (odd ? demo.odd : demo.civil) : '•••'}</span>
            <AnimatePresence>
              {odd && step === 2 && (
                <motion.span className="demo-stamp" initial={{ scale: 2.4, opacity: 0, rotate: -4 }} animate={{ scale: 1, opacity: 1, rotate: -12 }} transition={{ type: 'spring', stiffness: 420, damping: 18 }}>
                  <Stamp role="undercover" />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}

export function Home() {
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const conn = useStore((s) => s.conn);
  const [invited, setInvited] = useState(codeFromUrl);
  const [code, setCode] = useState('');
  useEffect(() => {
    const sync = () => setInvited(codeFromUrl());
    window.addEventListener('uc:url', sync);
    return () => window.removeEventListener('uc:url', sync);
  }, []);
  const [busy, setBusy] = useState<string | null>(null);
  const nameOk = profile.name.trim().length > 0;

  const run = async (key: string, fn: () => Promise<boolean>) => {
    if (busy) return;
    if (!nameOk) {
      useStore.getState().showToast('Choisis d’abord un pseudo.', 'info');
      document.getElementById('pseudo')?.focus();
      return;
    }
    setBusy(key);
    await fn();
    setBusy(null);
  };

  const cleanCode = code.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4);

  return (
    <div className="screen home">
      <Facade />
      <div className="home-inner">
        <a className="all-games" href="https://akhis-games.onrender.com">
          <House size={16} aria-hidden /> Tous les jeux
        </a>
        <div className="home-grid">
          <header className="home-hero">
            <motion.div className="home-title" initial={{ x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}>
              <Logo size="lg" />
            </motion.div>
            <motion.p className="tagline" initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.15, duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}>
              Tout le monde a le même mot.
              <br />
              <span className="hl">Sauf un.</span>
            </motion.p>
            <Demo />
          </header>

          <motion.section className="sheet home-panel" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2, duration: 0.45 }}>
            {invited && (
              <div className="invite-banner">
                Invitation à la table <b>{invited}</b> : choisis ton pseudo et rejoins !
              </div>
            )}
            <label className="field-label" htmlFor="pseudo">
              Ton nom de code
            </label>
            <input
              id="pseudo"
              className="input input-lg"
              placeholder="Ex. Le Renard"
              value={profile.name}
              maxLength={16}
              autoComplete="nickname"
              onChange={(e) => setProfile({ name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && invited) void run('join', () => joinRoom(invited));
              }}
            />
            <span className="field-label" id="avatar-label">
              Ton portrait
            </span>
            <div className="avatar-picker" role="radiogroup" aria-labelledby="avatar-label">
              {AVATARS.map((a) => (
                <button key={a} type="button" role="radio" aria-checked={profile.avatar === a} aria-label={AVATAR_LABELS[a]} className={cls('avatar-opt', profile.avatar === a && 'is-on')} onClick={() => setProfile({ avatar: a })}>
                  {AVATAR_EMOJI[a]}
                </button>
              ))}
            </div>

            {invited ? (
              <div className="home-actions">
                <Button variant="primary" className="btn-lg" icon={<LogIn size={20} />} disabled={!!busy} onClick={() => run('join', () => joinRoom(invited))}>
                  {busy === 'join' ? 'Connexion…' : `Rejoindre la table ${invited}`}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    window.history.replaceState(null, '', '/');
                    setInvited(null);
                  }}
                >
                  Créer ma propre table à la place
                </Button>
              </div>
            ) : (
              <div className="home-actions">
                <Button variant="primary" className="btn-lg" icon={<Plus size={20} />} disabled={!!busy} onClick={() => run('create', () => createRoom())}>
                  {busy === 'create' ? 'Création…' : 'Créer une table'}
                </Button>
                <div className="or">
                  <span>ou</span>
                </div>
                <div className="join-row">
                  <input
                    className="input code-input"
                    placeholder="CODE"
                    value={cleanCode}
                    maxLength={4}
                    aria-label="Code de la table"
                    autoCapitalize="characters"
                    onChange={(e) => setCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && cleanCode.length === 4) void run('join', () => joinRoom(cleanCode));
                    }}
                  />
                  <Button icon={<LogIn size={18} />} disabled={cleanCode.length !== 4 || !!busy} onClick={() => run('join', () => joinRoom(cleanCode))}>
                    Rejoindre
                  </Button>
                </div>
              </div>
            )}
            <Button variant="ghost" className="rules-link" icon={<BookOpen size={18} />} onClick={() => setRulesOpen(true)}>
              Les règles en 2 minutes
            </Button>
            <p className="home-note">De 3 à 12 joueurs. Mieux avec un appel vocal ou dans la même pièce : tout le sel est dans les soupçons.</p>
            {conn !== 'online' && (
              <p className="wake-note" role="status">
                <span className="spinner" /> Réveil du serveur… (jusqu'à une minute la première fois)
              </p>
            )}
          </motion.section>
        </div>

        <footer className="home-foot">
          D'après <i>Undercover</i>, le jeu de Yanstar Studio. Création de fans, non officielle.
        </footer>
      </div>
    </div>
  );
}
