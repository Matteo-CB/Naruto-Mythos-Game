import type { GameState, PlayerID, CharacterCard } from '../types';

/**
 * Get the top card from a character, supporting both CharacterInPlay (has .stack)
 * and VisibleCharacter (has .topCard). This allows calculateEffectiveCost to work
 * with both server-side GameState and client-side VisibleGameState.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getTopCard(char: any): CharacterCard | undefined {
  if (char.stack?.length > 0) return char.stack[char.stack?.length - 1];
  if (char.topCard) return char.topCard;
  return char.card;
}

/**
 * Calculate the effective cost to play a character card,
 * considering all cost modifiers from continuous effects.
 * Works with both GameState (server) and VisibleGameState (client).
 */
export function calculateEffectiveCost(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: GameState | any,
  player: PlayerID,
  card: CharacterCard,
  missionIndex: number,
  isReveal: boolean,
): number {
  let cost = card.chakra;

  if (missionIndex < 0 || missionIndex >= (state.activeMissions?.length ?? 0)) {
    return cost;
  }

  const mission = state.activeMissions[missionIndex];
  if (!mission) return cost;
  const friendlyChars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
  if (!friendlyChars) return cost;

  // Check cost modifiers from continuous effects in this mission (both sides)
  const allCharsInMission = [...(friendlyChars || []), ...(player === 'player1' ? mission.player2Characters : mission.player1Characters) || []];
  for (const charInMission of allCharsInMission) {
    if (charInMission.isHidden) continue;

    const topCard = getTopCard(charInMission);
    if (!topCard) continue;

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
      if (card.number === 96 && topCard.name_fr?.toUpperCase().includes('NARUTO UZUMAKI')) {
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
        (c: any) => {
          if (c.isHidden) return false;
          const cTop = getTopCard(c);
          return cTop?.name_fr?.toUpperCase().includes('NARUTO UZUMAKI');
        },
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
        // Check friendly characters (all, player knows their own hidden cards)
        // and visible enemy characters (hidden enemy identity is unknown)
        const enemySide = player === 'player1' ? mission.player2Characters : mission.player1Characters;
        const checkableChars = [
          ...(friendlyChars || []).filter((c: any) => !c.isHidden),
          ...(enemySide || []).filter((c: any) => !c.isHidden),
        ];
        const hasSasuke = checkableChars.some(
          (c: any) => {
            const cTop = getTopCard(c);
            return cTop?.name_fr?.toUpperCase().includes('SASUKE');
          },
        );
        if (hasSasuke) {
          cost = Math.max(0, cost - 3);
        }
      }
    }
  }

  // Check enemy continuous effects that increase cost
  const enemyChars = player === 'player1' ? mission.player2Characters : mission.player1Characters;
  if (!enemyChars) return Math.max(0, cost);
  for (const enemy of enemyChars) {
    if (enemy.isHidden) continue;

    const enemyTopCard = getTopCard(enemy);
    if (!enemyTopCard) continue;

    for (const effect of enemyTopCard.effects ?? []) {
      if (effect.type !== 'MAIN' || !effect.description.includes('[⧗]')) continue;

      // Tayuya 125 (R/RA): Non-hidden enemy characters cost an additional 1 Chakra to play in this mission
      // Only applies to face-visible plays from hand - not to reveals (character is hidden at action start)
      if (!isReveal && enemyTopCard.number === 125 && effect.description.includes('additional 1 Chakra')) {
        cost += 1;
      }
    }
  }

  // Shino 033 AMBUSH: Pay 4 less when revealing if there's an enemy Jutsu character in this mission
  if (isReveal && card.number === 33) {
    const hasEnemyJutsu = enemyChars?.some((c: any) => {
      if (c.isHidden) return false;
      const cTop = getTopCard(c);
      return cTop?.keywords?.includes('Jutsu');
    });
    if (hasEnemyJutsu) {
      cost = Math.max(0, cost - 4);
    }
  }

  // Turn-wide cost increases
  if (state.playCostIncrease) {
    cost += state.playCostIncrease[player] ?? 0;
  }

  // Turn-wide cost reduction (e.g., Kakashi copying Shino 033 AMBUSH)
  if (state.playCostReduction) {
    const reduction = state.playCostReduction[player] ?? 0;
    if (reduction > 0) {
      cost = Math.max(0, cost - reduction);
    }
  }

  // Jiraiya 007 sub-play cost reduction for Summon characters
  // This is handled separately when Jiraiya's MAIN effect triggers

  return Math.max(0, cost);
}

/**
 * Check if Kurenai 034's continuous cost reduction applies to this card on this mission.
 * Used by PlayValidation to enforce minimum 1 cost on upgrades when Kurenai's reduction is active.
 */
export function hasKurenai034CostReduction(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: GameState | any,
  player: PlayerID,
  card: CharacterCard,
  missionIndex: number,
): boolean {
  if (missionIndex < 0 || missionIndex >= (state.activeMissions?.length ?? 0)) return false;
  const mission = state.activeMissions[missionIndex];
  if (!mission) return false;

  const friendlyChars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
  const enemyChars = player === 'player1' ? mission.player2Characters : mission.player1Characters;
  const allCharsInMission = [...(friendlyChars || []), ...(enemyChars || [])];

  for (const charInMission of allCharsInMission) {
    if (charInMission.isHidden) continue;
    const topCard = getTopCard(charInMission);
    if (!topCard) continue;
    for (const effect of topCard.effects ?? []) {
      if (effect.type !== 'MAIN' || !effect.description.includes('[⧗]')) continue;
      if (topCard.number === 34 && effect.description.includes('Team 8') && effect.description.includes('less')) {
        if ((card.keywords ?? []).includes('Team 8') && card.id !== topCard.id) {
          return true;
        }
      }
    }
  }
  return false;
}
