import type { EffectContext, EffectResult } from '../../EffectTypes';
import type { CharacterInPlay } from '../../../engine/types';
import { registerEffect } from '../../EffectRegistry';
import { generateInstanceId } from '../../../engine/utils/id';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 002/130 - HIRUZEN SARUTOBI "Troisième Hokage" (UC)
 * Chakra: 5 | Power: 4
 * Group: Leaf Village | Keywords: Hokage
 *
 * MAIN: Play a Leaf Village character anywhere paying 1 less.
 *   - Auto-resolves: finds the highest-power Leaf Village character in hand
 *     that can be played at cost-1, removes from hand, places on the mission
 *     with fewest friendly characters, and pays cost-1 from the player's chakra pool.
 *
 * UPGRADE: POWERUP 2 the character played with the MAIN effect.
 *   - When triggered as an upgrade, the character placed by the MAIN effect
 *     also receives 2 power tokens.
 */

function handleHiruzen002Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex, isUpgrade } = ctx;
  const playerState = state[sourcePlayer];

  // Find all Leaf Village characters in hand
  const leafCards: { index: number; card: typeof playerState.hand[0] }[] = [];
  for (let i = 0; i < playerState.hand.length; i++) {
    const card = playerState.hand[i];
    if (card.group === 'Leaf Village') {
      leafCards.push({ index: i, card });
    }
  }

  if (leafCards.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Hiruzen Sarutobi (002): No Leaf Village characters in hand.',
      'game.log.effect.noTarget', { card: 'HIRUZEN SARUTOBI', id: '002/130' }) } };
  }

  // Sort by power descending to pick highest-power affordable card
  leafCards.sort((a, b) => b.card.power - a.card.power);

  const newState = { ...state };
  const ps = { ...newState[sourcePlayer] };
  ps.hand = [...ps.hand];

  for (const leaf of leafCards) {
    const reducedCost = Math.max(0, leaf.card.chakra - 1);
    if (ps.chakra < reducedCost) continue;

    // Find the mission with fewest friendly characters, starting with current mission
    const friendlySide = sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
    let bestMissionIdx = -1;
    let fewestChars = Infinity;

    for (let mIdx = 0; mIdx < state.activeMissions.length; mIdx++) {
      const mission = state.activeMissions[mIdx];
      const friendlyChars = mission[friendlySide];

      // Check name uniqueness constraint
      const hasSameName = friendlyChars.some((c) => {
        const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
        return topCard.name_fr === leaf.card.name_fr;
      });
      if (hasSameName) continue;

      if (friendlyChars.length < fewestChars) {
        fewestChars = friendlyChars.length;
        bestMissionIdx = mIdx;
      }
    }

    if (bestMissionIdx === -1) continue;

    // Pay the reduced cost
    ps.chakra -= reducedCost;
    ps.hand.splice(leaf.index, 1);

    const charInPlay: CharacterInPlay = {
      instanceId: generateInstanceId(),
      card: leaf.card,
      isHidden: false,
      powerTokens: isUpgrade ? 2 : 0, // UPGRADE: POWERUP 2 on the played character
      stack: [leaf.card],
      controlledBy: sourcePlayer,
      originalOwner: sourcePlayer,
      missionIndex: bestMissionIdx,
    };

    const newMissions = [...state.activeMissions];
    const newMission = { ...newMissions[bestMissionIdx] };
    if (sourcePlayer === 'player1') {
      newMission.player1Characters = [...newMission.player1Characters, charInPlay];
    } else {
      newMission.player2Characters = [...newMission.player2Characters, charInPlay];
    }
    newMissions[bestMissionIdx] = newMission;

    // Update character count
    let charCount = 0;
    for (const m of newMissions) {
      charCount += (sourcePlayer === 'player1' ? m.player1Characters : m.player2Characters).length;
    }
    ps.charactersInPlay = charCount;

    newState[sourcePlayer] = ps;
    newState.activeMissions = newMissions;

    const upgradeNote = isUpgrade ? ' with POWERUP 2 (upgrade)' : '';
    newState.log = logAction(
      state.log, state.turn, 'action', sourcePlayer,
      'EFFECT',
      `Hiruzen Sarutobi (002): Plays ${leaf.card.name_fr} on mission ${bestMissionIdx + 1} for ${reducedCost} chakra (1 less)${upgradeNote}.`,
      'game.log.effect.playLeafReduced',
      { card: 'HIRUZEN SARUTOBI', id: '002/130', target: leaf.card.name_fr, mission: String(bestMissionIdx + 1), cost: String(reducedCost) },
    );

    return { state: newState };
  }

  return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
    'Hiruzen Sarutobi (002): No affordable Leaf Village character could be played on any mission.',
    'game.log.effect.noTarget', { card: 'HIRUZEN SARUTOBI', id: '002/130' }) } };
}

export function registerHandler(): void {
  registerEffect('002/130', 'MAIN', handleHiruzen002Main);
  // UPGRADE triggers the same MAIN handler with ctx.isUpgrade = true
  // The MAIN handler checks isUpgrade to apply POWERUP 2
}
