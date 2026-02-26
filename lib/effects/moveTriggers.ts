import type { GameState, PlayerID, CharacterInPlay, PendingEffect, PendingAction } from '../engine/types';
import { logAction } from '../engine/utils/gameLog';
import { generateInstanceId } from '../engine/utils/id';

/**
 * Check and trigger Ninja Hounds 100 continuous move effect.
 *
 * Card text: "[hourglass] Each time this character moves to a different mission,
 *            look at a hidden character in this mission."
 */
export function checkNinjaHoundsTrigger(
  state: GameState,
  movedChar: CharacterInPlay,
  destMissionIndex: number,
  player: PlayerID,
): GameState {
  if (movedChar.isHidden) return state;

  const topCard = movedChar.stack.length > 0
    ? movedChar.stack[movedChar.stack.length - 1]
    : movedChar.card;

  if (topCard.number !== 100) return state;

  const hasEffect = (topCard.effects ?? []).some(
    (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('moves to a different mission'),
  );
  if (!hasEffect) return state;

  const mission = state.activeMissions[destMissionIndex];
  if (!mission) return state;

  const allChars = [...mission.player1Characters, ...mission.player2Characters];
  const hiddenChar = allChars.find(
    (c) => c.isHidden && c.instanceId !== movedChar.instanceId,
  );

  if (!hiddenChar) return state;

  return {
    ...state,
    log: logAction(
      state.log, state.turn, state.phase, player,
      'EFFECT',
      `Ninja Hounds (100): Moved to mission ${destMissionIndex + 1} - looked at hidden ${hiddenChar.card.name_fr}.`,
      'game.log.effect.lookAtHidden',
      { card: 'Chiens Ninjas', id: 'KS-100-C', target: hiddenChar.card.name_fr },
    ),
  };
}

/**
 * Check and trigger Choji 018 continuous post-move hide effect.
 *
 * Card text: "[⧗] After you move this character, hide an enemy character
 *            in this mission with less Power than this character."
 *
 * Only triggers on friendly moves (charOwner === character's controller).
 */
export function checkChoji018PostMoveTrigger(
  state: GameState,
  movedChar: CharacterInPlay,
  destMissionIndex: number,
  charOwner: PlayerID,
  charController: PlayerID,
): GameState {
  // Only triggers on friendly moves
  if (charOwner !== charController) return state;
  if (movedChar.isHidden) return state;

  const topCard = movedChar.stack.length > 0
    ? movedChar.stack[movedChar.stack.length - 1]
    : movedChar.card;

  if (topCard.number !== 18) return state;

  const hasEffect = (topCard.effects ?? []).some(
    (e) => e.type === 'MAIN' && e.description.includes('[⧗]'),
  );
  if (!hasEffect) return state;

  const mission = state.activeMissions[destMissionIndex];
  if (!mission) return state;

  const enemySide: 'player1Characters' | 'player2Characters' =
    charController === 'player1' ? 'player2Characters' : 'player1Characters';

  const chojiPower = (topCard.power ?? 0) + movedChar.powerTokens;

  // Find non-hidden enemies with less power
  const hideTargets: string[] = [];
  for (const enemy of mission[enemySide]) {
    if (enemy.isHidden) continue;
    const enemyTop = enemy.stack.length > 0 ? enemy.stack[enemy.stack.length - 1] : enemy.card;
    const enemyPower = (enemyTop.power ?? 0) + enemy.powerTokens;
    if (enemyPower < chojiPower) {
      hideTargets.push(enemy.instanceId);
    }
  }

  if (hideTargets.length === 0) {
    return {
      ...state,
      log: logAction(
        state.log, state.turn, state.phase, charController,
        'EFFECT_NO_TARGET',
        'Choji Akimichi (018): No enemy character with less Power to hide after moving.',
        'game.log.effect.noTarget',
        { card: 'CHOJI AKIMICHI', id: 'KS-018-UC' },
      ),
    };
  }

  if (hideTargets.length === 1) {
    // Auto-hide single target
    const targetId = hideTargets[0];
    const missions = [...state.activeMissions];
    const m = { ...missions[destMissionIndex] };
    const chars = [...m[enemySide]];
    const idx = chars.findIndex(c => c.instanceId === targetId);
    if (idx !== -1) {
      const targetName = chars[idx].card.name_fr;
      chars[idx] = { ...chars[idx], isHidden: true };
      m[enemySide] = chars;
      missions[destMissionIndex] = m;
      return {
        ...state,
        activeMissions: missions,
        log: logAction(
          state.log, state.turn, state.phase, charController,
          'EFFECT_HIDE',
          `Choji Akimichi (018): Hid ${targetName} after moving (less Power).`,
          'game.log.effect.hide',
          { card: 'CHOJI AKIMICHI', id: 'KS-018-UC', target: targetName },
        ),
      };
    }
    return state;
  }

  // Multiple targets: create pending target selection
  const effectId = generateInstanceId();
  const actionId = generateInstanceId();

  const pendingEffect: PendingEffect = {
    id: effectId,
    sourceCardId: topCard.id ?? '',
    sourceInstanceId: movedChar.instanceId,
    sourceMissionIndex: destMissionIndex,
    effectType: 'MAIN',
    effectDescription: 'Choji Akimichi (018): Choose an enemy character with less Power to hide.',
    targetSelectionType: 'CHOJI018_HIDE_ENEMY',
    sourcePlayer: charController,
    requiresTargetSelection: true,
    validTargets: hideTargets,
    isOptional: true,
    isMandatory: false,
    resolved: false,
    isUpgrade: false,
  };

  const pendingAction: PendingAction = {
    id: actionId,
    type: 'SELECT_TARGET',
    player: charController,
    description: 'Choji Akimichi (018): Choose an enemy character with less Power to hide.',
    descriptionKey: 'game.effect.desc.choji018HideEnemy',
    options: hideTargets,
    minSelections: 1,
    maxSelections: 1,
    sourceEffectId: effectId,
  };

  return {
    ...state,
    pendingEffects: [...state.pendingEffects, pendingEffect],
    pendingActions: [...state.pendingActions, pendingAction],
    log: logAction(
      state.log, state.turn, state.phase, charController,
      'EFFECT_CONTINUOUS',
      'Choji Akimichi (018): After moving — choose an enemy to hide.',
      'game.log.effect.continuous',
      { card: 'CHOJI AKIMICHI', id: 'KS-018-UC' },
    ),
  };
}
