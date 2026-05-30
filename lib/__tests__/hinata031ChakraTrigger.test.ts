import { describe, it, expect } from 'vitest';
import { triggerOnPlayReactions } from '@/lib/effects/ContinuousEffects';
import type { GameState, CharacterCard, CharacterInPlay } from '@/lib/engine/types';

const HINATA_031: CharacterCard = {
  id: 'KS-031-UC', cardId: 'KS-031-UC',
  set: 'KS', number: 31,
  name_fr: 'HINATA HYÛGA', name_en: 'HINATA HYUGA',
  title_fr: 'Byakugan', title_en: 'Byakugan',
  rarity: 'UC', card_type: 'character',
  has_visual: false, chakra: 3, power: 2,
  group: 'Leaf Village', keywords: ['Team 8', 'Kekkei Genkai'],
  effects: [
    { type: 'MAIN', description: '[⧗] When a non-hidden enemy character is played in this mission, gain 1 Chakra.' },
  ],
  image_file: undefined, is_rare_art: false, data_complete: true,
} as CharacterCard;

const SHINO_032: CharacterCard = {
  id: 'KS-032-C', cardId: 'KS-032-C',
  set: 'KS', number: 32,
  name_fr: 'SHINO ABURAME', name_en: 'SHINO ABURAME',
  title_fr: 'Insectes Destructeurs', title_en: 'Destruction Bugs',
  rarity: 'C', card_type: 'character',
  has_visual: false, chakra: 2, power: 3,
  group: 'Leaf Village', keywords: ['Team 8'],
  effects: [{ type: 'MAIN', description: 'Each player draws a card.' }],
  image_file: undefined, is_rare_art: false, data_complete: true,
} as CharacterCard;

function makeChar(card: CharacterCard, instanceId: string, owner: 'player1' | 'player2', isHidden = false): CharacterInPlay {
  return {
    instanceId,
    card,
    stack: [card],
    isHidden,
    wasRevealedAtLeastOnce: !isHidden,
    powerTokens: 0,
    controlledBy: owner,
    originalOwner: owner,
    missionIndex: 0,
  } as CharacterInPlay;
}

function makeState(p1Chars: CharacterInPlay[], p2Chars: CharacterInPlay[], p1Chakra = 5, p2Chakra = 5): GameState {
  return {
    gameId: 'g1',
    gameMode: 'casual',
    turn: 2,
    phase: 'action',
    activePlayer: 'player2',
    edgeHolder: 'player1',
    firstPasser: null,
    player1: { userId: 'a', isAI: false, aiDifficulty: null, hand: [], deck: [], discardPile: [],
      missionCards: [], missionPoints: 0, chakra: p1Chakra, unusedMission: null,
      cardsDrawnThisTurn: 0, hasPassed: false, charactersInPlay: p1Chars.length, hand_size: 0 } as never,
    player2: { userId: 'b', isAI: false, aiDifficulty: null, hand: [], deck: [], discardPile: [],
      missionCards: [], missionPoints: 0, chakra: p2Chakra, unusedMission: null,
      cardsDrawnThisTurn: 0, hasPassed: false, charactersInPlay: p2Chars.length, hand_size: 0 } as never,
    missionDeck: [],
    activeMissions: [{
      card: { id: 'KS-MSS-01', name_fr: 'M', title_fr: '', name_en: 'M', title_en: '',
        rarity: 'MMS' as const, card_type: 'mission' as const, set: 'KS', number: 1,
        chakra: 0, power: 0, group: 'Independent', keywords: [], effects: [],
        has_visual: false, image_file: undefined } as never,
      rank: 'D',
      revealedAtTurn: 1,
      wonBy: null,
      player1Characters: p1Chars,
      player2Characters: p2Chars,
    }] as never,
    log: [],
    pendingEffects: [],
    pendingActions: [],
    turnMissionRevealed: false,
    consecutiveTimeouts: { player1: 0, player2: 0 },
    actionHistory: [],
  } as never;
}

describe('Hinata 031 [⧗] chakra trigger', () => {
  it('gains +1 chakra to Hinata owner when opponent plays/reveals a non-hidden character at the same mission', () => {
    const hinata = makeChar(HINATA_031, 'hinata-1', 'player1');
    const shino = makeChar(SHINO_032, 'shino-1', 'player2'); // shino just played by player2
    const state = makeState([hinata], [shino], 3, 5);

    // Simulate: player2 just played shino in mission 0
    const result = triggerOnPlayReactions(state, 'player2', 0, true, 'shino-1');

    expect(result.player1.chakra).toBe(4); // +1 from Hinata trigger
    expect(result.player2.chakra).toBe(5); // unchanged
  });

  it('does NOT trigger if Hinata is at a DIFFERENT mission than the play', () => {
    // mission 0 has only shino on p2 side, hinata on mission 1 (not in state's mission 0)
    const shino = makeChar(SHINO_032, 'shino-1', 'player2');
    const state = makeState([], [shino], 3, 5);
    const result = triggerOnPlayReactions(state, 'player2', 0, true, 'shino-1');
    expect(result.player1.chakra).toBe(3); // unchanged
  });

  it('does NOT trigger if Hinata is hidden', () => {
    const hinata = makeChar(HINATA_031, 'hinata-1', 'player1', true); // hidden
    const shino = makeChar(SHINO_032, 'shino-1', 'player2');
    const state = makeState([hinata], [shino], 3, 5);
    const result = triggerOnPlayReactions(state, 'player2', 0, true, 'shino-1');
    expect(result.player1.chakra).toBe(3); // unchanged
  });

  it('does NOT trigger if Hinata is the one revealing (own character)', () => {
    // If player1 reveals their own hidden Shino, Hinata (also player1) should NOT trigger
    // because triggerOnPlayReactions looks at opponent's chars, not friendly ones
    const hinata = makeChar(HINATA_031, 'hinata-1', 'player1');
    const ownShino = makeChar(SHINO_032, 'shino-2', 'player1');
    const state = makeState([hinata, ownShino], [], 3, 5);
    const result = triggerOnPlayReactions(state, 'player1', 0, true, 'shino-2');
    expect(result.player1.chakra).toBe(3);
  });

  it('Defensive: trigger still fires if topCard.number is STRING "31" (cards.json type slip)', () => {
    const hinataStringNum = { ...HINATA_031, number: '31' as unknown as number };
    const hinata = makeChar(hinataStringNum, 'hinata-1', 'player1');
    const shino = makeChar(SHINO_032, 'shino-1', 'player2');
    const state = makeState([hinata], [shino], 3, 5);
    const result = triggerOnPlayReactions(state, 'player2', 0, true, 'shino-1');
    // Without defensive coercion, this would FAIL because '31' === 31 is false.
    // If currently fails: that's a real bug that needs fixing.
    expect(result.player1.chakra).toBe(4);
  });
});
