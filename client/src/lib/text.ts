// Les mots de la table : noms, rôles, verdicts et petites tournures.
import { ROLE_NAME, type Composition, type Role, type RoomView, type Winner } from '../../../shared/protocol';

export function nameOf(view: RoomView, id: string | undefined | null): string {
  if (!id) return '?';
  if (id === view.me) return 'toi';
  return view.players.find((p) => p.id === id)?.name ?? '?';
}

/** Le nom, avec une majuscule si on commence la phrase par « toi ». */
export function NameOf(view: RoomView, id: string | undefined | null): string {
  const n = nameOf(view, id);
  return n === 'toi' ? 'Toi' : n;
}

export function roleName(role: Role): string {
  return ROLE_NAME[role];
}

/** La composition, telle qu'on l'annonce avant de distribuer : « 4 civils · 1 undercover · Mister White ». */
export function compositionParts(c: Composition): string[] {
  const parts = [`${c.civil} civil${c.civil > 1 ? 's' : ''}`];
  if (c.undercover) parts.push(`${c.undercover} undercover${c.undercover > 1 ? 's' : ''}`);
  if (c.white) parts.push('Mister White');
  return parts;
}

export const WINNER_TITLE: Record<Winner, string> = {
  civil: 'Les civils l’emportent',
  infiltrators: 'Les infiltrés l’emportent',
  white: 'Mister White a deviné !',
};

export function pointsLabel(n: number): string {
  return n === 1 ? '+1 point' : `+${n} points`;
}

/** Liste lisible : « A, B et C ». */
export function listing(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`;
}

/** « On attend Zino et Inès », ou « On n'attend plus que toi » quand il ne manque que soi. */
export function waitingLine(names: string[]): string {
  if (names.length === 1 && names[0] === 'toi') return "On n'attend plus que toi";
  return `On attend ${listing(names)}`;
}
