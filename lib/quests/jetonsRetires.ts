import type { GameState, PlayerID } from '@/lib/engine/types';
import { emitEngineQuestEvent } from './engineEmit';
import { champsDeLaSource } from './sourceCourante';

export const HOOK_JETONS_RETIRES = 'tokens.removed.by.card';

function totalDesJetons(state: GameState): number {
  if (!state?.activeMissions) return 0;
  let total = 0;
  for (const mission of state.activeMissions) {
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      for (const ch of mission[side] ?? []) total += ch.powerTokens ?? 0;
    }
  }
  return total;
}

// Aucun utilitaire central ne retire les jetons: chaque carte le fait a sa facon. On mesure
// donc la difference de part et d autre de l effet, ce qui couvre toutes les cartes, y
// compris celles ajoutees plus tard.
export function annoncerJetonsRetires(avant: GameState, apres: GameState, player: PlayerID): void {
  const retires = totalDesJetons(avant) - totalDesJetons(apres);
  if (retires <= 0) return;
  emitEngineQuestEvent(apres, player, HOOK_JETONS_RETIRES, {
    ...champsDeLaSource(),
    delta: retires,
  });
}
