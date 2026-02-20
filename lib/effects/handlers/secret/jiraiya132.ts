import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import type { CharacterInPlay, GameState } from '../../../engine/types';
import { logAction } from '../../../engine/utils/gameLog';
import { generateInstanceId } from '../../../engine/utils/id';
import { defeatEnemyCharacter } from '../../defeatUtils';

/**
 * Card 132/130 - JIRAYA (S)
 * Chakra: 7, Power: 6
 * Group: Leaf Village, Keywords: Sannin
 *
 * MAIN: Play a Summon character from your hand anywhere, paying 5 less.
 *   - Find all character cards in hand with the "Summon" keyword.
 *   - The player can afford the card at (cost - 5, minimum 0).
 *   - For auto-resolution: pick the best affordable Summon and place it on the
 *     mission with the fewest friendly characters.
 *   - If no Summon characters in hand or none affordable, fizzles.
 *
 * UPGRADE: Opponent must defeat their characters until at most 2 are assigned per mission.
 *   - For each mission, count enemy characters. If more than 2, defeat the weakest
 *     excess characters automatically.
 */

function getEffectivePower(char: CharacterInPlay): number {
  if (char.isHidden) return 0;
  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  return topCard.power + char.powerTokens;
}

function jiraiya132MainHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };
  const playerState = { ...state[ctx.sourcePlayer] };

  // Find Summon characters in hand that are affordable at cost - 5
  const affordableSummons: { handIndex: number; reducedCost: number }[] = [];
  for (let i = 0; i < playerState.hand.length; i++) {
    const card = playerState.hand[i];
    if (card.card_type === 'character' && card.keywords && card.keywords.includes('Summon')) {
      const reducedCost = Math.max(0, card.chakra - 5);
      if (playerState.chakra >= reducedCost) {
        affordableSummons.push({ handIndex: i, reducedCost });
      }
    }
  }

  if (affordableSummons.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Jiraya (132): No affordable Summon character in hand to play.',
      'game.log.effect.noTarget',
      { card: 'JIRAYA', id: '132/130' },
    );
    return { state: { ...state, log } };
  }

  // If multiple valid targets, return target selection
  if (affordableSummons.length > 1) {
    return {
      state,
      requiresTargetSelection: true,
      targetSelectionType: 'JIRAIYA132_CHOOSE_SUMMON',
      validTargets: affordableSummons.map((s) => String(s.handIndex)),
      description: 'Jiraya (132): Choose a Summon character from your hand to play (paying 5 less).',
    };
  }

  // Auto-resolve: pick the single affordable Summon
  const chosen = affordableSummons[0];
  const friendlySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  // Find mission with fewest friendly characters
  let bestMissionIndex = 0;
  let fewestChars = Infinity;
  for (let i = 0; i < state.activeMissions.length; i++) {
    const count = state.activeMissions[i][friendlySide].length;
    if (count < fewestChars) {
      fewestChars = count;
      bestMissionIndex = i;
    }
  }

  // Remove from hand, pay cost, place on mission
  const hand = [...playerState.hand];
  const playedCard = hand.splice(chosen.handIndex, 1)[0];
  playerState.hand = hand;
  playerState.chakra -= chosen.reducedCost;
  playerState.charactersInPlay += 1;

  const newChar: CharacterInPlay = {
    instanceId: generateInstanceId(),
    card: playedCard,
    isHidden: false,
    powerTokens: 0,
    stack: [playedCard],
    controlledBy: ctx.sourcePlayer,
    originalOwner: ctx.sourcePlayer,
    missionIndex: bestMissionIndex,
  };

  const missions = [...state.activeMissions];
  const targetMission = { ...missions[bestMissionIndex] };
  targetMission[friendlySide] = [...targetMission[friendlySide], newChar];
  missions[bestMissionIndex] = targetMission;

  state = {
    ...state,
    activeMissions: missions,
    [ctx.sourcePlayer]: playerState,
  };

  state = {
    ...state,
    log: logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_PLAY',
      `Jiraya (132): Played ${playedCard.name_fr} (Summon) on mission ${bestMissionIndex} paying ${chosen.reducedCost} (reduced by 5).`,
      'game.log.effect.playSummon',
      { card: 'JIRAYA', id: '132/130', target: playedCard.name_fr, cost: chosen.reducedCost },
    ),
  };

  // UPGRADE: Opponent must defeat their characters until at most 2 per mission
  if (ctx.isUpgrade) {
    state = applyUpgradeEffect(state, ctx);
  }

  return { state };
}

/**
 * UPGRADE: For each mission, if the opponent has more than 2 characters,
 * defeat the weakest excess characters.
 */
function applyUpgradeEffect(state: GameState, ctx: EffectContext): GameState {
  const enemySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    const enemyChars = mission[enemySide];

    while (enemyChars.length > 2) {
      // Fresh read each iteration (defeatEnemyCharacter mutates state)
      const currentMission = state.activeMissions[i];
      const currentEnemyChars = currentMission[enemySide];

      if (currentEnemyChars.length <= 2) break;

      // Find the weakest character to defeat
      let weakestIdx = 0;
      let weakestPower = getEffectivePower(currentEnemyChars[0]);
      for (let j = 1; j < currentEnemyChars.length; j++) {
        const p = getEffectivePower(currentEnemyChars[j]);
        if (p < weakestPower) {
          weakestPower = p;
          weakestIdx = j;
        }
      }

      const target = currentEnemyChars[weakestIdx];
      state = defeatEnemyCharacter(state, i, target.instanceId, ctx.sourcePlayer);

      state = {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, ctx.sourcePlayer,
          'EFFECT_DEFEAT',
          `Jiraya (132): Defeated enemy ${target.card.name_fr} in mission ${i} (upgrade, exceeds 2 per mission).`,
          'game.log.effect.defeat',
          { card: 'JIRAYA', id: '132/130', target: target.card.name_fr },
        ),
      };
    }
  }

  return state;
}

function jiraiya132UpgradeHandler(ctx: EffectContext): EffectResult {
  // UPGRADE logic is integrated into MAIN handler when isUpgrade is true.
  return { state: ctx.state };
}

export function registerJiraiya132Handlers(): void {
  registerEffect('132/130', 'MAIN', jiraiya132MainHandler);
  registerEffect('132/130', 'UPGRADE', jiraiya132UpgradeHandler);
}
