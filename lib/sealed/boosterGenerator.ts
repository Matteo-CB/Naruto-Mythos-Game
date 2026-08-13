import { getPlayableCharacters, getPlayableMissions } from '@/lib/data/cardLoader';
import { getSealedSetIds } from '@/lib/data/sets/registry';
import type { CharacterCard, MissionCard, CardData } from '@/lib/engine/types';
import { isVariantRarity } from '@/lib/variants/constants';
import { NUMBERED_RARITIES, SHINOBI_SHIREN_SET_ID, rollShinobiShirenChase } from './shinobiShirenRates';

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
const _instancePrefix = `${Date.now()}${Math.floor(Math.random() * 1_000_000)}`;
function nextInstanceId(): string {
  _instanceCounter++;
  return `sealed-${_instancePrefix}-${_instanceCounter}`;
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
  specials: CharacterCard[];
  shinobis: CharacterCard[];
  numbered: CharacterCard[];
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
    specials: allChars.filter((c) => c.rarity === 'SP'),
    shinobis: allChars.filter((c) => c.rarity === 'SHINOBI'),
    numbered: allChars.filter((c) => NUMBERED_RARITIES.includes(c.rarity)),
    missions: allMissions,
  };
}

function bucketsHaveEnough(b: RarityBuckets): boolean {
  return b.commons.length >= 4 && b.uncommons.length >= 3 && b.rares.length >= 1 && b.missions.length >= 1;
}

function chaseCardForShinobiShiren(b: RarityBuckets): CardData | null {
  const parRarete: Record<string, CharacterCard[]> = {
    RA: b.rareArts,
    S: b.secrets,
    SP: b.specials,
    SHINOBI: b.shinobis,
    L: b.legendaries,
    NUMBERED: b.numbered,
  };
  for (let essai = 0; essai < 12; essai++) {
    const tire = rollShinobiShirenChase();
    if (!tire) return null;
    const vivier = parRarete[tire];
    if (vivier && vivier.length > 0) return pickRandom(vivier);
  }
  return null;
}

function generateShinobiShirenBooster(boosterIndex: number, setId: string, b: RarityBuckets): BoosterPack {
  const cards: BoosterCard[] = [];

  for (const c of pickRandomN(b.commons, 4)) cards.push(toBoosterCard(c));
  for (const c of pickRandomN(b.uncommons, 3)) cards.push(toBoosterCard(c));
  cards.push(toBoosterCard(pickRandom(b.rares)));

  const chase = chaseCardForShinobiShiren(b);
  cards.push(chase ? toBoosterCard(chase, true) : toBoosterCard(pickRandom(b.commons)));

  cards.push(toBoosterCard(pickRandom(b.missions)));

  return { cards, boosterIndex, setId };
}

export function generateBooster(boosterIndex: number, setId?: string, buckets?: RarityBuckets): BoosterPack {
  const resolvedSetId = setId ?? resolveSetChoice('random');
  let b = buckets;
  if (!b) {
    b = buildRarityBuckets(resolvedSetId);
    if (!bucketsHaveEnough(b)) {
      throw new Error(`Set "${resolvedSetId}" does not have enough cards to generate a booster`);
    }
  }
  if (resolvedSetId === SHINOBI_SHIREN_SET_ID) return generateShinobiShirenBooster(boosterIndex, resolvedSetId, b);

  const { commons, uncommons, rares, rareArts, secrets, legendaries, missions: allMissions } = b;

  const cards: BoosterCard[] = [];

  const pickedCommons = pickRandomN(commons, 4);
  for (const c of pickedCommons) cards.push(toBoosterCard(c));

  const pickedUncommons = pickRandomN(uncommons, 3);
  for (const c of pickedUncommons) cards.push(toBoosterCard(c));

  cards.push(toBoosterCard(pickRandom(rares)));

  const holoRoll = Math.random();
  const specialRoll = Math.random();
  let holoCard: CardData;
  if (specialRoll < 0.00125 && legendaries.length > 0) {
    holoCard = pickRandom(legendaries);
  } else if (specialRoll < 0.10 && secrets.length > 0) {
    holoCard = pickRandom(secrets);
  } else if (holoRoll < 0.2 && rareArts.length > 0) {
    holoCard = pickRandom(rareArts);
  } else if (holoRoll < 0.6) {
    holoCard = pickRandom(commons);
  } else {
    holoCard = pickRandom(uncommons);
  }
  cards.push(toBoosterCard(holoCard, true));

  cards.push(toBoosterCard(pickRandom(allMissions)));

  return { cards, boosterIndex, setId: resolvedSetId };
}

function resolveSetChoice(choice: SealedSetChoice): string {
  const available = getSealedSetIds();
  if (available.length === 0) throw new Error('No sealed-ready sets are available');
  if (choice === 'random') return available[Math.floor(Math.random() * available.length)];
  if (available.includes(choice)) return choice;
  throw new Error(`Set "${choice}" is not available for sealed play`);
}

export function generateSealedPool(boosterCount: number = 6, setChoice: SealedSetChoice = 'random'): SealedPool {
  if (typeof boosterCount !== 'number' || !Number.isInteger(boosterCount) || boosterCount < 1) {
    throw new Error(`Invalid sealed booster count: ${boosterCount}`);
  }
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
