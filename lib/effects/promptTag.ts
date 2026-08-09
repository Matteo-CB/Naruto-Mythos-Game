import { parseDuelCharacterName } from '@/lib/effects/duelUtils';

export interface PromptTag {
  effectType: string;
  duelPartner?: string;
}

const UNTAGGED_SELECTIONS = new Set([
  'REORDER_DISCARD',
  'CHOOSE_EFFECT_ORDER',
  'END_OF_ROUND_EFFECT_ORDER',
  'EFFECT_PLAY_UPGRADE_OR_FRESH',
  'HIRUZEN002_UPGRADE_OR_FRESH',
]);

export function isTaggableSelection(targetSelectionType?: string): boolean {
  return !targetSelectionType || !UNTAGGED_SELECTIONS.has(targetSelectionType);
}

export function duelPartnerOf(
  card: { effects?: Array<{ type: string; description: string }> } | null | undefined,
): string | undefined {
  const duel = card?.effects?.find((e) => e.type === 'DUEL');
  if (!duel) return undefined;
  const name = parseDuelCharacterName(duel.description);
  if (!name) return undefined;
  return name.replace(/\s+(MAIN|AMBUSH|UPGRADE|SCORE)\s+effect$/i, '').trim() || undefined;
}

export function buildPromptTag(
  effectType: string | undefined,
  targetSelectionType: string | undefined,
  card: { effects?: Array<{ type: string; description: string }> } | null | undefined,
): PromptTag | undefined {
  if (!effectType) return undefined;
  if (!isTaggableSelection(targetSelectionType)) return undefined;
  if (effectType !== 'DUEL') return { effectType };
  return { effectType, duelPartner: duelPartnerOf(card) };
}
