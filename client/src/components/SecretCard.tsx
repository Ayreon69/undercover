// Le mot secret : caché par défaut, on le découvre d'un geste, puis il se recache tout seul.
import { motion } from 'framer-motion';
import { Eye, EyeOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { sfx } from '../lib/sound';
import { cls } from '../lib/util';
import { MaskIcon } from './Ui';

interface Props {
  word: string | null;
  white: boolean;
  author: boolean;
  /** La grande carte du début de manche, ou le rappel compact en haut de la table. */
  big?: boolean;
}

/** Le temps pendant lequel le mot reste visible : assez pour le lire, pas assez pour qu'un voisin le lise. */
const SHOW_MS = 4000;

export function SecretCard({ word, white, author, big }: Props) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!shown) return;
    const t = window.setTimeout(() => setShown(false), big ? SHOW_MS * 2 : SHOW_MS);
    return () => window.clearTimeout(t);
  }, [shown, big]);

  const toggle = () => {
    if (!shown) sfx.reveal();
    setShown((x) => !x);
  };

  if (white) {
    return (
      <div className={cls('secret', 'is-white', big && 'is-big')}>
        <MaskIcon blank className="secret-mask" />
        <div className="secret-text">
          <span className="secret-label">Tu es</span>
          <b className="secret-word">Mister White</b>
          {big && <p className="secret-note">Tu n'as pas de mot. Écoute les indices, improvise, et ne te fais pas prendre. Démasqué, tu pourras encore gagner en devinant le mot des civils.</p>}
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={cls('secret', big && 'is-big', shown && 'is-shown')}
      onClick={toggle}
      aria-pressed={shown}
      aria-label={shown ? `Ton mot : ${word}. Touche pour le cacher.` : 'Touche pour voir ton mot'}
    >
      <span className="secret-label">Ton mot secret</span>
      <span className="secret-window">
        <motion.b key={shown ? 'on' : 'off'} className="secret-word" initial={{ y: shown ? 14 : 0, opacity: shown ? 0 : 1 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.18 }}>
          {shown ? word : '• • • • •'}
        </motion.b>
        <span className="secret-blind" aria-hidden />
      </span>
      <span className="secret-hint">
        {shown ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
        {shown ? 'Touche pour cacher' : 'Touche pour voir'}
      </span>
      {big && (
        <span className="secret-note">
          {author ? 'Ce sont tes mots perso : tu connais les deux, mais pas ton camp. ' : ''}
          Civil ou undercover ? Personne ne te le dira. Compare ton mot aux indices des autres.
        </span>
      )}
    </button>
  );
}
