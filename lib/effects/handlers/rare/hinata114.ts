import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';
import type { CharacterInPlay } from '../../../engine/types';

/**
 * Card 114/130 - HINATA HYUGA (R)
 * Chakra: 3, Power: 2
 * Group: Leaf Village, Keywords: Team 8
 *
 * MAIN: POWERUP 2 (self); then POWERUP 1 on another character in play (any player).
 *   First applies POWERUP 2 on self, then requires target selection for
 *   which other character in play receives POWERUP 1.
 *
 * UPGRADE: Remove all Power tokens from an enemy character in play.
 *   When isUpgrade: find enemies with powerTokens > 0. Target selection. Set tokens to 0.
 */

function hinata114MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;

  // Step 1: POWERUP 2 on self
  let newState = { ...state };
  const missions = [...newState.activeMissions];

  // Apply POWERUP 2 on self across all missions (since sourceCard is in sourceMissionIndex)
  for (let i = 0; i < missions.length; i++) {
    const m = { ...missions[i] };
    m.player1Characters = m.player1Characters.map((c) =>
      c.instanceId === sourceCard.instanceId
        ? { ...c, powerTokens: c.powerTokens + 2 }
        : c,
    );
    m.player2Characters = m.player2Characters.map((c) =>
      c.instanceId === sourceCard.instanceId
        ? { ...c, powerTokens: c.powerTokens + 2 }
        : c,
    );
    missions[i] = m;
  }

  newState = {
    ...newState,
    activeMissions: missions,
    log: logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_POWERUP',
      'Hinata Hyuga (114): POWERUP 2 on self.',
      'game.log.effect.powerupSelf',
      { card: 'HINATA HYUGA', id: '114/130', amount: 2 },
    ),
  };

  // Step 2: Find all other characters in play (any player) for POWERUP 1
  const validTargets: string[] = [];
  for (const mission of newState.activeMissions) {
    for (const char of mission.player1Characters) {
      if (char.instanceId !== sourceCard.instanceId) {
        validTargets.push(char.instanceId);
      }
    }
    for (const char of mission.player2Characters) {
      if (char.instanceId !== sourceCard.instanceId) {
        validTargets.push(char.instanceId);
      }
    }
  }

  if (validTargets.length === 0) {
    return {
      state: {
        ...newState,
        log: logAction(
          newState.log, newState.turn, newState.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Hinata Hyuga (114): No other character in play for POWERUP 1.',
          'game.log.effect.noTarget',
          { card: 'HINATA HYUGA', id: '114/130' },
        ),
      },
    };
  }

  // If exactly one target, auto-resolve
  if (validTargets.length === 1) {
    return applyPowerup1(newState, validTargets[0], sourcePlayer);
  }

  return {
    state: newState,
    requiresTargetSelection: true,
    targetSelectionType: 'HINATA114_POWERUP_TARGET',
    validTargets,
    description: 'Hinata Hyuga (114): Choose another character in play to give POWERUP 1.',
  };
}

function applyPowerup1(
  state: EffectContext['state'],
  targetInstanceId: string,
  sourcePlayer: EffectContext['sourcePlayer'],
): EffectResult {
  let targetName = '';
  const missions = state.activeMissions.map((mission) => ({
    ...mission,
    player1Characters: mission.player1Characters.map((c) => {
      if (c.instanceId === targetInstanceId) {
        targetName = c.card.name_fr;
        return { ...c, powerTokens: c.powerTokens + 1 };
      }
      return c;
    }),
    player2Characters: mission.player2Characters.map((c) => {
      if (c.instanceId === targetInstanceId) {
        targetName = c.card.name_fr;
        return { ...c, powerTokens: c.powerTokens + 1 };
      }
      return c;
    }),
  }));

  return {
    state: {
      ...state,
      activeMissions: missions,
      log: logAction(
        state.log, state.turn, state.phase, sourcePlayer,
        'EFFECT_POWERUP',
        `Hinata Hyuga (114): POWERUP 1 on ${targetName}.`,
        'game.log.effect.powerup',
        { card: 'HINATA HYUGA', id: '114/130', amount: 1, target: targetName },
      ),
    },
  };
}

function hinata114UpgradeHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Find enemy characters with power tokens > 0
  const validTargets: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of mission[enemySide]) {
      if (char.powerTokens > 0) {
        validTargets.push(char.instanceId);
      }
    }
  }

  if (validTargets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Hinata Hyuga (114) UPGRADE: No enemy character with Power tokens.',
          'game.log.effect.noTarget',
          { card: 'HINATA HYUGA', id: '114/130' },
        ),
      },
    };
  }

  // If exactly one target, auto-resolve
  if (validTargets.length === 1) {
    return applyRemoveTokens(state, validTargets[0], sourcePlayer, enemySide);
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'HINATA114_REMOVE_TOKENS',
    validTargets,
    description: 'Hinata Hyuga (114) UPGRADE: Choose an enemy character to remove all Power tokens from.',
  };
}

function applyRemoveTokens(
  state: EffectContext['state'],
  targetInstanceId: string,
  sourcePlayer: EffectContext['sourcePlayer'],
  enemySide: 'player1Characters' | 'player2Characters',
): EffectResult {
  let targetName = '';
  let removedAmount = 0;

  const missions = state.activeMissions.map((mission) => ({
    ...mission,
    player1Characters: mission.player1Characters.map((c) => {
      if (c.instanceId === targetInstanceId) {
        targetName = c.card.name_fr;
        removedAmount = c.powerTokens;
        return { ...c, powerTokens: 0 };
      }
      return c;
    }),
    player2Characters: mission.player2Characters.map((c) => {
      if (c.instanceId === targetInstanceId) {
        targetName = c.card.name_fr;
        removedAmount = c.powerTokens;
        return { ...c, powerTokens: 0 };
      }
      return c;
    }),
  }));

  return {
    state: {
      ...state,
      activeMissions: missions,
      log: logAction(
        state.log, state.turn, state.phase, sourcePlayer,
        'EFFECT_REMOVE_TOKENS',
        `Hinata Hyuga (114) UPGRADE: Removed ${removedAmount} Power tokens from ${targetName}.`,
        'game.log.effect.removeTokens',
        { card: 'HINATA HYUGA', id: '114/130', amount: removedAmount, target: targetName },
      ),
    },
  };
}

export function registerHinata114Handlers(): void {
  registerEffect('114/130', 'MAIN', hinata114MainHandler);
  registerEffect('114/130', 'UPGRADE', hinata114UpgradeHandler);
}
