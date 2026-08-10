export const FLEXIBLE_UPGRADE_RESTRICTION_REASON_KEY = 'game.error.flexibleUpgradeRestriction';

const RESTRICTED_KS_NUMBERS = [51, 138];

interface UpgradingCardShape {
  set?: string;
  number?: string | number;
  effects?: Array<{ type: string; description: string }>;
}

interface UpgradeTargetShape {
  keywords?: string[];
  name_fr?: string;
}

export function hasFlexibleUpgradeRestriction(card: UpgradingCardShape): boolean {
  if (String(card.set ?? 'KS') !== 'KS') return false;
  const number = typeof card.number === 'string' ? parseInt(card.number, 10) : card.number;
  if (typeof number !== 'number' || !RESTRICTED_KS_NUMBERS.includes(number)) return false;
  return (card.effects ?? []).some(
    (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.toLowerCase().includes('upgrade'),
  );
}

export function isRestrictedUpgradeTarget(targetTopCard: UpgradeTargetShape): boolean {
  const isSummon = (targetTopCard.keywords ?? []).includes('Summon');
  const isOrochimaru = (targetTopCard.name_fr ?? '').toUpperCase().includes('OROCHIMARU');
  return isSummon || isOrochimaru;
}

export function flexibleUpgradeRestrictionBlocks(
  upgradingCard: UpgradingCardShape,
  targetTopCard: UpgradeTargetShape,
): boolean {
  return hasFlexibleUpgradeRestriction(upgradingCard) && isRestrictedUpgradeTarget(targetTopCard);
}
