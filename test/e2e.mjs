// Test de bout en bout : 6 joueurs (socket.io) jouent une partie à l'oral, en mots perso avec Mister White,
// puis une partie à l'écrit avec la liste du jeu et un chrono, sur le serveur compilé. Un joueur se déconnecte en route.
// Usage : npm run build && npm run e2e
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';

const PORT = 3900 + Math.floor(Math.random() * 90);
const URL = `http://localhost:${PORT}`;
const server = spawn(process.execPath, ['dist/server/index.mjs'], {
  env: { ...process.env, PORT: String(PORT), UC_FAST: '1' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  server.kill();
  process.exit(1);
};
setTimeout(() => fail('délai dépassé (3 min)'), 180_000).unref();

await new Promise((resolve) => server.stdout.on('data', (d) => String(d).includes('prêt') && resolve()));

const PAIRS = [
  ['Raclette', 'Fondue'],
  ['Plage', 'Piscine'],
  ['Tramway', 'Funiculaire'],
  ['Marmotte', 'Castor'],
  ['Harmonica', 'Accordéon'],
  ['Igloo', 'Chalet'],
];
const stats = { audited: 0, manches: 0, duels: 0, draws: 0, guesses: 0, whiteWins: 0, skips: 0, games: 0, forced: 0 };
/** Les mots de chaque manche, vus par leurs propriétaires : personne d'autre ne doit les recevoir. */
const wordsByManche = new Map();
/** Ce que le test sait de chaque manche (et que les joueurs ignorent) : qui est Mister White, et les mots de chacun. */
const secrets = new Map();
function secret(tag) {
  if (!secrets.has(tag)) secrets.set(tag, { white: null, words: [] });
  return secrets.get(tag);
}

function client(name) {
  const socket = io(URL, { transports: ['websocket'], forceNew: true });
  const c = { name, socket, view: null, acted: new Set(), session: null, paused: false };
  socket.on('state', (v) => {
    c.view = v;
    audit(c, v);
    if (!c.paused) play(c);
  });
  c.call = (event, payload = {}) => new Promise((res) => socket.emit(event, payload, res));
  return c;
}

function audit(c, v) {
  const json = JSON.stringify(v);
  if (json.includes('"token"')) fail('un jeton circule');
  const g = v.game;
  if (v.phase !== 'playing' || !g) return;
  stats.audited++;
  const r = g.round;
  const key = `${stats.games}:${r.n}`;
  if (!wordsByManche.has(key)) wordsByManche.set(key, new Set());
  const words = wordsByManche.get(key);
  if (r.word) words.add(r.word);
  const sec = secret(key);
  if (r.white) sec.white = v.me;
  if (r.word && r.stage === 'ready') sec.words.push(r.word);
  if (r.white && r.word !== null) fail('Mister White reçoit un mot');
  if (r.seats.some((s) => s.skipped)) stats.skips++;
  if (r.stage !== 'end') {
    for (const w of words) if (w !== r.word && json.includes(JSON.stringify(w))) fail(`${c.name} voit le mot « ${w} » qui n'est pas le sien`);
    if (r.result) fail('le bilan arrive avant la fin de la manche');
    for (const s of r.seats) if (s.alive && s.role) fail(`${c.name} voit le rôle d'un joueur encore en jeu`);
  } else if (!r.result) fail('pas de bilan en fin de manche');
  if (r.stage === 'vote' && r.myVote === undefined) fail('pas de champ de vote');
  for (const s of r.seats) if (s.voted && r.stage !== 'vote') fail('des votes visibles hors du vote');
  if (v.settings.clues === 'oral') {
    if (r.seats.some((s) => s.clue || s.duelClue)) fail('un indice écrit dans une partie à l’oral');
    // Personne ne doit être sauté, même quand l'hôte passe la parole en même temps que le joueur.
    if (r.stage === 'vote')
      for (const s of r.seats) {
        const heard = r.duel ? !r.duel.includes(s.id) || s.duelSpoke || s.skipped : s.spoke || s.skipped;
        if (s.alive && !heard) fail(`${s.id} n’a pas eu la parole`);
      }
  }
}

function once(c, key, fn) {
  if (c.acted.has(key)) return;
  c.acted.add(key);
  fn();
}

const ack = () => {};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
/** Un petit temps de réflexion, pour que la partie ne se joue pas en une milliseconde. */
const later = (c, fn) => setTimeout(() => !c.paused && c.socket.connected && fn(), 10 + Math.random() * 30);

function play(c) {
  const v = c.view;
  if (!v) return;
  const isHost = v.hostId === v.me;
  if (v.phase !== 'finished') c.inFinal = false;
  if (v.phase === 'finished') {
    if (!isHost || c.inFinal) return;
    c.inFinal = true;
    once(c, `final:${stats.games}`, () => {
      const f = v.final;
      if (!f || f.rounds.length === 0) fail('pas de récapitulatif');
      const total = Object.values(f.scores).reduce((a, b) => a + b, 0);
      if (total <= 0) fail('personne n’a marqué de point');
      stats.games++;
      if (stats.games === 1) {
        // Seconde partie : la liste du jeu, sans Mister White, avec un chrono.
        c.socket.emit('game:restart', {}, () => {
          c.socket.emit('room:settings', { words: 'list', clues: 'written', white: false, timer: 30, undercovers: 2 }, () => c.socket.emit('game:start', {}, ack));
        });
      } else finish();
    });
    return;
  }
  if (v.phase !== 'playing' || !v.game) return;
  const g = v.game;
  const r = g.round;
  const mine = r.seats.find((s) => s.id === v.me);
  const tag = `${stats.games}:${r.n}`;
  switch (r.stage) {
    case 'ready':
      if (mine && !mine.ready) once(c, `ready:${tag}`, () => c.socket.emit('game:ready', {}, ack));
      break;
    case 'clue':
      if (stats.games === 0 && r.n === 2 && !c.cut && c === others[3]) {
        c.cut = true;
        cut(c);
      }
      if (v.settings.clues === 'oral') {
        // À l'oral, on passe la parole ; l'hôte le fait parfois pour un joueur distrait, en même temps que lui.
        const forced = isHost && r.speaker !== v.me && Math.random() < 0.3;
        if (r.speaker === v.me || forced)
          once(c, `spoke:${tag}:${r.tour}:${r.duel ? 'd' : 't'}:${r.speaker}`, () => {
            if (forced) stats.forced++;
            later(c, () => c.socket.emit('game:spoke', { speaker: r.speaker, seq: r.seq }, (res) => res?.ok || fail(`parole refusée : ${res?.error}`)));
          });
        break;
      }
      if (r.speaker === v.me)
        once(c, `clue:${tag}:${r.tour}:${r.duel ? 'd' : 't'}`, () => {
          // Le joueur lent du chrono laisse passer son tour une fois.
          if (stats.games === 1 && c.name === 'Bot3' && r.tour === 1 && !r.duel && !c.slow) {
            c.slow = true;
            return;
          }
          later(c, () => c.socket.emit('game:clue', { text: `indice ${c.name} ${tag} ${r.tour}${r.duel ? ' duel' : ''}` }, (res) => res?.ok || fail(`indice refusé : ${res?.error}`)));
        });
      break;
    case 'vote':
      if (mine?.alive)
        once(c, `vote:${tag}:${r.tour}:${r.duel ? 'd' : 't'}`, () => {
          const pool = r.seats.filter((s) => s.alive && s.id !== v.me && (!r.duel || r.duel.includes(s.id))).map((s) => s.id);
          if (r.duel) stats.duels++;
          // Les votes se dispersent un peu, pour provoquer des égalités ; Mister White est souvent visé, pour qu'il devine.
          const white = secret(tag).white;
          const target = white && pool.includes(white) && Math.random() < 0.45 ? white : pick(pool);
          later(c, () => c.socket.emit('game:vote', { target }, (res) => res?.ok || fail(`vote refusé : ${res?.error}`)));
        });
      break;
    case 'guess':
      if (r.out === v.me)
        once(c, `guess:${tag}`, () => {
          stats.guesses++;
          // Une fois sur deux, il trouve : le mot le plus répandu de la manche.
          const counts = new Map();
          for (const w of secret(tag).words) counts.set(w, (counts.get(w) ?? 0) + 1);
          const civil = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'rien';
          later(c, () => c.socket.emit('game:guess', { text: Math.random() < 0.5 ? civil.toLowerCase() : 'Mauvaise réponse' }, ack));
        });
      break;
    case 'out':
      once(c, `out:${tag}:${r.seq}`, () => {
        if (c === host && r.vote?.draw) stats.draws++;
        if (c === host && r.guess?.correct) stats.whiteWins++;
        if (mine) setTimeout(() => c.socket.emit('game:next', { seq: r.seq }, ack), 20);
      });
      break;
    case 'end':
      if (isHost)
        once(c, `end:${tag}`, () => {
          stats.manches++;
          if (r.n >= 4) c.socket.emit('game:finish', {}, ack);
          else c.socket.emit('game:manche', { fromList: g.pairsLeft === 0 && v.settings.words === 'custom' }, (res) => res?.ok || fail(`manche refusée : ${res?.error}`));
        });
      break;
  }
}

const bots = Array.from({ length: 6 }, (_, i) => client(`Bot${i + 1}`));
const [host, ...others] = bots;
await new Promise((r) => host.socket.on('connect', r));
const created = await host.call('room:create', { name: host.name, avatar: 'loup' });
if (!created.ok) fail('création de table');
const code = created.data.code;
for (const b of others) {
  if (!b.socket.connected) await new Promise((r) => b.socket.on('connect', r));
  const res = await b.call('room:join', { code, name: b.name, avatar: 'renard' });
  if (!res.ok) fail(`${b.name} ne rejoint pas : ${res.error}`);
  b.session = res.data;
}
await host.call('room:settings', { words: 'custom', clues: 'oral', white: true });
for (const [i, b] of bots.entries()) {
  const res = await b.call('room:pair', { a: PAIRS[i][0], b: PAIRS[i][1] });
  if (!res.ok) fail(`paire refusée : ${res.error}`);
}
await new Promise((r) => setTimeout(r, 150));
if (host.view.pairs !== 6) fail('les paires ne sont pas comptées');
if (JSON.stringify(others[0].view).includes('Raclette')) fail('la paire de l’hôte fuit vers un autre joueur');
const started = await host.call('game:start');
if (!started.ok) fail(`lancement : ${started.error}`);

// Un joueur coupe son téléphone en pleine manche, puis revient.
async function cut(b) {
  b.paused = true;
  b.socket.disconnect();
  await new Promise((r) => setTimeout(r, 1500));
  b.socket.connect();
  await new Promise((r) => b.socket.once('connect', r));
  const res = await b.call('room:join', { code, playerId: b.session.playerId, token: b.session.token, resumeOnly: true });
  if (!res.ok) fail(`reprise de session : ${res.error}`);
  b.paused = false;
  stats.reconnected = true;
}

function finish() {
  if (stats.manches < 8) fail(`seulement ${stats.manches} manches`);
  if (!stats.reconnected) fail('la reconnexion n’a pas eu lieu');
  if (stats.skips === 0) fail('aucun tour passé (absent ou chrono)');
  if (stats.forced === 0) fail('l’hôte n’a jamais passé la parole');
  console.log(`✓ ${stats.games} parties, ${stats.manches} manches, ${stats.audited} états vérifiés, ${stats.duels} votes de duel, ${stats.draws} tirages au sort, ${stats.guesses} essais de Mister White (${stats.whiteWins} réussis), ${stats.skips} états avec un tour passé, ${stats.forced} paroles passées par l’hôte`);
  for (const b of bots) b.socket.close();
  server.kill();
  process.exit(0);
}
