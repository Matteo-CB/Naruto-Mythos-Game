import type {
  GameState,
  GameConfig,
  PlayerConfig,
  CharacterCard,
  MissionCard,
  CharacterInPlay,
  ActiveMission,
  PlayerID,
  TurnNumber,
} from '../engine/types';
import { generateInstanceId, generateGameId } from '../engine/utils/id';

/**
 * Create a mock character card for testing.
 */
export function mockCharacter(overrides: Partial<CharacterCard> = {}): CharacterCard {
  return {
    id: overrides.id ?? '001/130',
    number: overrides.number ?? 1,
    name_fr: overrides.name_fr ?? 'Test Character',
    title_fr: overrides.title_fr ?? 'Test Title',
    rarity: overrides.rarity ?? 'C',
    card_type: 'character',
    has_visual: overrides.has_visual ?? true,
    chakra: overrides.chakra ?? 3,
    power: overrides.power ?? 2,
    keywords: overrides.keywords ?? [],
    group: overrides.group ?? 'Leaf Village',
    effects: overrides.effects ?? [],
    image_file: overrides.image_file,
  };
}

/**
 * Create a mock mission card for testing.
 */
export function mockMission(overrides: Partial<MissionCard> = {}): MissionCard {
  return {
    id: overrides.id ?? 'MSS 01',
    number: overrides.number ?? 1,
    name_fr: overrides.name_fr ?? 'Test Mission',
    title_fr: overrides.title_fr ?? '',
    rarity: 'Mission',
    card_type: 'mission',
    has_visual: true,
    chakra: 0,
    power: 0,
    keywords: [],
    group: '',
    effects: overrides.effects ?? [],
    basePoints: overrides.basePoints ?? 2,
    image_file: overrides.image_file,
  };
}

/**
 * Create a mock character in play.
 */
export function mockCharInPlay(
  overrides: Partial<CharacterInPlay> = {},
  cardOverrides: Partial<CharacterCard> = {},
): CharacterInPlay {
  const card = mockCharacter(cardOverrides);
  return {
    instanceId: overrides.instanceId ?? generateInstanceId(),
    card,
    isHidden: overrides.isHidden ?? false,
    powerTokens: overrides.powerTokens ?? 0,
    stack: overrides.stack ?? [card],
    controlledBy: overrides.controlledBy ?? 'player1',
    originalOwner: overrides.originalOwner ?? 'player1',
    missionIndex: overrides.missionIndex ?? 0,
  };
}

/**
 * Create a minimal deck for testing (30 unique cards).
 */
export function createTestDeck(count: number = 30): CharacterCard[] {
  const deck: CharacterCard[] = [];
  for (let i = 0; i < count; i++) {
    deck.push(
      mockCharacter({
        id: `${String(i + 1).padStart(3, '0')}/130`,
        number: i + 1,
        name_fr: `Character ${i + 1}`,
        title_fr: `Title ${i + 1}`,
        chakra: (i % 5) + 1,
        power: (i % 4) + 1,
      }),
    );
  }
  return deck;
}

/**
 * Create a test game config with two decks and missions.
 */
export function createTestConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  const missions1 = [
    mockMission({ id: 'MSS 01', name_fr: 'Mission A', basePoints: 2 }),
    mockMission({ id: 'MSS 02', name_fr: 'Mission B', basePoints: 3 }),
    mockMission({ id: 'MSS 03', name_fr: 'Mission C', basePoints: 4 }),
  ];
  const missions2 = [
    mockMission({ id: 'MSS 04', name_fr: 'Mission D', basePoints: 2 }),
    mockMission({ id: 'MSS 05', name_fr: 'Mission E', basePoints: 3 }),
    mockMission({ id: 'MSS 06', name_fr: 'Mission F', basePoints: 4 }),
  ];

  return {
    player1: overrides.player1 ?? {
      userId: 'test-user-1',
      isAI: false,
      deck: createTestDeck(),
      missionCards: missions1,
    },
    player2: overrides.player2 ?? {
      userId: null,
      isAI: true,
      aiDifficulty: 'easy',
      deck: createTestDeck(),
      missionCards: missions2,
    },
  };
}

/**
 * Create a game state that's ready for the action phase (after mulligan + start phase).
 */
export function createActionPhaseState(overrides: Partial<GameState> = {}): GameState {
  const mission = mockMission({ basePoints: 3 });

  const state: GameState = {
    gameId: generateGameId(),
    turn: 1 as TurnNumber,
    phase: 'action',
    activePlayer: 'player1',
    edgeHolder: 'player1',
    firstPasser: null,
    player1: {
      id: 'player1',
      userId: 'test-1',
      isAI: false,
      deck: createTestDeck(20),
      hand: [
        mockCharacter({ id: '010/130', name_fr: 'Naruto', chakra: 3, power: 3 }),
        mockCharacter({ id: '020/130', name_fr: 'Sasuke', chakra: 4, power: 4 }),
        mockCharacter({ id: '030/130', name_fr: 'Sakura', chakra: 2, power: 1 }),
        mockCharacter({ id: '040/130', name_fr: 'Kakashi', chakra: 5, power: 5 }),
        mockCharacter({ id: '050/130', name_fr: 'Iruka', chakra: 1, power: 1 }),
      ],
      discardPile: [],
      missionCards: [],
      chakra: 10,
      missionPoints: 0,
      hasPassed: false,
      hasMulliganed: true,
      charactersInPlay: 0,
      unusedMission: null,
    },
    player2: {
      id: 'player2',
      userId: 'test-2',
      isAI: false,
      deck: createTestDeck(20),
      hand: [
        mockCharacter({ id: '060/130', name_fr: 'Gaara', chakra: 3, power: 3 }),
        mockCharacter({ id: '070/130', name_fr: 'Temari', chakra: 2, power: 2 }),
        mockCharacter({ id: '080/130', name_fr: 'Kankuro', chakra: 2, power: 2 }),
        mockCharacter({ id: '090/130', name_fr: 'Baki', chakra: 4, power: 3 }),
        mockCharacter({ id: '100/130', name_fr: 'Shikamaru', chakra: 1, power: 1 }),
      ],
      discardPile: [],
      missionCards: [],
      chakra: 10,
      missionPoints: 0,
      hasPassed: false,
      hasMulliganed: true,
      charactersInPlay: 0,
      unusedMission: null,
    },
    missionDeck: [mockMission({ basePoints: 3 }), mockMission({ basePoints: 4 })],
    activeMissions: [
      {
        card: mission,
        rank: 'D',
        basePoints: 3,
        rankBonus: 1,
        player1Characters: [],
        player2Characters: [],
        wonBy: null,
      },
    ],
    log: [],
    pendingEffects: [],
    pendingActions: [],
    turnMissionRevealed: true,
    ...overrides,
  };

  return state;
}
