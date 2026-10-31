// Les règles, lisibles en deux minutes et consultables à tout moment.
import { Eye, MessageSquareText, Pointer, Swords, Trophy } from 'lucide-react';
import { POINTS } from '../../../shared/protocol';
import { useStore } from '../store';
import { MaskIcon, Modal, Stamp } from './Ui';

export function RulesModal() {
  const open = useStore((s) => s.rulesOpen);
  const setOpen = useStore((s) => s.setRulesOpen);
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Les règles" wide>
      <div className="rules">
        <section className="rule-hero">
          <div className="rule-words" aria-hidden>
            <span className="rule-card">Chat</span>
            <span className="rule-card">Chat</span>
            <span className="rule-card is-odd">Chien</span>
            <span className="rule-card">Chat</span>
          </div>
          <p>
            Tout le monde reçoit <b>le même mot secret</b>… sauf <b>l'undercover</b>, qui en a un proche. Personne ne sait dans quel camp il est : à chacun de le deviner en écoutant les autres. <b>Démasquez l'imposteur avant qu'il ne vous élimine.</b>
          </p>
        </section>

        <section>
          <h3>Une manche</h3>
          <ol className="rule-steps">
            <li>
              <Eye size={20} aria-hidden />
              <div>
                <b>Chacun lit son mot</b>, en cachette. L'undercover ne sait pas qu'il l'est : son mot lui paraît tout à fait normal.
              </div>
            </li>
            <li>
              <MessageSquareText size={20} aria-hidden />
              <div>
                <b>Tour à tour, chacun donne un indice</b> sur son mot : à voix haute, ou tapé dans l'appli selon le réglage de l'hôte. Pas le mot lui-même, et jamais deux fois le même indice. Trop précis, tu aides l'undercover ; trop vague, tu deviens suspect.
              </div>
            </li>
            <li>
              <Pointer size={20} aria-hidden />
              <div>
                <b>On vote</b> pour le joueur le plus suspect. Les votes restent secrets jusqu'au dernier. Le plus désigné sort et <b>dévoile son rôle</b>. Puis on refait un tour d'indices.
              </div>
            </li>
            <li>
              <Swords size={20} aria-hidden />
              <div>
                <b>Égalité ?</b> Les ex æquo redonnent un indice, puis on revote entre eux. Encore égalité : le sort tranche.
              </div>
            </li>
          </ol>
        </section>

        <section className="rule-split">
          <div className="rule-case">
            <h3>
              <Trophy size={18} aria-hidden /> Qui gagne ?
            </h3>
            <p>
              <b>Les civils</b>, quand tous les infiltrés sont sortis. <b>Les infiltrés</b> (undercovers et Mister White), s'ils tiennent jusqu'à ce qu'il ne reste qu'un civil.
            </p>
            <ul className="rule-points">
              <li>
                <Stamp role="civil" /> {POINTS.civil} points chacun
              </li>
              <li>
                <Stamp role="undercover" /> {POINTS.undercover} points
              </li>
              <li>
                <Stamp role="white" /> {POINTS.white} points
              </li>
            </ul>
          </div>
          <div className="rule-case is-white">
            <h3>
              <MaskIcon blank className="rule-mask" /> Mister White
            </h3>
            <p>
              En option. Il <b>n'a pas de mot</b> et le sait : il improvise d'après les indices des autres. Il ne parle jamais en premier. Éliminé, il tente de <b>deviner le mot des civils</b> : s'il trouve, il gagne seul la manche.
            </p>
          </div>
        </section>

        <section className="rule-case">
          <h3>Mots perso</h3>
          <p>
            En option. Chacun propose <b>deux mots proches</b> (par exemple « Raclette » et « Fondue »). À chaque manche, le jeu prend la paire d'un joueur, et tire au sort quel mot va aux civils et lequel à l'undercover. Son auteur connaît donc les deux mots, mais pas son camp, et il ne peut pas être Mister White. Chacun son tour !
          </p>
        </section>

        <p className="rule-foot">
          D'après <i>Undercover</i>, le jeu de Yanstar Studio. Création de fans, non officielle, avec ses propres visuels. Liste de mots tirée du projet libre <i>undercover-word-game</i> d'Ante Brähler (licence MIT), revue et complétée.
        </p>
      </div>
    </Modal>
  );
}
