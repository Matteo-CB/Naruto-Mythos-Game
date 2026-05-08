import { getPlayableCharacters, getPlayableMissions } from '@/lib/data/cardLoader';
import type { CharacterCard, MissionCard, CardData } from '@/lib/engine/types';

export interface BoosterCard extends CardData {
  isHolo?: boolean;
  sealedInstanceId: string; // unique per-sealed instance to allow duplicates
}

export interface BoosterPack {
  cards: BoosterCard[];
  boosterIndex: number;
}

export interface SealedPool {
  boosters: BoosterPack[];
  allCards: BoosterCard[];
}





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
  return { ...card, isHolo, sealedInstanceId: nextInstanceId() };
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

function buildRarityBuckets(): RarityBuckets {
  const allChars = getPlayableCharacters();
  return {
    commons: allChars.filter(c => c.rarity === 'C'),
    uncommons: allChars.filter(c => c.rarity === 'UC'),
    rares: allChars.filter(c => c.rarity === 'R'),
    rareArts: allChars.filter(c => c.rarity === 'RA'),
    secrets: allChars.filter(c => c.rarity === 'S'),
    legendaries: allChars.filter(c => c.rarity === 'L'),
    missions: getPlayableMissions(),
  };
}

export function generateBooster(boosterIndex: number, buckets?: RarityBuckets): BoosterPack {
  const b = buckets ?? buildRarityBuckets();
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

  return { cards, boosterIndex };
}

export function generateSealedPool(boosterCount: number = 6): SealedPool {
  _instanceCounter = 0;
  const buckets = buildRarityBuckets();
  const boosters: BoosterPack[] = [];
  const allCards: BoosterCard[] = [];

  for (let i = 0; i < boosterCount; i++) {
    const booster = generateBooster(i, buckets);
    boosters.push(booster);
    allCards.push(...booster.cards);
  }

  return { boosters, allCards };
}


export function separateSealedPool(pool: SealedPool): {
  characters: BoosterCard[];
  missions: BoosterCard[];
} {
  const characters = pool.allCards.filter(c => c.card_type === 'character');
  const missions = pool.allCards.filter(c => c.card_type === 'mission');
  return { characters, missions };
}
