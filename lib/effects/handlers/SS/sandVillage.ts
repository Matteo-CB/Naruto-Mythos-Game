import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { isDuelConditionMet } from '@/lib/effects/duelUtils';
import { confirmFirst } from './confirmFirst';
import type { CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { getEffectivePower } from '@/lib/effects/powerUtils';
import { charactersMovableFromMission, enemyOf, sideKey, topOf } from './sandMove';

function noTarget(state: GameState, player: PlayerID, message: string, card: string, id: string): EffectResult {
  return {
    state: {
      ...state,
      log: logAction(state.log, state.turn, state.phase, player, 'EFFECT_NO_TARGET', message,
        'game.log.effect.noTarget', { card, id }),
    },
  };
}

function costOf(char: CharacterInPlay): number {
  return topOf(char).chakra ?? 0;
}


function ss046Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const deck = state[sourcePlayer].deck;
  const hasSand = deck.some((c) => c.card_type === 'character' && c.group === 'Sand Village');
  if (!hasSand) {
    return noTarget(state, sourcePlayer, 'Gaara (SS-046): No Sand Village character left in the deck.', 'GAARA', 'SS-046-UC');
  }
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS046_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: 'Gaara (SS-046) MAIN: Reveal until a Sand Village character, draw it, shuffle the rest back.',
    descriptionKey: 'game.effect.desc.ss046ConfirmMain',
  };
}


function ss047Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const enemySide = sideKey(enemyOf(sourcePlayer));
  const validTargets: string[] = [];
  state.activeMissions.forEach((mission) => {
    for (const char of mission[enemySide]) {
      if (getEffectivePower(state, char, char.controlledBy) <= 3) validTargets.push(char.instanceId);
    }
  });
  if (validTargets.length === 0) {
    return noTarget(state, sourcePlayer, 'One-Tail (SS-047) UPGRADE: No enemy with Power 3 or less.', 'ONE-TAIL', 'SS-047-UC');
  }
  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS047_DEFEAT',
    validTargets,
    isOptional: true,
    description: 'One-Tail (SS-047) UPGRADE: Defeat an enemy character with Power 3 or less.',
    descriptionKey: 'game.effect.desc.ss047Defeat',
  }, ctx.sourceCard.instanceId, 'SS047_CONFIRM_UPGRADE');
}


function ss078Duel(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const enemySide = sideKey(enemyOf(sourcePlayer));
  const validTargets: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of mission[enemySide]) {
      const cost = char.isHidden ? 0 : costOf(char);
      if (cost <= 2) validTargets.push(char.instanceId);
    }
  }
  if (validTargets.length === 0) {
    return noTarget(state, sourcePlayer, 'Gaara (SS-078) DUEL: No enemy with cost 2 or less.', 'GAARA', 'SS-078-UC');
  }
  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS078_DUEL_DEFEAT',
    validTargets,
    isOptional: true,
    description: 'Gaara (SS-078) DUEL: Defeat an enemy character with cost 2 or less.',
    descriptionKey: 'game.effect.desc.ss078DuelDefeat',
  }, ctx.sourceCard.instanceId, 'SS078_CONFIRM_DUEL');
}


function ss114Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const hand = state[sourcePlayer].hand;
  const gaaraIndices: string[] = [];
  hand.forEach((c, i) => {
    if ((c.name_en ?? '').toUpperCase() === 'GAARA' || (c.name_fr ?? '').toUpperCase() === 'GAARA') gaaraIndices.push(String(i));
  });
  if (gaaraIndices.length === 0) {
    return noTarget(state, sourcePlayer, 'Gaara (SS-114) MAIN: No Gaara in hand to discard.', 'GAARA', 'SS-114-R');
  }
  const mission = state.activeMissions[sourceMissionIndex];
  if (!mission) {
    return noTarget(state, sourcePlayer, 'Gaara (SS-114) MAIN: No enemy character in this mission.', 'GAARA', 'SS-114-R');
  }
  const willDefeat = isDuelConditionMet(state, sourceMissionIndex, 'DUEL Rock Lee:');
  const reachableEnemies = mission[sideKey(enemyOf(sourcePlayer))]
    .filter((c) => willDefeat || !c.isHidden);
  if (reachableEnemies.length === 0) {
    return noTarget(state, sourcePlayer, 'Gaara (SS-114) MAIN: No enemy character in this mission.', 'GAARA', 'SS-114-R');
  }
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS114_CONFIRM_MAIN',
    validTargets: [ctx.sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({}),
    descriptionKey: 'game.effect.desc.ss114ConfirmMain',
  };
}


