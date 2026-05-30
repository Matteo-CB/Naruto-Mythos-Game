import { describe, it, expect } from 'vitest';
import { validateUpgradeCharacter, checkFlexibleUpgrade } from '@/lib/engine/rules/PlayValidation';
import { calculateEffectiveCost } from '@/lib/engine/rules/ChakraValidation';
import type { GameState, CharacterCard } from '@/lib/engine/types';

function makeCharacterCard(opts: Partial<CharacterCard>): CharacterCard {
  return {
    id: opts.id ?? 'KS-XXX-C',
    cardId: opts.id ?? 'KS-XXX-C',
    set: 'KS',
    number: opts.number ?? 0,
    name_fr: opts.name_fr ?? 'TestChar',
    name_en: opts.name_en ?? 'TestChar',
    title_fr: '',
    title_en: '',
    rarity: opts.rarity ?? 'C',
    card_type: 'character',
    has_visual: false,
    chakra: opts.chakra ?? 0,
    power: opts.power ?? 0,
    keywords: opts.keywords ?? [],
    group: opts.group ?? 'Sound Village',
    effects: opts.effects ?? [],
    image_file: undefined,
    is_rare_art: false,
    data_complete: true,
  } as CharacterCard;
}

const OROCHIMARU_138_SECRET: CharacterCard = makeCharacterCard({
  id: 'KS-138-S',
  number: 138,
  name_fr: 'OROCHIMARU',
  name_en: 'OROCHIMARU',
  rarity: 'S',
  chakra: 6,
  power: 8,
  keywords: ['Sannin', 'Jutsu'],
  group: 'Sound Village',
  effects: [
    { type: 'MAIN', description: '[⧗] You can play this character as an upgrade to any character that is not a Summon nor Orochimaru.' },
    { type: 'UPGRADE', description: 'Gain 2 Mission points if the character you upgraded from had Power 6 or more.' },
  ],
});

const SAKURA_135_SECRET: CharacterCard = makeCharacterCard({
  id: 'KS-135-S',
  number: 135,
  name_fr: 'SAKURA HARUNO',
  name_en: 'SAKURA HARUNO',
  rarity: 'S',
  chakra: 5,
  power: 4,
  keywords: ['Team 7'],
  group: 'Leaf Village',
  effects: [
    { type: 'MAIN', description: 'Look at top 3 cards. Play one anywhere and discard the others.' },
    { type: 'UPGRADE', description: 'MAIN effect: Instead, play the card paying 4 less.' },
  ],
});

function makeStateWithSakura(playerChakra: number): GameState {
  const sakuraInPlay = {
    instanceId: 'sakura-1',
    card: SAKURA_135_SECRET,
    isHidden: false,
    wasRevealedAtLeastOnce: true,
    powerTokens: 0,
    stack: [SAKURA_135_SECRET],
    controlledBy: 'player1' as const,
    originalOwner: 'player1' as const,
    missionIndex: 0,
  };
  return {
    gameId: 'g1',
    gameMode: 'casual',
    turn: 2,
    phase: 'action',
    activePlayer: 'player1',
    edgeHolder: 'player1',
    firstPasser: null,
    player1: {
      userId: 'u1', isAI: false, aiDifficulty: null,
      hand: [OROCHIMARU_138_SECRET],
      deck: [], discardPile: [], missionCards: [],
      missionPoints: 0, chakra: playerChakra,
      unusedMission: null, cardsDrawnThisTurn: 0,
      hasPassed: false, charactersInPlay: 1, hand_size: 1,
    } as never,
    player2: {
      userId: 'u2', isAI: false, aiDifficulty: null,
      hand: [], deck: [], discardPile: [], missionCards: [],
      missionPoints: 0, chakra: 5,
      unusedMission: null, cardsDrawnThisTurn: 0,
      hasPassed: false, charactersInPlay: 0, hand_size: 0,
    } as never,
    missionDeck: [],
    activeMissions: [{
      card: { id: 'KS-MSS-01', name_fr: 'Test Mission', title_fr: '', name_en: 'Test', title_en: '',
        rarity: 'MMS' as const, card_type: 'mission' as const, set: 'KS', number: 1,
        chakra: 0, power: 0, group: 'Independent', keywords: [], effects: [],
        has_visual: false, image_file: undefined } as never,
      rank: 'D',
      revealedAtTurn: 1,
      wonBy: null,
      player1Characters: [sakuraInPlay],
      player2Characters: [],
    }] as never,
    log: [],
    pendingEffects: [],
    pendingActions: [],
    turnMissionRevealed: false,
    consecutiveTimeouts: { player1: 0, player2: 0 },
    actionHistory: [],
  } as never;
}

