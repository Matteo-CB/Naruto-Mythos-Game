import { getPlayableCharacters, getPlayableMissions } from '@/lib/data/cardLoader';
import { getAvailableSetIds } from '@/lib/data/sets/registry';
import type { CharacterCard, MissionCard, CardData } from '@/lib/engine/types';
import { isVariantRarity } from '@/lib/variants/constants';

export interface BoosterCard extends CardData {
  isHolo?: boolean;
  isTemporaryVariant?: boolean;
  sealedInstanceId: string;
}

export interface BoosterPack {
  cards: BoosterCard[];
  boosterIndex: number;
  setId: string;
}

export interface SealedPool {
  boosters: BoosterPack[];
  allCards: BoosterCard[];
  temporaryVariants: string[];
}

export type SealedSetChoice = string | 'random';


function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickRandomN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

let _instanceCounter = 0;
function nextInstanceId(): string {
  _instanceCounter++;
  return `sealed-${Date.now()}-${_instanceCounter}`;
}

function toBoosterCard(card: CardData, isHolo = false): BoosterCard {
  return { ...card, isHolo, isTemporaryVariant: isVariantRarity(card.rarity), sealedInstanceId: nextInstanceId() };
}

interface RarityBuckets {
  commons: CharacterCard[];
  uncommons: CharacterCard[];
  rares: CharacterCard[];
  rareArts: CharacterCard[];
  secrets: CharacterCard[];
  legendaries: CharacterCard[];
  missions: MissionCard[];
}

function buildRarityBuckets(setId: string): RarityBuckets {
  const allChars = getPlayableCharacters().filter((c) => c.set === setId);
  const allMissions = getPlayableMissions().filter((m) => m.set === setId);
  return {
    commons: allChars.filter((c) => c.rarity === 'C'),
    uncommons: allChars.filter((c) => c.rarity === 'UC'),
    rares: allChars.filter((c) => c.rarity === 'R'),
    rareArts: allChars.filter((c) => c.rarity === 'RA'),
    secrets: allChars.filter((c) => c.rarity === 'S'),
    legendaries: allChars.filter((c) => c.rarity === 'L'),
    missions: allMissions,
  };
}

function bucketsHaveEnough(b: RarityBuckets): boolean {
  return b.commons.length >= 4 && b.uncommons.length >= 3 && b.rares.length >= 1 && b.missions.length >= 1;
}

export function generateBooster(boosterIndex: number, setId?: string, buckets?: RarityBuckets): BoosterPack {
  const resolvedSetId = setId ?? resolveSetChoice('random');
  const b = buckets ?? buildRarityBuckets(resolvedSetId);
  const { commons, uncommons, rares, rareArts, secrets, legendaries, missions: allMissions } = b;

  const cards: BoosterCard[] = [];

  const pickedCommons = pickRandomN(commons, 4);
  for (const c of pickedCommons) cards.push(toBoosterCard(c));

  const pickedUncommons = pickRandomN(uncommons, 3);
  for (const c of pickedUncommons) cards.push(toBoosterCard(c));

  cards.push(toBoosterCard(pickRandom(rares)));

  const holoRoll = Math.random();
  if (holoRoll < 0.2 && rareArts.length > 0) {
    cards.push(toBoosterCard(pickRandom(rareArts), true));
  } else if (holoRoll < 0.6) {
    cards.push(toBoosterCard(pickRandom(commons), true));
  } else {
    cards.push(toBoosterCard(pickRandom(uncommons), true));
  }

  const specialRoll = Math.random();
  if (specialRoll < 0.00125 && legendaries.length > 0) {
    cards[cards.length - 1] = toBoosterCard(pickRandom(legendaries), true);
  } else if (specialRoll < 0.10 && secrets.length > 0) {
    cards[cards.length - 1] = toBoosterCard(pickRandom(secrets), true);
  }

  cards.push(toBoosterCard(pickRandom(allMissions)));

  return { cards, boosterIndex, setId: resolvedSetId };
}

function resolveSetChoice(choice: SealedSetChoice): string {
  const available = getAvailableSetIds();
  if (available.length === 0) throw new Error('No sealed-ready sets are available');
  if (choice === 'random') return available[Math.floor(Math.random() * available.length)];
  if (available.includes(choice)) return choice;
  throw new Error(`Set "${choice}" is not available for sealed play`);
}

export function generateSealedPool(boosterCount: number = 6, setChoice: SealedSetChoice = 'random'): SealedPool {
  _instanceCounter = 0;
  const boosters: BoosterPack[] = [];
  const allCards: BoosterCard[] = [];
  const temporaryVariants: string[] = [];

  const bucketCache = new Map<string, RarityBuckets>();
  const getBuckets = (id: string): RarityBuckets => {
    let b = bucketCache.get(id);
    if (!b) {
      b = buildRarityBuckets(id);
      if (!bucketsHaveEnough(b)) {
        throw new Error(`Set "${id}" does not have enough cards to generate a booster`);
      }
      bucketCache.set(id, b);
    }
    return b;
  };

  for (let i = 0; i < boosterCount; i++) {
    const setId = resolveSetChoice(setChoice);
    const booster = generateBooster(i, setId, getBuckets(setId));
    boosters.push(booster);
    allCards.push(...booster.cards);
    for (const c of booster.cards) {
      if (c.isTemporaryVariant) temporaryVariants.push(c.id);
    }
  }

  return { boosters, allCards, temporaryVariants };
}


export function separateSealedPool(pool: SealedPool): {
  characters: BoosterCard[];
  missions: BoosterCard[];
} {
  const characters = pool.allCards.filter((c) => c.card_type === 'character');
  const missions = pool.allCards.filter((c) => c.card_type === 'mission');
  return { characters, missions };
}
