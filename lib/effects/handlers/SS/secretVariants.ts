import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { getEffectivePower } from '@/lib/effects/powerUtils';
import { isImmuneToEnemyHideOrDefeat } from '@/lib/effects/ContinuousEffects';
import { enemyOf, sideKey, topOf } from './sandMove';
import { confirmFirst } from './confirmFirst';

export const SASUKE_148_ID = 'SS-148-SV';
export const ZABUZA_150_ID = 'SS-150-SV';
export const SASUKE_148_DUEL_POWERUP = 3;

function noTarget(state: GameState, player: PlayerID, message: string, card: string, id: string): EffectResult {
  return {
    state: {
      ...state,
      log: logAction(state.log, state.turn, state.phase, player, 'EFFECT_NO_TARGET', message,
        'game.log.effect.noTarget', { card, id }),
    },
  };
}

export function isUpgraded(char: CharacterInPlay): boolean {
  return (char.stack?.length ?? 0) > 1;
}

export function printedPowerOf(char: CharacterInPlay): number {
  return topOf(char).power ?? 0;
}

export function sasuke148DefeatTargets(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  sourceInstanceId: string,
): string[] {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return [];
  const self = mission[sideKey(player)].find((c) => c.instanceId === sourceInstanceId);
  if (!self) return [];
  const ownPower = getEffectivePower(state, self, player);

  return mission[sideKey(enemyOf(player))]
    .filter((c) => !c.isHidden
      && isUpgraded(c)
      && !isImmuneToEnemyHideOrDefeat(c)
      && printedPowerOf(c) < ownPower)
    .map((c) => c.instanceId);
}

function sasuke148Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex, sourceCard } = ctx;
  const validTargets = sasuke148DefeatTargets(state, sourcePlayer, sourceMissionIndex, sourceCard.instanceId);
  if (validTargets.length === 0) {
    return noTarget(state, sourcePlayer,
      'Sasuke Uchiha (SS-148) MAIN: No enemy upgraded character weak enough in this mission.',
      'SASUKE UCHIWA', SASUKE_148_ID);
  }
  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS148_DEFEAT_UPGRADED',
    validTargets,
    isOptional: true,
    description: 'Sasuke Uchiha (SS-148) MAIN: Defeat an enemy upgraded character, then move yourself.',
    descriptionKey: 'game.effect.desc.ss148DefeatUpgraded',
  }, sourceCard.instanceId, 'SS148_CONFIRM_MAIN');
}

function sasuke148Duel(ctx: EffectContext): EffectResult {
  const { state, sourceCard } = ctx;
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS148_CONFIRM_DUEL',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ amount: SASUKE_148_DUEL_POWERUP }),
    descriptionKey: 'game.effect.desc.ss148DuelPowerup',
    descriptionParams: { amount: String(SASUKE_148_DUEL_POWERUP) },
  };
}

export function strongestEnemyIn(
  state: GameState,
  player: PlayerID,
  missionIndex?: number,
): CharacterInPlay | null {
  const enemySide = sideKey(enemyOf(player));
  let best: CharacterInPlay | null = null;
  let bestPower = -1;
  state.activeMissions.forEach((mission, index) => {
    if (missionIndex !== undefined && index !== missionIndex) return;
    for (const char of mission[enemySide]) {
      if (char.isHidden) continue;
      const power = getEffectivePower(state, char, char.controlledBy);
      if (power > bestPower) {
        bestPower = power;
        best = char;
      }
    }
  });
  return best;
}

function zabuza150Duel(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex, sourceCard } = ctx;
  const strongest = strongestEnemyIn(state, sourcePlayer);
  if (!strongest) {
    return noTarget(state, sourcePlayer,
      'Zabuza Momochi (SS-150) DUEL: No enemy character in play.', 'ZABUZA MOMOCHI', ZABUZA_150_ID);
  }
  const alreadyHere = state.activeMissions[sourceMissionIndex]?.[sideKey(enemyOf(sourcePlayer))]
    .some((c) => c.instanceId === (strongest as CharacterInPlay).instanceId);
  if (alreadyHere) {
    return noTarget(state, sourcePlayer,
      'Zabuza Momochi (SS-150) DUEL: The strongest enemy is already in this mission.',
      'ZABUZA MOMOCHI', ZABUZA_150_ID);
  }
  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS150_PULL_STRONGEST',
    validTargets: [(strongest as CharacterInPlay).instanceId],
    isOptional: true,
    description: 'Zabuza Momochi (SS-150) DUEL: Move the strongest enemy character here.',
    descriptionKey: 'game.effect.desc.ss150PullStrongest',
  }, sourceCard.instanceId, 'SS150_CONFIRM_DUEL');
}

export function zabuza150Amount(state: GameState, player: PlayerID, missionIndex: number): number {
  const strongest = strongestEnemyIn(state, player, missionIndex);
  return strongest ? (topOf(strongest).chakra ?? 0) : 0;
}

function zabuza150Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex, sourceCard } = ctx;
  const amount = zabuza150Amount(state, sourcePlayer, sourceMissionIndex);
  if (amount <= 0) {
    return noTarget(state, sourcePlayer,
      'Zabuza Momochi (SS-150) UPGRADE: No enemy character in this mission to measure.',
      'ZABUZA MOMOCHI', ZABUZA_150_ID);
  }
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS150_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ amount }),
    descriptionKey: 'game.effect.desc.ss150PowerupByCost',
    descriptionParams: { amount: String(amount) },
  };
}

export function registerSecretVariantHandlers(): void {
  for (const id of [SASUKE_148_ID, 'SS-148-S']) {
    registerEffect(id, 'MAIN', sasuke148Main);
    registerEffect(id, 'DUEL', sasuke148Duel);
  }
  for (const id of [ZABUZA_150_ID, 'SS-150-S']) {
    registerEffect(id, 'DUEL', zabuza150Duel);
    registerEffect(id, 'UPGRADE', zabuza150Upgrade);
  }
}
