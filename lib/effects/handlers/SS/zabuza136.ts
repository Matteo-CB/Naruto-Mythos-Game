import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { idsJouesAuTourPrecedent } from '@/lib/engine/rules/discountedPlay';
import { sideFor } from '@/lib/effects/moveNameUniqueness';
import { confirmFirst } from './confirmFirst';

export const ZABUZA_136 = 'SS-136-R';

export function ennemisJouesMoinsCher(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
): CharacterInPlay[] {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return [];
  const adversaire: PlayerID = player === 'player1' ? 'player2' : 'player1';
  const joues = new Set(idsJouesAuTourPrecedent(state, adversaire));
  return mission[sideFor(adversaire)].filter((c) =>
    joues.has(c.instanceId) && c.playedBelowPrintedCost === true);
}

function zabuza136(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const cibles = ennemisJouesMoinsCher(state, sourcePlayer, sourceMissionIndex);
  if (cibles.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
          'Zabuza Momochi (136): no enemy character here was played last turn below its printed cost.',
          'game.log.effect.noTarget', { card: 'ZABUZA MOMOCHI', id: ZABUZA_136 }),
      },
    };
  }

  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS136_DEFEAT_DISCOUNTED',
    validTargets: cibles.map((c) => c.instanceId),
    isOptional: true,
    description: JSON.stringify({}),
    descriptionKey: 'game.effect.desc.ss136DefeatDiscounted',
  }, sourceCard.instanceId, 'SS136_CONFIRM_MAIN');
}

export function registerZabuza136Handler(): void {
  registerEffect(ZABUZA_136, 'MAIN', zabuza136);
}
