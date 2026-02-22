import type { CardData, CharacterCard, MissionCard } from '../engine/types';

type Locale = 'en' | 'fr';
type AnyCard = CardData | CharacterCard | MissionCard;

/**
 * Get the display name of a card based on the current locale.
 * Falls back to name_fr if name_en is not available.
 */
export function getCardName(card: AnyCard, locale: Locale): string {
  if (locale === 'en' && card.name_en) return card.name_en;
  return card.name_fr;
}

/**
 * Get the display title of a card based on the current locale.
 * Falls back to title_fr if title_en is not available.
 */
export function getCardTitle(card: AnyCard, locale: Locale): string {
  if (locale === 'en' && card.title_en) return card.title_en;
  return card.title_fr;
}

// ─── Group Translations ───

const GROUP_FR: Record<string, string> = {
  'Leaf Village': 'Village de Konoha',
  'Sand Village': 'Village du Sable',
  'Sound Village': 'Village du Son',
  'Akatsuki': 'Akatsuki',
  'Independent': 'Indépendant',
};

export function getCardGroup(group: string, locale: Locale): string {
  if (locale === 'fr') return GROUP_FR[group] ?? group;
  return group;
}

// ─── Keyword Translations ───

const KEYWORD_FR: Record<string, string> = {
  'Team 7': 'Équipe 7',
  'Team 8': 'Équipe 8',
  'Team 10': 'Équipe 10',
  'Team Guy': 'Équipe Gaï',
  'Team Baki': 'Équipe Baki',
  'Sannin': 'Sannin',
  'Summon': 'Invocation',
  'Hokage': 'Hokage',
  'Rogue Ninja': 'Ninja Déserteur',
  'Sound Four': 'Quatre du Son',
  'Sound Ninja': 'Ninja du Son',
  'Kekkei Genkai': 'Kekkei Genkai',
  'Taijutsu': 'Taijutsu',
  'Jutsu': 'Jutsu',
  'Weapon': 'Arme',
  'Tailed Beast': 'Bijû',
  'Ninja Hound': 'Chien Ninja',
  'Ninja Pig': 'Cochon Ninja',
  'Special Jonin': 'Jônin Spécial',
};

export function getCardKeyword(keyword: string, locale: Locale): string {
  if (locale === 'fr') return KEYWORD_FR[keyword] ?? keyword;
  return keyword;
}

// ─── Rarity Labels ───

const RARITY_LABELS_EN: Record<string, string> = {
  C: 'Common',
  UC: 'Uncommon',
  R: 'Rare',
  RA: 'Rare Art',
  S: 'Secret',
  SV: 'Secret V',
  M: 'Mythos',
  MV: 'Mythos V',
  L: 'Legendary',
  MMS: 'Mission',
};

const RARITY_LABELS_FR: Record<string, string> = {
  C: 'Commune',
  UC: 'Peu commune',
  R: 'Rare',
  RA: 'Rare Art',
  S: 'Secrète',
  SV: 'Secrète V',
  M: 'Mythos',
  MV: 'Mythos V',
  L: 'Légendaire',
  MMS: 'Mission',
};

export function getRarityLabel(rarity: string, locale: Locale): string {
  if (locale === 'fr') return RARITY_LABELS_FR[rarity] ?? rarity;
  return RARITY_LABELS_EN[rarity] ?? rarity;
}
