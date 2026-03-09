import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import type { CharacterInPlay } from '@/lib/engine/types';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 148/130 - KAKASHI HATAKE (M)
 * Chakra: 4, Power: 5
 * Group: Leaf Village, Keywords: Team 7
 *
 * MAIN: Gain the Edge token.
 *   - Sets state.edgeHolder to sourcePlayer.
 *
 * AMBUSH: Copy an instant effect (non-continuous [hourglass]) of another
 *         friendly Team 7 character in play.
 *   - Find all friendly characters across all missions with keyword "Team 7" (not self).
 *   - For each, check their effects: find MAIN or UPGRADE effects that are NOT
 *     continuous ([hourglass]) and NOT SCORE.
 *   - If valid targets found, require target selection for which character to copy from.
 *   - The actual copying/execution of the chosen effect is handled by the
 *     EffectEngine's target resolution pipeline.
 *   - For auto-resolution: pick the first valid Team 7 character with a copyable effect.
 */

function kakashi148MainHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };

  // Gain the Edge token
  state = { ...state, edgeHolder: ctx.sourcePlayer };

  const log = logAction(
    state.log, state.turn, state.phase, ctx.sourcePlayer,
    'EFFECT_EDGE',
    'Kakashi Hatake (148): Gained the Edge token.',
    'game.log.effect.gainEdge',
    { card: 'KAKASHI HATAKE', id: 'KS-148-M' },
  );

  return { state: { ...state, log } };
}

function kakashi148AmbushHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;

  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  // Find all friendly Team 7 characters (not self) that have copyable effects
  const validTargets: string[] = [];

  for (let i = 0; i < state.activeMissions.length; i++) {
    for (const char of state.activeMissions[i][friendlySide]) {
      if (char.instanceId === ctx.sourceCard.instanceId) continue;
      if (char.isHidden) continue;

      // Check if this character has keyword "Team 7"
      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      if (!topCard.keywords || !topCard.keywords.includes('Team 7')) continue;

      // Check if this character has any non-continuous, non-UPGRADE instant effects
      const hasCopyableEffect = topCard.effects.some((effect) => {
        // Only copy MAIN, AMBUSH, or SCORE instant effects (not UPGRADE)
        if (effect.type !== 'MAIN' && effect.type !== 'AMBUSH' && effect.type !== 'SCORE') return false;
        // Skip continuous effects (marked with [⧗] symbol)
        if (effect.description.includes('[⧗]')) return false;
        // Exclude effect modifiers
        if (effect.description.startsWith('effect:') || effect.description.startsWith('effect.')) return false;
        return true;
      });

      if (hasCopyableEffect) {
        validTargets.push(char.instanceId);
      }
    }
  }

  if (validTargets.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET',
      'Kakashi Hatake (148): No friendly Team 7 character with a copyable instant effect found (ambush).',
      'game.log.effect.noTarget',
      { card: 'KAKASHI HATAKE', id: 'KS-148-M' },
    );
    return { state: { ...state, log } };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KAKASHI148_COPY_EFFECT',
    validTargets,
    description: 'Kakashi Hatake (148): Choose a friendly Team 7 character whose instant effect to copy.',
    descriptionKey: 'game.effect.desc.kakashi148CopyEffect',
  };
}

export function registerKakashi148Handlers(): void {
  registerEffect('KS-148-M', 'MAIN', kakashi148MainHandler);
  registerEffect('KS-148-M', 'AMBUSH', kakashi148AmbushHandler);
}
