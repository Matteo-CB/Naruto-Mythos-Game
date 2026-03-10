import { resolveCardId } from '@/lib/data/cardLoader';
import type { CharacterCard, MissionCard } from '@/lib/engine/types';
import {
  MAX_COPIES_PER_VERSION,
  MIN_DECK_SIZE,
  MISSION_CARDS_PER_PLAYER,
} from '@/lib/engine/types';

export interface ResolvedDeck {
  name: string;
  characters: CharacterCard[];
  missions: MissionCard[];
  score: number;
}

export interface DeckIdBundle {
  name?: string;
  cardIds: string[];
  missionIds: string[];
}

function versionKey(cardId: string): string {
  return cardId.replace(/\s*A$/, '').trim();
}

function scoreMission(card: MissionCard): number {
  const effectValue = (card.effects ?? []).reduce((sum, effect) => {
    if (effect.type === 'SCORE') return sum + 3;
    if (effect.type === 'MAIN') return sum + 1;
    return sum;
  }, 0);

  return (card.basePoints ?? 1) * 2 + effectValue;
}

function scoreCharacter(card: CharacterCard, preferredGroup?: string): number {
  const cost = card.chakra ?? 0;
  const power = card.power ?? 0;
  const efficiency = cost > 0 ? power / cost : power;
  const effects = card.effects ?? [];
  let effectScore = 0;

  for (const effect of effects) {
    if (effect.type === 'SCORE') effectScore += 3.5;
    if (effect.type === 'MAIN') effectScore += 1.8;
    if (effect.type === 'AMBUSH') effectScore += 1.2;
    if (/CHAKRA\s*\+/i.test(effect.description)) effectScore += 2.2;
    if (/POWERUP/i.test(effect.description)) effectScore += 1.4;
    if (/defeat|hide|defeat/i.test(effect.description)) effectScore += 1;
  }

  const curveBonus = cost >= 2 && cost <= 5 ? 0.8 : 0;
  const groupBonus = preferredGroup && card.group === preferredGroup ? 1.5 : 0;

  return efficiency * 3.2 + power * 0.55 + effectScore + curveBonus + groupBonus;
}

function normalizeCharacters(
  input: CharacterCard[],
  allCharacters: CharacterCard[],
  bannedIds: ReadonlySet<string>,
): CharacterCard[] {
  const byVersion = new Map<string, number>();
  const selected: CharacterCard[] = [];

  const pushIfAllowed = (card: CharacterCard) => {
    if (bannedIds.has(card.id)) return;
    const key = versionKey(card.id);
    const count = byVersion.get(key) ?? 0;
    if (count >= MAX_COPIES_PER_VERSION) return;
    byVersion.set(key, count + 1);
    selected.push(card);
  };

  for (const card of input) {
    if (selected.length >= MIN_DECK_SIZE) break;
    pushIfAllowed(card);
  }

  if (selected.length < MIN_DECK_SIZE) {
    const rankedFallback = [...allCharacters]
      .filter((c) => !bannedIds.has(c.id))
      .sort((a, b) => scoreCharacter(b) - scoreCharacter(a));
    for (const card of rankedFallback) {
      if (selected.length >= MIN_DECK_SIZE) break;
      pushIfAllowed(card);
    }
  }

  return selected.slice(0, MIN_DECK_SIZE);
}

function normalizeMissions(
  input: MissionCard[],
  allMissions: MissionCard[],
  bannedIds: ReadonlySet<string>,
): MissionCard[] {
  const chosen = new Map<string, MissionCard>();
  for (const mission of input) {
    if (chosen.size >= MISSION_CARDS_PER_PLAYER) break;
    if (bannedIds.has(mission.id)) continue;
    if (!chosen.has(mission.id)) {
      chosen.set(mission.id, mission);
    }
  }

  if (chosen.size < MISSION_CARDS_PER_PLAYER) {
    const rankedFallback = [...allMissions]
      .filter((m) => !bannedIds.has(m.id))
      .sort((a, b) => scoreMission(b) - scoreMission(a));
    for (const mission of rankedFallback) {
      if (chosen.size >= MISSION_CARDS_PER_PLAYER) break;
      if (!chosen.has(mission.id)) {
        chosen.set(mission.id, mission);
      }
    }
  }

  return [...chosen.values()].slice(0, MISSION_CARDS_PER_PLAYER);
}

