import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';


function handleZaku070Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';

  const opponentState = { ...state[opponentPlayer], chakra: state[opponentPlayer].chakra + 1 };
  const log = logAction(
    state.log, state.turn, state.phase, sourcePlayer,
    'EFFECT_CHAKRA',
    'Zaku Abumi (070): Opponent gains 1 Chakra.',
    'game.log.effect.oppGainChakra',
    { card: 'Zaku Abumi', id: 'KS-070-C', amount: '1' },
  );

  return { state: { ...state, [opponentPlayer]: opponentState, log } };
}

export function registerHandler(): void {
  registerEffect('KS-070-C', 'MAIN', handleZaku070Main);
}
