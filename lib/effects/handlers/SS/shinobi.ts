import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CardData } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { playLessBlockedRevealResult, playLessSelectionResult, type PlayLessCategory } from '@/lib/effects/handlers/shared/playLess';

const HINATA_ID = 'SS-111-SHINOBIV';
const HINATA_NAME = 'HINATA HYÛGA';
const SS111_CATEGORY: PlayLessCategory = { kind: 'name', value: 'HYUGA' };

export function topmostHinataIndexInDiscard(discardPile: ReadonlyArray<CardData>): number {
  for (let i = discardPile.length - 1; i >= 0; i--) {
    const card = discardPile[i];
    const label = `${card.name_fr ?? ''} ${card.name_en ?? ''}`.toUpperCase();
    if (label.includes('HINATA')) return i;
  }
  return -1;
}

function ss111DuelHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const index = topmostHinataIndexInDiscard(state[sourcePlayer].discardPile);

  if (index === -1) {
    return {
      state: {
        ...state,
        log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
          'Hinata Hyuga (SS-111): No Hinata Hyuga in the discard pile.',
          'game.log.effect.noTarget', { card: HINATA_NAME, id: HINATA_ID }),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS111_CONFIRM_DUEL',
    validTargets: [ctx.sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ discardIndex: index }),
    descriptionKey: 'game.effect.desc.ss111ConfirmDuel',
  };
}

function ss111MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const selection = playLessSelectionResult(state, sourcePlayer, {
    category: SS111_CATEGORY,
    costReduction: 3,
    sourceName: HINATA_NAME,
    sourceId: HINATA_ID,
    textFallback: 'Hinata Hyuga (SS-111): Play a Hyuga-named character anywhere, paying 3 less.',
    descriptionKey: 'game.effect.desc.ss111PlayHyuga',
  });

  if (!selection) {
    const blocked = playLessBlockedRevealResult(state, sourcePlayer, SS111_CATEGORY, 'Hinata Hyuga (SS-111)');
    if (blocked) return blocked;
    return {
      state: {
        ...state,
        log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
          'Hinata Hyuga (SS-111): No affordable Hyuga-named character available.',
          'game.log.effect.noTarget', { card: HINATA_NAME, id: HINATA_ID }),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS111_CONFIRM_MAIN',
    validTargets: [ctx.sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({}),
    descriptionKey: 'game.effect.desc.ss111ConfirmMain',
  };
}

export function ss111PlayHyugaSelection(ctx: EffectContext): EffectResult | null {
  return playLessSelectionResult(ctx.state, ctx.sourcePlayer, {
    category: SS111_CATEGORY,
    costReduction: 3,
    sourceName: HINATA_NAME,
    sourceId: HINATA_ID,
    textFallback: 'Hinata Hyuga (SS-111): Play a Hyuga-named character anywhere, paying 3 less.',
    descriptionKey: 'game.effect.desc.ss111PlayHyuga',
  });
}

export function registerShinobiHandlers(): void {
  registerEffect(HINATA_ID, 'DUEL', ss111DuelHandler);
  registerEffect(HINATA_ID, 'MAIN', ss111MainHandler);
  registerEffect('SS-111-CHIBIV', 'DUEL', ss111DuelHandler);
  registerEffect('SS-111-CHIBIV', 'MAIN', ss111MainHandler);
}
