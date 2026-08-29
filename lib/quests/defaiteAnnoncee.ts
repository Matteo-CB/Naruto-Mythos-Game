import type { CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { emitEngineQuestEvent } from './engineEmit';
import { champsDeLaSource, sourceCourante } from './sourceCourante';

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
  const source = sourceCourante();
  emitEngineQuestEvent(state, source?.player ?? sourcePlayer, 'character.defeated.by.card', {
    ...champsDeLaSource(),
    targetName: sommet.name_fr,
    isHidden: vaincu.isHidden,
  });
}
