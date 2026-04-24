import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';


function handleAkamaru028Main(ctx: EffectContext): EffectResult {
  
  return { state: ctx.state };
}

function handleAkamaru028Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const friendlyChars = mission[friendlySide];

  
  const kibaTargets: string[] = [];
  for (const char of friendlyChars) {
    if (char.isHidden) continue;
    const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
    if (topCard.name_fr === 'KIBA INUZUKA') {
      kibaTargets.push(char.instanceId);
    }
  }

  
  if (kibaTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Akamaru (028): No friendly Kiba Inuzuka in this mission for POWERUP 2.',
      'game.log.effect.noTarget', { card: 'AKAMARU', id: 'KS-028-UC' }) } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'AKAMARU028_CONFIRM_AMBUSH',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.akamaru028ConfirmAmbush',
  };
}

function applyPowerupToTarget(
  state: import('@/lib/effects/EffectTypes').EffectContext['state'],
  targetInstanceId: string,
  amount: number,
  missionIndex: number,
  sourcePlayer: import('@/lib/engine/types').PlayerID,
): import('@/lib/effects/EffectTypes').EffectContext['state'] {
  let targetName = '';
  const newState = { ...state };
  const missions = [...state.activeMissions];
  const mission = { ...missions[missionIndex] };

  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const chars = [...mission[friendlySide]];
  const idx = chars.findIndex(c => c.instanceId === targetInstanceId);

  if (idx !== -1) {
    targetName = chars[idx].card.name_fr;
    chars[idx] = { ...chars[idx], powerTokens: chars[idx].powerTokens + amount };
    mission[friendlySide] = chars;
    missions[missionIndex] = mission;
    newState.activeMissions = missions;
  }

  newState.log = logAction(
    state.log, state.turn, state.phase, sourcePlayer,
    'EFFECT_POWERUP',
    `Akamaru (028): POWERUP ${amount} on ${targetName} (ambush).`,
    'game.log.effect.powerup',
    { card: 'AKAMARU', id: 'KS-028-UC', amount, target: targetName },
  );

  return newState;
}

export function registerAkamaru028Handlers(): void {
  registerEffect('KS-028-UC', 'MAIN', handleAkamaru028Main);
  registerEffect('KS-028-UC', 'AMBUSH', handleAkamaru028Ambush);
}
