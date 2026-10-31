// Règles d'Undercover : composition, rôles, tours d'indices, vote, duel, Mister White, victoire, points et secrets.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, composition, normalize, sameWord, type Settings } from '../shared/protocol';
import { Game, type Manche } from '../server/game';
import { Room } from '../server/room';
import { WORD_PAIRS } from '../server/words';

const P5 = ['p1', 'p2', 'p3', 'p4', 'p5'];

function newGame(settings: Partial<Settings> = {}, extra: { away?: Set<string>; now?: () => number; clueMs?: number; voteMs?: number; readyMs?: number } = {}): Game {
  const away = extra.away ?? new Set<string>();
  // Les règles des indices se vérifient à l'écrit ; l'oral a ses propres tests.
  return new Game({ settings: { ...DEFAULT_SETTINGS, clues: 'written', ...settings }, isAway: (id) => away.has(id), now: extra.now, clueMs: extra.clueMs, voteMs: extra.voteMs, readyMs: extra.readyMs });
}

function begin(g: Game, players = P5, author: string | null = null): Manche {
  expect(g.begin(players, { a: 'Chat', b: 'Chien', author })).toBeUndefined();
  g.settle();
  return g.manche!;
}

const byRole = (m: Manche, role: string) => [...m.seats.values()].filter((s) => s.role === role).map((s) => s.id);

function allReady(g: Game): void {
  for (const id of g.manche!.alive) g.ready(id);
  g.settle();
}

/** Tout le monde donne un indice, chacun le sien. */
function cluesRound(g: Game): void {
  const m = g.manche!;
  let i = 0;
  while (m.stage === 'clue' && m.speaker) {
    expect(g.clue(m.speaker, `indice ${m.tour}-${i++}`)).toBeUndefined();
    g.settle();
  }
}

/** Tout le monde vote contre la cible (la cible, elle, vote contre quelqu'un d'autre). */
function voteOut(g: Game, target: string, fallback?: string): void {
  const m = g.manche!;
  for (const id of m.alive) {
    const t = id === target ? (fallback ?? m.alive.find((x) => x !== target)!) : target;
    expect(g.vote(id, t)).toBeUndefined();
  }
  g.settle();
}

describe('la composition', () => {
  it('suit le nombre de joueurs, avec toujours plus de civils que d’infiltrés', () => {
    expect(composition(3, 0, false)).toEqual({ civil: 2, undercover: 1, white: 0 });
    expect(composition(6, 0, false)).toEqual({ civil: 5, undercover: 1, white: 0 });
    expect(composition(7, 0, false)).toEqual({ civil: 5, undercover: 2, white: 0 });
    expect(composition(12, 0, false)).toEqual({ civil: 9, undercover: 3, white: 0 });
    expect(composition(3, 0, true)).toEqual({ civil: 2, undercover: 0, white: 1 });
    expect(composition(5, 0, true)).toEqual({ civil: 3, undercover: 1, white: 1 });
    expect(composition(12, 0, true)).toEqual({ civil: 8, undercover: 3, white: 1 });
    for (let n = 3; n <= 12; n++) {
      for (const white of [false, true]) {
        const c = composition(n, 0, white);
        if (typeof c === 'string') throw new Error(c);
        expect(c.civil).toBeGreaterThan(c.undercover + c.white);
        expect(c.undercover + c.white).toBeGreaterThan(0);
      }
    }
  });

  it('refuse à la main une table où les infiltrés seraient trop nombreux', () => {
    expect(composition(4, 2, false)).toEqual({ civil: 2, undercover: 2, white: 0 });
    expect(typeof composition(4, 2, true)).toBe('string');
    expect(typeof composition(5, 3, false)).toBe('string');
    expect(typeof composition(2, 0, false)).toBe('string');
  });
});

