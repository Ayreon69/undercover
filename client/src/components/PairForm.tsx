// Mots perso : chacun dépose deux mots proches. Le jeu en fera une manche, sans dire de qui ils viennent.
import { Check, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { WORD_MAX, sameWord } from '../../../shared/protocol';
import { send } from '../net';
import { Button } from './Ui';

export function PairForm({ pair, compact }: { pair: [string, string] | null; compact?: boolean }) {
  const [editing, setEditing] = useState(!pair);
  const [a, setA] = useState(pair?.[0] ?? '');
  const [b, setB] = useState(pair?.[1] ?? '');
  const [busy, setBusy] = useState(false);
  const ready = a.trim() && b.trim() && !sameWord(a, b);

  const save = async () => {
    if (!ready || busy) return;
    setBusy(true);
    const ok = await send('room:pair', { a, b });
    setBusy(false);
    if (ok) setEditing(false);
  };

  if (pair && !editing) {
    return (
      <div className="pair-saved">
        <span className="pair-label">Ta paire, gardée secrète</span>
        <span className="pair-words">
          <b>{pair[0]}</b>
          <i>/</i>
          <b>{pair[1]}</b>
        </span>
        <span className="pair-tools">
          <button
            type="button"
            className="icon-btn"
            aria-label="Modifier ma paire"
            onClick={() => {
              setA(pair[0]);
              setB(pair[1]);
              setEditing(true);
            }}
          >
            <Pencil size={17} />
          </button>
          <button type="button" className="icon-btn" aria-label="Retirer ma paire" onClick={() => void send('room:unpair')}>
            <Trash2 size={17} />
          </button>
        </span>
      </div>
    );
  }

  return (
    <form
      className={compact ? 'pair-form is-compact' : 'pair-form'}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {!compact && <p className="pair-help">Deux mots proches, assez pour que les indices se ressemblent : « Raclette » et « Fondue », « Plage » et « Piscine »…</p>}
      <div className="pair-inputs">
        <input className="input" placeholder="Premier mot" value={a} maxLength={WORD_MAX} aria-label="Premier mot" autoComplete="off" onChange={(e) => setA(e.target.value)} />
        <span className="pair-vs" aria-hidden>
          /
        </span>
        <input className="input" placeholder="Second mot" value={b} maxLength={WORD_MAX} aria-label="Second mot" autoComplete="off" onChange={(e) => setB(e.target.value)} />
      </div>
      {a.trim() && b.trim() && sameWord(a, b) && <p className="pair-error">Deux mots différents, sinon personne ne se distingue !</p>}
      <Button type="submit" variant="primary" icon={<Check size={18} />} disabled={!ready || busy}>
        {pair ? 'Enregistrer' : 'Déposer ma paire'}
      </Button>
    </form>
  );
}
