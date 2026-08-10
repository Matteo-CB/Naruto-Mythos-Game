import type { GameState, CharacterInPlay, PlayerID } from '@/lib/engine/types';
import { sideFor } from './moveNameUniqueness';
import { flexibleUpgradeRestrictionBlocks } from '@/lib/engine/rules/flexibleUpgradeRestriction';

export const REVEAL_DUPLICATE_NAME_REASON_KEY = 'game.error.duplicateNameReveal';

export type RevealNameUniquenessCheck =
  | { allowed: true; upgradeTarget: CharacterInPlay | null }
  | { allowed: false; reasonKey: string; reasonParams: { name: string } };

function topOf(c: CharacterInPlay) {
  return c.stack?.length > 0 ? c.stack[c.stack.length - 1] : c.card;
}

function visibleSameNameOnSide(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  hiddenChar: CharacterInPlay,
): CharacterInPlay[] {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return [];
  const name = topOf(hiddenChar).name_fr.toUpperCase();
  return mission[sideFor(player)].filter(
    (c) => c.instanceId !== hiddenChar.instanceId && !c.isHidden && topOf(c).name_fr.toUpperCase() === name,
  );
}

export function findLegalRevealUpgradeTarget(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  hiddenChar: CharacterInPlay,
): CharacterInPlay | null {
  const sameName = visibleSameNameOnSide(state, player, missionIndex, hiddenChar);
  if (sameName.length !== 1) return null;
  if (hiddenChar.controlledBy !== hiddenChar.originalOwner) return null;

  const target = sameName[0];
  if (target.controlledBy !== target.originalOwner) return null;

  const revealedTop = topOf(hiddenChar);
  const targetTop = topOf(target);
  if ((revealedTop.chakra ?? 0) <= (targetTop.chakra ?? 0)) return null;
  if (flexibleUpgradeRestrictionBlocks(revealedTop, targetTop)) return null;

  return target;
}

export function revealUpgradeWouldDuplicateName(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  hiddenChar: CharacterInPlay,
  upgradeTarget: CharacterInPlay,
): boolean {
  return visibleSameNameOnSide(state, player, missionIndex, hiddenChar).some(
    (c) => c.instanceId !== upgradeTarget.instanceId,
  );
}

export function revealWouldViolateNameUniqueness(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  hiddenChar: CharacterInPlay,
): boolean {
  if (visibleSameNameOnSide(state, player, missionIndex, hiddenChar).length === 0) return false;
  return findLegalRevealUpgradeTarget(state, player, missionIndex, hiddenChar) === null;
}

export function canRevealHiddenCharacter(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  hiddenChar: CharacterInPlay,
): RevealNameUniquenessCheck {
  if (revealWouldViolateNameUniqueness(state, player, missionIndex, hiddenChar)) {
    return {
      allowed: false,
      reasonKey: REVEAL_DUPLICATE_NAME_REASON_KEY,
      reasonParams: { name: topOf(hiddenChar).name_fr },
    };
  }
  return { allowed: true, upgradeTarget: findLegalRevealUpgradeTarget(state, player, missionIndex, hiddenChar) };
}