export function evaluateDeckStrength(
  characters: CharacterCard[],
  missions: MissionCard[],
): number {
  const charStrength = characters.reduce((sum, card) => sum + scoreCharacter(card), 0) / Math.max(1, characters.length);
  const missionStrength = missions.reduce((sum, mission) => sum + scoreMission(mission), 0);
  return charStrength * 10 + missionStrength;
}

export function sanitizeResolvedDeck(
  deck: { name?: string; characters: CharacterCard[]; missions: MissionCard[] },
  allCharacters: CharacterCard[],
  allMissions: MissionCard[],
  bannedIds: ReadonlySet<string> = new Set<string>(),
): ResolvedDeck {
  const characters = normalizeCharacters(deck.characters, allCharacters, bannedIds);
  const missions = normalizeMissions(deck.missions, allMissions, bannedIds);
  const name = deck.name || 'AI Deck';

  return {
    name,
    characters,
    missions,
    score: evaluateDeckStrength(characters, missions),
  };
}

export function resolveDeckFromIds(
  bundle: DeckIdBundle,
  allCharacters: CharacterCard[],
  allMissions: MissionCard[],
  bannedIds: ReadonlySet<string> = new Set<string>(),
): ResolvedDeck {
  const charMap = new Map(allCharacters.map((card) => [card.id, card]));
  const missionMap = new Map(allMissions.map((card) => [card.id, card]));

  const characters: CharacterCard[] = [];
  for (const rawId of bundle.cardIds) {
    const resolvedId = resolveCardId(rawId);
    const card = charMap.get(resolvedId);
    if (card) characters.push(card);
  }

  const missions: MissionCard[] = [];
  for (const rawId of bundle.missionIds) {
    const resolvedId = resolveCardId(rawId);
    const card = missionMap.get(resolvedId);
    if (card) missions.push(card);
  }

  return sanitizeResolvedDeck(
    {
      name: bundle.name || 'AI Deck',
      characters,
      missions,
    },
    allCharacters,
    allMissions,
    bannedIds,
  );
}

function topGroups(allCharacters: CharacterCard[], maxGroups = 8): string[] {
  const counts = new Map<string, number>();
  for (const card of allCharacters) {
    if (!card.group) continue;
    counts.set(card.group, (counts.get(card.group) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxGroups)
    .map(([group]) => group);
}

function buildSingleStrongDeck(
  allCharacters: CharacterCard[],
  allMissions: MissionCard[],
  preferredGroup?: string,
): ResolvedDeck {
  const rankedChars = [...allCharacters].sort(
    (a, b) => scoreCharacter(b, preferredGroup) - scoreCharacter(a, preferredGroup),
  );
  const rankedMissions = [...allMissions].sort((a, b) => scoreMission(b) - scoreMission(a));

  return sanitizeResolvedDeck(
    {
      name: preferredGroup ? `AI ${preferredGroup}` : 'AI Meta',
      characters: rankedChars,
      missions: rankedMissions,
    },
    allCharacters,
    allMissions,
  );
}

export function buildStrongDeckVariants(
  allCharacters: CharacterCard[],
  allMissions: MissionCard[],
  count = 10,
): ResolvedDeck[] {
  const groups = topGroups(allCharacters, count);
  const variants: ResolvedDeck[] = [];

  for (const group of groups) {
    variants.push(buildSingleStrongDeck(allCharacters, allMissions, group));
    if (variants.length >= count) break;
  }

  while (variants.length < count) {
    variants.push(buildSingleStrongDeck(allCharacters, allMissions));
  }

  return variants
    .map((deck) => ({
      ...deck,
      score: evaluateDeckStrength(deck.characters, deck.missions),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
}
