// Une table d'Undercover : salon, réglages, mots perso, partie, minuteries et vue personnalisée de chacun.
import crypto from 'node:crypto';
import {
  DEFAULT_SETTINGS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  TIMER_OPTIONS,
  UNDERCOVER_OPTIONS,
  WORD_MAX,
  cleanText,
  composition,
  sameWord,
  type FinalView,
  type GameView,
  type PlayerStatus,
  type RoomView,
  type RoundView,
  type Settings,
  type TimerSetting,
  type UndercoverSetting,
} from '../shared/protocol';
import { Game, type Pair } from './game';
import { WORD_PAIRS } from './words';

const MAX_MEMBERS = 16;
/** Mode accéléré pour les tests locaux (UC_FAST=1). */
const FAST = process.env.UC_FAST === '1';
/** Délai laissé à un joueur déconnecté avant qu'on ne l'attende plus. */
const GRACE_MS = FAST ? 600 : 20_000;
/** Le temps de lire son mot : au-delà, la manche démarre, et chacun peut le relire à tout moment. */
const READY_MS = FAST ? 3_000 : 45_000;
/** Avec un chrono : le temps de voter, et celui de Mister White pour deviner. */
const VOTE_MS = 60_000;
const GUESS_MS = 45_000;

export interface Player {
  id: string;
  token: string;
  name: string;
  avatar: string;
  sockets: Set<string>;
  connected: boolean;
  disconnectedAt: number;
  left: boolean;
  status: PlayerStatus;
}

