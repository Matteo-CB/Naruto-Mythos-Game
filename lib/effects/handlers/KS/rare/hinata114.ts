import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';



function hinata114MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourceCard } = ctx;

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'HINATA114_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: 'Hinata Hyuga (114): POWERUP 2 on self, then POWERUP 1 on another friendly character in play.',
    descriptionKey: 'game.effect.desc.hinata114ConfirmMain',
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
        { card: 'HINATA HYUGA', id: 'KS-114-R', amount: 1, target: targetName },
      ),
    },
  };
}

function hinata114UpgradeHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  
  let hasValidTarget = false;
  for (const mission of state.activeMissions) {
    for (const char of mission[enemySide]) {
      if (char.powerTokens > 0) {
        hasValidTarget = true;
        break;
      }
    }
    if (hasValidTarget) break;
  }

  if (!hasValidTarget) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Hinata Hyuga (114) UPGRADE: No enemy character with Power tokens.',
          'game.log.effect.noTarget',
          { card: 'HINATA HYUGA', id: 'KS-114-R' },
        ),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'HINATA114_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: 'Hinata Hyuga (114) UPGRADE: Remove all Power tokens from an enemy character in play.',
    descriptionKey: 'game.effect.desc.hinata114ConfirmUpgrade',
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
        { card: 'HINATA HYUGA', id: 'KS-114-R', amount: removedAmount, target: targetName },
      ),
    },
  };
}

export function registerHinata114Handlers(): void {
  registerEffect('KS-114-R', 'MAIN', hinata114MainHandler);
  registerEffect('KS-114-R', 'UPGRADE', hinata114UpgradeHandler);
}
