import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { isMovementBlockedByKurenai } from '@/lib/effects/ContinuousEffects';
import type { CharacterInPlay } from '@/lib/engine/types';

/**
 * Card 143/130 - ITACHI UCHIWA "Traquant Naruto" (M)
 * Chakra: 5, Power: 5
 * Group: Akatsuki, Keywords: Rogue Ninja
 *
 * MAIN: Move a friendly character to this mission.
 *   - Player chooses which friendly character from another mission to move here.
 *
 * AMBUSH: Move an enemy character to this mission.
 *   - Player chooses which enemy character from another mission to move here.
 *   - Only triggers when Itachi is revealed from hidden.
 */

/** Check if moving a visible character to destMission would create a same-name conflict. */
function wouldConflictOnDest(
  char: CharacterInPlay,
  destChars: CharacterInPlay[],
): boolean {
  if (char.isHidden) return false; // hidden chars have no visible name
  const topCard = char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  const charName = topCard.name_fr.toUpperCase();
  return destChars.some(
    (c) => c.instanceId !== char.instanceId && !c.isHidden &&
      (c.stack?.length > 0 ? c.stack[c.stack.length - 1] : c.card).name_fr.toUpperCase() === charName,
  );
}

function itachi143MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const destChars = state.activeMissions[sourceMissionIndex][friendlySide];

  // Find all friendly characters in OTHER missions (not this one, not self)
  // Filter out chars that would create a name conflict on the destination mission
  const validTargets: string[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i === sourceMissionIndex) continue;
    if (isMovementBlockedByKurenai(state, i, sourcePlayer)) continue;
    for (const char of state.activeMissions[i][friendlySide]) {
      if (char.instanceId === ctx.sourceCard.instanceId) continue;
      if (wouldConflictOnDest(char, destChars)) continue;
      validTargets.push(char.instanceId);
    }
  }

  if (validTargets.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET',
      'Itachi Uchiwa (143): No friendly character in another mission to move here.',
      'game.log.effect.noTarget',
      { card: 'ITACHI UCHIWA', id: 'KS-143-M' },
    );
    return { state: { ...state, log } };
  }

  // Return CONFIRM popup first — EffectEngine will handle the actual target selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'ITACHI143_CONFIRM_MAIN',
    validTargets: [ctx.sourceCard.instanceId],
    description: JSON.stringify({ sourceMissionIndex, friendlyCount: validTargets.length }),
    descriptionKey: 'game.effect.desc.itachi143ConfirmMain',
  };
}

function itachi143AmbushHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const destChars = state.activeMissions[sourceMissionIndex][enemySide];

  // Find all enemy characters in OTHER missions
  // Filter out chars that would create a name conflict on the destination mission
  const validTargets: string[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i === sourceMissionIndex) continue;
    for (const char of state.activeMissions[i][enemySide]) {
      if (isMovementBlockedByKurenai(state, i, char.controlledBy)) continue;
      if (wouldConflictOnDest(char, destChars)) continue;
      validTargets.push(char.instanceId);
    }
  }

  if (validTargets.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET',
      'Itachi Uchiwa (143): No enemy character in another mission to move here (ambush).',
      'game.log.effect.noTarget',
      { card: 'ITACHI UCHIWA', id: 'KS-143-M' },
    );
    return { state: { ...state, log } };
  }

  // Return CONFIRM popup first — EffectEngine will handle the actual target selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'ITACHI143_CONFIRM_AMBUSH',
    validTargets: [ctx.sourceCard.instanceId],
    description: JSON.stringify({ sourceMissionIndex, enemyCount: validTargets.length }),
    descriptionKey: 'game.effect.desc.itachi143ConfirmAmbush',
  };
}

export function registerItachi143Handlers(): void {
  registerEffect('KS-143-M', 'MAIN', itachi143MainHandler);
  registerEffect('KS-143-M', 'AMBUSH', itachi143AmbushHandler);
}
