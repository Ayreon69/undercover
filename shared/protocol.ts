// Contrat partagé entre le serveur et le client : réglages, rôles, vues de table et règles de texte.

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 12;
/** Longueur maximale d'un mot proposé, et d'un indice. */
export const WORD_MAX = 24;
export const CLUE_MAX = 30;

export type Role = 'civil' | 'undercover' | 'white';
export const ROLE_NAME: Record<Role, string> = { civil: 'Civil', undercover: 'Undercover', white: 'Mister White' };
/** Les points d'une manche gagnée, comme dans l'application d'origine. */
export const POINTS: Record<Role, number> = { civil: 2, undercover: 10, white: 6 };

export type WordSource = 'list' | 'custom';
/** 0 : le nombre d'undercovers suit le nombre de joueurs. */
export const UNDERCOVER_OPTIONS = [0, 1, 2, 3] as const;
export type UndercoverSetting = (typeof UNDERCOVER_OPTIONS)[number];
/** Les indices : dits à voix haute (autour d'une table ou en appel), ou tapés dans l'appli. */
export type ClueMode = 'oral' | 'written';
export const TIMER_OPTIONS = [0, 30, 60] as const;
export type TimerSetting = (typeof TIMER_OPTIONS)[number];

export interface Settings {
  words: WordSource;
  clues: ClueMode;
  undercovers: UndercoverSetting;
  /** Mister White : désactivé tant que l'hôte ne l'ajoute pas. */
  white: boolean;
  /** Temps pour donner son indice, en secondes (0 : sans limite). */
  timer: TimerSetting;
}

export const DEFAULT_SETTINGS: Settings = { words: 'list', clues: 'oral', undercovers: 0, white: false, timer: 0 };

export interface Composition {
  civil: number;
  undercover: number;
  white: number;
}

/**
 * Les rôles d'une manche. En automatique, il reste toujours plus de civils que d'infiltrés.
 * À la main, on accepte une table plus serrée, tant qu'il y a au moins deux civils et autant que d'infiltrés.
 */
export function composition(players: number, undercovers: UndercoverSetting, white: boolean): Composition | string {
  const w = white ? 1 : 0;
  if (players < MIN_PLAYERS) return `Il faut au moins ${MIN_PLAYERS} joueurs`;
  if (undercovers === 0) {
    let uc = players <= 6 ? 1 : players <= 9 ? 2 : 3;
    while (uc > 0 && players - uc - w <= uc + w) uc--;
    if (uc + w === 0) uc = 1;
    return { civil: players - uc - w, undercover: uc, white: w };
  }
  const civil = players - undercovers - w;
  if (civil < 2 || civil < undercovers + w) return `Trop d'infiltrés pour ${players} joueurs`;
  return { civil, undercover: undercovers, white: w };
}

export const AVATARS = ['detective', 'lunettes', 'chapeau', 'masque', 'renard', 'loup', 'hibou', 'cameleon', 'rose', 'cle', 'cocktail', 'mallette'] as const;
/** Des réactions et des petites phrases de table, pour débattre sans clavier. */
export const EMOTES = ['🤨', '😂', '😱', '🤫', '👀', '👏'] as const;
export const TAUNTS = ['Suspect…', 'Je te crois', 'Trop vague', 'Hors sujet', 'Je suis civil', 'Bien vu'] as const;

export type PlayerStatus = 'lobby' | 'playing' | 'spectator';

export interface PlayerView {
  id: string;
  name: string;
  avatar: string;
  isHost: boolean;
  connected: boolean;
  /** Parti, ou déconnecté depuis un moment : on ne l'attend plus. */
  away: boolean;
  status: PlayerStatus;
  /** Mots perso : il a une paire en réserve pour une prochaine manche. */
  hasPair: boolean;
}

/**
 * Une manche : chacun lit son mot ; tour à tour, chacun donne un indice ; on vote ;
 * le plus désigné sort et dévoile son rôle. Mister White éliminé tente de deviner le mot des civils.
 */
export type Stage = 'ready' | 'clue' | 'vote' | 'guess' | 'out' | 'end';
export type Winner = 'civil' | 'infiltrators' | 'white';

