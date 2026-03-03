// Complete game engine type system

export type PlayerID = 'player1' | 'player2';
export type GamePhase = 'setup' | 'mulligan' | 'start' | 'action' | 'mission' | 'end' | 'gameOver';
export type TurnNumber = 1 | 2 | 3 | 4;
export type MissionRank = 'D' | 'C' | 'B' | 'A';
export type EffectType = 'MAIN' | 'UPGRADE' | 'AMBUSH' | 'SCORE';
export type Rarity = 'C' | 'UC' | 'R' | 'RA' | 'S' | 'SV' | 'M' | 'MV' | 'L' | 'MMS';

// ---------------------
// Card Data Interfaces
// ---------------------

export interface CardEffect {
  type: EffectType;
  description: string;
}

export interface CardData {
  id: string;
  cardId: string;        // Unique card identifier: [SET]-[NUMBER]-[RARITY] e.g. "KS-108-R"
  set: string;           // Set code e.g. "KS"
  number: number;
  name_fr: string;
  title_fr: string;
  name_en?: string;
  title_en?: string;
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
  data_complete?: boolean;
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
  wasRevealedAtLeastOnce: boolean; // true if card was ever face-visible (stays true even if re-hidden)
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
  aiDifficulty?: 'easy' | 'medium' | 'hard' | 'impossible';
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

export interface MissionScoringProgress {
  /** Index into rankOrder ['D','C','B','A'] — which rank we're currently scoring */
  currentRankIndex: number;
  /** Whether the mission card's SCORE effect has been processed for the current mission */
  missionCardScoreDone: boolean;
  /** instanceIds of characters whose SCORE effects have already been processed on the current mission */
  processedCharacterIds: string[];
  /** The player who won the current mission (needed for resumption) */
  winner: PlayerID;
}

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
  /** Prevents executeMissionPhase from running twice in the same turn */
  missionScoredThisTurn: boolean;
  /** Tracks progress through mission scoring when SCORE effects require target selection */
  missionScoringProgress?: MissionScoringProgress;
  /** Instance IDs of Rock Lee characters already moved during this End Phase */
  endPhaseMovedIds?: string[];
  /** Instance IDs of Akamaru 028 characters already processed for optional return during this End Phase */
  endPhaseAkamaru028Ids?: string[];
  /** Instance IDs of Kyodaigumo 103 characters already processed for optional hide during this End Phase */
  endPhaseKyodaigumo103Ids?: string[];
  /** Set when all mission scoring is complete but End Phase hasn't run yet.
   * Allows the UI to show SCORE effect results (POWERUP tokens, etc.) before tokens are removed. */
  missionScoringComplete?: boolean;
  /** Which player forfeited (abandon or timeout) — if set, game is over */
  forfeitedBy?: PlayerID;
  /** Consecutive timeout count per player (online timer) */
  consecutiveTimeouts: { player1: number; player2: number };
  /** Turn-wide cost increase for playing characters (set by Shino 033 MAIN effect).
   *  Key = player who pays MORE. Reset at start of each turn. */
  playCostIncrease?: { player1: number; player2: number };
  /** Ordered history of all actions applied during the game (for replay). */
  actionHistory?: Array<{ player: PlayerID; action: GameAction }>;
  /** When a forced-choice pending (e.g. Dosu069) is created for a player,
   *  this records which player should receive the turn once all pendings clear.
   *  Cleared by GameEngine when the turn switch fires. */
  pendingForcedResolver?: PlayerID;
}

export interface GameLogEntry {
  turn: number;
  phase: GamePhase;
  player?: PlayerID;
  action: string;
  details: string;
  messageKey?: string;
  messageParams?: Record<string, string | number>;
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
  // When the selecting player differs from the source player (e.g., opponent choices)
  selectingPlayer?: PlayerID;
}

export interface PendingAction {
  id: string;
  type: 'SELECT_TARGET' | 'CHOOSE_CARD_FROM_LIST' | 'DISCARD_CARD' | 'PUT_CARD_ON_DECK' | 'INFO_REVEAL' | 'CHOOSE_EFFECT';
  player: PlayerID;
  /** The player whose action originally created this pending (may differ from player who resolves it). */
  originPlayer?: PlayerID;
  description: string;
  descriptionKey?: string;
  descriptionParams?: Record<string, string | number>;
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
  | { type: 'DECLINE_OPTIONAL_EFFECT'; pendingEffectId: string }
  | { type: 'FORFEIT'; reason: 'abandon' | 'timeout' }
  | { type: 'ADVANCE_PHASE' };

// ---------------------
// Game Configuration
// ---------------------

export interface PlayerConfig {
  userId: string | null;
  isAI: boolean;
  aiDifficulty?: 'easy' | 'medium' | 'hard' | 'impossible';
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
  forfeitedBy?: PlayerID;
}

export interface VisibleOpponentState {
  id: PlayerID;
  handSize: number;
  deckSize: number;
  discardPileSize: number;
  discardPile: CardData[];  // Public information per rules
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
  wasRevealedAtLeastOnce: boolean; // true if card was ever face-visible (re-hidden cards show greyed out)
  isOwn: boolean; // Can the viewing player see this card?
  card?: CharacterCard; // Only present if visible to the viewer
  topCard?: CharacterCard; // Top of the evolution stack (differs from card when upgraded)
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