function ss117Duel(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const enemy = enemyOf(sourcePlayer);
  const enemySide = sideKey(enemy);
  const validTargets: string[] = [];
  state.activeMissions.forEach((mission, mi) => {
    if (mi === sourceMissionIndex) return;
    for (const char of mission[enemySide]) {
      if (charactersMovableFromMission(state, mi, 'enemy', sourcePlayer).includes(char.instanceId)) {
        validTargets.push(char.instanceId);
      }
    }
  });
  const reachable = validTargets.filter((id) => {
    for (let mi = 0; mi < state.activeMissions.length; mi++) {
      const found = state.activeMissions[mi][enemySide].find((c) => c.instanceId === id);
      if (!found) continue;
      const name = topOf(found).name_fr?.toUpperCase();
      const clash = state.activeMissions[sourceMissionIndex][enemySide].some(
        (c) => c.instanceId !== id && !c.isHidden && topOf(c).name_fr?.toUpperCase() === name,
      );
      return !(clash && !found.isHidden);
    }
    return false;
  });
  if (reachable.length === 0) {
    return noTarget(state, sourcePlayer, 'Kankuro (SS-117) DUEL: No enemy character can be moved here.', 'KANKURO', 'SS-117-R');
  }
  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS117_DUEL_MOVE',
    validTargets: reachable,
    isOptional: true,
    description: 'Kankuro (SS-117) DUEL: Move an enemy character to this mission.',
    descriptionKey: 'game.effect.desc.ss117DuelMove',
  }, ctx.sourceCard.instanceId, 'SS117_CONFIRM_DUEL');
}


function ss119Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  if (state.activeMissions.length < 2) {
    return noTarget(state, sourcePlayer, 'Temari (SS-119) MAIN: Only 1 mission in play.', 'TEMARI', 'SS-119-R');
  }
  const validTargets = charactersMovableFromMission(state, sourceMissionIndex, 'enemy', sourcePlayer);
  if (validTargets.length === 0) {
    return noTarget(state, sourcePlayer, 'Temari (SS-119) MAIN: No enemy character can be moved from this mission.', 'TEMARI', 'SS-119-R');
  }
  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS119_MOVE_CHAR',
    validTargets,
    isOptional: true,
    description: 'Temari (SS-119) MAIN: Move an enemy character from this mission.',
    descriptionKey: 'game.effect.desc.ss119MoveChar',
  }, ctx.sourceCard.instanceId, 'SS119_CONFIRM_MAIN');
}

function ss119Duel(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS119_CONFIRM_DUEL',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: 'Temari (SS-119) DUEL: Draw a card and gain the Edge.',
    descriptionKey: 'game.effect.desc.ss119DuelConfirm',
  };
}


function ss085Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  if (state.activeMissions.length < 2) {
    return noTarget(state, sourcePlayer, 'Giant Fan (SS-085): Only 1 mission in play.', 'GIANT FAN', 'SS-085-UC');
  }
  const hostPower = getEffectivePower(state, sourceCard, sourcePlayer);
  const validTargets = charactersMovableFromMission(
    state, sourceMissionIndex, 'enemy', sourcePlayer,
    (char) => getEffectivePower(state, char, char.controlledBy) < hostPower,
  );
  if (validTargets.length === 0) {
    return noTarget(state, sourcePlayer, 'Giant Fan (SS-085): No weaker enemy can be moved from this mission.', 'GIANT FAN', 'SS-085-UC');
  }
  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS085_MOVE_CHAR',
    validTargets,
    isOptional: true,
    description: 'Giant Fan (SS-085): Move a weaker enemy character from this mission.',
    descriptionKey: 'game.effect.desc.ss085MoveChar',
  }, sourceCard.instanceId, 'SS085_CONFIRM_MAIN');
}


function ss099Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  if (!mission) {
    return noTarget(state, sourcePlayer, 'Blade of the Thunder God (SS-099): Mission not found.', 'BLADE OF THE THUNDER GOD', 'SS-099-UC');
  }
  const hostPower = getEffectivePower(state, sourceCard, sourcePlayer);
  const validTargets: string[] = [];
  for (const char of mission[sideKey(enemyOf(sourcePlayer))]) {
    if (char.isHidden) continue;
    if (!(topOf(char).keywords ?? []).includes('Jutsu')) continue;
    if (getEffectivePower(state, char, char.controlledBy) >= hostPower) continue;
    validTargets.push(char.instanceId);
  }
  if (validTargets.length === 0) {
    return noTarget(state, sourcePlayer, 'Blade of the Thunder God (SS-099): No weaker enemy Jutsu character here.', 'BLADE OF THE THUNDER GOD', 'SS-099-UC');
  }
  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS099_HIDE',
    validTargets,
    isOptional: true,
    description: 'Blade of the Thunder God (SS-099): Hide a weaker enemy Jutsu character in this mission.',
    descriptionKey: 'game.effect.desc.ss099Hide',
  }, sourceCard.instanceId, 'SS099_CONFIRM_MAIN');
}


export function registerSandVillageHandlers(): void {
  registerEffect('SS-046-UC', 'MAIN', ss046Main);
  registerEffect('SS-047-UC', 'UPGRADE', ss047Upgrade);
  registerEffect('SS-078-UC', 'DUEL', ss078Duel);
  registerEffect('SS-114-R', 'MAIN', ss114Main);
  registerEffect('SS-114-SHINOBIV', 'MAIN', ss114Main);
  registerEffect('SS-117-R', 'DUEL', ss117Duel);
  registerEffect('SS-119-R', 'MAIN', ss119Main);
  registerEffect('SS-119-R', 'DUEL', ss119Duel);
  registerEffect('SS-085-UC', 'MAIN', ss085Main);
  registerEffect('SS-099-UC', 'MAIN', ss099Main);
}
