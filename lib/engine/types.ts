// Complete game engine type system

export type PlayerID = 'player1' | 'player2';
export type GamePhase = 'setup' | 'mulligan' | 'start' | 'action' | 'mission' | 'end' | 'gameOver';
export type TurnNumber = 1 | 2 | 3 | 4;
export type MissionRank = 'D' | 'C' | 'B' | 'A';
export type EffectType = 'MAIN' | 'UPGRADE' | 'AMBUSH' | 'SCORE';
export type Rarity = 'C' | 'UC' | 'R' | 'RA' | 'S' | 'M' | 'Legendary' | 'Mission';

// ---------------------
// Card Data Interfaces
// ---------------------

export interface CardEffect {
  type: EffectType;
  description: string;
}

export interface CardData {
  id: string;
  number: number;
  name_fr: string;
  title_fr: string;
  name_en?: string;
  rarity: Rarity;
  card_type: 'character' | 'mission';
  has_visual: boolean;
  chakra: number;
  power: number;
  keywords: string[];
  group: string;
  effects: CardEffect[];
  image_file?: string;
  is_rare_art?: boolean;
}

export interface CharacterCard extends CardData {
  card_type: 'character';
}

export interface MissionCard extends CardData {
  card_type: 'mission';
  name_en?: string;
  basePoints: number;
}

// ---------------------
// In-Play Interfaces
// ---------------------

export interface CharacterInPlay {
  instanceId: string;
  card: CharacterCard;
  isHidden: boolean;
  powerTokens: number;
  stack: CharacterCard[]; // Evolution stack, bottom to top. Last element = active card
  controlledBy: PlayerID;
  originalOwner: PlayerID;
  missionIndex: number;
}

export interface ActiveMission {
  card: MissionCard;
  rank: MissionRank;
  basePoints: number;
  rankBonus: number; // D:1, C:2, B:3, A:4
  player1Characters: CharacterInPlay[];
  player2Characters: CharacterInPlay[];
  wonBy?: PlayerID | null;
}

// ---------------------
// Player State
// ---------------------

export interface PlayerState {
  id: PlayerID;
  userId: string | null;
  isAI: boolean;
  aiDifficulty?: 'easy' | 'medium' | 'hard' | 'expert';
  deck: CharacterCard[];
  hand: CharacterCard[];
  discardPile: CharacterCard[];
  missionCards: MissionCard[]; // The 3 selected mission cards
  chakra: number;
  missionPoints: number;
  hasPassed: boolean;
  hasMulliganed: boolean;
  charactersInPlay: number; // Cached count for quick access
  unusedMission: MissionCard | null; // The 3rd mission card not selected for the mission deck
}

// ---------------------
// Game State
// ---------------------

export interface GameState {
  gameId: string;
  turn: TurnNumber;
  phase: GamePhase;
  activePlayer: PlayerID;
  edgeHolder: PlayerID;
  firstPasser: PlayerID | null;
  player1: PlayerState;
  player2: PlayerState;
  missionDeck: MissionCard[];
  activeMissions: ActiveMission[];
  log: GameLogEntry[];
  pendingEffects: PendingEffect[];
  pendingActions: PendingAction[];
  turnMissionRevealed: boolean;
}

export interface GameLogEntry {
  turn: number;
  phase: GamePhase;
  player?: PlayerID;
  action: string;
  details: string;
  timestamp: number;
}

// ---------------------
// Effects
// ---------------------

export interface PendingEffect {
  id: string;
  sourceCardId: string;
  sourceInstanceId: string;
  sourceMissionIndex: number;
  effectType: EffectType;
  effectDescription: string;
  targetSelectionType: string;
  sourcePlayer: PlayerID;
  requiresTargetSelection: boolean;
  validTargets: string[]; // instanceIds of valid targets
  isOptional: boolean;
  isMandatory: boolean;
  resolved: boolean;
  isUpgrade: boolean;
  // Continuation: remaining effect types to process after this pending is resolved
  remainingEffectTypes?: EffectType[];
}

export interface PendingAction {
  id: string;
  type: 'SELECT_TARGET' | 'CHOOSE_CARD_FROM_LIST' | 'DISCARD_CARD' | 'PUT_CARD_ON_DECK';
  player: PlayerID;
  description: string;
  options: string[]; // instanceIds, card indices, etc.
  minSelections: number;
  maxSelections: number;
  sourceEffectId?: string;
}

