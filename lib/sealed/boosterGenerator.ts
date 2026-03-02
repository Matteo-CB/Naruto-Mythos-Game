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

// Official booster composition from collection guide:
// 4 Common + 3 Uncommon + 1 Rare + 1 Holo slot + 1 Mission = 10 cards
// Special pull rates: Secret 10%, Mythos 2%, Legendary 0.125%

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

export function generateBooster(boosterIndex: number): BoosterPack {
  const allChars = getPlayableCharacters();
  const allMissions = getPlayableMissions();

  const commons = allChars.filter(c => c.rarity === 'C');
  const uncommons = allChars.filter(c => c.rarity === 'UC');
  const rares = allChars.filter(c => c.rarity === 'R');
  const rareArts = allChars.filter(c => c.rarity === 'RA');
  const secrets = allChars.filter(c => c.rarity === 'S');
  const legendaries = allChars.filter(c => c.rarity === 'L');

  const cards: BoosterCard[] = [];

  // 4 Common characters
  const pickedCommons = pickRandomN(commons, 4);
  for (const c of pickedCommons) cards.push(toBoosterCard(c));

  // 3 Uncommon characters
  const pickedUncommons = pickRandomN(uncommons, 3);
  for (const c of pickedUncommons) cards.push(toBoosterCard(c));

  // 1 Rare character
  cards.push(toBoosterCard(pickRandom(rares)));

  // 1 Holographic slot: 20% Rare Art, 40% Common Holo, 40% Uncommon Holo
  const holoRoll = Math.random();
  if (holoRoll < 0.2 && rareArts.length > 0) {
    cards.push(toBoosterCard(pickRandom(rareArts), true));
  } else if (holoRoll < 0.6) {
    cards.push(toBoosterCard(pickRandom(commons), true));
  } else {
    cards.push(toBoosterCard(pickRandom(uncommons), true));
  }

  // Special pull: replace the holo slot card with a special rarity
  // Secret: 10% chance, Legendary: 0.125% chance (Mythos excluded from sealed)
  const specialRoll = Math.random();
  if (specialRoll < 0.00125 && legendaries.length > 0) {
    // Legendary — replace last card
    cards[cards.length - 1] = toBoosterCard(pickRandom(legendaries), true);
  } else if (specialRoll < 0.10 && secrets.length > 0) {
    // Secret — replace last card
    cards[cards.length - 1] = toBoosterCard(pickRandom(secrets), true);
  }

  // 1 Mission card
  cards.push(toBoosterCard(pickRandom(allMissions)));

  return { cards, boosterIndex };
}

export function generateSealedPool(boosterCount: number = 6): SealedPool {
  _instanceCounter = 0; // Reset counter for each sealed
  const boosters: BoosterPack[] = [];
  const allCards: BoosterCard[] = [];

  for (let i = 0; i < boosterCount; i++) {
    const booster = generateBooster(i);
    boosters.push(booster);
    allCards.push(...booster.cards);
  }

  return { boosters, allCards };
}

/**
 * Separate sealed cards into characters and missions for deck building.
 */
export function separateSealedPool(pool: SealedPool): {
  characters: BoosterCard[];
  missions: BoosterCard[];
} {
  const characters = pool.allCards.filter(c => c.card_type === 'character');
  const missions = pool.allCards.filter(c => c.card_type === 'mission');
  return { characters, missions };
}
