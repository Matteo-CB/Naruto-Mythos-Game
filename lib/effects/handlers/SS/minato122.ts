import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { confirmFirst } from './confirmFirst';
import type { CharacterInPlay } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

const TAILED_BEAST = 'Tailed Beast';

function stackCards(char: CharacterInPlay) {
  return char.stack?.length > 0 ? char.stack : [char.card];
}

export function stackHasTailedBeast(char: CharacterInPlay): boolean {
  return stackCards(char).some((c) => (c.keywords ?? []).includes(TAILED_BEAST));
}

export function topIsTailedBeast(char: CharacterInPlay): boolean {
  const cards = stackCards(char);
  const top = cards[cards.length - 1];
  return (top.keywords ?? []).includes(TAILED_BEAST);
}

function minato122MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;

  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  const mission = state.activeMissions[sourceMissionIndex];
  const discardTargets = mission
    ? mission[enemySide].filter((c) => !c.isHidden && stackHasTailedBeast(c)).map((c) => c.instanceId)
    : [];

  const moveTargets: string[] = [];
  if (state.activeMissions.length >= 2) {
    for (const m of state.activeMissions) {
      for (const c of m[friendlySide]) {
        if (c.isHidden || c.instanceId === sourceCard.instanceId) continue;
        if (topIsTailedBeast(c)) moveTargets.push(c.instanceId);
      }
    }
  }

  const validTargets = [...discardTargets, ...moveTargets];

  if (validTargets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Minato Namikaze (122): No enemy Tailed Beast stack to discard and no friendly Tailed Beast to move.',
          'game.log.effect.noTarget',
          { card: 'MINATO NAMIKAZE', id: 'SS-122-SPV' },
        ),
      },
    };
  }

  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'MINATO122_SELECT',
    validTargets,
    isOptional: true,
    description: JSON.stringify({ sourceMissionIndex, discardTargets, moveTargets }),
    descriptionKey: 'game.effect.desc.minato122Select',
  }, ctx.sourceCard.instanceId, 'MINATO122_CONFIRM_MAIN');
}

export function registerMinato122Handlers(): void {
  registerEffect('SS-122-SPV', 'MAIN', minato122MainHandler);
  registerEffect('SS-122-SP', 'MAIN', minato122MainHandler);
}
