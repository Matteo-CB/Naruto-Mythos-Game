import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { getEffectivePower } from '@/lib/effects/powerUtils';

export const SNAKE_SWORD_ID = 'SS-101-UC';
export const SNAKE_SWORD_NAME = 'ÉPÉE SERPENT';

export function weakestVisibleIn(state: GameState, missionIndex: number): CharacterInPlay[] {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return [];

  const candidats = [...mission.player1Characters, ...mission.player2Characters]
    .filter((c) => !c.isHidden);
  if (candidats.length === 0) return [];

  let minimum = Infinity;
  for (const c of candidats) {
    const puissance = getEffectivePower(state, c, c.controlledBy);
    if (puissance < minimum) minimum = puissance;
  }

  return candidats.filter((c) => getEffectivePower(state, c, c.controlledBy) === minimum);
}

function snakeSwordFirstStrike(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;

  const plusFaibles = weakestVisibleIn(state, sourceMissionIndex);
  if (plusFaibles.length === 0) {
    return refuse(state, sourcePlayer, 'Snake Sword (101) FIRST STRIKE: no non-hidden character in this mission.');
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS101_CONFIRM_FIRST_STRIKE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ missionIndex: sourceMissionIndex }),
    descriptionKey: 'game.effect.desc.ss101DefeatWeakest',
  };
}

function refuse(state: GameState, player: PlayerID, texte: string): EffectResult {
  return {
    state: {
      ...state,
      log: logAction(state.log, state.turn, state.phase, player, 'EFFECT_NO_TARGET', texte,
        'game.log.effect.noTarget', { card: SNAKE_SWORD_NAME, id: SNAKE_SWORD_ID }),
    },
  };
}

export function registerSnakeSword101Handlers(): void {
  registerEffect(SNAKE_SWORD_ID, 'FIRST_STRIKE', snakeSwordFirstStrike);
}
