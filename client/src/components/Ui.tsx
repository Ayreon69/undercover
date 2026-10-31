// Briques d'interface communes : boutons, fenêtres, sélecteurs, logo, avatars, tampons et décor de façade en perspective.
import { X } from 'lucide-react';
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Role } from '../../../shared/protocol';
import { cls } from '../lib/util';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  icon?: ReactNode;
}

export function Button({ variant = 'default', icon, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={cls('btn', `btn-${variant}`, className)} {...rest}>
      {icon}
      {children && <span className="btn-label">{children}</span>}
    </button>
  );
}

/** Le loup : le masque de l'infiltré, découpé dans du papier noir. */
export function MaskIcon({ className, blank }: { className?: string; blank?: boolean }) {
  return (
    <svg className={cls('mask-icon', blank && 'is-blank', className)} viewBox="0 0 64 34" aria-hidden>
      <path className="mask-shape" d="M2 9C12 0 52 0 62 9c0 13-8 23-17 23-7 0-9-7-13-7s-6 7-13 7C10 32 2 22 2 9Z" />
      {!blank && <path className="mask-eyes" d="M13 13c4-4 11-4 14 1-3 5-11 5-14-1Zm24 1c3-5 10-5 14-1-3 6-11 6-14 1Z" />}
    </svg>
  );
}

/** Le titre, en lettres condensées posées sur les lignes de la façade. */
export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className={cls('logo', `logo-${size}`)} role="img" aria-label="Undercover">
      <MaskIcon className="logo-mask" />
      <span className="logo-word" aria-hidden>
        <span>Under</span>
        <span>cover</span>
      </span>
    </div>
  );
}

/** La façade : une grille de fenêtres vue en contre-plongée, qui défile lentement derrière l'écran. */
export function Facade() {
  return (
    <div className="facade" aria-hidden>
      <div className="facade-grid" />
    </div>
  );
}

export function Pill({ tone, children, className }: { tone?: 'ink' | 'red' | 'paper'; children: ReactNode; className?: string }) {
  return <span className={cls('pill', tone && `pill-${tone}`, className)}>{children}</span>;
}

interface SegmentedOption<T> {
  value: T;
  label: string;
  sub?: string;
  disabled?: boolean;
}

export function Segmented<T extends string | number | boolean>({ options, value, onChange, disabled, label }: { options: SegmentedOption<T>[]; value: T; onChange: (v: T) => void; disabled?: boolean; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={disabled || o.disabled}
          className={cls('seg', o.value === value && 'is-on')}
          onClick={() => onChange(o.value)}
        >
          <b>{o.label}</b>
          {o.sub && <small>{o.sub}</small>}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, disabled, label, children }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string; children: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={cls('toggle', on && 'is-on')} onClick={() => onChange(!on)}>
      <span className="toggle-text">{children}</span>
      <span className="toggle-track" aria-hidden>
        <span className="toggle-knob" />
      </span>
    </button>
  );
}

/**
 * Une fenêtre. Elle s'ouvre avec un petit mouvement en CSS, dont l'état final est l'état de repos,
 * et se ferme d'un coup : aucune animation de sortie dont dépendrait l'affichage suivant.
 */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
    };
    window.addEventListener('keydown', onKey);
    // Le focus entre dans la fenêtre, et revient d'où il venait à la fermeture.
    const t = window.setTimeout(() => box.current?.querySelector<HTMLElement>('[data-autofocus], .modal-body button, .modal-body input')?.focus({ preventScroll: true }), 30);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
      before?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  // Rendue à la racine du document : aucun écran ne peut la décaler ni la recouvrir.
  return createPortal(
    <div className="modal-back" onClick={onClose}>
      <div ref={box} className={cls('modal', wide && 'is-wide')} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Fermer" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export const AVATAR_EMOJI: Record<string, string> = {
  detective: '🕵️',
  lunettes: '🕶️',
  chapeau: '🎩',
  masque: '🎭',
  renard: '🦊',
  loup: '🐺',
  hibou: '🦉',
  cameleon: '🦎',
  rose: '🌹',
  cle: '🗝️',
  cocktail: '🍸',
  mallette: '💼',
};

export const AVATAR_LABELS: Record<string, string> = {
  detective: 'Détective',
  lunettes: 'Lunettes noires',
  chapeau: 'Chapeau',
  masque: 'Masques',
  renard: 'Renard',
  loup: 'Loup',
  hibou: 'Hibou',
  cameleon: 'Caméléon',
  rose: 'Rose',
  cle: 'Clé',
  cocktail: 'Cocktail',
  mallette: 'Mallette',
};

export function Avatar({ avatar, className }: { avatar: string; className?: string }) {
  return (
    <span className={cls('avatar', className)} aria-hidden>
      {AVATAR_EMOJI[avatar] ?? '🕵️'}
    </span>
  );
}

const STAMP_TEXT: Record<Role, string> = { civil: 'Civil', undercover: 'Undercover', white: 'Mr White' };

/** Le tampon qui s'abat sur un dossier : le rôle de l'éliminé. */
export function Stamp({ role, className }: { role: Role; className?: string }) {
  return <span className={cls('stamp', `is-${role}`, className)}>{STAMP_TEXT[role]}</span>;
}
