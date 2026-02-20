import type { EffectContext, EffectResult } from '../../EffectTypes';
import type { CharacterInPlay, CharacterCard } from '../../../engine/types';
import { registerEffect } from '../../EffectRegistry';
import { generateInstanceId } from '../../../engine/utils/id';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 008/130 - JIRAYA "Doton, Les Marecages des Limbes" (UC)
 * Chakra: 5 | Power: 5
 * Group: Leaf Village | Keywords: Sannin, Jutsu
 *
 * MAIN: Play a Summon character anywhere, paying 2 less.
 *   - Find Summon keyword characters in hand that the player can afford at cost-2.
 *   - Place the chosen card face-visible on a mission. Pay the reduced cost.
 *   - If multiple valid Summon cards or multiple valid missions, requires target selection.
 *
 * UPGRADE: Hide an enemy character with cost 3 or less in this mission.
 *   - When triggered as an upgrade, also hide a non-hidden enemy in this mission
 *     with printed chakra cost <= 3.
 */
function handleJiraiya008Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex, isUpgrade } = ctx;

  let newState = { ...state };

  // UPGRADE bonus: Hide an enemy character with cost 3 or less in this mission
  if (isUpgrade) {
    const mission = newState.activeMissions[sourceMissionIndex];
    const enemySide: 'player1Characters' | 'player2Characters' =
      sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
    const enemyChars = mission[enemySide];

    // Find non-hidden enemies with cost <= 3
    const hideTargets: string[] = [];
    for (const char of enemyChars) {
      if (char.isHidden) continue;
      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      if (topCard.chakra <= 3) {
        hideTargets.push(char.instanceId);
      }
    }

    if (hideTargets.length === 1) {
      // Auto-hide the single target
      const targetId = hideTargets[0];
      const missions = [...newState.activeMissions];
      const m = { ...missions[sourceMissionIndex] };
      const chars = [...m[enemySide]];
      const idx = chars.findIndex(c => c.instanceId === targetId);
      if (idx !== -1) {
        const targetName = chars[idx].card.name_fr;
        chars[idx] = { ...chars[idx], isHidden: true };
        m[enemySide] = chars;
        missions[sourceMissionIndex] = m;
        newState = { ...newState, activeMissions: missions };
        newState = { ...newState, log: logAction(newState.log, newState.turn, newState.phase, sourcePlayer,
          'EFFECT_HIDE',
          `Jiraiya (008): Hid ${targetName} (upgrade effect, cost 3 or less).`,
          'game.log.effect.hide',
          { card: 'JIRAYA', id: '008/130', target: targetName }) };
      }
    } else if (hideTargets.length > 1) {
      // Multiple targets for the hide portion - requires target selection
      // This will be handled separately; for now, return the hide selection
      return {
        state: newState,
        requiresTargetSelection: true,
        targetSelectionType: 'JIRAIYA_HIDE_ENEMY_COST_3',
        validTargets: hideTargets,
        description: 'Select an enemy character with cost 3 or less in this mission to hide (upgrade effect).',
      };
    }
    // If no hide targets, upgrade hide portion fizzles but MAIN continues
  }

  // MAIN: Play a Summon character from hand anywhere, paying 2 less
  const playerState = newState[sourcePlayer];
  const summonCards: { index: number; card: CharacterCard }[] = [];
  for (let i = 0; i < playerState.hand.length; i++) {
    const card = playerState.hand[i];
    if (card.keywords && card.keywords.includes('Summon')) {
      const reducedCost = Math.max(0, card.chakra - 2);
      if (playerState.chakra >= reducedCost) {
        summonCards.push({ index: i, card });
      }
    }
  }

  if (summonCards.length === 0) {
    return { state: { ...newState, log: logAction(newState.log, newState.turn, newState.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Jiraiya (008): No affordable Summon character in hand.',
      'game.log.effect.noTarget', { card: 'JIRAYA', id: '008/130' }) } };
  }

  // For simplicity, pick the highest-power affordable Summon card
  summonCards.sort((a, b) => b.card.power - a.card.power);
  const chosen = summonCards[0];
  const reducedCost = Math.max(0, chosen.card.chakra - 2);

  // Find the best mission (fewest friendly characters, no same-name conflict)
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  let bestMissionIdx = -1;
  let fewestChars = Infinity;
  for (let mIdx = 0; mIdx < newState.activeMissions.length; mIdx++) {
    const mission = newState.activeMissions[mIdx];
    const friendlyChars = mission[friendlySide];

    const hasSameName = friendlyChars.some(c => {
      const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
      return topCard.name_fr === chosen.card.name_fr;
    });
    if (hasSameName) continue;

    if (friendlyChars.length < fewestChars) {
      fewestChars = friendlyChars.length;
      bestMissionIdx = mIdx;
    }
  }

  if (bestMissionIdx === -1) {
    return { state: { ...newState, log: logAction(newState.log, newState.turn, newState.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Jiraiya (008): No valid mission to place the Summon character.',
      'game.log.effect.noTarget', { card: 'JIRAYA', id: '008/130' }) } };
  }

  // Pay reduced cost and play the card
  const ps = { ...newState[sourcePlayer] };
  ps.chakra -= reducedCost;
  ps.hand = [...ps.hand];
  ps.hand.splice(chosen.index, 1);

  const charInPlay: CharacterInPlay = {
    instanceId: generateInstanceId(),
    card: chosen.card,
    isHidden: false,
    powerTokens: 0,
    stack: [chosen.card],
    controlledBy: sourcePlayer,
    originalOwner: sourcePlayer,
    missionIndex: bestMissionIdx,
  };

  const missions = [...newState.activeMissions];
  const mission = { ...missions[bestMissionIdx] };
  const chars = [...mission[friendlySide]];
  chars.push(charInPlay);
  mission[friendlySide] = chars;
  missions[bestMissionIdx] = mission;

  // Update character count
  let charCount = 0;
  for (const m of missions) {
    charCount += (sourcePlayer === 'player1' ? m.player1Characters : m.player2Characters).length;
  }
  ps.charactersInPlay = charCount;

  newState[sourcePlayer] = ps;
  newState.activeMissions = missions;

  newState.log = logAction(
    newState.log, newState.turn, newState.phase, sourcePlayer,
    'EFFECT',
    `Jiraiya (008): Plays ${chosen.card.name_fr} (Summon) on mission ${bestMissionIdx + 1} for ${reducedCost} chakra (2 less).`,
    'game.log.effect.playSummonReduced',
    { card: 'JIRAYA', id: '008/130', target: chosen.card.name_fr, mission: String(bestMissionIdx + 1), cost: String(reducedCost) },
  );

  return { state: newState };
}

export function registerJiraiya008Handlers(): void {
  registerEffect('008/130', 'MAIN', handleJiraiya008Main);
  // UPGRADE triggers the same MAIN handler with ctx.isUpgrade = true
  // The MAIN handler checks isUpgrade to apply the hide effect
}
