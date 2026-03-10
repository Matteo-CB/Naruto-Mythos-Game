import type { GameState, PlayerID } from '@/lib/engine/types';
import { canAffordAsUpgrade } from './upgradeCheck';

export interface HiddenCharTarget {
  instanceId: string;
  name_fr: string;
  name_en?: string;
  chakra: number;
  power: number;
  image_file?: string;
  missionIndex: number;
}

/**
 * Find all Summon cards in the player's hand that are affordable with the given cost reduction.
 * Returns hand indices as numbers.
 */
export function findAffordableSummonsInHand(
  state: GameState,
  player: PlayerID,
  costReduction: number,
): number[] {
  const ps = state[player];
  const indices: number[] = [];
  for (let i = 0; i < ps.hand.length; i++) {
    const card = ps.hand[i];
    if (card.keywords && card.keywords.includes('Summon')) {
      const freshCost = Math.max(0, card.chakra - costReduction);
      if (ps.chakra >= freshCost || canAffordAsUpgrade(state, player, card, costReduction)) {
        indices.push(i);
      }
    }
  }
  return indices;
}

/**
 * Find all hidden Summon characters controlled by the player on the board
 * that could be revealed with the given cost reduction.
 * Checks name uniqueness: skips if a visible same-name character exists on the same mission
 * (unless it would be a valid upgrade).
 */
export function findHiddenSummonsOnBoard(
  state: GameState,
  player: PlayerID,
  costReduction: number,
): HiddenCharTarget[] {
  const ps = state[player];
  const friendlySide = player === 'player1' ? 'player1Characters' : 'player2Characters';
  const targets: HiddenCharTarget[] = [];

  for (let mIdx = 0; mIdx < state.activeMissions.length; mIdx++) {
    const mission = state.activeMissions[mIdx];
    for (const char of mission[friendlySide]) {
      if (!char.isHidden) continue;
      if (char.controlledBy !== player) continue;

      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      if (!topCard.keywords || !topCard.keywords.includes('Summon')) continue;

      const sameNameVisible = mission[friendlySide].find((c: any) => {
        if (c.isHidden) return false;
        if (c.instanceId === char.instanceId) return false;
        const cTop = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
        return cTop.name_fr.toUpperCase() === topCard.name_fr.toUpperCase();
      });

      let revealCost: number;
      if (sameNameVisible) {
        const existingTop = sameNameVisible.stack.length > 0
          ? sameNameVisible.stack[sameNameVisible.stack.length - 1]
          : sameNameVisible.card;
        if ((topCard.chakra ?? 0) <= (existingTop.chakra ?? 0)) {
          continue;
        }
        revealCost = Math.max(0, ((topCard.chakra ?? 0) - (existingTop.chakra ?? 0)) - costReduction);
      } else {
        revealCost = Math.max(0, (topCard.chakra ?? 0) - costReduction);
      }

      if (ps.chakra >= revealCost) {
        targets.push({
          instanceId: char.instanceId,
          name_fr: topCard.name_fr,
          name_en: topCard.name_en,
          chakra: topCard.chakra ?? 0,
          power: topCard.power ?? 0,
          image_file: topCard.image_file,
          missionIndex: mIdx,
        });
      }
    }
  }

  return targets;
}

/**
 * Find all hidden Leaf Village characters controlled by the player on the board
 * that could be revealed with a cost reduction.
 */
export function findHiddenLeafOnBoard(
  state: GameState,
  player: PlayerID,
  costReduction: number,
): HiddenCharTarget[] {
  const ps = state[player];
  const friendlySide = player === 'player1' ? 'player1Characters' : 'player2Characters';
  const targets: HiddenCharTarget[] = [];

  for (let mIdx = 0; mIdx < state.activeMissions.length; mIdx++) {
    const mission = state.activeMissions[mIdx];
    for (const char of mission[friendlySide]) {
      if (!char.isHidden) continue;
      if (char.controlledBy !== player) continue;

      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      if (topCard.group !== 'Leaf Village') continue;

      const sameNameVisible = mission[friendlySide].find((c: any) => {
        if (c.isHidden) return false;
        if (c.instanceId === char.instanceId) return false;
        const cTop = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
        return cTop.name_fr.toUpperCase() === topCard.name_fr.toUpperCase();
      });

      let revealCost: number;
      if (sameNameVisible) {
        const existingTop = sameNameVisible.stack.length > 0
          ? sameNameVisible.stack[sameNameVisible.stack.length - 1]
          : sameNameVisible.card;
        if ((topCard.chakra ?? 0) <= (existingTop.chakra ?? 0)) {
          continue;
        }
        revealCost = Math.max(0, ((topCard.chakra ?? 0) - (existingTop.chakra ?? 0)) - costReduction);
      } else {
        revealCost = Math.max(0, (topCard.chakra ?? 0) - costReduction);
      }

      if (ps.chakra >= revealCost) {
        targets.push({
          instanceId: char.instanceId,
          name_fr: topCard.name_fr,
          name_en: topCard.name_en,
          chakra: topCard.chakra ?? 0,
          power: topCard.power ?? 0,
          image_file: topCard.image_file,
          missionIndex: mIdx,
        });
      }
    }
  }

  return targets;
}
