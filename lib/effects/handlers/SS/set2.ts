import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { PlayerID, CharacterInPlay } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { getEffectivePower } from '@/lib/effects/powerUtils';
import { playLessSelectionResult } from '@/lib/effects/handlers/shared/playLess';
import { ss000DeckHounds, ss000FinalizeSearch, ss000HoundChoicePayload, SS000_MAX_HOUNDS } from './ss000Search';

function sideFor(player: PlayerID, which: 'friendly' | 'enemy'): 'player1Characters' | 'player2Characters' {
  const friendly = player === 'player1' ? 'player1Characters' : 'player2Characters';
  const enemy = player === 'player1' ? 'player2Characters' : 'player1Characters';
  return which === 'friendly' ? friendly : enemy;
}

function topOf(char: CharacterInPlay) {
  return char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
}


function ss147DuelHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const enemySide = sideFor(sourcePlayer, 'enemy');

  let enemyCount = 0;
  for (const m of state.activeMissions) {
    for (const c of m[enemySide]) if (!c.isHidden) enemyCount += 1;
  }

  if (enemyCount <= 0) {
    return {
      state: {
        ...state,
        log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
          'Naruto Uzumaki (SS-147): No non-hidden enemy in play, no POWERUP.',
          'game.log.effect.noTarget', { card: 'NARUTO UZUMAKI', id: 'SS-147-POPV' }),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS147_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ amount: enemyCount }),
    descriptionKey: 'game.effect.desc.ss147Confirm',
    descriptionParams: { amount: enemyCount },
  };
}


function ss134DuelHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex, isUpgrade } = ctx;
  const enemySide = sideFor(sourcePlayer, 'enemy');
  const enemyPlayer: PlayerID = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const mission = state.activeMissions[sourceMissionIndex];
  if (!mission) return { state };

  const enemies = mission[enemySide].filter((c) => !c.isHidden);
  const noTarget = (): EffectResult => ({
    state: {
      ...state,
      log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
        'Kurenai Yuhi (SS-134): No enemy strong enough to defeat.',
        'game.log.effect.noTarget', { card: 'KURENAI YUHI', id: 'SS-134-R' }),
    },
  });
  if (enemies.length === 0) return noTarget();

  let strongest = enemies[0];
  let maxP = getEffectivePower(state, strongest, enemyPlayer);
  for (const e of enemies.slice(1)) {
    const p = getEffectivePower(state, e, enemyPlayer);
    if (p > maxP) { maxP = p; strongest = e; }
  }

  const threshold = (isUpgrade || (sourceCard.stack?.length ?? 1) > 1) ? 5 : 6;
  if (maxP < threshold) return noTarget();

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS134_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ targetInstanceId: strongest.instanceId }),
    descriptionKey: threshold === 5 ? 'game.effect.desc.ss134ConfirmUpgrade' : 'game.effect.desc.ss134Confirm',
    descriptionParams: { power: maxP },
  };
}

function ss134UpgradeHandler(ctx: EffectContext): EffectResult {
  return { state: ctx.state };
}


function ss120DuelHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const enemySide = sideFor(sourcePlayer, 'enemy');
  const enemyPlayer: PlayerID = sourcePlayer === 'player1' ? 'player2' : 'player1';

  const validTargets: string[] = [];
  for (const m of state.activeMissions) {
    for (const c of m[enemySide]) {
      if (c.isHidden) continue;
      if (getEffectivePower(state, c, enemyPlayer) <= 4) validTargets.push(c.instanceId);
    }
  }

  if (validTargets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
          'Kiba Inuzuka (SS-120): No enemy with Power 4 or less to hide.',
          'game.log.effect.noTarget', { card: 'KIBA INUZUKA', id: 'SS-120-CHIBIV' }),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS120_CONFIRM_DUEL',
    validTargets: [ctx.sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({}),
    descriptionKey: 'game.effect.desc.ss120ConfirmDuel',
  };
}


function ss126DuelHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const sel = playLessSelectionResult(state, sourcePlayer, {
    category: { kind: 'group', value: 'Sound Village' },
    costReduction: 3,
    sourceName: 'SASUKE UCHIWA',
    sourceId: 'SS-126-SPV',
    textFallback: 'Sasuke Uchiha (SS-126): Play a Sound Village character anywhere, paying 3 less.',
    descriptionKey: 'game.effect.desc.ss126PlaySound',
  });
  if (!sel) {
    return {
      state: {
        ...state,
        log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
          'Sasuke Uchiha (SS-126): No affordable Sound Village character available.',
          'game.log.effect.noTarget', { card: 'SASUKE UCHIWA', id: 'SS-126-SPV' }),
      },
    };
  }
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS126_CONFIRM_DUEL',
    validTargets: [ctx.sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({}),
    descriptionKey: 'game.effect.desc.ss126ConfirmDuel',
  };
}


