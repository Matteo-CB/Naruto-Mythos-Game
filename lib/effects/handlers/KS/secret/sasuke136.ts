import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';



function sasuke136MainHandler(ctx: EffectContext): EffectResult {
  
  const state = ctx.state;
  const log = logAction(
    state.log, state.turn, state.phase, ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Sasuke Uchiwa (136): Gain 1 Chakra when any character is defeated (continuous).',
    'game.log.effect.gainChakra',
    { card: 'SASUKE UCHIWA', id: 'KS-136-S', amount: 1 },
  );
  return { state: { ...state, log } };
}

function sasuke136UpgradeHandler(ctx: EffectContext): EffectResult {
  const state = ctx.state;
  const mission = state.activeMissions[ctx.sourceMissionIndex];

  const friendlySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const enemySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  
  const friendlyTargets = mission[friendlySide].filter(
    (c) => !c.isHidden && c.instanceId !== ctx.sourceCard.instanceId,
  );
  
  
  const enemyTargets = mission[enemySide];

  
  
  
  const hasFriendly = friendlyTargets.length > 0;
  const hasEnemy = enemyTargets.length > 0;

  if (!hasFriendly && !hasEnemy) {
    const log = logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Sasuke Uchiwa (136) UPGRADE: No friendly nor enemy character in this mission to defeat.',
      'game.log.effect.noTarget',
      { card: 'SASUKE UCHIWA', id: 'KS-136-S' },
    );
    return { state: { ...state, log } };
  }

  
  
  
  if (hasFriendly) {
    return {
      state,
      requiresTargetSelection: true,
      targetSelectionType: 'SASUKE136_CHOOSE_FRIENDLY',
      validTargets: friendlyTargets.map((c) => c.instanceId),
      isMandatory: true,
      description: JSON.stringify({
        missionIndex: ctx.sourceMissionIndex,
        text: 'Sasuke Uchiwa (136) UPGRADE: Choose a friendly character to defeat.',
      }),
      descriptionKey: 'game.effect.desc.sasuke136ChooseFriendly',
    };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SASUKE136_CHOOSE_ENEMY',
    validTargets: enemyTargets.map((c) => c.instanceId),
    isMandatory: true,
    description: JSON.stringify({
      missionIndex: ctx.sourceMissionIndex,
      text: 'Sasuke Uchiwa (136) UPGRADE: No friendly to sacrifice, choose an enemy to defeat.',
    }),
    descriptionKey: 'game.effect.desc.sasuke136ChooseEnemy',
  };
}

export function registerSasuke136Handlers(): void {
  registerEffect('KS-136-S', 'MAIN', sasuke136MainHandler);
  registerEffect('KS-136-S', 'UPGRADE', sasuke136UpgradeHandler);
  registerEffect('KS-136-MV', 'MAIN', sasuke136MainHandler);
  registerEffect('KS-136-MV', 'UPGRADE', sasuke136UpgradeHandler);
}