function uid(): string {
  return crypto.randomBytes(9).toString('base64url');
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export class Room {
  readonly code: string;
  hostId = '';
  phase: 'lobby' | 'playing' | 'finished' = 'lobby';
  settings: Settings = { ...DEFAULT_SETTINGS };
  players: Player[] = [];
  game: Game | null = null;
  final: FinalView | null = null;
  /** Mots perso : la paire en réserve de chaque joueur, gardée secrète. */
  readonly pairs = new Map<string, [string, string]>();
  /** Ceux dont une paire a déjà servi : les autres passent avant eux. */
  private readonly usedAuthors = new Set<string>();
  /** Les paires de la liste déjà jouées à cette table. */
  private readonly usedList = new Set<number>();
  lastActive = Date.now();
  onChange: () => void = () => {};

  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(code: string) {
    this.code = code;
  }

  // ───────────────────────────── Membres ─────────────────────────────

  get(id: string | undefined): Player | undefined {
    return id ? this.players.find((p) => p.id === id) : undefined;
  }

  findByToken(playerId: unknown, token: unknown): Player | undefined {
    if (typeof playerId !== 'string' || typeof token !== 'string') return undefined;
    const p = this.get(playerId);
    return p && p.token === token ? p : undefined;
  }

  get seated(): Player[] {
    return this.players.filter((p) => p.status !== 'spectator');
  }

  get humansOnline(): number {
    return this.players.filter((p) => p.connected).length;
  }

  touch(): void {
    this.lastActive = Date.now();
  }

  isAway(p: Player | undefined): boolean {
    return !p || p.left || (!p.connected && Date.now() - p.disconnectedAt >= GRACE_MS);
  }

  private uniqueName(name: string): string {
    const taken = new Set(this.players.map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; i < 99; i++) {
      const candidate = `${name.slice(0, 13)} ${i}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return name;
  }

  addHuman(name: string, avatar: string): Player | string {
    if (this.players.length >= MAX_MEMBERS) return 'Cette table est pleine.';
    const seats = this.seated.filter((p) => !p.left).length;
    if (this.phase === 'lobby' && seats >= MAX_PLAYERS) return `La table est complète (${MAX_PLAYERS} joueurs maximum).`;
    // En cours de partie, on regarde la manche, et on s'assoit à la suivante.
    const status: PlayerStatus = this.phase === 'lobby' ? 'lobby' : 'spectator';
    const p: Player = {
      id: uid(),
      token: uid() + uid(),
      name: this.uniqueName(name),
      avatar,
      sockets: new Set(),
      connected: false,
      disconnectedAt: Date.now(),
      left: false,
      status,
    };
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    return p;
  }

  kick(by: string, target: string): { sockets: string[] } | string {
    if (by !== this.hostId) return "Seul l'hôte peut retirer un joueur.";
    if (this.phase !== 'lobby') return 'On ne peut retirer un joueur que dans le salon.';
    const p = this.get(target);
    if (!p || p.id === by) return 'Joueur introuvable.';
    this.players = this.players.filter((x) => x.id !== p.id);
    this.pairs.delete(p.id);
    return { sockets: [...p.sockets] };
  }

  leave(id: string): void {
    const p = this.get(id);
    if (!p) return;
    p.sockets.clear();
    p.connected = false;
    p.disconnectedAt = Date.now();
    // En partie, sa place et ses points restent : on ne l'attend plus, c'est tout.
    if (this.phase === 'lobby' || p.status === 'spectator') {
      this.players = this.players.filter((x) => x.id !== id);
      this.pairs.delete(id);
    } else p.left = true;
    if (this.hostId === id) this.transferHost();
  }

  private transferHost(): void {
    const next = this.players.find((p) => !p.left && p.connected) ?? this.players.find((p) => !p.left);
    this.hostId = next?.id ?? '';
  }

  connect(p: Player, socketId: string): void {
    p.sockets.add(socketId);
    p.connected = true;
    p.left = false;
    if (!this.hostId || !this.get(this.hostId) || this.get(this.hostId)?.left) this.hostId = p.id;
  }

  disconnect(id: string | undefined, socketId: string): void {
    const p = this.get(id);
    if (!p) return;
    p.sockets.delete(socketId);
    if (p.sockets.size === 0) {
      p.connected = false;
      p.disconnectedAt = Date.now();
    }
  }

  updateSettings(by: string, payload: Record<string, unknown>): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut changer les réglages.";
    if (this.phase !== 'lobby') return 'Les réglages se changent dans le salon.';
    if (payload.words === 'list' || payload.words === 'custom') this.settings.words = payload.words;
    if (payload.clues === 'oral' || payload.clues === 'written') this.settings.clues = payload.clues;
    if ((UNDERCOVER_OPTIONS as readonly unknown[]).includes(payload.undercovers)) this.settings.undercovers = payload.undercovers as UndercoverSetting;
    if (typeof payload.white === 'boolean') this.settings.white = payload.white;
    if ((TIMER_OPTIONS as readonly unknown[]).includes(payload.timer)) this.settings.timer = payload.timer as TimerSetting;
    return undefined;
  }

  /** Mots perso : chacun dépose une paire de mots proches, qui servira à une manche. */
  setPair(by: string, a: unknown, b: unknown): string | undefined {
    if (!this.get(by)) return 'Tu as quitté la table.';
    const x = cleanText(a, WORD_MAX);
    const y = cleanText(b, WORD_MAX);
    if (!x || !y) return 'Il faut deux mots.';
    if (sameWord(x, y)) return 'Deux mots différents, sinon personne ne se distingue !';
    this.pairs.set(by, [x, y]);
    return undefined;
  }

  clearPair(by: string): string | undefined {
    this.pairs.delete(by);
    return undefined;
  }

  // ───────────────────────────── Partie ─────────────────────────────

  private startProblem(count: number): string | undefined {
    if (count < MIN_PLAYERS) return `Il faut au moins ${MIN_PLAYERS} joueurs.`;
    const comp = composition(count, this.settings.undercovers, this.settings.white);
    return typeof comp === 'string' ? `${comp}.` : undefined;
  }

  start(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut lancer la partie.";
    if (this.phase !== 'lobby') return 'La partie est déjà lancée.';
    const seated = this.seated;
    const problem = this.startProblem(seated.length);
    if (problem) return problem;
    if (this.settings.words === 'custom' && this.pairs.size === 0) return 'Mots perso : il faut au moins une paire de mots.';
    for (const p of seated) p.status = 'playing';
    // L'ordre autour de la table est tiré au sort, puis il ne bouge plus.
    const order = shuffle([...seated]);
    const others = this.players.filter((p) => p.status === 'spectator');
    this.players = [...order, ...others];
    const t = this.settings.timer;
    this.game = new Game({
      settings: { ...this.settings },
      isAway: (id) => this.isAway(this.get(id)),
      readyMs: READY_MS,
      clueMs: FAST && t ? 1_500 : t * 1000,
      voteMs: t ? (FAST ? 3_000 : VOTE_MS) : 0,
      guessMs: t ? (FAST ? 3_000 : GUESS_MS) : 0,
    });
    this.final = null;
    this.usedAuthors.clear();
    const err = this.beginManche(false);
    if (err) {
      for (const p of seated) p.status = 'lobby';
      this.game = null;
      return err;
    }
    this.phase = 'playing';
    return undefined;
  }

  /** La paire de la manche : celle d'un joueur qui n'a pas encore servi, sinon la liste du jeu. */
  private drawPair(fromList: boolean): Pair | null {
    if (this.settings.words === 'custom' && !fromList) {
      const authors = [...this.pairs.keys()];
      if (authors.length === 0) return null;
      const fresh = authors.filter((id) => !this.usedAuthors.has(id));
      const pool = fresh.length ? fresh : authors;
      const author = pool[crypto.randomInt(pool.length)];
      const [a, b] = this.pairs.get(author)!;
      this.pairs.delete(author);
      this.usedAuthors.add(author);
      return { a, b, author };
    }
    if (this.usedList.size >= WORD_PAIRS.length) this.usedList.clear();
    let i = crypto.randomInt(WORD_PAIRS.length);
    while (this.usedList.has(i)) i = (i + 1) % WORD_PAIRS.length;
    this.usedList.add(i);
    const [a, b] = WORD_PAIRS[i];
    return { a, b, author: null };
  }

  private beginManche(fromList: boolean): string | undefined {
    const g = this.game!;
    const players = this.players.filter((p) => p.status === 'playing' && !p.left).map((p) => p.id);
    const problem = this.startProblem(players.length);
    if (problem) return problem;
    const pair = this.drawPair(fromList);
    if (!pair) return 'Plus aucune paire de mots perso : proposez-en, ou piochez dans la liste du jeu.';
    return g.begin(players, pair);
  }

  /** L'hôte lance la manche suivante. Ceux qui regardaient s'assoient. */
  nextManche(by: string, fromList: unknown): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte lance la manche suivante.";
    const g = this.game;
    if (this.phase !== 'playing' || !g?.manche || g.manche.stage !== 'end') return undefined;
    let seats = this.players.filter((p) => p.status === 'playing' && !p.left).length;
    for (const p of this.players) {
      if (p.status === 'spectator' && seats < MAX_PLAYERS) {
        p.status = 'playing';
        seats++;
      }
    }
    return this.beginManche(fromList === true);
  }

  restart(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut relancer une partie.";
    if (this.phase === 'lobby') return undefined;
    this.clearTimer();
    this.players = this.players.filter((p) => !p.left);
    let seats = 0;
    for (const p of this.players) {
      p.status = seats < MAX_PLAYERS ? 'lobby' : 'spectator';
      if (p.status === 'lobby') seats++;
    }
    this.phase = 'lobby';
    this.game = null;
    this.final = null;
    return undefined;
  }

  /** Fin de partie : le classement, s'il y a au moins une manche jouée ; sinon retour au salon. */
  finish(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut terminer la partie.";
    if (this.phase !== 'playing') return undefined;
    const g = this.game;
    if (!g || g.records.length === 0) return this.restart(by);
    const name = (id: string | null) => (id ? (this.get(id)?.name ?? '?') : null);
    const ids = new Set(g.scores.keys());
    this.final = {
      scores: Object.fromEntries(g.scores),
      rounds: g.records.map((r) => ({
        n: r.n,
        winner: r.winner,
        civilWord: r.civilWord,
        undercoverWord: r.undercoverWord,
        authorName: name(r.author),
        roles: { ...r.roles },
      })),
      players: this.players.filter((p) => ids.has(p.id)).map((p) => ({ id: p.id, name: p.name, avatar: p.avatar })),
    };
    this.phase = 'finished';
    this.clearTimer();
    return undefined;
  }

  private playing(): Game | string {
    if (this.phase !== 'playing' || !this.game) return "Aucune partie n'est en cours.";
    return this.game;
  }

  ready(by: string): string | undefined {
    const g = this.playing();
    return typeof g === 'string' ? g : g.ready(by);
  }

  clue(by: string, text: unknown): string | undefined {
    const g = this.playing();
    return typeof g === 'string' ? g : g.clue(by, text);
  }

  spoke(by: string, speaker: unknown, seq: unknown): string | undefined {
    const g = this.playing();
    return typeof g === 'string' ? g : g.spoke(by, by === this.hostId, speaker, seq);
  }

  vote(by: string, target: unknown): string | undefined {
    const g = this.playing();
    return typeof g === 'string' ? g : g.vote(by, target);
  }

  guess(by: string, text: unknown): string | undefined {
    const g = this.playing();
    return typeof g === 'string' ? g : g.guessWord(by, text);
  }

  next(by: string, seq: unknown): string | undefined {
    const g = this.playing();
    return typeof g === 'string' ? g : g.next(by, seq);
  }

  // ───────────────────────────── Minuteries ─────────────────────────────

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** À appeler après chaque changement : remet la manche d'aplomb, planifie la prochaine échéance, puis diffuse. */
  commit(): void {
    if (this.phase === 'playing') this.game?.settle();
    this.reschedule();
    this.onChange();
  }

  /** La prochaine échéance : la fin du chrono, ou le moment où un absent cessera d'être attendu. */
  private reschedule(): void {
    this.clearTimer();
    const m = this.game?.manche;
    if (this.phase !== 'playing' || !m) return;
    let due = m.endsAt > 0 ? m.endsAt : Infinity;
    for (const p of this.players) {
      if (m.seats.has(p.id) && !p.connected && !p.left && !this.isAway(p)) due = Math.min(due, p.disconnectedAt + GRACE_MS + 5);
    }
    if (!Number.isFinite(due)) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      try {
        this.commit();
      } catch (e) {
        console.error(`[room ${this.code}]`, e);
      }
    }, Math.max(0, Math.min(due - Date.now(), 2_147_000_000)));
  }

  dispose(): void {
    this.clearTimer();
  }

  // ───────────────────────────── Vue personnalisée ─────────────────────────────

  /** Le secret du jeu : chacun ne reçoit que son mot. Les rôles se dévoilent à l'élimination, et tout à la fin. */
  private roundView(g: Game, viewer: string): RoundView {
    const m = g.manche!;
    const mine = m.seat(viewer);
    const end = m.stage === 'end';
    return {
      n: m.n,
      stage: m.stage,
      tour: m.tour,
      word: mine?.word ?? null,
      white: mine?.role === 'white',
      author: !!mine && m.author === viewer,
      composition: { ...m.comp },
      order: [...m.order],
      speaker: m.speaker,
      seats: m.order.map((id) => {
        const s = m.seat(id)!;
        return {
          id,
          alive: s.alive,
          role: !s.alive || end ? s.role : null,
          clue: s.clue,
          skipped: s.skipped,
          duelClue: s.duelClue,
          spoke: s.spoke,
          duelSpoke: s.duelSpoke,
          ready: s.ready,
          voted: m.stage === 'vote' && m.votes.has(id),
        };
      }),
      duel: m.duel ? [...m.duel] : null,
      vote: m.vote ? { votes: { ...m.vote.votes }, eliminated: m.vote.eliminated, draw: m.vote.draw ? [...m.vote.draw] : null } : null,
      out: m.out,
      guess: m.guess ? { ...m.guess } : null,
      over: m.over,
      result: end && m.result ? { ...m.result, points: { ...m.result.points } } : null,
      endsAt: m.endsAt,
      myVote: m.stage === 'vote' ? (m.votes.get(viewer) ?? null) : null,
      seq: m.seq,
    };
  }

  private gameView(g: Game, viewer: string): GameView {
    return {
      scores: Object.fromEntries(g.scores),
      pairsLeft: this.pairs.size,
      round: this.roundView(g, viewer),
    };
  }

  viewFor(viewerId: string): RoomView {
    const g = this.phase === 'playing' && this.game?.manche ? this.game : null;
    const m = g?.manche;
    return {
      code: this.code,
      phase: this.phase,
      me: viewerId,
      hostId: this.hostId,
      settings: { ...this.settings },
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isHost: p.id === this.hostId,
        connected: p.connected,
        away: !!m?.seats.has(p.id) && this.isAway(p),
        status: p.status,
        hasPair: this.pairs.has(p.id),
      })),
      myPair: this.pairs.get(viewerId) ?? null,
      pairs: this.pairs.size,
      game: g ? this.gameView(g, viewerId) : null,
      final: this.final,
      serverNow: Date.now(),
    };
  }
}
