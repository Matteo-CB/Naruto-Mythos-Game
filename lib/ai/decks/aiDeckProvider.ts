import type { AIDifficulty } from '@/lib/ai/AIPlayer';
import type { CharacterCard, MissionCard } from '@/lib/engine/types';
import curatedStrongDecks from '@/ai_training/strong_decks_curated.json';
import {
  buildStrongDeckVariants,
  resolveDeckFromIds,
  sanitizeResolvedDeck,
  type ResolvedDeck,
} from './strongDecks';

interface StrongDeckApiEntry {
  name?: string;
  cardIds: string[];
  missionIds: string[];
}

interface StrongDeckApiResponse {
  decks?: StrongDeckApiEntry[];
}

interface CuratedDeckFile {
  decks?: StrongDeckApiEntry[];
}

interface DeckPoolParams {
  allCharacters: CharacterCard[];
  allMissions: MissionCard[];
  bannedIds?: ReadonlySet<string>;
  limit?: number;
  source?: 'curated' | 'hybrid';
}

function deckSignature(deck: { characters: CharacterCard[]; missions: MissionCard[] }): string {
  const chars = deck.characters.map((c) => c.id).sort().join(',');
  const missions = deck.missions.map((m) => m.id).sort().join(',');
  return `${chars}::${missions}`;
}

function randomInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

function randomPick<T>(items: T[]): T {
  return items[randomInt(items.length)];
}

function getCuratedDeckEntries(maxCount: number): StrongDeckApiEntry[] {
  const source = curatedStrongDecks as CuratedDeckFile;
  if (!Array.isArray(source.decks)) return [];
  return source.decks.slice(0, Math.max(1, maxCount));
}

async function fetchApiDeckEntries(limit: number): Promise<StrongDeckApiEntry[]> {
  try {
    const response = await fetch(`/api/ai/strong-decks?limit=${limit}`, { cache: 'no-store' });
    if (!response.ok) return [];
    const data = (await response.json()) as StrongDeckApiResponse;
    return Array.isArray(data.decks) ? data.decks : [];
  } catch {
    return [];
  }
}

function sortedByPower(
  cards: CharacterCard[],
  direction: 'asc' | 'desc',
): CharacterCard[] {
  const sorted = [...cards].sort((a, b) => {
    const ap = (a.power ?? 0) + (a.chakra ?? 0) * 0.25;
    const bp = (b.power ?? 0) + (b.chakra ?? 0) * 0.25;
    return ap - bp;
  });
  return direction === 'asc' ? sorted : sorted.reverse();
}

function withRandomSwaps(
  deck: ResolvedDeck,
  allCharacters: CharacterCard[],
  allMissions: MissionCard[],
  bannedIds: ReadonlySet<string>,
  swaps: number,
  replacementBias: 'weak' | 'mixed' | 'strong',
): ResolvedDeck {
  if (swaps <= 0 || deck.characters.length === 0) {
    return sanitizeResolvedDeck(deck, allCharacters, allMissions, bannedIds);
  }

  const candidates = sortedByPower(
    allCharacters.filter((card) => !bannedIds.has(card.id)),
    replacementBias === 'weak' ? 'asc' : 'desc',
  );

  const candidateSlice =
    replacementBias === 'mixed'
      ? candidates.slice(Math.floor(candidates.length * 0.2), Math.floor(candidates.length * 0.8))
      : candidates.slice(0, Math.max(1, Math.floor(candidates.length * 0.6)));

  const chars = [...deck.characters];
  for (let i = 0; i < swaps; i++) {
    const replaceIndex = randomInt(chars.length);
    const replacement = randomPick(candidateSlice);
    chars[replaceIndex] = replacement;
  }

  return sanitizeResolvedDeck(
    {
      name: deck.name,
      characters: chars,
      missions: deck.missions,
    },
    allCharacters,
    allMissions,
    bannedIds,
  );
}

