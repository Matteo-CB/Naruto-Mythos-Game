import type { GameState, PlayerID, CharacterCard, CharacterInPlay } from '@/lib/engine/types';
import { canAffordAsUpgrade } from './upgradeCheck';
import { isHiddenRevealBlocked } from '@/lib/effects/ContinuousEffects';
import { calculateEffectiveCost } from '@/lib/engine/rules/ChakraValidation';

export interface HiddenCharTarget {
  instanceId: string;
  name_fr: string;
  name_en?: string;
  chakra: number;
  power: number;
  image_file?: string;
  missionIndex: number;
}

type CardPredicate = (card: CharacterCard) => boolean;

function topCardOf(c: CharacterInPlay): CharacterCard {
  return c.stack?.length > 0 ? c.stack[c.stack.length - 1] : c.card;
}

export function effectiveFreshPlayCost(
  state: GameState,
  player: PlayerID,
  card: CharacterCard,
  missionIndex: number,
  costReduction: number,
): number {
  const eff = calculateEffectiveCost(state, player, card, missionIndex, false);
  return Math.max(0, eff - costReduction);
}

export function bestFreshPlayCost(
  state: GameState,
  player: PlayerID,
  card: CharacterCard,
  costReduction: number,
): number {
  if (!state.activeMissions || state.activeMissions.length === 0) {
    return Math.max(0, (card.chakra ?? 0) - costReduction);
  }
  let best = Infinity;
  for (let i = 0; i < state.activeMissions.length; i++) {
    const c = effectiveFreshPlayCost(state, player, card, i, costReduction);
    if (c < best) best = c;
  }
  return best;
}

export function canAffordFromHand(
  state: GameState,
  player: PlayerID,
  card: CharacterCard,
  costReduction: number,
): boolean {
  const ps = state[player];
  if (ps.chakra >= bestFreshPlayCost(state, player, card, costReduction)) return true;
  return canAffordAsUpgrade(state, player, card, costReduction);
}

export function effectiveRevealCost(
  state: GameState,
  player: PlayerID,
  hiddenChar: CharacterInPlay,
  missionIndex: number,
  costReduction: number,
): number | null {
  const topCard = topCardOf(hiddenChar);
  const mission = state.activeMissions[missionIndex];
  if (!mission) return null;
  const friendlySide = player === 'player1' ? mission.player1Characters : mission.player2Characters;

  const sameNameVisible = friendlySide.find((c) => {
    if (c.isHidden) return false;
    if (c.instanceId === hiddenChar.instanceId) return false;
    return topCardOf(c).name_fr.toUpperCase() === topCard.name_fr.toUpperCase();
  });

  const effective = calculateEffectiveCost(state, player, topCard, missionIndex, true);

  if (sameNameVisible) {
    const existingTop = topCardOf(sameNameVisible);
    if ((topCard.chakra ?? 0) <= (existingTop.chakra ?? 0)) return null;
    return Math.max(0, (effective - (existingTop.chakra ?? 0)) - costReduction);
  }

  return Math.max(0, effective - costReduction);
}

export function findAffordableInHandByPredicate(
  state: GameState,
  player: PlayerID,
  predicate: CardPredicate,
  costReduction: number,
): number[] {
  const ps = state[player];
  const indices: number[] = [];
  for (let i = 0; i < ps.hand.length; i++) {
    const card = ps.hand[i];
    if (!predicate(card)) continue;
    if (canAffordFromHand(state, player, card, costReduction)) {
      indices.push(i);
    }
  }
  return indices;
}

export function findHiddenOnBoardByPredicate(
  state: GameState,
  player: PlayerID,
  predicate: CardPredicate,
  costReduction: number,
): HiddenCharTarget[] {
  const ps = state[player];
  const friendlySide = player === 'player1' ? 'player1Characters' : 'player2Characters';
  const targets: HiddenCharTarget[] = [];

  for (let mIdx = 0; mIdx < state.activeMissions.length; mIdx++) {
    if (isHiddenRevealBlocked(state, mIdx, player)) continue;
    for (const char of state.activeMissions[mIdx][friendlySide]) {
      if (!char.isHidden) continue;
      if (char.controlledBy !== player) continue;
      const topCard = topCardOf(char);
      if (!predicate(topCard)) continue;

      const revealCost = effectiveRevealCost(state, player, char, mIdx, costReduction);
      if (revealCost === null) continue;

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

const HAS_SUMMON: CardPredicate = (c) => !!c.keywords && c.keywords.includes('Summon');
const IS_SOUND: CardPredicate = (c) => c.group === 'Sound Village';
const IS_LEAF: CardPredicate = (c) => c.group === 'Leaf Village';

export function findAffordableSummonsInHand(state: GameState, player: PlayerID, costReduction: number): number[] {
  return findAffordableInHandByPredicate(state, player, HAS_SUMMON, costReduction);
}

export function findHiddenSummonsOnBoard(state: GameState, player: PlayerID, costReduction: number): HiddenCharTarget[] {
  return findHiddenOnBoardByPredicate(state, player, HAS_SUMMON, costReduction);
}

export function findAffordableSoundVillageInHand(state: GameState, player: PlayerID, costReduction: number): number[] {
  return findAffordableInHandByPredicate(state, player, IS_SOUND, costReduction);
}

export function findHiddenSoundVillageOnBoard(state: GameState, player: PlayerID, costReduction: number): HiddenCharTarget[] {
  return findHiddenOnBoardByPredicate(state, player, IS_SOUND, costReduction);
}

export function findAffordableLeafInHand(state: GameState, player: PlayerID, costReduction: number): number[] {
  return findAffordableInHandByPredicate(state, player, IS_LEAF, costReduction);
}

export function findHiddenLeafOnBoard(state: GameState, player: PlayerID, costReduction: number): HiddenCharTarget[] {
  return findHiddenOnBoardByPredicate(state, player, IS_LEAF, costReduction);
}
