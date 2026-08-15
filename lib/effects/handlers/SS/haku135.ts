import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CardData, CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { sideFor } from '@/lib/effects/moveNameUniqueness';

export const HAKU_135 = 'SS-135-R';
export const HAKU_135_VARIANTS = [HAKU_135];

function topOf(char: CharacterInPlay) {
  return char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
}

export function ennemisMoinsChersQue(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  seuil: number,
): CharacterInPlay[] {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return [];
  const adversaire: PlayerID = player === 'player1' ? 'player2' : 'player1';
  return mission[sideFor(adversaire)].filter((c) => {
    if (c.isHidden) return false;
    return ((topOf(c) as unknown as CardData).chakra ?? 0) < seuil;
  });
}

function haku135Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  if (state[sourcePlayer].deck.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
          'Haku (135): the deck is empty, nothing to discard.',
          'game.log.effect.noTarget', { card: 'HAKU', id: HAKU_135 }),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS135_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({}),
    descriptionKey: 'game.effect.desc.ss135DiscardThenHide',
  };
}

export function registerHaku135Handlers(): void {
  for (const id of HAKU_135_VARIANTS) {
    registerEffect(id, 'UPGRADE', haku135Upgrade);
  }
}