export interface SeatView {
  id: string;
  alive: boolean;
  /** Connu seulement une fois le joueur éliminé, ou à la fin de la manche. */
  role: Role | null;
  /** L'indice de ce tour (null : pas encore, ou passé sans rien dire). */
  clue: string | null;
  /** Il a passé son tour sans donner d'indice. */
  skipped: boolean;
  /** L'indice redonné pendant un duel. */
  duelClue: string | null;
  /** À l'oral : il a dit son indice de ce tour, puis celui du duel. */
  spoke: boolean;
  duelSpoke: boolean;
  ready: boolean;
  /** A voté (sans dire pour qui, tant que le vote est ouvert). */
  voted: boolean;
}

export interface VoteResult {
  /** Qui a désigné qui : public une fois le vote clos, comme des doigts pointés autour d'une table. */
  votes: Record<string, string>;
  eliminated: string | null;
  /** Égalité au second vote : le sort a tranché entre les ex æquo. */
  draw: string[] | null;
}

export interface RoundResult {
  winner: Winner;
  civilWord: string;
  undercoverWord: string;
  /** Mots perso : l'auteur de la paire. */
  author: string | null;
  points: Record<string, number>;
}

export interface RoundView {
  n: number;
  stage: Stage;
  tour: number;
  /** Ton mot. Rien pour Mister White, ni pour qui regarde. */
  word: string | null;
  /** Seul Mister White connaît son rôle ; les autres ne savent pas s'ils sont civils ou undercovers. */
  white: boolean;
  /** Mots perso : la paire de la manche est la tienne. */
  author: boolean;
  composition: Composition;
  /** L'ordre de parole, éliminés compris. */
  order: string[];
  speaker: string | null;
  seats: SeatView[];
  /** Duel : on ne revote qu'entre les ex æquo. */
  duel: string[] | null;
  vote: VoteResult | null;
  /** Le joueur qui vient de sortir. */
  out: string | null;
  guess: { text: string | null; correct: boolean } | null;
  /** La manche est jouée : « Continuer » mène au bilan. */
  over: Winner | null;
  result: RoundResult | null;
  endsAt: number;
  /** Ton vote en cours, que toi seul vois. */
  myVote: string | null;
  seq: number;
}

export interface GameView {
  scores: Record<string, number>;
  /** Mots perso : il ne reste plus de paire pour la manche suivante. */
  pairsLeft: number;
  round: RoundView;
}

export interface RoundRecap {
  n: number;
  winner: Winner;
  civilWord: string;
  undercoverWord: string;
  authorName: string | null;
  roles: Record<string, Role>;
}

export interface FinalView {
  scores: Record<string, number>;
  rounds: RoundRecap[];
  players: { id: string; name: string; avatar: string }[];
}

export interface RoomView {
  code: string;
  phase: 'lobby' | 'playing' | 'finished';
  me: string;
  hostId: string;
  settings: Settings;
  players: PlayerView[];
  /** Ta paire de mots perso en réserve (toi seul la vois). */
  myPair: [string, string] | null;
  pairs: number;
  game: GameView | null;
  final: FinalView | null;
  serverNow: number;
}

export type Ack<T = unknown> = (res: { ok: boolean; error?: string; data?: T }) => void;

/** Nettoie un texte saisi : une ligne, sans caractères de contrôle. */
export function cleanText(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

const ARTICLES = /^(le|la|les|l|un|une|des|du|de la|de l|d)\s+/;

/** La forme d'un mot pour le comparer : sans accents, majuscules, article, ponctuation ni pluriel simple. */
export function normalize(raw: string): string {
  const base = raw
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(ARTICLES, '');
  return base
    .split(' ')
    .map((w) => (w.length > 3 ? w.replace(/(s|x)$/, '') : w))
    .join(' ');
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

/**
 * Deux mots identiques à l'oreille. Avec `typo`, une faute de frappe passe sur un mot assez long :
 * c'est utile pour la réponse de Mister White, pas pour un indice (« Bateau » n'est pas « Gâteau »).
 */
export function sameWord(a: string, b: string, typo = false): boolean {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return false;
  if (x === y || x.replace(/ /g, '') === y.replace(/ /g, '')) return true;
  return typo && Math.min(x.length, y.length) >= 6 && distance(x, y) <= 1;
}