describe('Orochimaru 138 flex upgrade over Sakura Secret', () => {
  it('checkFlexibleUpgrade returns true for Orochimaru 138 onto Sakura Secret', () => {
    expect(checkFlexibleUpgrade(OROCHIMARU_138_SECRET, SAKURA_135_SECRET)).toBe(true);
  });

  it('checkFlexibleUpgrade returns false if Sakura is a Summon (would be blocked)', () => {
    const sakuraAsSummon = { ...SAKURA_135_SECRET, keywords: ['Summon'] };
    expect(checkFlexibleUpgrade(OROCHIMARU_138_SECRET, sakuraAsSummon)).toBe(false);
  });

  it('checkFlexibleUpgrade returns false if target name is OROCHIMARU', () => {
    const otherOrochi = { ...OROCHIMARU_138_SECRET, id: 'KS-126-R', number: 126, chakra: 7 };
    expect(checkFlexibleUpgrade(OROCHIMARU_138_SECRET, otherOrochi)).toBe(false);
  });

  it('validateUpgradeCharacter accepts the user scenario: 3 chakra, upgrade Orochimaru(6) over Sakura(5)', () => {
    const state = makeStateWithSakura(3);
    const result = validateUpgradeCharacter(state, 'player1', OROCHIMARU_138_SECRET, 0, 'sakura-1');
    expect(result.valid).toBe(true);
  });

  it('validateUpgradeCharacter rejects when chakra is too low (1 chakra, need 1)', () => {
    const state = makeStateWithSakura(0);
    const result = validateUpgradeCharacter(state, 'player1', OROCHIMARU_138_SECRET, 0, 'sakura-1');
    expect(result.valid).toBe(false);
    expect(result.reasonKey).toBe('game.error.notEnoughChakraUpgrade');
  });

  it('calculateEffectiveCost for Orochimaru on mission with own Sakura returns base 6', () => {
    const state = makeStateWithSakura(3);
    const cost = calculateEffectiveCost(state, 'player1', OROCHIMARU_138_SECRET, 0, false);
    expect(cost).toBe(6);
  });

  it('effectiveCost - sakura.chakra = upgrade cost of 1 chakra', () => {
    const state = makeStateWithSakura(3);
    const cost = calculateEffectiveCost(state, 'player1', OROCHIMARU_138_SECRET, 0, false);
    const upgradeCost = Math.max(0, cost - SAKURA_135_SECRET.chakra);
    expect(upgradeCost).toBe(1);
  });

  it('validateUpgradeCharacter rejects upgrade onto a CONTROLLED Sakura (taken from opponent)', () => {
    const state = makeStateWithSakura(3);
    state.activeMissions[0].player1Characters[0].originalOwner = 'player2';
    const result = validateUpgradeCharacter(state, 'player1', OROCHIMARU_138_SECRET, 0, 'sakura-1');
    expect(result.valid).toBe(false);
    expect(result.reasonKey).toBe('game.error.cannotUpgradeControlled');
  });
});

describe('Sakura 135 MAIN: pick Orochimaru 138 from top-3 → place over Sakura herself (flex upgrade)', () => {
  it('checkFlexibleUpgrade returns true for Orochimaru flex over Sakura 135', () => {
    expect(checkFlexibleUpgrade(OROCHIMARU_138_SECRET, SAKURA_135_SECRET)).toBe(true);
  });

  it('Defensive: checkFlexibleUpgrade still works if newCard.number is the STRING "138" (cards.json type slip)', () => {
    const orochiWithStringNumber = { ...OROCHIMARU_138_SECRET, number: '138' as unknown as number };
    expect(checkFlexibleUpgrade(orochiWithStringNumber, SAKURA_135_SECRET)).toBe(true);
  });
});
