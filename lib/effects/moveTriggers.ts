import type { GameState, PlayerID, CharacterInPlay, PendingEffect, PendingAction } from '../engine/types';
import { effetsActifsDe } from '@/lib/effects/handlers/SS/attachmentStatics';
import { annoncerRegardIndiscret } from '@/lib/effects/publicReveal';
import { logAction } from '../engine/utils/gameLog';
import { generateInstanceId } from '../engine/utils/id';
import { canBeHiddenByEnemy } from './ContinuousEffects';
import { getEffectivePower } from './powerUtils';



import { EffectEngine } from './EffectEngine';


export function checkNinjaHoundsTrigger(
  state: GameState,
  movedChar: CharacterInPlay,
  destMissionIndex: number,
  player: PlayerID,
): GameState {
  if (movedChar.isHidden) return state;

  const topCard = movedChar.stack?.length > 0
    ? movedChar.stack[movedChar.stack?.length - 1]
    : movedChar.card;

  if (topCard.set !== 'KS' || topCard.number !== 100) return state;

  const hasEffect = effetsActifsDe(movedChar).some(
    (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('moves to a different mission'),
  );
  if (!hasEffect) return state;

  const mission = state.activeMissions[destMissionIndex];
  if (!mission) return state;

  
  const enemySide: 'player1Characters' | 'player2Characters' =
    player === 'player1' ? 'player2Characters' : 'player1Characters';
  const hiddenEnemies = mission[enemySide].filter(
    (c) => c.isHidden && c.instanceId !== movedChar.instanceId,
  );

  if (hiddenEnemies.length === 0) {
    return {
      ...state,
      log: logAction(
        state.log, state.turn, state.phase, player,
        'EFFECT_NO_TARGET',
        `Ninja Hounds (100): Moved to mission ${destMissionIndex + 1} but no hidden enemy characters to look at.`,
        'game.log.effect.noTarget',
        { card: 'Chiens Ninjas', id: 'KS-100-C' },
      ),
    };
  }

  if (hiddenEnemies.length === 1) {
    
    const target = hiddenEnemies[0];
    const effectId = generateInstanceId();
    const actionId = generateInstanceId();
    const revealData = JSON.stringify({
      cardName: target.card.name_fr,
      cardCost: target.card.chakra,
      cardPower: target.card.power,
      cardImageFile: target.card.image_file,
    });

    return {
      ...state,
      pendingEffects: [...state.pendingEffects, {
        id: effectId,
        sourceCardId: topCard.id ?? 'KS-100-C',
        sourceInstanceId: movedChar.instanceId,
        sourceMissionIndex: destMissionIndex,
        effectType: 'MAIN' as const,
        effectDescription: revealData,
        targetSelectionType: 'DOSU_LOOK_REVEAL',
        sourcePlayer: player,
        requiresTargetSelection: true,
        validTargets: ['confirm'],
        isOptional: false,
        isMandatory: true,
        resolved: false,
        isUpgrade: false,
      }],
      pendingActions: [...state.pendingActions, {
        id: actionId,
        type: 'SELECT_TARGET' as const,
        player,
        description: `Ninja Hounds (100): Revealed ${target.card.name_fr} (Cost ${target.card.chakra}, Power ${target.card.power}).`,
        descriptionKey: 'game.effect.desc.ninjaHounds100LookReveal',
        descriptionParams: { target: target.card.name_fr, cost: String(target.card.chakra), power: String(target.card.power) },
        options: ['confirm'],
        minSelections: 1,
        maxSelections: 1,
        sourceEffectId: effectId,
      }],
      log: logAction(
        state.log, state.turn, state.phase, player,
        'EFFECT',
        `Ninja Hounds (100): Moved to mission ${destMissionIndex + 1} - looked at hidden ${target.card.name_fr}.`,
        'game.log.effect.lookAtHidden',
        { card: 'Chiens Ninjas', id: 'KS-100-C', target: target.card.name_fr },
      ),
      publicReveal: annoncerRegardIndiscret(state, player, target, 'KS-100-C').publicReveal ?? null,
    };
  }

  
  const validTargets = hiddenEnemies.map((c) => c.instanceId);
  const effectId = generateInstanceId();
  const actionId = generateInstanceId();

  return {
    ...state,
    pendingEffects: [...state.pendingEffects, {
      id: effectId,
      sourceCardId: topCard.id ?? 'KS-100-C',
      sourceInstanceId: movedChar.instanceId,
      sourceMissionIndex: destMissionIndex,
      effectType: 'MAIN' as const,
      effectDescription: 'Ninja Hounds (100): Choose a hidden enemy character to look at.',
      targetSelectionType: 'NINJA_HOUNDS_LOOK_AT_HIDDEN',
      sourcePlayer: player,
      requiresTargetSelection: true,
      validTargets,
      isOptional: true,
      isMandatory: false,
      resolved: false,
      isUpgrade: false,
    }],
    pendingActions: [...state.pendingActions, {
      id: actionId,
      type: 'SELECT_TARGET' as const,
      player,
      description: 'Ninja Hounds (100): Choose a hidden enemy character in this mission to look at.',
      descriptionKey: 'game.effect.desc.ninjaHounds100LookAtHidden',
      options: validTargets,
      minSelections: 1,
      maxSelections: 1,
      sourceEffectId: effectId,
    }],
    log: logAction(
      state.log, state.turn, state.phase, player,
      'EFFECT_CONTINUOUS',
      `Ninja Hounds (100): Moved to mission ${destMissionIndex + 1} - choose a hidden enemy to look at.`,
      'game.log.effect.continuous',
      { card: 'Chiens Ninjas', id: 'KS-100-C' },
    ),
  };
}


export function checkChoji018PostMoveTrigger(
  state: GameState,
  movedChar: CharacterInPlay,
  destMissionIndex: number,
  charOwner: PlayerID,
  charController: PlayerID,
): GameState {
  
  if (charOwner !== charController) return state;
  if (movedChar.isHidden) return state;

  const topCard = movedChar.stack?.length > 0
    ? movedChar.stack[movedChar.stack?.length - 1]
    : movedChar.card;

  if (topCard.set !== 'KS' || topCard.number !== 18) return state;

  const hasEffect = effetsActifsDe(movedChar).some(
    (e) => e.type === 'MAIN' && e.description.includes('[⧗]'),
  );
  if (!hasEffect) return state;

  const mission = state.activeMissions[destMissionIndex];
  if (!mission) return state;

  const enemySide: 'player1Characters' | 'player2Characters' =
    charController === 'player1' ? 'player2Characters' : 'player1Characters';

  const chojiPower = getEffectivePower(state, movedChar, charController);

  const enemyPlayer: PlayerID = charController === 'player1' ? 'player2' : 'player1';


  const hideTargets: string[] = [];
  for (const enemy of mission[enemySide]) {
    if (enemy.isHidden) continue;
    if (!canBeHiddenByEnemy(state, enemy, enemyPlayer)) continue;
    const enemyPower = getEffectivePower(state, enemy, enemyPlayer);
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
    
    
    
    
    return EffectEngine.hideCharacterWithLog(state, hideTargets[0], charController);
  }

  
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
      'Choji Akimichi (018): After moving - choose an enemy to hide.',
      'game.log.effect.continuous',
      { card: 'CHOJI AKIMICHI', id: 'KS-018-UC' },
    ),
  };
}
