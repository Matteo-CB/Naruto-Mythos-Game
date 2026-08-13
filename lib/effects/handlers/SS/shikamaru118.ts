import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { canBeHiddenByEnemy, isImmuneToEnemyHideOrDefeat } from '@/lib/effects/ContinuousEffects';
import { confirmFirst } from './confirmFirst';

export const SHIKAMARU_118_ID = 'SS-118-CHIBIV';
export const SHIKAMARU_118_BASE_ID = 'SS-118-R';
export const SHIKAMARU_118_NAME = 'SHIKAMARU NARA';

function enemyOf(player: PlayerID): PlayerID {
  return player === 'player1' ? 'player2' : 'player1';
}

function sideOf(player: PlayerID): 'player1Characters' | 'player2Characters' {
  return player === 'player1' ? 'player1Characters' : 'player2Characters';
}

export function topCardOf(char: CharacterInPlay) {
  return char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
}

function noTarget(state: GameState, player: PlayerID, message: string): EffectResult {
  return {
    state: {
      ...state,
      log: logAction(state.log, state.turn, state.phase, player, 'EFFECT_NO_TARGET', message,
        'game.log.effect.noTarget', { card: SHIKAMARU_118_NAME, id: SHIKAMARU_118_ID }),
    },
  };
}

export function hiddenEnemiesInPlay(state: GameState, player: PlayerID): string[] {
  const enemySide = sideOf(enemyOf(player));
  const targets: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of mission[enemySide]) {
      if (char.isHidden && !isImmuneToEnemyHideOrDefeat(char)) targets.push(char.instanceId);
    }
  }
  return targets;
}

export function enemiesNamed(state: GameState, player: PlayerID, name: string): string[] {
  const enemy = enemyOf(player);
  const enemySide = sideOf(enemy);
  const wanted = name.toUpperCase();
  const targets: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of mission[enemySide]) {
      if (!canBeHiddenByEnemy(state, char, enemy)) continue;
      const top = topCardOf(char);
      if ((top.name_fr ?? '').toUpperCase() === wanted || (top.name_en ?? '').toUpperCase() === wanted) {
        targets.push(char.instanceId);
      }
    }
  }
  return targets;
}

function shikamaru118Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const validTargets = hiddenEnemiesInPlay(state, sourcePlayer);
  if (validTargets.length === 0) {
    return noTarget(state, sourcePlayer, 'Shikamaru Nara (SS-118) AMBUSH: No enemy hidden character in play.');
  }
  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS118_REVEAL_DEFEAT',
    validTargets,
    isOptional: true,
    description: 'Shikamaru Nara (SS-118) AMBUSH: Reveal and defeat an enemy hidden character.',
    descriptionKey: 'game.effect.desc.ss118RevealDefeat',
  }, sourceCard.instanceId, 'SS118_CONFIRM_AMBUSH');
}

export function findCharacter(state: GameState, instanceId: string): CharacterInPlay | null {
  for (const mission of state.activeMissions) {
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const found = mission[side].find((c: CharacterInPlay) => c.instanceId === instanceId);
      if (found) return found;
    }
  }
  return null;
}

function shikamaru118Duel(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const revealed = findCharacter(state, sourceCard.instanceId)?.ss118RevealedName;
  if (!revealed) {
    return noTarget(state, sourcePlayer, 'Shikamaru Nara (SS-118) DUEL: No character was revealed.');
  }
  const validTargets = enemiesNamed(state, sourcePlayer, revealed);
  if (validTargets.length === 0) {
    return noTarget(state, sourcePlayer, 'Shikamaru Nara (SS-118) DUEL: No enemy shares the revealed name.');
  }
  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS118_HIDE_SAME_NAME',
    validTargets,
    isOptional: true,
    description: 'Shikamaru Nara (SS-118) DUEL: Hide an enemy character with the revealed name.',
    descriptionKey: 'game.effect.desc.ss118HideSameName',
  }, sourceCard.instanceId, 'SS118_CONFIRM_DUEL');
}

export function registerShikamaru118Handlers(): void {
  registerEffect(SHIKAMARU_118_ID, 'AMBUSH', shikamaru118Ambush);
  registerEffect(SHIKAMARU_118_ID, 'DUEL', shikamaru118Duel);
  registerEffect(SHIKAMARU_118_BASE_ID, 'AMBUSH', shikamaru118Ambush);
  registerEffect(SHIKAMARU_118_BASE_ID, 'DUEL', shikamaru118Duel);
}
