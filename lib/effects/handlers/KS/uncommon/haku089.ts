import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 089/130 - HAKU "Crystal Ice Mirrors" (UC)
 * Chakra: 4 | Power: 3
 * Group: Independent | Keywords: Rogue Ninja, Kekkei Genkai
 *
 * MAIN: Discard the top card of opponent's deck, then POWERUP X on self where
 *   X = the chakra cost of the discarded card.
 *
 * UPGRADE: MAIN effect: Instead, discard the top card of YOUR OWN deck (and POWERUP X).
 *
 * Modifier pattern: CONFIRM MAIN → if upgrade, CONFIRM UPGRADE MODIFIER (own deck vs opponent deck).
 * The UPGRADE "effect:" is a Type A modifier — the engine skips it in orderedTypes.
 */

function handleHaku089Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex, isUpgrade } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';

  // Pre-check: target deck must have cards
  // If not upgrade: opponent deck. If upgrade: at least one deck (opponent or own) must have cards.
  const opponentDeckEmpty = state[opponentPlayer].deck.length === 0;
  const ownDeckEmpty = state[sourcePlayer].deck.length === 0;

  if (!isUpgrade && opponentDeckEmpty) {
    const log = logAction(state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET', "Haku (089): Opponent's deck is empty. Cannot discard.",
      'game.log.effect.noTarget', { card: 'HAKU', id: 'KS-089-UC' });
    return { state: { ...state, log } };
  }

  if (isUpgrade && opponentDeckEmpty && ownDeckEmpty) {
    const log = logAction(state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET', 'Haku (089): Both decks are empty. Cannot discard.',
      'game.log.effect.noTarget', { card: 'HAKU', id: 'KS-089-UC' });
    return { state: { ...state, log } };
  }

  // Confirmation popup
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'HAKU089_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ missionIndex: sourceMissionIndex }),
    descriptionKey: 'game.effect.desc.haku089ConfirmMain',
  };
}

function handleHaku089UpgradeNoop(ctx: EffectContext): EffectResult {
  // No-op: Type A modifier — handled by engine's HAKU089_CONFIRM_MAIN + UPGRADE_MODIFIER cases.
  return { state: ctx.state };
}

export function registerHaku089Handlers(): void {
  registerEffect('KS-089-UC', 'MAIN', handleHaku089Main);
  registerEffect('KS-089-UC', 'UPGRADE', handleHaku089UpgradeNoop);
}
