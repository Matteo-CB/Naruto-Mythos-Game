import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import type { CharacterInPlay, GameState, PlayerID } from '../../../engine/types';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 133/130 - NARUTO UZUMAKI "Rasengan" (S)
 * Chakra: 6, Power: 6
 * Group: Leaf Village, Keywords: Team 7
 *
 * MAIN: Hide an enemy character with Power 5 or less in this mission
 *       AND another enemy character with Power 2 or less in play (any mission).
 *
 * MAIN "effect:": Instead, defeat both of them.
 *   - The "effect:" modifier applies when this card is played as an upgrade.
 *   - When upgrading: defeat both targets instead of hiding them.
 */

function getEffectivePower(char: CharacterInPlay): number {
  if (char.isHidden) return 0;
  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  return topCard.power + char.powerTokens;
}

function defeatCharacter(
  state: GameState,
  missionIndex: number,
  charInstanceId: string,
  sourcePlayer: PlayerID,
): GameState {
  const missions = [...state.activeMissions];
  const mission = { ...missions[missionIndex] };

  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const chars = [...mission[enemySide]];
  const charIndex = chars.findIndex((c) => c.instanceId === charInstanceId);

  if (charIndex === -1) return state;

  const defeated = chars[charIndex];
  chars.splice(charIndex, 1);
  mission[enemySide] = chars;
  missions[missionIndex] = mission;

  // Add defeated card (and stack) to original owner's discard pile
  const owner = defeated.originalOwner;
  const ownerState = { ...state[owner] };
  const cardsToDiscard = defeated.stack.length > 0 ? [...defeated.stack] : [defeated.card];
  ownerState.discardPile = [...ownerState.discardPile, ...cardsToDiscard];
  ownerState.charactersInPlay = Math.max(0, ownerState.charactersInPlay - 1);

  return {
    ...state,
    activeMissions: missions,
    [owner]: ownerState,
  };
}

function naruto133MainHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };
  const useDefeat = ctx.isUpgrade;

  const enemySideKey: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Target 1: enemy character with Power <= 5 in THIS mission (not hidden)
  const thisMission = state.activeMissions[ctx.sourceMissionIndex];
  const enemyCharsThisMission = thisMission[enemySideKey];
  const target1 = enemyCharsThisMission.find((c) => !c.isHidden && getEffectivePower(c) <= 5);

  // Target 2: another enemy character with Power <= 2 in play (any mission, different from target1)
  let target2: CharacterInPlay | undefined;
  let target2MissionIndex = -1;

  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    const enemyChars = mission[enemySideKey];
    for (const char of enemyChars) {
      if (char.isHidden) continue;
      if (target1 && char.instanceId === target1.instanceId) continue;
      if (getEffectivePower(char) <= 2) {
        target2 = char;
        target2MissionIndex = i;
        break;
      }
    }
    if (target2) break;
  }

  // Apply effects to target 1
  if (target1) {
    if (useDefeat) {
      // Defeat target 1
      state = defeatCharacter(state, ctx.sourceMissionIndex, target1.instanceId, ctx.sourcePlayer);
      state = {
        ...state,
        log: logAction(
          state.log,
          state.turn,
          state.phase,
          ctx.sourcePlayer,
          'EFFECT_DEFEAT',
          `Naruto Uzumaki (133): Defeated enemy ${target1.card.name_fr} (Power ${getEffectivePower(target1)}) in this mission (upgrade modifier).`,
        ),
      };
    } else {
      // Hide target 1
      const missions = [...state.activeMissions];
      const mission = { ...missions[ctx.sourceMissionIndex] };
      const enemyChars = [...mission[enemySideKey]];
      const idx = enemyChars.findIndex((c) => c.instanceId === target1.instanceId);
      if (idx !== -1) {
        enemyChars[idx] = { ...enemyChars[idx], isHidden: true };
        mission[enemySideKey] = enemyChars;
        missions[ctx.sourceMissionIndex] = mission;
        state = {
          ...state,
          activeMissions: missions,
          log: logAction(
            state.log,
            state.turn,
            state.phase,
            ctx.sourcePlayer,
            'EFFECT_HIDE',
            `Naruto Uzumaki (133): Hid enemy ${target1.card.name_fr} (Power ${getEffectivePower(target1)}) in this mission.`,
          ),
        };
      }
    }
  } else {
    state = {
      ...state,
      log: logAction(
        state.log,
        state.turn,
        state.phase,
        ctx.sourcePlayer,
        'EFFECT_NO_TARGET',
        'Naruto Uzumaki (133): No valid enemy with Power 5 or less in this mission.',
      ),
    };
  }

  // Apply effects to target 2
  if (target2 && target2MissionIndex >= 0) {
    if (useDefeat) {
      // Defeat target 2
      state = defeatCharacter(state, target2MissionIndex, target2.instanceId, ctx.sourcePlayer);
      state = {
        ...state,
        log: logAction(
          state.log,
          state.turn,
          state.phase,
          ctx.sourcePlayer,
          'EFFECT_DEFEAT',
          `Naruto Uzumaki (133): Defeated enemy ${target2.card.name_fr} (Power ${getEffectivePower(target2)}) in mission ${target2MissionIndex} (upgrade modifier).`,
        ),
      };
    } else {
      // Hide target 2
      const missions = [...state.activeMissions];
      const mission = { ...missions[target2MissionIndex] };
      const enemyChars = [...mission[enemySideKey]];
      const idx = enemyChars.findIndex((c) => c.instanceId === target2.instanceId);
      if (idx !== -1) {
        enemyChars[idx] = { ...enemyChars[idx], isHidden: true };
        mission[enemySideKey] = enemyChars;
        missions[target2MissionIndex] = mission;
        state = {
          ...state,
          activeMissions: missions,
          log: logAction(
            state.log,
            state.turn,
            state.phase,
            ctx.sourcePlayer,
            'EFFECT_HIDE',
            `Naruto Uzumaki (133): Hid enemy ${target2.card.name_fr} (Power ${getEffectivePower(target2)}) in mission ${target2MissionIndex}.`,
          ),
        };
      }
    }
  } else {
    state = {
      ...state,
      log: logAction(
        state.log,
        state.turn,
        state.phase,
        ctx.sourcePlayer,
        'EFFECT_NO_TARGET',
        'Naruto Uzumaki (133): No valid second enemy with Power 2 or less in play.',
      ),
    };
  }

  return { state };
}

export function registerNaruto133Handlers(): void {
  registerEffect('133/130', 'MAIN', naruto133MainHandler);
}
