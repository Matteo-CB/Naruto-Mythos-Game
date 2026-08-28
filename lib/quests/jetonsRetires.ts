import type { GameState, PlayerID } from '@/lib/engine/types';
import { emitEngineQuestEvent } from './engineEmit';
import { champsDeLaSource } from './sourceCourante';

export const HOOK_JETONS_RETIRES = 'tokens.removed.by.card';

function jetonsParPersonnage(state: GameState): Map<string, number> {
  const parId = new Map<string, number>();
  if (!state?.activeMissions) return parId;
  for (const mission of state.activeMissions) {
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      for (const ch of mission[side] ?? []) parId.set(ch.instanceId, ch.powerTokens ?? 0);
    }
  }
  return parId;
}

// On compte ce que chaque personnage a perdu, pas la variation du total: une carte qui
// deplace des jetons d un camp a l autre en retire bel et bien a sa cible, et le total ne
// bougerait pas.
function jetonsPerdus(avant: GameState, apres: GameState): number {
  const av = jetonsParPersonnage(avant);
  const ap = jetonsParPersonnage(apres);
  let perdus = 0;
  for (const [id, valeur] of av) {
    const reste = ap.get(id);
    if (reste === undefined) continue;
    if (reste < valeur) perdus += valeur - reste;
  }
  return perdus;
}

// Aucun utilitaire central ne retire les jetons: chaque carte le fait a sa facon. On mesure
// donc la difference de part et d autre de l effet, ce qui couvre toutes les cartes, y
// compris celles ajoutees plus tard.
export function annoncerJetonsRetires(avant: GameState, apres: GameState, player: PlayerID): void {
  const retires = jetonsPerdus(avant, apres);
  if (retires <= 0) return;
  emitEngineQuestEvent(apres, player, HOOK_JETONS_RETIRES, {
    ...champsDeLaSource(),
    delta: retires,
  });
}