export async function loadStrongAIDeckPool({
  allCharacters,
  allMissions,
  bannedIds = new Set<string>(),
  limit = 10,
  source = 'curated',
}: DeckPoolParams): Promise<ResolvedDeck[]> {
  const resolved: ResolvedDeck[] = [];

  if (source === 'hybrid') {
    const apiDecks = await fetchApiDeckEntries(limit * 2);
    for (const deck of apiDecks) {
      resolved.push(
        resolveDeckFromIds(
          {
            name: deck.name,
            cardIds: deck.cardIds,
            missionIds: deck.missionIds,
          },
          allCharacters,
          allMissions,
          bannedIds,
        ),
      );
    }
  }

  const curatedDecks = getCuratedDeckEntries(limit * 2);
  for (const deck of curatedDecks) {
    resolved.push(
      resolveDeckFromIds(
        {
          name: deck.name,
          cardIds: deck.cardIds,
          missionIds: deck.missionIds,
        },
        allCharacters,
        allMissions,
        bannedIds,
      ),
    );
  }

  if (resolved.length === 0) {
    resolved.push(
      ...buildStrongDeckVariants(
        allCharacters.filter((card) => !bannedIds.has(card.id)),
        allMissions.filter((card) => !bannedIds.has(card.id)),
        limit,
      ).map((deck) =>
        sanitizeResolvedDeck(deck, allCharacters, allMissions, bannedIds),
      ),
    );
  }

  const dedup = new Map<string, ResolvedDeck>();
  for (const deck of resolved) {
    const signature = deckSignature(deck);
    const existing = dedup.get(signature);
    if (!existing || existing.score < deck.score) {
      dedup.set(signature, deck);
    }
  }

  return [...dedup.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function pickAIDeckByDifficulty(
  pool: ResolvedDeck[],
  difficulty: AIDifficulty,
  allCharacters: CharacterCard[],
  allMissions: MissionCard[],
  bannedIds: ReadonlySet<string> = new Set<string>(),
): ResolvedDeck {
  const fallback = sanitizeResolvedDeck(
    buildStrongDeckVariants(allCharacters, allMissions, 1)[0],
    allCharacters,
    allMissions,
    bannedIds,
  );
  const decks = pool.length > 0 ? pool : [fallback];
  const top = decks.slice(0, Math.min(5, decks.length));

  if (difficulty === 'impossible') {
    return sanitizeResolvedDeck(top[0], allCharacters, allMissions, bannedIds);
  }

  if (difficulty === 'hard') {
    return withRandomSwaps(
      randomPick(top),
      allCharacters,
      allMissions,
      bannedIds,
      1,
      'strong',
    );
  }

  if (difficulty === 'medium') {
    const mediumPool = decks.slice(0, Math.min(8, decks.length));
    return withRandomSwaps(
      randomPick(mediumPool),
      allCharacters,
      allMissions,
      bannedIds,
      3,
      'mixed',
    );
  }

  // Easy: weaken deck noticeably so difficulty gap remains visible.
  const easyPool = decks.slice(Math.max(0, Math.floor(decks.length / 2)));
  return withRandomSwaps(
    randomPick(easyPool.length > 0 ? easyPool : decks),
    allCharacters,
    allMissions,
    bannedIds,
    8,
    'weak',
  );
}

export function pickAIMissionsAvoidingPlayer(
  aiMissions: MissionCard[],
  playerMissions: MissionCard[],
  allMissions: MissionCard[],
  bannedIds: ReadonlySet<string> = new Set<string>(),
): MissionCard[] {
  const playerIds = new Set(playerMissions.map((mission) => mission.id));
  const result = new Map<string, MissionCard>();

  for (const mission of aiMissions) {
    if (result.size >= 3) break;
    if (bannedIds.has(mission.id)) continue;
    if (playerIds.has(mission.id)) continue;
    result.set(mission.id, mission);
  }

  for (const mission of allMissions) {
    if (result.size >= 3) break;
    if (bannedIds.has(mission.id)) continue;
    if (playerIds.has(mission.id)) continue;
    if (!result.has(mission.id)) {
      result.set(mission.id, mission);
    }
  }

  return [...result.values()].slice(0, 3);
}
