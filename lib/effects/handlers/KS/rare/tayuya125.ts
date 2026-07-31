import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import {
  findAffordableSoundVillageInHand,
  findHiddenSoundVillageOnBoard,
} from '@/lib/effects/handlers/KS/shared/summonSearch';



function hasSoundVillageCandidate(state: EffectContext['state'], player: EffectContext['sourcePlayer']): boolean {
  const inHand = state[player].hand.some((c) => c.group === 'Sound Village');
  if (inHand) return true;
  const side = player === 'player1' ? 'player1Characters' : 'player2Characters';
  return state.activeMissions.some((mission) => mission[side].some((c) => c.isHidden));
}

function tayuya125MainHandler(ctx: EffectContext): EffectResult {


  return { state: ctx.state };
}

function tayuya125UpgradeHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;

  const handTargets = findAffordableSoundVillageInHand(state, sourcePlayer, 2);
  const hiddenTargets = findHiddenSoundVillageOnBoard(state, sourcePlayer, 2);

  if (handTargets.length === 0 && hiddenTargets.length === 0) {
    const anySoundVillage = hasSoundVillageCandidate(state, sourcePlayer);
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          anySoundVillage
            ? 'Tayuya (125) UPGRADE: A Sound Village character is available but its cost cannot be paid, even reduced by 2.'
            : 'Tayuya (125) UPGRADE: No Sound Village character available.',
          anySoundVillage ? 'game.log.effect.noChakra' : 'game.log.effect.noTarget',
          { card: 'TAYUYA', id: 'KS-125-R' },
        ),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'TAYUYA125_CONFIRM_UPGRADE',
    validTargets: [ctx.sourceCard.instanceId],
    description: JSON.stringify({
      text: 'Tayuya (125) UPGRADE: Play a Sound Village character (from hand or by revealing a hidden one), paying 2 less.',
    }),
    descriptionKey: 'game.effect.desc.tayuya125ConfirmUpgrade',
    isOptional: true,
  };
}

export function registerTayuya125Handlers(): void {
  registerEffect('KS-125-R', 'MAIN', tayuya125MainHandler);
  registerEffect('KS-125-R', 'UPGRADE', tayuya125UpgradeHandler);
}
