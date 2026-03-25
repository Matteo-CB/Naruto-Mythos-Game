import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { EffectEngine } from '@/lib/effects/EffectEngine';

/**
 * MSS 05 - "Ramener" / "Bring it Back"
 *
 * SCORE [arrow]: You must return one friendly non-hidden character in this mission
 *                to your hand, if able.
 *   - This is mandatory ("you must") if a valid target exists ("if able").
 *   - Returns the top card of the character's stack to the player's hand.
 *   - If multiple valid targets, requires target selection. Auto-resolves with 1 target.
 */

function mss05ScoreHandler(ctx: EffectContext): EffectResult {
  const state = { ...ctx.state };

  const friendlySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  const mission = state.activeMissions[ctx.sourceMissionIndex];
  const friendlyChars = mission[friendlySide];

  // Collect all non-hidden friendly characters in THIS mission (including stolen cards)
  const validTargets: string[] = [];
  for (const c of friendlyChars) {
    if (!c.isHidden) {
      validTargets.push(c.instanceId);
    }
  }

  if (validTargets.length === 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'SCORE_NO_TARGET',
      'MSS 05 (Bring it Back): No non-hidden friendly character in this mission to return.',
      'game.log.effect.noTarget',
      { card: 'Ramener', id: 'KS-005-MMS' },
    );
    return { state: { ...state, log } };
  }

  // If exactly one valid target, auto-resolve
  if (validTargets.length === 1) {
    return applyMss05ReturnToHand(state, validTargets[0], ctx.sourcePlayer, friendlySide, ctx.sourceMissionIndex);
  }

  // Multiple valid targets: require player selection (this is mandatory - "you must")
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'MSS05_RETURN_TO_HAND',
    validTargets,
    description: 'MSS 05 (Bring it Back): Choose a friendly character in this mission to return to your hand (mandatory).',
    descriptionKey: 'game.effect.desc.mss05ReturnToHand',
    isMandatory: true,
  };
}

function applyMss05ReturnToHand(
  state: import('@/lib/effects/EffectTypes').EffectContext['state'],
  targetInstanceId: string,
  sourcePlayer: import('@/lib/engine/types').PlayerID,
  friendlySide: 'player1Characters' | 'player2Characters',
  sourceMissionIndex: number,
): EffectResult {
  const mission = state.activeMissions[sourceMissionIndex];
  const friendlyChars = mission[friendlySide];
  const targetIndex = friendlyChars.findIndex((c) => c.instanceId === targetInstanceId);

  if (targetIndex === -1) {
    return { state };
  }

  const target = friendlyChars[targetIndex];

  // If this character controlled stolen cards (Ino/Kabuto/Orochimaru), return them
  state = EffectEngine.restoreControlOnLeave(state, target.instanceId);

  // Remove from mission (re-find from current state after restoreControlOnLeave)
  const missions = [...state.activeMissions];
  const updatedMission = { ...missions[sourceMissionIndex] };
  const chars = [...updatedMission[friendlySide]];
  const newTargetIndex = chars.findIndex((c) => c.instanceId === targetInstanceId);
  if (newTargetIndex === -1) return { state };
  const currentTarget = chars[newTargetIndex]; // Use fresh reference from current state
  chars.splice(newTargetIndex, 1);
  updatedMission[friendlySide] = chars;
  missions[sourceMissionIndex] = updatedMission;

  // Return the TOP card to its ORIGINAL OWNER's hand
  // Stolen cards (originalOwner !== controlledBy) go to opponent's hand
  const owner = currentTarget.originalOwner;
  const ownerState = { ...state[owner] };
  const topCard = currentTarget.stack?.length > 0 ? currentTarget.stack[currentTarget.stack?.length - 1] : currentTarget.card;
  const underCards = currentTarget.stack?.length > 1 ? currentTarget.stack.slice(0, -1) : [];
  ownerState.hand = [...ownerState.hand, topCard];
  ownerState.discardPile = [...ownerState.discardPile, ...underCards];

  // Update character count for the controller (who had it on the field)
  const controller = currentTarget.controlledBy;
  const controllerState = controller !== owner ? { ...state[controller], charactersInPlay: Math.max(0, state[controller].charactersInPlay - 1) } : ownerState;
  if (controller === owner) {
    ownerState.charactersInPlay = Math.max(0, ownerState.charactersInPlay - 1);
  }

  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    sourcePlayer,
    'SCORE_RETURN',
    `MSS 05 (Bring it Back): Returned ${currentTarget.card.name_fr} to ${owner === controller ? 'hand' : 'original owner\'s hand'} (mandatory).`,
    'game.log.score.returnToHand',
    { card: 'Ramener', target: currentTarget.card.name_fr },
  );

  return {
    state: {
      ...state,
      activeMissions: missions,
      [owner]: ownerState,
      ...(controller !== owner ? { [controller]: controllerState } : {}),
      log,
    },
  };
}

export function registerMss05Handlers(): void {
  registerEffect('KS-005-MMS', 'SCORE', mss05ScoreHandler);
}