describe('les mots', () => {
  it('se comparent sans accents, majuscules, articles ni pluriel', () => {
    expect(sameWord('Chat', 'chats')).toBe(true);
    expect(sameWord('Pâtes', 'les pates')).toBe(true);
    expect(sameWord('Bœuf', 'boeuf')).toBe(true);
    expect(sameWord("L'éléphant", 'elephant')).toBe(true);
    expect(sameWord('Rhinocéros', 'rinoceros', true)).toBe(true);
    expect(sameWord('Rhinocéros', 'rinoceros')).toBe(false);
    expect(sameWord('Bateau', 'Gâteau')).toBe(false);
    expect(sameWord('Chat', 'Char')).toBe(false);
    expect(sameWord('Chien', 'Loup')).toBe(false);
    expect(normalize('  Pomme  de terre ')).toBe('pomme de terre');
  });

  it('forment une liste propre : pas de doublon, deux mots différents par paire', () => {
    expect(WORD_PAIRS.length).toBeGreaterThanOrEqual(300);
    const seen = new Set<string>();
    for (const [a, b] of WORD_PAIRS) {
      expect(sameWord(a, b)).toBe(false);
      const key = [normalize(a), normalize(b)].sort().join('|');
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});

describe('une manche', () => {
  it('donne un mot aux civils, l’autre aux undercovers, et rien à Mister White, qui ne parle jamais en premier', () => {
    for (let k = 0; k < 40; k++) {
      const g = newGame({ white: true });
      const m = begin(g);
      const civ = byRole(m, 'civil');
      const uc = byRole(m, 'undercover');
      const white = byRole(m, 'white');
      expect([civ.length, uc.length, white.length]).toEqual([3, 1, 1]);
      expect(new Set(civ.map((id) => m.seat(id)!.word))).toEqual(new Set([m.civilWord]));
      expect(m.seat(uc[0])!.word).toBe(m.undercoverWord);
      expect(m.seat(white[0])!.word).toBeNull();
      expect(new Set([m.civilWord, m.undercoverWord])).toEqual(new Set(['Chat', 'Chien']));
      expect(m.starter).not.toBe(white[0]);
      allReady(g);
      expect(m.speaker).not.toBe(white[0]);
    }
  });

  it('tire au sort quel mot va aux civils', () => {
    const civilWords = new Set<string>();
    for (let k = 0; k < 40; k++) civilWords.add(begin(newGame()).civilWord);
    expect(civilWords).toEqual(new Set(['Chat', 'Chien']));
  });

  it('ne fait jamais de l’auteur des mots perso un Mister White', () => {
    for (let k = 0; k < 60; k++) {
      const m = begin(newGame({ white: true }), P5, 'p3');
      expect(m.seat('p3')!.role).not.toBe('white');
    }
  });

  it('démarre quand tout le monde a lu son mot, ou à la fin du temps de lecture', () => {
    let now = 0;
    const g = newGame({}, { now: () => now, readyMs: 45_000 });
    const m = begin(g);
    for (const id of P5.slice(0, 4)) g.ready(id);
    g.settle();
    expect(m.stage).toBe('ready');
    now = 45_000;
    g.settle();
    expect(m.stage).toBe('clue');
  });

  it('fait parler chacun à son tour, dans l’ordre de la table, puis passe au vote', () => {
    const g = newGame();
    const m = begin(g);
    allReady(g);
    const start = m.order.indexOf(m.starter);
    const expected = [...m.order.slice(start), ...m.order.slice(0, start)];
    const spoken: string[] = [];
    while (m.stage === 'clue') {
      spoken.push(m.speaker!);
      expect(g.clue(m.order.find((id) => id !== m.speaker)!, 'hors tour')).toBe("Ce n'est pas ton tour de parler.");
      g.clue(m.speaker!, `mot ${spoken.length}`);
    }
    expect(spoken).toEqual(expected);
    expect(m.stage).toBe('vote');
  });

  it('refuse qu’on dise son propre mot, ou qu’on répète un indice', () => {
    const g = newGame();
    const m = begin(g);
    allReady(g);
    const sp = m.speaker!;
    expect(g.clue(sp, `  les ${m.seat(sp)!.word!.toUpperCase()}s `)).toBe('Pas ton mot lui-même !');
    expect(g.clue(sp, '   ')).toBe('Écris ton indice.');
    expect(g.clue(sp, 'Moustaches')).toBeUndefined();
    cluesRound(g);
    voteOut(g, m.alive.find((id) => id !== sp && m.seat(id)!.role === 'civil')!);
    if (m.stage === 'out' && !m.over) {
      g.next(sp, m.seq);
      while (m.speaker !== sp) g.clue(m.speaker!, `autre ${m.speaker}`);
      expect(g.clue(sp, 'moustache')).toBe('Tu as déjà donné cet indice.');
    }
  });

  it('passe le tour d’un absent, et celui d’un joueur à court de temps', () => {
    let now = 0;
    const away = new Set<string>();
    const g = newGame({}, { away, now: () => now, clueMs: 30_000 });
    const m = begin(g);
    allReady(g);
    const first = m.speaker!;
    now = 30_000;
    g.settle();
    expect(m.seat(first)!.skipped).toBe(true);
    expect(m.speaker).not.toBe(first);
    away.add(m.speaker!);
    const second = m.speaker!;
    g.settle();
    expect(m.seat(second)!.skipped).toBe(true);
    expect(m.speaker).not.toBe(second);
  });

  it('attend une table entièrement absente plutôt que de jouer à sa place', () => {
    const away = new Set(P5);
    const g = newGame({}, { away });
    const m = begin(g);
    expect(m.stage).toBe('ready');
    away.clear();
    allReady(g);
    const sp = m.speaker!;
    for (const id of P5) away.add(id);
    g.settle();
    expect(m.speaker).toBe(sp);
  });
});

describe('à l’oral', () => {
  it('chacun signale qu’il a parlé, ou l’hôte pour lui, sans jamais sauter le suivant', () => {
    const g = newGame({ clues: 'oral' });
    const m = begin(g);
    allReady(g);
    const sp = m.speaker!;
    const other = m.order.find((id) => id !== sp)!;
    expect(g.clue(sp, 'Moustaches')).toBe('Les indices se disent à voix haute dans cette partie.');
    expect(g.spoke(other, false, sp, m.seq)).toBe("Ce n'est pas ton tour de parler.");
    expect(g.spoke(sp, false, sp, m.seq)).toBeUndefined();
    expect(m.seat(sp)!.spoke).toBe(true);
    const second = m.speaker!;
    expect(second).not.toBe(sp);
    // L'hôte fait avancer un joueur distrait ; l'appui tardif du joueur ne fait pas sauter le suivant.
    expect(g.spoke(other === second ? sp : other, true, second, m.seq)).toBeUndefined();
    const third = m.speaker!;
    expect(g.spoke(second, false, second, m.seq)).toBeUndefined();
    expect(m.speaker).toBe(third);
    // Un appui d'une étape passée ne fait rien non plus.
    expect(g.spoke(third, false, third, m.seq - 1)).toBeUndefined();
    expect(m.speaker).toBe(third);
    while (m.stage === 'clue') g.spoke(m.speaker!, false, m.speaker, m.seq);
    expect(m.stage).toBe('vote');
    expect(m.alive.every((id) => m.seat(id)!.spoke && !m.seat(id)!.skipped)).toBe(true);
  });

  it('passe au suivant à la fin du temps, sans compter le tour comme sauté ; un absent, lui, passe son tour', () => {
    let now = 0;
    const away = new Set<string>();
    const g = newGame({ clues: 'oral' }, { away, now: () => now, clueMs: 30_000 });
    const m = begin(g);
    allReady(g);
    const first = m.speaker!;
    now = 30_000;
    g.settle();
    expect(m.seat(first)!.spoke).toBe(true);
    expect(m.seat(first)!.skipped).toBe(false);
    const second = m.speaker!;
    away.add(second);
    g.settle();
    expect(m.seat(second)!.skipped).toBe(true);
    expect(m.seat(second)!.spoke).toBe(false);
  });

  it('fait reparler les ex æquo à l’oral, puis revote entre eux', () => {
    const g = newGame({ clues: 'oral' }, {});
    const m = begin(g, ['p1', 'p2', 'p3', 'p4']);
    allReady(g);
    while (m.stage === 'clue') g.spoke(m.speaker!, false, m.speaker, m.seq);
    // Deux voix chacun pour p1 et p2.
    g.vote('p1', 'p2');
    g.vote('p2', 'p1');
    g.vote('p3', 'p1');
    g.vote('p4', 'p2');
    g.settle();
    expect(m.stage).toBe('clue');
    expect(m.duel).toEqual(['p1', 'p2']);
    expect(m.seat('p1')!.duelSpoke).toBe(false);
    g.spoke(m.speaker!, false, m.speaker, m.seq);
    g.spoke(m.speaker!, false, m.speaker, m.seq);
    expect(m.stage).toBe('vote');
    expect(m.seat('p1')!.duelSpoke && m.seat('p2')!.duelSpoke).toBe(true);
  });
});

describe('le vote', () => {
  it('garde les votes secrets jusqu’au dernier, puis élimine le plus désigné et dévoile son rôle', () => {
    const g = newGame();
    const m = begin(g);
    allReady(g);
    cluesRound(g);
    const uc = byRole(m, 'undercover')[0];
    const voters = m.alive.filter((id) => id !== uc);
    for (const id of voters) g.vote(id, uc);
    g.settle();
    expect(m.stage).toBe('vote');
    g.vote(uc, voters[0]);
    g.settle();
    expect(m.stage).toBe('out');
    expect(m.out).toBe(uc);
    expect(m.seat(uc)!.alive).toBe(false);
    expect(m.vote?.votes[voters[1]]).toBe(uc);
    expect(m.over).toBe('civil');
  });

  it('refuse un vote contre soi, contre un éliminé, ou d’un éliminé', () => {
    const g = newGame({ undercovers: 2 }, {});
    const m = begin(g, ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    allReady(g);
    cluesRound(g);
    expect(g.vote('p1', 'p1')).toBe('Tu ne peux pas voter contre toi.');
    const civ = byRole(m, 'civil')[0];
    voteOut(g, civ);
    g.next('p1', m.seq);
    cluesRound(g);
    expect(g.vote(civ, 'p2')).toBe('Seuls les joueurs encore en jeu votent.');
    expect(g.vote(m.alive[0], civ)).toBe('Ce joueur ne peut pas être désigné.');
  });

  it('en cas d’égalité, fait redonner un indice aux ex æquo et revoter entre eux, puis laisse le sort trancher', () => {
    const g = newGame();
    const m = begin(g, ['p1', 'p2', 'p3', 'p4']);
    allReady(g);
    cluesRound(g);
    // p1 et p2 contre p3, p3 et p4 contre p1.
    g.vote('p1', 'p3');
    g.vote('p2', 'p3');
    g.vote('p3', 'p1');
    g.vote('p4', 'p1');
    g.settle();
    expect(m.stage).toBe('clue');
    expect(m.duel).toEqual(['p1', 'p3']);
    expect([m.speaker, ...m.queue]).toEqual(['p1', 'p3']);
    g.clue('p1', 'duel un');
    g.clue('p3', 'duel trois');
    g.settle();
    expect(m.seat('p1')!.duelClue).toBe('duel un');
    expect(m.stage).toBe('vote');
    expect(g.vote('p2', 'p4')).toBe('Le duel se joue entre les ex æquo.');
    g.vote('p1', 'p3');
    g.vote('p2', 'p3');
    g.vote('p3', 'p1');
    g.vote('p4', 'p1');
    g.settle();
    expect(m.stage === 'out' || m.stage === 'guess').toBe(true);
    expect(m.vote?.draw).toEqual(['p1', 'p3']);
    expect(['p1', 'p3']).toContain(m.out);
  });

  it('ne fait sortir personne si le temps file sans un seul vote', () => {
    let now = 0;
    const g = newGame({}, { now: () => now, voteMs: 60_000 });
    const m = begin(g);
    allReady(g);
    cluesRound(g);
    now += 60_000;
    g.settle();
    expect(m.stage).toBe('out');
    expect(m.out).toBeNull();
    expect(m.alive.length).toBe(5);
    g.next('p1', m.seq);
    expect(m.stage).toBe('clue');
    expect(m.tour).toBe(2);
  });
});

describe('la fin d’une manche', () => {
  it('donne la victoire aux infiltrés quand il ne reste qu’un civil, avec 10 points par undercover', () => {
    const g = newGame();
    const m = begin(g, ['p1', 'p2', 'p3']);
    allReady(g);
    cluesRound(g);
    const civ = byRole(m, 'civil')[0];
    voteOut(g, civ);
    expect(m.over).toBe('infiltrators');
    g.next('p1', m.seq);
    expect(m.stage).toBe('end');
    const uc = byRole(m, 'undercover')[0];
    expect(m.result?.points).toEqual({ [uc]: 10 });
    expect(g.scores.get(uc)).toBe(10);
    expect(g.records).toHaveLength(1);
  });

  it('donne 2 points à chaque civil, éliminé ou non, quand tous les infiltrés sont sortis', () => {
    const g = newGame({ undercovers: 1 });
    const m = begin(g, ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    allReady(g);
    cluesRound(g);
    const civ = byRole(m, 'civil');
    voteOut(g, civ[0]);
    expect(m.over).toBeNull();
    g.next('p2', m.seq);
    cluesRound(g);
    voteOut(g, byRole(m, 'undercover')[0]);
    expect(m.over).toBe('civil');
    g.next('p2', m.seq);
    for (const id of civ) expect(m.result?.points[id]).toBe(2);
    expect(Object.keys(m.result!.points)).toHaveLength(5);
  });

  it('laisse Mister White éliminé deviner le mot des civils : s’il trouve, il gagne seul ses 6 points', () => {
    const g = newGame({ white: true });
    const m = begin(g, ['p1', 'p2', 'p3', 'p4', 'p5']);
    allReady(g);
    cluesRound(g);
    const white = byRole(m, 'white')[0];
    voteOut(g, white);
    expect(m.stage).toBe('guess');
    expect(g.guessWord(byRole(m, 'civil')[0], 'x')).toBe('Seul Mister White peut deviner.');
    expect(g.guessWord(white, `  le ${m.civilWord.toLowerCase()} `)).toBeUndefined();
    expect(m.guess?.correct).toBe(true);
    expect(m.over).toBe('white');
    g.next(white, m.seq);
    expect(m.result?.points).toEqual({ [white]: 6 });
  });

  it('continue la manche quand Mister White se trompe', () => {
    const g = newGame({ white: true });
    const m = begin(g, ['p1', 'p2', 'p3', 'p4', 'p5']);
    allReady(g);
    cluesRound(g);
    const white = byRole(m, 'white')[0];
    voteOut(g, white);
    g.guessWord(white, m.undercoverWord);
    expect(m.guess?.correct).toBe(false);
    expect(m.over).toBeNull();
    expect(m.stage).toBe('out');
    g.next(m.alive[0], m.seq);
    expect(m.stage).toBe('clue');
  });

  it('ignore un « Continuer » envoyé deux fois', () => {
    const g = newGame();
    const m = begin(g);
    allReady(g);
    cluesRound(g);
    voteOut(g, byRole(m, 'civil')[0]);
    const seq = m.seq;
    g.next('p1', seq);
    const tour = m.tour;
    g.next('p2', seq);
    expect(m.tour).toBe(tour);
  });
});

describe('la table', () => {
  function table(n: number, settings: Partial<Settings> = {}): { room: Room; ids: string[] } {
    const room = new Room('TEST');
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const p = room.addHuman(`J${i}`, 'loup');
      if (typeof p === 'string') throw new Error(p);
      room.connect(p, `s${i}`);
      ids.push(p.id);
    }
    room.updateSettings(ids[0], settings);
    return { room, ids };
  }

  it('ne montre à chacun que son propre mot, et dévoile tout à la fin', () => {
    const { room, ids } = table(5, { words: 'custom' });
    expect(room.start(ids[0])).toBe('Mots perso : il faut au moins une paire de mots.');
    expect(room.setPair(ids[1], 'Raclette', 'raclettes')).toBe('Deux mots différents, sinon personne ne se distingue !');
    expect(room.setPair(ids[1], 'Raclette', 'Fondue')).toBeUndefined();
    expect(room.viewFor(ids[1]).myPair).toEqual(['Raclette', 'Fondue']);
    expect(JSON.stringify(room.viewFor(ids[2]))).not.toContain('Raclette');
    expect(room.start(ids[0])).toBeUndefined();
    room.commit();
    const m = room.game!.manche!;
    expect(m.author).toBe(ids[1]);
    expect(room.pairs.size).toBe(0);
    for (const id of ids) {
      const json = JSON.stringify(room.viewFor(id));
      const own = m.seat(id)!.word;
      for (const w of ['Raclette', 'Fondue']) if (w !== own) expect(json).not.toContain(w);
      expect(json).not.toContain('"token"');
      expect(room.viewFor(id).game!.round.author).toBe(id === ids[1]);
    }
    room.dispose();
  });

  it('pioche dans la liste du jeu quand les mots perso sont épuisés, à la demande de l’hôte', () => {
    const { room, ids } = table(3, { words: 'custom' });
    room.setPair(ids[2], 'Camembert', 'Brie');
    room.start(ids[0]);
    const g = room.game!;
    const m = g.manche!;
    for (const id of ids) room.ready(id);
    room.commit();
    while (m.stage === 'clue') expect(room.spoke(m.speaker!, m.speaker, m.seq)).toBeUndefined();
    const civ = [...m.seats.values()].find((s) => s.role === 'civil')!.id;
    for (const id of m.alive) room.vote(id, id === civ ? m.alive.find((x) => x !== civ) : civ);
    room.commit();
    room.next(ids[0], m.seq);
    expect(m.stage).toBe('end');
    expect(room.nextManche(ids[1], false)).toBe("Seul l'hôte lance la manche suivante.");
    expect(room.nextManche(ids[0], false)).toBe('Plus aucune paire de mots perso : proposez-en, ou piochez dans la liste du jeu.');
    expect(room.nextManche(ids[0], true)).toBeUndefined();
    expect(g.manche!.n).toBe(2);
    expect(g.manche!.author).toBeNull();
    room.dispose();
  });

  it('assoit à la manche suivante ceux qui arrivent en cours de partie', () => {
    const { room, ids } = table(3);
    room.start(ids[0]);
    const late = room.addHuman('Tard', 'rose');
    if (typeof late === 'string') throw new Error(late);
    expect(late.status).toBe('spectator');
    const g = room.game!;
    const m = g.manche!;
    for (const id of ids) room.ready(id);
    room.commit();
    while (m.stage === 'clue') expect(room.spoke(m.speaker!, m.speaker, m.seq)).toBeUndefined();
    const civ = [...m.seats.values()].find((s) => s.role === 'civil')!.id;
    for (const id of m.alive) room.vote(id, id === civ ? m.alive.find((x) => x !== civ) : civ);
    room.commit();
    room.next(ids[0], m.seq);
    expect(room.nextManche(ids[0], false)).toBeUndefined();
    expect(g.manche!.seats.has(late.id)).toBe(true);
    expect(room.finish(ids[0])).toBeUndefined();
    expect(room.phase).toBe('finished');
    expect(room.final?.rounds).toHaveLength(1);
    room.dispose();
  });
});
