import type { CharacterCard } from '../types';

const GROUPES = ['Leaf Village', 'Sand Village', 'Sound Village', 'Akatsuki', 'Independent'];

export function characterGroupMatches(description: string, card: CharacterCard): boolean {
  const cite = GROUPES.filter((g) => description.includes(g));
  if (cite.length === 0) return true;
  return cite.includes(card.group);
}

export function characterKeywordMatches(description: string, card: CharacterCard): boolean {
  const motsCles = card.keywords ?? [];
  const cites = new Set<string>();
  for (const mot of ['Team 7', 'Team 8', 'Team 10', 'Team Guy', 'Sannin', 'Summon', 'Rogue Ninja', 'Sound Four', 'Jutsu', 'Ninja Hound', 'Weapon', 'Armor', 'Food']) {
    if (description.includes(mot)) cites.add(mot);
  }
  if (cites.size === 0) return true;
  for (const mot of cites) {
    if (motsCles.includes(mot)) return true;
  }
  return false;
}
