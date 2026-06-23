import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';



function kakashi148MainHandler(ctx: EffectContext): EffectResult {
  const state = ctx.state;
  const player = ctx.sourcePlayer;

  const log = logAction(
    state.log, state.turn, state.phase, player,
    'EFFECT',
    'Kakashi Hatake (148): Gains the Edge and cannot lose it during this round.',
    'game.log.effect.kakashi148GainLockEdge',
    { card: 'KAKASHI HATAKE', id: 'KS-148-M' },
  );

  return {
    state: {
      ...state,
      edgeHolder: player,
      edgeLockedFor: player,
      log,
    },
  };
}

export function registerKakashi148Handlers(): void {
  registerEffect('KS-148-M', 'MAIN', kakashi148MainHandler);
}
