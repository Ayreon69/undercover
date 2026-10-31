// Une partie d'Undercover : des manches qui se suivent, et les points de chacun d'une manche à l'autre.
import crypto from 'node:crypto';
import {
  CLUE_MAX,
  POINTS,
  WORD_MAX,
  cleanText,
  composition,
  sameWord,
  type Composition,
  type Role,
  type RoundResult,
  type Settings,
  type Stage,
  type VoteResult,
  type Winner,
} from '../shared/protocol';

export interface Pair {
  a: string;
  b: string;
  /** Mots perso : qui a proposé la paire. */
  author: string | null;
}

export interface Seat {
  id: string;
  role: Role;
  word: string | null;
  alive: boolean;
  clue: string | null;
  skipped: boolean;
  duelClue: string | null;
  /** À l'oral : l'indice de ce tour, puis celui du duel, a été dit. */
  spoke: boolean;
  duelSpoke: boolean;
  ready: boolean;
  /** Ses indices de la manche, pour refuser une redite. Le serveur s'en souvient, l'écran non. */
  clues: string[];
}

export interface GameOptions {
  settings: Settings;
  isAway: (id: string) => boolean;
  /** Entier au hasard dans [0, n). */
  rand?: (n: number) => number;
  now?: () => number;
  readyMs?: number;
  clueMs?: number;
  voteMs?: number;
  guessMs?: number;
}

export interface MancheRecord {
  n: number;
  winner: Winner;
  civilWord: string;
  undercoverWord: string;
  author: string | null;
  roles: Record<string, Role>;
}

export class Manche {
  stage: Stage = 'ready';
  tour = 0;
  readonly seats = new Map<string, Seat>();
  /** Qui parle encore pendant ce tour (ou ce duel). */
  queue: string[] = [];
  speaker: string | null = null;
  readonly votes = new Map<string, string>();
  duel: string[] | null = null;
  vote: VoteResult | null = null;
  out: string | null = null;
  guess: { text: string | null; correct: boolean } | null = null;
  over: Winner | null = null;
  result: RoundResult | null = null;
  endsAt = 0;
  seq = 0;

  constructor(
    readonly n: number,
    readonly order: string[],
    readonly starter: string,
    readonly civilWord: string,
    readonly undercoverWord: string,
    readonly author: string | null,
    readonly comp: Composition,
  ) {}

  seat(id: string | null | undefined): Seat | undefined {
    return id ? this.seats.get(id) : undefined;
  }

  get alive(): string[] {
    return this.order.filter((id) => this.seats.get(id)!.alive);
  }
}

export class Game {
  readonly scores = new Map<string, number>();
  readonly records: MancheRecord[] = [];
  manche: Manche | null = null;
  private readonly rand: (n: number) => number;
  private readonly now: () => number;

  constructor(private readonly o: GameOptions) {
    this.rand = o.rand ?? ((n) => crypto.randomInt(n));
    this.now = o.now ?? Date.now;
  }

