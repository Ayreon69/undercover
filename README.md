# Undercover

**Tout le monde a le même mot. Sauf un.**

👉 **Jouer : https://undercover-h60g.onrender.com** (la première ouverture peut prendre jusqu'à une minute, le temps que le serveur gratuit se réveille)

Jeu d'ambiance multijoueur en ligne, à jouer entre amis depuis un navigateur, sur téléphone ou ordinateur, sans compte ni installation.
D'après *Undercover*, l'application de Yanstar Studio (projet de fans, non officiel, avec ses propres visuels).

## Règles en bref

- De 3 à 12 joueurs. Les **civils** reçoivent tous le même mot ; l'**undercover** reçoit un mot proche, et ne sait pas qu'il est l'intrus.
- Tour à tour, chacun donne **un indice** sur son mot : ni le mot lui-même, ni un indice déjà donné.
- Puis **on vote**. Le plus désigné sort et dévoile son rôle, et on refait un tour d'indices.
- **Égalité** : les ex æquo redonnent un indice, puis on revote entre eux. Encore égalité : le sort tranche.
- Les civils gagnent quand tous les infiltrés sont sortis ; les infiltrés, quand il ne reste qu'un civil.
- **Mister White** (en option, désactivé au départ) n'a pas de mot et le sait. Démasqué, il tente de deviner le mot des civils : s'il trouve, il gagne seul la manche.
- Points d'une manche gagnée : 2 par civil, 10 par undercover, 6 pour Mister White.

Sont des choix de ce jeu :

- **Indices à voix haute ou à l'écrit**, au choix de l'hôte. À voix haute (par défaut), autour d'une table ou en appel : l'appli donne la parole à tour de rôle, le joueur dit son indice puis touche « C'est dit », et l'hôte peut passer au suivant si quelqu'un oublie. À l'écrit, chacun tape son indice, qui reste affiché sur son dossier jusqu'au vote. Dans les deux cas, le vote reste secret dans l'appli, et Mister White tape le mot qu'il devine.
- **Mots du jeu ou mots perso.** La liste du jeu compte 365 paires. En mots perso, chacun propose deux mots proches ; à chaque manche, le jeu prend la paire d'un joueur et tire au sort lequel des deux va aux civils. L'auteur de la paire connaît les deux mots mais pas son camp, et il n'est jamais Mister White.
- **Nombre d'undercovers** automatique (1 jusqu'à 6 joueurs, 2 jusqu'à 9, 3 au-delà) ou réglé par l'hôte.
- **Votes secrets** jusqu'à ce que tout le monde ait voté, puis dévoilés d'un coup.
- **Mister White ne parle jamais en premier**, et sa devinette tolère une faute de frappe sur les mots longs.
- **Chrono facultatif** : 30 ou 60 secondes par indice (à l'oral, le temps écoulé passe au suivant), une minute pour voter.
- **On n'attend pas les absents** : au bout de 20 secondes de coupure, un joueur passe son tour et ne bloque plus le vote. Une table entièrement absente est attendue.
- **Les retardataires regardent** la manche en cours et jouent à la suivante.

## Fonctionnalités

- Tables privées avec code à 4 lettres, lien d'invitation, partage natif et QR code
- Mot secret caché derrière un store : on le découvre d'un geste, il se recache tout seul
- Un dossier par joueur, avec son indice, les votes reçus et le tampon de son rôle quand il sort
- Réactions et petites phrases, règles consultables en jeu
- Fin de partie en confettis, avec le podium et le récapitulatif des manches
- Reprise automatique après une coupure
- Sons synthétisés et vibrations, animations réduites si le système le demande
- Aucune aide au calcul : ni probabilité, ni historique des indices des tours passés

## Développement

```bash
npm install
npm run dev:server   # serveur temps réel sur http://localhost:3140
npm run dev:client   # interface sur http://localhost:5193
npm test             # composition, mots, tours, oral, vote, duel, Mister White, points, secrets
npm run build && npm run e2e   # une partie à l'oral et une à l'écrit, avec de vrais clients connectés
```

`UC_FAST=1` raccourcit les délais d'absence et les chronos (tests locaux uniquement).

## Architecture

- `shared/` : contrat client/serveur, composition des rôles, comparaison des mots
- `server/` : Express + Socket.IO, moteur de partie (`game.ts`), paires de mots (`words.ts`), table, mots perso et minuteries (`room.ts`). Le serveur fait autorité : chacun ne reçoit que son propre mot, les rôles ne sortent qu'à l'élimination ou en fin de manche, et les paires perso restent chez leur auteur
- `client/` : React + Vite + Framer Motion. La table est dans `screens/Table.tsx`, le salon dans `screens/Lobby.tsx`
- Déploiement : un seul service Node (`npm ci && npm run build`, puis `npm start`)

## Crédits

La liste de mots part de celle du projet [undercover-word-game](https://github.com/antebrl/undercover-word-game) d'Ante Brähler, publiée sous licence MIT (texte complet dans `server/words.ts`), triée, corrigée et complétée.
