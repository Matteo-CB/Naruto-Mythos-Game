import type { CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { emitEngineQuestEvent } from './engineEmit';
import { champsDeLaSource, sourceCourante } from './sourceCourante';

// Le moteur possede plusieurs chemins de defaite. Ils annoncent tous le meme fait par ici,
// sinon une carte vaincue par l un compterait et par l autre non, sans que rien ne le dise.
export function annoncerDefaite(
  state: GameState,
  sourcePlayer: PlayerID,
  vaincu: CharacterInPlay,
): void {
  const sommet = vaincu.stack?.length > 0 ? vaincu.stack[vaincu.stack.length - 1] : vaincu.card;
  if (!sommet) return;
  emitEngineQuestEvent(state, sourcePlayer, 'character.defeated', {
    targetName: sommet.name_fr,
    targetKeywords: sommet.keywords ?? [],
    isHidden: vaincu.isHidden,
  });
  emitEngineQuestEvent(state, sourcePlayer, 'character.defeated.by.name', {
    name: sommet.name_fr,
  });
  // La defaite par carte revient a celui qui a pose la carte, meme quand c est l adversaire
  // qui designe la victime.
  const source = sourceCourante();
  emitEngineQuestEvent(state, source?.player ?? sourcePlayer, 'character.defeated.by.card', {
    ...champsDeLaSource(),
    targetName: sommet.name_fr,
    isHidden: vaincu.isHidden,
  });
}
