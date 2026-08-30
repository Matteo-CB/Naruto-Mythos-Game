import type { GameState, PlayerID, CharacterCard, CharacterInPlay } from '@/lib/engine/types';
import { isHiddenRevealBlocked } from '@/lib/effects/ContinuousEffects';
import { calculateEffectiveCost } from '@/lib/engine/rules/ChakraValidation';
import { peutEtreJouee } from '@/lib/engine/rules/placement';
import { canRevealHiddenCharacter, revealWouldViolateNameUniqueness } from '@/lib/effects/revealNameUniqueness';

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
  return peutEtreJouee(state, player, card, costReduction);
}

export function canFreshPlayFromHand(
  state: GameState,
  player: PlayerID,
  card: CharacterCard,
  costReduction: number,
): boolean {
  const ps = state[player];
  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    const friendlySide = player === 'player1' ? mission.player1Characters : mission.player2Characters;
    const sameNameVisible = friendlySide.some(
      (c) => !c.isHidden && topCardOf(c).name_fr.toUpperCase() === card.name_fr.toUpperCase(),
    );
    if (sameNameVisible) continue;
    if (ps.chakra >= effectiveFreshPlayCost(state, player, card, i, costReduction)) return true;
  }
  return false;
}

export function freshRevealCost(
  state: GameState,
  player: PlayerID,
  hiddenChar: CharacterInPlay,
  missionIndex: number,
  costReduction: number,
): number | null {
  const topCard = topCardOf(hiddenChar);
  const mission = state.activeMissions[missionIndex];
  if (!mission) return null;

  const check = canRevealHiddenCharacter(state, player, missionIndex, hiddenChar);
  if (!check.allowed || check.upgradeTarget) return null;

  return Math.max(0, calculateEffectiveCost(state, player, topCard, missionIndex, true, hiddenChar) - costReduction);
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

  const check = canRevealHiddenCharacter(state, player, missionIndex, hiddenChar);
  if (!check.allowed) return null;

  const effective = calculateEffectiveCost(state, player, topCard, missionIndex, true, hiddenChar);

  if (check.upgradeTarget) {
    const existingTop = topCardOf(check.upgradeTarget);
    return Math.max(0, (effective - (existingTop.chakra ?? 0)) - costReduction);
  }

  return Math.max(0, effective - costReduction);
}

export function isPlayableCharacter(card: { card_type?: string }): boolean {
  return card.card_type === undefined || card.card_type === 'character';
}

export function findAffordableInHandByPredicate(
  state: GameState,
  player: PlayerID,
  predicate: CardPredicate,
  costReduction: number,
  freshOnly = false,
): number[] {
  const ps = state[player];
  const indices: number[] = [];
  for (let i = 0; i < ps.hand.length; i++) {
    const card = ps.hand[i];
    if (!isPlayableCharacter(card)) continue;
    if (!predicate(card)) continue;
    const affordable = freshOnly
      ? canFreshPlayFromHand(state, player, card, costReduction)
      : canAffordFromHand(state, player, card, costReduction);
    if (affordable) {
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
  freshOnly = false,
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
      if (!isPlayableCharacter(topCard)) continue;
      if (!predicate(topCard)) continue;
      if (revealWouldViolateNameUniqueness(state, player, mIdx, char)) continue;

      const revealCost = freshOnly
        ? freshRevealCost(state, player, char, mIdx, costReduction)
        : effectiveRevealCost(state, player, char, mIdx, costReduction);
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

export function findRevealBlockedByNameRule(
  state: GameState,
  player: PlayerID,
  predicate: CardPredicate,
): string | null {
  const friendlySide = player === 'player1' ? 'player1Characters' : 'player2Characters';
  for (let mIdx = 0; mIdx < state.activeMissions.length; mIdx++) {
    if (isHiddenRevealBlocked(state, mIdx, player)) continue;
    for (const char of state.activeMissions[mIdx][friendlySide]) {
      if (!char.isHidden) continue;
      if (char.controlledBy !== player) continue;
      const topCard = topCardOf(char);
      if (!isPlayableCharacter(topCard)) continue;
      if (!predicate(topCard)) continue;
      if (revealWouldViolateNameUniqueness(state, player, mIdx, char)) return topCard.name_fr;
    }
  }
  return null;
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

export function findRevealBlockedSummon(state: GameState, player: PlayerID): string | null {
  return findRevealBlockedByNameRule(state, player, HAS_SUMMON);
}

export function findRevealBlockedSoundVillage(state: GameState, player: PlayerID): string | null {
  return findRevealBlockedByNameRule(state, player, IS_SOUND);
}

export function findRevealBlockedLeaf(state: GameState, player: PlayerID): string | null {
  return findRevealBlockedByNameRule(state, player, IS_LEAF);
}
