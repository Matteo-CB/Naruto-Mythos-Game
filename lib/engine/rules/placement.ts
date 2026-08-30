import type { GameState, PlayerID, CharacterInPlay } from '../types';
import { calculateEffectiveCost } from './ChakraValidation';
import { checkFlexibleUpgrade } from './PlayValidation';
import { hasFlexibleUpgradeRestriction, isRestrictedUpgradeTarget } from './flexibleUpgradeRestriction';

export function findUpgradeTargetIdx(
  chars: CharacterInPlay[],
  card: { name_fr: string; chakra: number; set?: string; number?: number | string; effects?: Array<{ type: string; description: string }> },
  excludeInstanceId?: string,
): number {


  const hasFlexibleRestriction = hasFlexibleUpgradeRestriction(card);


  const sameNameIdx = chars.findIndex(c => {
    if (c.isHidden) return false;
    if (c.controlledBy !== c.originalOwner) return false;
    if (excludeInstanceId && c.instanceId === excludeInstanceId) return false;
    const topCard = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;

    if (hasFlexibleRestriction && isRestrictedUpgradeTarget(topCard)) return false;
    return topCard.name_fr.toUpperCase() === card.name_fr.toUpperCase()
      && (card.chakra ?? 0) > (topCard.chakra ?? 0);
  });
  if (sameNameIdx >= 0) return sameNameIdx;


  const flexIdx = chars.findIndex(c => {
    if (c.isHidden) return false;
    if (c.controlledBy !== c.originalOwner) return false;
    if (excludeInstanceId && c.instanceId === excludeInstanceId) return false;
    const topCard = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!checkFlexibleUpgrade(card as any, topCard) || (card.chakra ?? 0) <= (topCard.chakra ?? 0)) return false;
    
    
    const wouldConflict = chars.some(other => {
      if (other.instanceId === c.instanceId || other.isHidden) return false;
      if (excludeInstanceId && other.instanceId === excludeInstanceId) return false;
      const oTop = other.stack?.length > 0 ? other.stack[other.stack?.length - 1] : other.card;
      return oTop.name_fr.toUpperCase() === card.name_fr.toUpperCase();
    });
    return !wouldConflict;
  });
  return flexIdx;
}


export function hasSameNameConflict(
  chars: CharacterInPlay[],
  card: { name_fr: string; chakra: number },
  excludeInstanceId?: string,
): boolean {
  return chars.some(c => {
    if (c.isHidden) return false;
    if (excludeInstanceId && c.instanceId === excludeInstanceId) return false;
    const topCard = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
    return topCard.name_fr.toUpperCase() === card.name_fr.toUpperCase();
  });
}


export function isMissionValidForPlay(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  friendlySide: 'player1Characters' | 'player2Characters',
  card: { id?: string; name_fr: string; chakra: number; number?: number; effects?: Array<{ type: string; description: string }>; keywords?: string[] },
  availableChakra: number,
  costReduction: number,
  excludeInstanceId?: string,
  noUpgrade = false,
): boolean {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return false;
  const chars = mission[friendlySide];
  const upgradeIdx = noUpgrade ? -1 : findUpgradeTargetIdx(chars, card, excludeInstanceId);

  const baseEffectiveCost = calculateEffectiveCost(
    state,
    player,
    card as never,
    missionIndex,
    false,
  );

  if (upgradeIdx >= 0) {
    const existing = chars[upgradeIdx];
    const existingTopCard = existing.stack?.length > 0 ? existing.stack[existing.stack?.length - 1] : existing.card;
    const upgradeCost = Math.max(0, (baseEffectiveCost - (existingTopCard.chakra ?? 0)) - costReduction);
    if (availableChakra >= upgradeCost) return true;

  }


  if (hasSameNameConflict(chars, card, excludeInstanceId)) {
    return false; // Same name exists but can't upgrade (lower or equal cost)
  }


  const freshCost = Math.max(0, baseEffectiveCost - costReduction);
  return availableChakra >= freshCost;
}


type CarteJouable = Parameters<typeof isMissionValidForPlay>[4];

export interface OptionsDePose {
  excludeInstanceId?: string;
  noUpgrade?: boolean;
  missionAutorisee?: (missionIndex: number) => boolean;
  reductionPourMission?: (missionIndex: number) => number;
}

export function missionsJouablesPour(
  state: GameState,
  player: PlayerID,
  carte: CarteJouable,
  costReduction: number,
  options: OptionsDePose = {},
): number[] {
  const friendlySide: 'player1Characters' | 'player2Characters' =
    player === 'player1' ? 'player1Characters' : 'player2Characters';
  const chakra = state[player].chakra;
  const jouables: number[] = [];

  for (let i = 0; i < state.activeMissions.length; i++) {
    if (options.missionAutorisee && !options.missionAutorisee(i)) continue;
    const reduction = options.reductionPourMission ? options.reductionPourMission(i) : costReduction;
    if (isMissionValidForPlay(
      state, player, i, friendlySide, carte, chakra, reduction,
      options.excludeInstanceId, options.noUpgrade ?? false,
    )) {
      jouables.push(i);
    }
  }
  return jouables;
}

export function peutEtreJouee(
  state: GameState,
  player: PlayerID,
  carte: CarteJouable,
  costReduction: number,
  options: OptionsDePose = {},
): boolean {
  return missionsJouablesPour(state, player, carte, costReduction, options).length > 0;
}