function ss121DuelHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const stack = sourceCard.stack ?? [];

  const noTarget = (msg: string): EffectResult => ({
    state: {
      ...state,
      log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
        `Naruto Uzumaki (SS-121): ${msg}`,
        'game.log.effect.noTarget', { card: 'NARUTO UZUMAKI', id: 'SS-121-R' }),
    },
  });

  if (stack.length < 2) return noTarget('No upgrade stack, nothing at the bottom to move.');

  const bottomCard = stack[0];
  const friendlySide = sideFor(sourcePlayer, 'friendly');
  const validDest: string[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i === sourceMissionIndex) continue;
    const dup = state.activeMissions[i][friendlySide].some((c) =>
      !c.isHidden && (topOf(c).name_fr ?? '').toUpperCase() === (bottomCard.name_fr ?? '').toUpperCase(),
    );
    if (!dup) validDest.push(String(i));
  }

  if (validDest.length === 0) return noTarget('No valid destination mission for the bottom card.');

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS121_CONFIRM_DUEL',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.ss121ConfirmDuel',
  };
}


function ss000SearchAndPlay(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex, triggerType } = ctx;

  const hounds = ss000DeckHounds(state, sourcePlayer);
  if (hounds.length === 0) {
    return { state: ss000FinalizeSearch(state, sourcePlayer, triggerType, sourceCard.instanceId, sourceMissionIndex, 0) };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS000_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({}),
    descriptionKey: 'game.effect.desc.ss000ConfirmMain',
  };
}


function ss112UpgradeHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const enemySide = sideFor(sourcePlayer, 'enemy');
  const mission = state.activeMissions[sourceMissionIndex];
  if (!mission) return { state };

  const validTargets: string[] = [];
  for (const c of mission[enemySide]) {
    if (c.isHidden) continue;
    if ((c.powerTokens ?? 0) > 0) validTargets.push(c.instanceId);
  }

  if (validTargets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
          'Neji Hyuga (SS-112): No enemy with Power tokens to remove in this mission.',
          'game.log.effect.noTarget', { card: 'NEJI HYÛGA', id: 'SS-112-SPV' }),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS112_CONFIRM_UPGRADE',
    validTargets: [ctx.sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({}),
    descriptionKey: 'game.effect.desc.ss112ConfirmUpgrade',
  };
}

function ss112DuelHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const enemySide = sideFor(sourcePlayer, 'enemy');
  const mission = state.activeMissions[sourceMissionIndex];
  if (!mission) return { state };

  const validTargets: string[] = [];
  for (const c of mission[enemySide]) {
    if (c.isHidden) continue;
    if ((c.powerTokens ?? 0) === 0) validTargets.push(c.instanceId);
  }

  if (validTargets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
          'Neji Hyuga (SS-112): No enemy without Power tokens to hide in this mission.',
          'game.log.effect.noTarget', { card: 'NEJI HYÛGA', id: 'SS-112-SPV' }),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS112_CONFIRM_DUEL',
    validTargets: [ctx.sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({}),
    descriptionKey: 'game.effect.desc.ss112ConfirmDuel',
  };
}


export function registerSet2Handlers(): void {
  registerEffect('SS-112-SPV', 'UPGRADE', ss112UpgradeHandler);
  registerEffect('SS-112-SPV', 'DUEL', ss112DuelHandler);
  registerEffect('SS-147-POPV', 'DUEL', ss147DuelHandler);
  registerEffect('SS-134-R', 'DUEL', ss134DuelHandler);
  registerEffect('SS-134-R', 'UPGRADE', ss134UpgradeHandler);
  registerEffect('SS-120-CHIBIV', 'DUEL', ss120DuelHandler);
  registerEffect('SS-126-SPV', 'DUEL', ss126DuelHandler);
  registerEffect('SS-121-R', 'DUEL', ss121DuelHandler);
  registerEffect('SS-000-L', 'MAIN', ss000SearchAndPlay);
  registerEffect('SS-000-L', 'DUEL', ss000SearchAndPlay);
}
