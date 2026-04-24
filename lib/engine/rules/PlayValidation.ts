import type { GameState, PlayerID, CharacterCard } from '../types';
import { HIDDEN_PLAY_COST } from '../types';
import { calculateEffectiveCost } from './ChakraValidation';
import { calculateCharacterPower } from '../phases/PowerCalculation';

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  reasonKey?: string;
  reasonParams?: Record<string, string | number>;
}


export function validatePlayCharacter(
  state: GameState,
  player: PlayerID,
  card: CharacterCard,
  missionIndex: number,
  effectiveCost: number,
): ValidationResult {
  
  if (missionIndex < 0 || missionIndex >= state.activeMissions.length) {
    return { valid: false, reason: 'Invalid mission index.', reasonKey: 'game.error.invalidMission' };
  }

  
  const ps = state[player];
  if (ps.chakra < effectiveCost) {
    return { valid: false, reason: `Not enough chakra. Need ${effectiveCost}, have ${ps.chakra}.`, reasonKey: 'game.error.notEnoughChakra', reasonParams: { need: effectiveCost, have: ps.chakra } };
  }

  
  const mission = state.activeMissions[missionIndex];
  const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
  const sameName = chars.some((c) => {
    
    
    if (!c.isHidden) {
      const topCard = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
      return topCard.name_fr.toUpperCase() === card.name_fr.toUpperCase();
    }
    return false;
  });

  if (sameName) {
    return { valid: false, reason: `Already have a ${card.name_fr} on this mission.`, reasonKey: 'game.error.duplicateName', reasonParams: { name: card.name_fr } };
  }

  
  if (card.number === 40) {
    const hasTentenRestriction = (card.effects ?? []).some(
      (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('currently winning'),
    );
    if (hasTentenRestriction) {
      if (!isWinningMission(state, player, missionIndex)) {
        return { valid: false, reason: 'Tenten can only be played on a mission where you are currently winning.', reasonKey: 'game.error.tentenRestriction' };
      }
    }
  }

  return { valid: true };
}


export function validatePlayHidden(
  state: GameState,
  player: PlayerID,
  card: CharacterCard,
  missionIndex: number,
): ValidationResult {
  if (missionIndex < 0 || missionIndex >= state.activeMissions.length) {
    return { valid: false, reason: 'Invalid mission index.', reasonKey: 'game.error.invalidMission' };
  }

  const ps = state[player];
  if (ps.chakra < HIDDEN_PLAY_COST) {
    return { valid: false, reason: `Not enough chakra to play hidden (need ${HIDDEN_PLAY_COST}).`, reasonKey: 'game.error.notEnoughChakraHidden', reasonParams: { need: HIDDEN_PLAY_COST } };
  }

  
  

  return { valid: true };
}


export function validateRevealCharacter(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  characterInstanceId: string,
): ValidationResult {
  if (missionIndex < 0 || missionIndex >= state.activeMissions.length) {
    return { valid: false, reason: 'Invalid mission index.', reasonKey: 'game.error.invalidMission' };
  }

  const mission = state.activeMissions[missionIndex];
  const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
  const char = chars.find((c) => c.instanceId === characterInstanceId);

  if (!char) {
    return { valid: false, reason: 'Character not found.', reasonKey: 'game.error.characterNotFound' };
  }

  if (!char.isHidden) {
    return { valid: false, reason: 'Character is already face-up.', reasonKey: 'game.error.alreadyFaceUp' };
  }

  if (char.controlledBy !== player) {
    return { valid: false, reason: 'Cannot reveal opponent\'s character.', reasonKey: 'game.error.cannotRevealOpponent' };
  }

  
  const opponent = player === 'player1' ? 'player2' : 'player1';
  const opponentChars = opponent === 'player1' ? mission.player1Characters : mission.player2Characters;
  for (const oc of opponentChars) {
    if (oc.isHidden) continue;
    const ocTop = oc.stack?.length > 0 ? oc.stack[oc.stack?.length - 1] : oc.card;
    if (ocTop.number === 111 || ocTop.number === 150) {
      const hasRestriction = (ocTop.effects ?? []).some(
        (e: { type: string; description: string }) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('cannot play characters while hidden'),
      );
      if (hasRestriction) {
        return { valid: false, reason: 'Shikamaru Nara blocks revealing hidden characters in this mission.', reasonKey: 'game.error.shikamaruBlock' };
      }
    }
  }

  
  const charTopCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;

  
  if (charTopCard.number === 40) {
    const hasTentenRestriction = (charTopCard.effects ?? []).some(
      (e: { type: string; description: string }) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('currently winning'),
    );
    if (hasTentenRestriction && !isWinningMission(state, player, missionIndex)) {
      return { valid: false, reason: 'Tenten can only be revealed on a mission where you are currently winning.', reasonKey: 'game.error.tentenRestriction' };
    }
  }

  
  
  const sameNameChar = chars.find((c) => {
    if (c.instanceId === characterInstanceId) return false;
    if (!c.isHidden) {
      const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
      return cTop.name_fr.toUpperCase() === charTopCard.name_fr.toUpperCase();
    }
    return false;
  });

  
  
  const flexibleUpgradeTarget = !sameNameChar ? chars.find((c) => {
    if (c.instanceId === characterInstanceId || c.isHidden) return false;
    const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
    if (!checkFlexibleUpgrade(charTopCard, cTop) || charTopCard.chakra <= cTop.chakra) return false;
    
    const wouldConflict = chars.some((other) => {
      if (other.instanceId === characterInstanceId || other.instanceId === c.instanceId) return false;
      if (other.isHidden) return false;
      const oTop = other.stack?.length > 0 ? other.stack[other.stack?.length - 1] : other.card;
      return oTop.name_fr.toUpperCase() === charTopCard.name_fr.toUpperCase();
    });
    return !wouldConflict;
  }) : null;

  const upgradeTarget = sameNameChar ?? flexibleUpgradeTarget;

  let effectiveCost: number;
  if (upgradeTarget) {
    const existingTopCard = upgradeTarget.stack?.length > 0
      ? upgradeTarget.stack[upgradeTarget.stack?.length - 1]
      : upgradeTarget.card;
    if (charTopCard.chakra > existingTopCard.chakra) {

      const revealCost = calculateEffectiveCost(state, player, charTopCard, missionIndex, true);
      effectiveCost = Math.max(0, revealCost - existingTopCard.chakra);
    } else if (sameNameChar) {
      return { valid: false, reason: `Already have a visible ${charTopCard.name_fr} on this mission.`, reasonKey: 'game.error.duplicateNameReveal', reasonParams: { name: charTopCard.name_fr } };
    } else {
      effectiveCost = calculateEffectiveCost(state, player, charTopCard, missionIndex, true);
    }
  } else {
    effectiveCost = calculateEffectiveCost(state, player, charTopCard, missionIndex, true);
  }

  
  const ps = state[player];
  if (ps.chakra < effectiveCost) {
    return { valid: false, reason: `Not enough chakra. Need ${effectiveCost}, have ${ps.chakra}.`, reasonKey: 'game.error.notEnoughChakra', reasonParams: { need: effectiveCost, have: ps.chakra } };
  }

  return { valid: true };
}


export function validateUpgradeCharacter(
  state: GameState,
  player: PlayerID,
  newCard: CharacterCard,
  missionIndex: number,
  targetInstanceId: string,
): ValidationResult {
  if (missionIndex < 0 || missionIndex >= state.activeMissions.length) {
    return { valid: false, reason: 'Invalid mission index.', reasonKey: 'game.error.invalidMission' };
  }

  const mission = state.activeMissions[missionIndex];
  const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
  const target = chars.find((c) => c.instanceId === targetInstanceId);

  if (!target) {
    return { valid: false, reason: 'Target character not found.', reasonKey: 'game.error.targetNotFound' };
  }

  if (target.controlledBy !== player) {
    return { valid: false, reason: 'Cannot upgrade opponent\'s character.', reasonKey: 'game.error.cannotUpgradeOpponent' };
  }


  if (target.isHidden) {
    return { valid: false, reason: 'Hidden' };
  }

  const topCard = target.stack?.length > 0 ? target.stack[target.stack?.length - 1] : target.card;

  
  const isFlexibleUpgrade = checkFlexibleUpgrade(newCard, topCard);

  if (!isFlexibleUpgrade) {
    
    if (newCard.name_fr.toUpperCase() !== topCard.name_fr.toUpperCase()) {
      return { valid: false, reason: 'Upgrade must be same character name.', reasonKey: 'game.error.upgradeSameName' };
    }
  }

  
  
  
  if (isFlexibleUpgrade) {
    const wouldConflict = chars.some((c) => {
      if (c.instanceId === targetInstanceId) return false; // Skip the target being upgraded
      if (c.isHidden) return false;
      const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
      return cTop.name_fr.toUpperCase() === newCard.name_fr.toUpperCase();
    });
    if (wouldConflict) {
      return { valid: false, reason: `Cannot upgrade: would create duplicate ${newCard.name_fr} on this mission.`, reasonKey: 'game.error.upgradeNameConflict', reasonParams: { name: newCard.name_fr } };
    }
  }

  
  
  if ((newCard.number === 51 || newCard.number === 138) &&
    (newCard.effects ?? []).some(e => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.toLowerCase().includes('upgrade'))) {
    const isSummon = (topCard.keywords ?? []).includes('Summon');
    const isOrochimaru = topCard.name_fr.toUpperCase().includes('OROCHIMARU');
    if (isSummon || isOrochimaru) {
      return { valid: false, reason: 'Cannot upgrade onto a Summon or Orochimaru.', reasonKey: 'game.error.flexibleUpgradeRestriction' };
    }
  }

  
  if (newCard.chakra <= topCard.chakra) {
    return { valid: false, reason: `Upgrade must have strictly higher chakra cost. New: ${newCard.chakra}, Current: ${topCard.chakra}.`, reasonKey: 'game.error.upgradeHigherCost', reasonParams: { newCost: newCard.chakra, currentCost: topCard.chakra } };
  }

  
  const ps = state[player];
  const effectiveCost = calculateEffectiveCost(state, player, newCard, missionIndex, false);
  const costDiff = Math.max(0, effectiveCost - topCard.chakra);
  if (ps.chakra < costDiff) {
    return { valid: false, reason: `Not enough chakra. Need ${costDiff} (difference), have ${ps.chakra}.`, reasonKey: 'game.error.notEnoughChakraUpgrade', reasonParams: { need: costDiff, have: ps.chakra } };
  }

  return { valid: true };
}


export function checkFlexibleUpgrade(newCard: CharacterCard, targetCard: CharacterCard): boolean {
  
  if (newCard.name_fr.toUpperCase() === targetCard.name_fr.toUpperCase()) return false;

  
  if (newCard.number === 51 || newCard.number === 138) {
    const hasFlexible = (newCard.effects ?? []).some(
      (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('upgrade'),
    );
    if (hasFlexible) {
      const isSummon = (targetCard.keywords ?? []).includes('Summon');
      const isOrochimaru = targetCard.name_fr.toUpperCase().includes('OROCHIMARU');
      return !isSummon && !isOrochimaru;
    }
  }

  
  if (newCard.number === 29) {
    const hasFlexible = (newCard.effects ?? []).some(
      (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('Kiba Inuzuka'),
    );
    if (hasFlexible) {
      return targetCard.name_fr.toUpperCase().includes('KIBA INUZUKA');
    }
  }

  
  
  if (newCard.number === 76) {
    return targetCard.name_fr.toUpperCase() === 'GAARA';
  }

  
  if (newCard.number === 129) {
    const hasFlexible = (newCard.effects ?? []).some(
      (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('Naruto Uzumaki'),
    );
    if (hasFlexible) {
      return targetCard.name_fr.toUpperCase().includes('NARUTO');
    }
  }

  
  if (newCard.number === 63 || newCard.number === 124 || newCard.number === 127) {
    const hasFlexible = (newCard.effects ?? []).some(
      (e) => e.description.includes('[⧗]') && e.description.toLowerCase().includes('upgrade'),
    );
    if (hasFlexible) {
      return (targetCard.group ?? '').toLowerCase().includes('sound');
    }
  }

  return false;
}


function isWinningMission(state: GameState, player: PlayerID, missionIndex: number): boolean {
  const mission = state.activeMissions[missionIndex];
  const p1Chars = mission.player1Characters;
  const p2Chars = mission.player2Characters;

  let p1Power = 0;
  let p2Power = 0;

  
  for (const c of p1Chars) {
    p1Power += calculateCharacterPower(state, c, 'player1');
  }
  for (const c of p2Chars) {
    p2Power += calculateCharacterPower(state, c, 'player2');
  }

  
  const myPower = player === 'player1' ? p1Power : p2Power;
  const oppPower = player === 'player1' ? p2Power : p1Power;
  if (myPower <= 0) return false; // must have at least 1 power
  if (myPower > oppPower) return true;
  if (myPower === oppPower && state.edgeHolder === player) return true;
  return false;
}
