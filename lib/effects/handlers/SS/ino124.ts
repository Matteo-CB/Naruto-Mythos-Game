import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { getEffectivePower } from '@/lib/effects/powerUtils';
import { duelPartnersIn, parseDuelCharacterName } from '@/lib/effects/duelUtils';
import { charactersMovableFromMission, enemyOf, sideKey } from './sandMove';
import { confirmFirst } from './confirmFirst';

export const INO_124_ID = 'SS-124-SHINOBIV';
export const INO_124_BASE_ID = 'SS-124-R';
export const INO_124_NAME = 'INO YAMANAKA';
export const INO_124_LOG_NAME = 'Ino Yamanaka';
const DEFAULT_DUEL_PARTNER = 'Sakura Haruno';

function topOf(char: CharacterInPlay) {
  return char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
}

function refuse(state: GameState, player: PlayerID, message: string): EffectResult {
  return {
    state: {
      ...state,
      log: logAction(state.log, state.turn, state.phase, player, 'EFFECT_NO_TARGET', message,
        'game.log.effect.noTarget', { card: INO_124_NAME, id: INO_124_ID }),
    },
  };
}

export function ino124DuelPartnerName(char: CharacterInPlay): string {
  for (const effect of topOf(char).effects ?? []) {
    if (effect.type !== 'DUEL') continue;
    const parsed = parseDuelCharacterName(effect.description);
    if (parsed) return parsed;
  }
  return DEFAULT_DUEL_PARTNER;
}

export function ino124ReferencePower(
  state: GameState,
  missionIndex: number,
  partnerName: string,
): number | null {
  const partners = duelPartnersIn(state, missionIndex, partnerName);
  if (partners.length === 0) return null;
  let best = getEffectivePower(state, partners[0], partners[0].controlledBy);
  for (const partner of partners) {
    const power = getEffectivePower(state, partner, partner.controlledBy);
    if (power > best) best = power;
  }
  return best;
}

export function ino124ControllableEnemies(
  state: GameState,
  sourcePlayer: PlayerID,
  referencePower: number,
): string[] {
  const enemySide = sideKey(enemyOf(sourcePlayer));
  const validTargets: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of mission[enemySide]) {
      if (getEffectivePower(state, char, char.controlledBy) < referencePower) {
        validTargets.push(char.instanceId);
      }
    }
  }
  return validTargets;
}

export function ino124MovableControlled(
  state: GameState,
  sourcePlayer: PlayerID,
  missionIndex: number,
): string[] {
  return charactersMovableFromMission(
    state, missionIndex, 'any', sourcePlayer,
    (char, owner) => owner === sourcePlayer
      && char.controlledBy === sourcePlayer
      && char.originalOwner !== sourcePlayer,
  );
}

function ino124Duel(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const partnerName = ino124DuelPartnerName(sourceCard);
  const referencePower = ino124ReferencePower(state, sourceMissionIndex, partnerName);
  if (referencePower === null) {
    return refuse(state, sourcePlayer,
      `Ino Yamanaka (124) DUEL: No visible ${partnerName} in this mission anymore.`);
  }
  const validTargets = ino124ControllableEnemies(state, sourcePlayer, referencePower);
  if (validTargets.length === 0) {
    return refuse(state, sourcePlayer,
      `Ino Yamanaka (124) DUEL: No enemy character with Power lower than ${referencePower} in play.`);
  }
  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS124_TAKE_CONTROL',
    validTargets,
    isOptional: true,
    description: 'Ino Yamanaka (SS-124) DUEL: Take control of an enemy character weaker than Sakura Haruno.',
    descriptionKey: 'game.effect.desc.ss124TakeControl',
  }, sourceCard.instanceId, 'SS124_CONFIRM_DUEL');
}

function ino124Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  if (state.activeMissions.length < 2) {
    return refuse(state, sourcePlayer, 'Ino Yamanaka (124) UPGRADE: Only 1 mission in play.');
  }
  const validTargets = ino124MovableControlled(state, sourcePlayer, sourceMissionIndex);
  if (validTargets.length === 0) {
    return refuse(state, sourcePlayer,
      'Ino Yamanaka (124) UPGRADE: No controlled character in this mission can be moved to another mission.');
  }
  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS124_MOVE_CONTROLLED',
    validTargets,
    isOptional: true,
    description: 'Ino Yamanaka (SS-124) UPGRADE: Move a controlled character from this mission.',
    descriptionKey: 'game.effect.desc.ss124MoveControlled',
  }, sourceCard.instanceId, 'SS124_CONFIRM_UPGRADE');
}

export function registerIno124Handlers(): void {
  registerEffect(INO_124_ID, 'DUEL', ino124Duel);
  registerEffect(INO_124_ID, 'UPGRADE', ino124Upgrade);
  registerEffect(INO_124_BASE_ID, 'DUEL', ino124Duel);
  registerEffect(INO_124_BASE_ID, 'UPGRADE', ino124Upgrade);
}