// ---------------------
// Continuous Effects
// ---------------------

export type ContinuousEffectType =
  | 'power_modifier'
  | 'chakra_bonus'
  | 'cost_modifier'
  | 'defeat_replacement'
  | 'move_replacement'
  | 'end_of_round'
  | 'play_restriction'
  | 'on_defeat_trigger'
  | 'on_move_trigger'
  | 'on_character_defeated';

export interface ContinuousEffect {
  id: string;
  sourceCardId: string;
  sourceInstanceId: string;
  sourcePlayer: PlayerID;
  sourceMissionIndex: number;
  type: ContinuousEffectType;
  condition?: string; // Serialized condition for evaluation
  value?: number;
}

// ---------------------
// Actions
// ---------------------

export type GameAction =
  | { type: 'PLAY_CHARACTER'; cardIndex: number; missionIndex: number; hidden: false }
  | { type: 'PLAY_HIDDEN'; cardIndex: number; missionIndex: number }
  | { type: 'REVEAL_CHARACTER'; missionIndex: number; characterInstanceId: string }
  | { type: 'UPGRADE_CHARACTER'; cardIndex: number; missionIndex: number; targetInstanceId: string }
  | { type: 'PASS' }
  | { type: 'MULLIGAN'; doMulligan: boolean }
  | { type: 'SELECT_TARGET'; pendingActionId: string; selectedTargets: string[] }
  | { type: 'DECLINE_OPTIONAL_EFFECT'; pendingEffectId: string };

// ---------------------
// Game Configuration
// ---------------------

export interface PlayerConfig {
  userId: string | null;
  isAI: boolean;
  aiDifficulty?: 'easy' | 'medium' | 'hard' | 'expert';
  deck: CharacterCard[];
  missionCards: MissionCard[];
}

export interface GameConfig {
  player1: PlayerConfig;
  player2: PlayerConfig;
  randomSeed?: number;
}

// ---------------------
// Visible State (for clients)
// ---------------------

export interface VisibleGameState {
  gameId: string;
  turn: TurnNumber;
  phase: GamePhase;
  activePlayer: PlayerID;
  edgeHolder: PlayerID;
  firstPasser: PlayerID | null;
  myPlayer: PlayerID;
  myState: PlayerState;
  opponentState: VisibleOpponentState;
  activeMissions: VisibleMission[];
  missionDeckSize: number;
  log: GameLogEntry[];
  pendingEffects: PendingEffect[];
  pendingActions: PendingAction[];
}

export interface VisibleOpponentState {
  id: PlayerID;
  handSize: number;
  deckSize: number;
  discardPileSize: number;
  chakra: number;
  missionPoints: number;
  hasPassed: boolean;
  charactersInPlay: number;
}

export interface VisibleMission extends Omit<ActiveMission, 'player1Characters' | 'player2Characters'> {
  // Characters visible to the viewing player
  // Hidden enemy characters show as unknown
  player1Characters: VisibleCharacter[];
  player2Characters: VisibleCharacter[];
}

export interface VisibleCharacter {
  instanceId: string;
  isHidden: boolean;
  isOwn: boolean; // Can the viewing player see this card?
  card?: CharacterCard; // Only present if visible to the viewer
  powerTokens: number;
  controlledBy: PlayerID;
  originalOwner: PlayerID;
  missionIndex: number;
  stackSize: number;
  effectivePower: number; // Includes base power + tokens + continuous modifiers
}

// ---------------------
// Rank bonus mapping
// ---------------------

export const RANK_BONUS: Record<MissionRank, number> = {
  'D': 1,
  'C': 2,
  'B': 3,
  'A': 4,
};

export const TURN_TO_RANK: Record<TurnNumber, MissionRank> = {
  1: 'D',
  2: 'C',
  3: 'B',
  4: 'A',
};

export const BASE_CHAKRA_PER_TURN = 5;
export const HIDDEN_PLAY_COST = 1;
export const INITIAL_HAND_SIZE = 5;
export const CARDS_DRAWN_PER_TURN = 2;
export const MIN_DECK_SIZE = 30;
export const MAX_COPIES_PER_VERSION = 2;
export const MISSION_CARDS_PER_PLAYER = 3;
export const TOTAL_TURNS = 4;