  private shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.rand(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  private away(id: string): boolean {
    return this.o.isAway(id);
  }

  /** Une nouvelle manche, avec les joueurs dans l'ordre de la table. */
  begin(players: string[], pair: Pair): string | undefined {
    const comp = composition(players.length, this.o.settings.undercovers, this.o.settings.white);
    if (typeof comp === 'string') return comp;
    // Au hasard, l'un des deux mots va aux civils, l'autre aux undercovers.
    const swap = this.rand(2) === 1;
    const civilWord = swap ? pair.b : pair.a;
    const undercoverWord = swap ? pair.a : pair.b;

    const pool = this.shuffle([...players]);
    const roles = new Map<string, Role>();
    // L'auteur de la paire connaît les deux mots : il ne peut pas être Mister White.
    if (comp.white) {
      const white = pool.find((id) => id !== pair.author) ?? pool[0];
      roles.set(white, 'white');
    }
    for (const id of pool) {
      if (roles.has(id)) continue;
      roles.set(id, [...roles.values()].filter((r) => r === 'undercover').length < comp.undercover ? 'undercover' : 'civil');
    }
    // Mister White ne parle jamais en premier.
    const speakers = players.filter((id) => roles.get(id) !== 'white');
    const starter = speakers[this.rand(speakers.length)];

    const m = new Manche(this.records.length + 1, [...players], starter, civilWord, undercoverWord, pair.author, comp);
    for (const id of players) {
      const role = roles.get(id)!;
      m.seats.set(id, { id, role, word: role === 'civil' ? civilWord : role === 'undercover' ? undercoverWord : null, alive: true, clue: null, skipped: false, duelClue: null, spoke: false, duelSpoke: false, ready: false, clues: [] });
      if (!this.scores.has(id)) this.scores.set(id, 0);
    }
    m.endsAt = this.o.readyMs ? this.now() + this.o.readyMs : 0;
    this.manche = m;
    return undefined;
  }

  isMember(id: string): boolean {
    return !!this.manche?.seats.has(id);
  }

  // ───────────────────────────── Actions ─────────────────────────────

  private current(stage: Stage): Manche | string {
    const m = this.manche;
    if (!m) return "Aucune manche n'est en cours.";
    if (m.stage !== stage) return 'Ce moment de la manche est passé.';
    return m;
  }

  ready(id: string): string | undefined {
    const m = this.current('ready');
    if (typeof m === 'string') return m;
    const s = m.seat(id);
    if (!s) return 'Tu regardes cette manche.';
    s.ready = true;
    return undefined;
  }

  clue(id: string, raw: unknown): string | undefined {
    const m = this.current('clue');
    if (typeof m === 'string') return m;
    if (this.o.settings.clues === 'oral') return 'Les indices se disent à voix haute dans cette partie.';
    if (m.speaker !== id) return "Ce n'est pas ton tour de parler.";
    const s = m.seat(id)!;
    const text = cleanText(raw, CLUE_MAX);
    if (!text) return 'Écris ton indice.';
    if (s.word && sameWord(text, s.word)) return 'Pas ton mot lui-même !';
    if (s.clues.some((c) => sameWord(c, text))) return 'Tu as déjà donné cet indice.';
    if (m.duel) s.duelClue = text;
    else s.clue = text;
    s.clues.push(text);
    this.nextSpeaker(m);
    return undefined;
  }

  /**
   * À l'oral : l'indice a été dit, au suivant. Le joueur qui parle le signale, ou l'hôte s'il oublie.
   * On précise qui parlait (et à quel moment), pour que deux appuis en même temps ne sautent pas le joueur suivant.
   */
  spoke(by: string, host: boolean, speaker: unknown, seq: unknown): string | undefined {
    const m = this.manche;
    if (!m) return "Aucune manche n'est en cours.";
    if (this.o.settings.clues !== 'oral') return "Les indices s'écrivent dans cette partie.";
    // Un appui en retard : la parole est déjà passée, il n'y a plus rien à faire.
    if (m.stage !== 'clue' || seq !== m.seq || !m.speaker || speaker !== m.speaker) return undefined;
    if (by !== m.speaker && !host) return "Ce n'est pas ton tour de parler.";
    const s = m.seat(m.speaker)!;
    if (m.duel) s.duelSpoke = true;
    else s.spoke = true;
    this.nextSpeaker(m);
    return undefined;
  }

  vote(id: string, target: unknown): string | undefined {
    const m = this.current('vote');
    if (typeof m === 'string') return m;
    const s = m.seat(id);
    if (!s?.alive) return 'Seuls les joueurs encore en jeu votent.';
    const t = typeof target === 'string' ? m.seat(target) : undefined;
    if (!t?.alive) return 'Ce joueur ne peut pas être désigné.';
    if (t.id === id) return 'Tu ne peux pas voter contre toi.';
    if (m.duel && !m.duel.includes(t.id)) return 'Le duel se joue entre les ex æquo.';
    m.votes.set(id, t.id);
    return undefined;
  }

  guessWord(id: string, raw: unknown): string | undefined {
    const m = this.current('guess');
    if (typeof m === 'string') return m;
    if (m.out !== id) return 'Seul Mister White peut deviner.';
    const text = cleanText(raw, WORD_MAX);
    if (!text) return 'Écris le mot des civils.';
    this.resolveGuess(m, text);
    return undefined;
  }

  /** « Continuer » après une élimination. Le numéro évite qu'un double appui saute un tour. */
  next(id: string, seq: unknown): string | undefined {
    const m = this.manche;
    if (!m || m.stage !== 'out' || seq !== m.seq) return undefined;
    if (!m.seats.has(id)) return 'Tu regardes cette manche.';
    if (m.over) this.finish(m);
    else this.beginTour(m);
    return undefined;
  }

  // ───────────────────────────── Déroulé ─────────────────────────────

  private beginTour(m: Manche): void {
    m.tour++;
    for (const s of m.seats.values()) {
      s.clue = null;
      s.skipped = false;
      s.duelClue = null;
      s.spoke = false;
      s.duelSpoke = false;
    }
    m.votes.clear();
    m.vote = null;
    m.out = null;
    m.guess = null;
    m.duel = null;
    // On parle dans l'ordre de la table, à partir de celui qui a ouvert la manche.
    const start = m.order.indexOf(m.starter);
    m.queue = [...m.order.slice(start), ...m.order.slice(0, start)].filter((id) => m.seats.get(id)!.alive);
    m.stage = 'clue';
    m.seq++;
    this.nextSpeaker(m);
  }

  private nextSpeaker(m: Manche): void {
    m.speaker = m.queue.shift() ?? null;
    if (m.speaker) {
      m.endsAt = this.o.clueMs ? this.now() + this.o.clueMs : 0;
      return;
    }
    m.stage = 'vote';
    m.votes.clear();
    m.endsAt = this.o.voteMs ? this.now() + this.o.voteMs : 0;
    m.seq++;
  }

  private closeVote(m: Manche): void {
    const tally = new Map<string, number>();
    for (const [voter, target] of m.votes) {
      if (m.seat(voter)?.alive && m.seat(target)?.alive) tally.set(target, (tally.get(target) ?? 0) + 1);
    }
    const votes = Object.fromEntries(m.votes);
    m.votes.clear();
    if (tally.size === 0) {
      // Personne n'a voté avant la fin du temps : personne ne sort.
      m.vote = { votes, eliminated: null, draw: null };
      m.out = null;
      m.over = null;
      m.stage = 'out';
      m.endsAt = 0;
      m.seq++;
      return;
    }
    const max = Math.max(...tally.values());
    const top = m.order.filter((id) => tally.get(id) === max);
    if (top.length === 1) return this.eliminate(m, top[0], votes, null);
    if (!m.duel) {
      // Égalité : les ex æquo redonnent chacun un indice, puis on revote entre eux.
      m.vote = { votes, eliminated: null, draw: null };
      m.duel = top;
      for (const id of top) {
        const s = m.seat(id)!;
        s.duelClue = null;
        s.duelSpoke = false;
        s.skipped = false;
      }
      m.queue = [...top];
      m.stage = 'clue';
      m.seq++;
      this.nextSpeaker(m);
      return;
    }
    // Encore égalité : le sort tranche.
    this.eliminate(m, top[this.rand(top.length)], votes, top);
  }

  private eliminate(m: Manche, id: string, votes: Record<string, string>, draw: string[] | null): void {
    const s = m.seat(id)!;
    s.alive = false;
    m.out = id;
    m.vote = { votes, eliminated: id, draw };
    m.speaker = null;
    m.seq++;
    if (s.role === 'white') {
      m.stage = 'guess';
      m.endsAt = this.o.guessMs ? this.now() + this.o.guessMs : 0;
      return;
    }
    m.over = this.winnerNow(m);
    m.stage = 'out';
    m.endsAt = 0;
  }

  private resolveGuess(m: Manche, text: string | null): void {
    const correct = text !== null && sameWord(text, m.civilWord, true);
    m.guess = { text, correct };
    m.over = correct ? 'white' : this.winnerNow(m);
    m.stage = 'out';
    m.endsAt = 0;
    m.seq++;
  }

  /** Les civils gagnent quand tous les infiltrés sont sortis ; les infiltrés, quand il ne reste qu'un civil. */
  winnerNow(m: Manche): Winner | null {
    let civils = 0;
    let infiltrators = 0;
    for (const s of m.seats.values()) {
      if (!s.alive) continue;
      if (s.role === 'civil') civils++;
      else infiltrators++;
    }
    if (infiltrators === 0) return 'civil';
    if (civils <= 1) return 'infiltrators';
    return null;
  }

  private finish(m: Manche): void {
    const winner = m.over!;
    const points: Record<string, number> = {};
    for (const s of m.seats.values()) {
      const won = winner === 'civil' ? s.role === 'civil' : winner === 'infiltrators' ? s.role !== 'civil' : s.role === 'white';
      if (!won) continue;
      points[s.id] = POINTS[s.role];
      this.scores.set(s.id, (this.scores.get(s.id) ?? 0) + POINTS[s.role]);
    }
    m.result = { winner, civilWord: m.civilWord, undercoverWord: m.undercoverWord, author: m.author, points };
    m.stage = 'end';
    m.speaker = null;
    m.endsAt = 0;
    m.seq++;
    this.records.push({
      n: m.n,
      winner,
      civilWord: m.civilWord,
      undercoverWord: m.undercoverWord,
      author: m.author,
      roles: Object.fromEntries([...m.seats.values()].map((s) => [s.id, s.role])),
    });
  }

  /**
   * Remet la manche d'aplomb après chaque changement : un absent ne bloque pas la table, le temps écoulé fait avancer.
   * Quand plus personne n'est là, on attend leur retour plutôt que de jouer la manche à leur place.
   */
  settle(): void {
    for (let guard = 0; guard < 64; guard++) if (!this.step()) break;
  }

  private step(): boolean {
    const m = this.manche;
    if (!m) return false;
    const present = m.alive.filter((id) => !this.away(id));
    if (present.length === 0) return false;
    const expired = m.endsAt > 0 && this.now() >= m.endsAt;
    switch (m.stage) {
      case 'ready':
        if (expired || present.every((id) => m.seat(id)!.ready)) {
          this.beginTour(m);
          return true;
        }
        return false;
      case 'clue':
        if (m.speaker && (expired || this.away(m.speaker))) {
          const s = m.seat(m.speaker)!;
          // À l'oral, le temps écoulé veut dire qu'il a parlé : on ne l'entend pas, on passe au suivant.
          if (expired && !this.away(s.id) && this.o.settings.clues === 'oral') {
            if (m.duel) s.duelSpoke = true;
            else s.spoke = true;
          } else s.skipped = true;
          this.nextSpeaker(m);
          return true;
        }
        return false;
      case 'vote':
        if (expired || present.every((id) => m.votes.has(id))) {
          this.closeVote(m);
          return true;
        }
        return false;
      case 'guess':
        if (expired || (m.out && this.away(m.out))) {
          this.resolveGuess(m, null);
          return true;
        }
        return false;
      default:
        return false;
    }
  }
}
