import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { canAffordAsUpgrade } from '@/lib/effects/handlers/KS/shared/upgradeCheck';
import { generateInstanceId } from '@/lib/engine/utils/id';
import type { CharacterInPlay, CharacterCard } from '@/lib/engine/types';

/**
 * Card 125/130 - TAYUYA (R)
 * Chakra: 3, Power: 2
 * Group: Sound Village, Keywords: Sound Four
 *
 * MAIN [continuous]: Non-hidden enemies cost 1 extra Chakra to play in this mission.
 *   This is a continuous cost modifier handled by the engine's chakra validation.
 *   The handler here is a no-op.
 *
 * UPGRADE: Play a Sound Village character from hand, paying 2 less.
 *   When isUpgrade: find Sound Village characters in hand that the player can afford
 *   (cost - 2). Target selection for which to play, then which mission.
 */

function tayuya125MainHandler(ctx: EffectContext): EffectResult {
  // Continuous cost modifier - handled by the engine's chakra validation.
  // Non-hidden enemies cost 1 extra to play in this mission.
  return { state: ctx.state };
}

function tayuya125UpgradeHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const playerState = state[sourcePlayer];
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  const validTargets: string[] = [];

  // Find Sound Village characters in hand that the player can afford (fresh play OR upgrade, cost - 2)
  for (let i = 0; i < playerState.hand.length; i++) {
    const card = playerState.hand[i];
    if (card.group === 'Sound Village') {
      const freshCost = Math.max(0, card.chakra - 2);
      const canFresh = playerState.chakra >= freshCost;
      const canUpgrade = canAffordAsUpgrade(state, sourcePlayer, card as { name_fr: string; chakra: number }, 2);
      if (canFresh || canUpgrade) {
        validTargets.push(String(i));
      }
    }
  }

  // Also find hidden friendly Sound Village characters on the board that can be revealed (cost - 2)
  for (const mission of state.activeMissions) {
    for (const char of mission[friendlySide]) {
      if (!char.isHidden) continue;
      // Player knows their own hidden cards - can target them by group
      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      if (topCard.group === 'Sound Village') {
        const revealCost = Math.max(0, topCard.chakra - 2);
        if (playerState.chakra >= revealCost) {
          validTargets.push(`board:${char.instanceId}`);
        }
      }
    }
  }

  if (validTargets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Tayuya (125) UPGRADE: No affordable Sound Village character in hand or hidden on board (cost reduced by 2).',
          'game.log.effect.noTarget',
          { card: 'TAYUYA', id: 'KS-125-R' },
        ),
      },
    };
  }

  // Embed hidden board char info so the UI can display card names/images for board: targets
  const hiddenBoardChars: Array<{ instanceId: string; name_fr: string; name_en?: string; chakra: number; power: number; image_file?: string; missionIndex: number }> = [];
  for (let mIdx = 0; mIdx < state.activeMissions.length; mIdx++) {
    const mission = state.activeMissions[mIdx];
    for (const char of mission[friendlySide]) {
      if (!char.isHidden) continue;
      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      if (topCard.group === 'Sound Village') {
        hiddenBoardChars.push({
          instanceId: char.instanceId,
          name_fr: topCard.name_fr,
          name_en: topCard.name_en,
          chakra: topCard.chakra ?? 0,
          power: topCard.power ?? 0,
          image_file: topCard.image_file,
          missionIndex: mIdx,
        });
      }
    }
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'TAYUYA125_CHOOSE_SOUND',
    validTargets,
    description: JSON.stringify({
      text: 'Tayuya (125) UPGRADE: Choose a Sound Village character from hand or hidden on board to play/reveal (paying 2 less).',
      hiddenChars: hiddenBoardChars,
    }),
    descriptionKey: 'game.effect.desc.tayuya125PlaySound',
  };
}

export function registerTayuya125Handlers(): void {
  registerEffect('KS-125-R', 'MAIN', tayuya125MainHandler);
  registerEffect('KS-125-R', 'UPGRADE', tayuya125UpgradeHandler);
}
