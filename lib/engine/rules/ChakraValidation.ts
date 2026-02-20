import type { GameState, PlayerID, CharacterCard } from '../types';

/**
 * Calculate the effective cost to play a character card,
 * considering all cost modifiers from continuous effects.
 */
export function calculateEffectiveCost(
  state: GameState,
  player: PlayerID,
  card: CharacterCard,
  missionIndex: number,
  isReveal: boolean,
): number {
  let cost = card.chakra;

  if (missionIndex < 0 || missionIndex >= state.activeMissions.length) {
    return cost;
  }

  const mission = state.activeMissions[missionIndex];
  const friendlyChars = player === 'player1' ? mission.player1Characters : mission.player2Characters;

  // Check cost modifiers from continuous effects in this mission
  for (const friendly of friendlyChars) {
    if (friendly.isHidden) continue;

    const topCard = friendly.stack.length > 0 ? friendly.stack[friendly.stack.length - 1] : friendly.card;

    for (const effect of topCard.effects ?? []) {
      if (effect.type !== 'MAIN' || !effect.description.includes('[⧗]')) continue;

      // Kurenai 034: Other Team 8 characters cost 1 less (min 1) in this mission
      if (topCard.number === 34 && effect.description.includes('Team 8') && effect.description.includes('less')) {
        if ((card.keywords ?? []).includes('Team 8') && card.id !== topCard.id) {
          cost = Math.max(1, cost - 1);
        }
      }

      // Gamakichi 096: Pay 1 less if Naruto Uzumaki in this mission
      // This applies to Gamakichi itself when being played
      if (card.number === 96 && topCard.name_fr.toUpperCase().includes('NARUTO UZUMAKI')) {
        // Naruto is already in the mission - Gamakichi costs 1 less
        cost = Math.max(0, cost - 1);
      }
    }
  }

  // Self cost modifiers (the card being played)
  for (const effect of card.effects ?? []) {
    if (effect.type !== 'MAIN' || !effect.description.includes('[⧗]')) continue;

    // Gamakichi 096: Pay 1 less if Naruto in this mission
    if (card.number === 96 && effect.description.includes('Naruto Uzumaki') && effect.description.includes('1 less')) {
      const hasNaruto = friendlyChars.some(
        (c) => !c.isHidden && c.card.name_fr.toUpperCase().includes('NARUTO UZUMAKI'),
      );
      if (hasNaruto) {
        cost = Math.max(0, cost - 1);
      }
    }

    // Gaara 075: Play while hidden paying 2 less
    if (card.number === 75 && effect.description.includes('hidden paying 2 less')) {
      // This only applies when the card is currently hidden and being revealed
      if (isReveal) {
        cost = Math.max(0, cost - 2);
      }
    }

    // Itachi 090: Play while hidden paying 3 less if Sasuke Uchiha in this mission
    // Only applies when revealing from hidden (isReveal), not when playing face-visible
    if (card.number === 90 && effect.description.includes('Sasuke Uchiha') && effect.description.includes('3 less')) {
      if (isReveal) {
        const hasSasuke = friendlyChars.some(
          (c) => !c.isHidden && c.card.name_fr.toUpperCase().includes('SASUKE'),
        );
        if (hasSasuke) {
          cost = Math.max(0, cost - 3);
        }
      }
    }
  }

  // Jiraiya 007 sub-play cost reduction for Summon characters
  // This is handled separately when Jiraiya's MAIN effect triggers

  return Math.max(0, cost);
}
