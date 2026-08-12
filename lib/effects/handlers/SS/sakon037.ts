import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CharacterCard, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { sideKey, enemyOf, topOf } from './sandMove';
import { confirmFirst } from './confirmFirst';

export const SAKON_037_ID = 'SS-037-UC';
export const SAKON_037_NAME = 'SAKON';

export function soundFourInHand(state: GameState, player: PlayerID): string[] {
  const indices: string[] = [];
  state[player].hand.forEach((carte: CharacterCard, i: number) => {
    if ((carte.keywords ?? []).includes('Sound Four')) indices.push(String(i));
  });
  return indices;
}

export function enemiesUnderCost(state: GameState, player: PlayerID, limite: number): string[] {
  const side = sideKey(enemyOf(player));
  const cibles: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of mission[side]) {
      const cout = char.isHidden ? 0 : (topOf(char).chakra ?? 0);
      if (cout < limite) cibles.push(char.instanceId);
    }
  }
  return cibles;
}

function refuse(state: GameState, player: PlayerID, texte: string): EffectResult {
  return {
    state: {
      ...state,
      log: logAction(state.log, state.turn, state.phase, player, 'EFFECT_NO_TARGET', texte,
        'game.log.effect.noTarget', { card: SAKON_037_NAME, id: SAKON_037_ID }),
    },
  };
}

function sakon037Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;

  const enMain = soundFourInHand(state, sourcePlayer);
  if (enMain.length === 0) {
    return refuse(state, sourcePlayer, 'Sakon (037) UPGRADE: no Sound Four character in hand to reveal.');
  }
  if (enemiesUnderCost(state, sourcePlayer, enMain.length).length === 0) {
    return refuse(state, sourcePlayer, 'Sakon (037) UPGRADE: no enemy character could be defeated even by revealing every Sound Four in hand.');
  }

  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS037_REVEAL_SOUND_FOUR',
    validTargets: enMain,
    isOptional: true,
    description: JSON.stringify({}),
    descriptionKey: 'game.effect.desc.ss037RevealSoundFour',
    minSelections: 1,
    maxSelections: enMain.length,
  }, ctx.sourceCard.instanceId, 'SS037_CONFIRM_UPGRADE');
}

export function registerSakon037Handlers(): void {
  registerEffect(SAKON_037_ID, 'UPGRADE', sakon037Upgrade);
}
