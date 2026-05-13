

export type PlayerID = 'player1' | 'player2';
export type GamePhase = 'setup' | 'mulligan' | 'start' | 'action' | 'mission' | 'end' | 'gameOver';
export type TurnNumber = 1 | 2 | 3 | 4;
export type MissionRank = 'D' | 'C' | 'B' | 'A';
export type EffectType = 'MAIN' | 'UPGRADE' | 'AMBUSH' | 'SCORE';
export type Rarity = 'C' | 'UC' | 'R' | 'RA' | 'S' | 'SV' | 'M' | 'MV' | 'L' | 'MMS';





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
  
  controllerInstanceId?: string;
  
  rempartLockedTargetId?: string;
}

export interface ActiveMission {
  card: MissionCard;
  rank: MissionRank;
  basePoints: number;
  rankBonus: number; // D:1, C:2, B:3, A:4
  player1Characters: CharacterInPlay[];
  player2Characters: CharacterInPlay[];
  wonBy?: PlayerID | 'draw' | null;
}





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






export interface ScoreEffectSource {
  
  cardId: string;
  
  instanceId: string | null;
  
  label: string;
}

export interface MissionScoringProgress {
  currentRankIndex: number;
  missionCardScoreDone: boolean;
  processedCharacterIds: string[];
  winner: PlayerID;
  pendingScoreEffects?: ScoreEffectSource[];
  pendingScoreAfterOrochimaru?: { winner: PlayerID; missionIndex: number; rankIndex: number };
  currentRankComplete?: boolean;
}

export interface GameState {
  gameId: string;
  gameMode?: 'casual' | 'ranked' | 'sealed';
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
  
  missionScoringProgress?: MissionScoringProgress;
  
  endPhaseMovedIds?: string[];
  
  endPhaseAkamaru028Ids?: string[];
  
  endPhaseGiantSpider103Ids?: string[];
  
  endPhaseTokensRemoved?: boolean;
  
  missionScoringComplete?: boolean;
  
  forfeitedBy?: PlayerID;
  
  sandboxNoAlternate?: boolean;
  
  pendingDiscardReorder?: {
    discardOwner: PlayerID;
    chooser: PlayerID;
    count: number;
  };
  
  pendingContinuation?: {
    sourceCardId: string;
    sourceInstanceId: string;
    sourceMissionIndex: number;
    sourcePlayer: PlayerID;
    remainingEffectTypes: EffectType[];
    isUpgrade: boolean;
    wasRevealed: boolean;
    chainData?: Record<string, unknown>;
  };
  
  consecutiveTimeouts: { player1: number; player2: number };
  
  playCostIncrease?: { player1: number; player2: number };
  
  actionHistory?: Array<{ player: PlayerID; action: GameAction; createdIds?: string[] }>;
  
  pendingForcedResolver?: PlayerID;
  
  _hiruzen002PlayedCharId?: string;
  
  turnPlayedIds?: string[];
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
  wasRevealed?: boolean; // Whether the source card was revealed from hidden
  
  remainingEffectTypes?: EffectType[];
  
  selectingPlayer?: PlayerID;
  
  
  
  
  
  rootOptional?: boolean;
}

export interface PendingAction {
  id: string;
  type: 'SELECT_TARGET' | 'CHOOSE_CARD_FROM_LIST' | 'DISCARD_CARD' | 'PUT_CARD_ON_DECK' | 'INFO_REVEAL' | 'CHOOSE_EFFECT';
  player: PlayerID;
  
  originPlayer?: PlayerID;
  description: string;
  descriptionKey?: string;
  descriptionParams?: Record<string, string | number>;
  options: string[]; // instanceIds, card indices, etc.
  minSelections: number;
  maxSelections: number;
  sourceEffectId?: string;
}





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





export type GameAction =
  | { type: 'PLAY_CHARACTER'; cardIndex: number; missionIndex: number; hidden: false }
  | { type: 'PLAY_HIDDEN'; cardIndex: number; missionIndex: number }
  | { type: 'REVEAL_CHARACTER'; missionIndex: number; characterInstanceId: string; upgradeTargetInstanceId?: string }
  | { type: 'UPGRADE_CHARACTER'; cardIndex: number; missionIndex: number; targetInstanceId: string }
  | { type: 'PASS' }
  | { type: 'MULLIGAN'; doMulligan: boolean }
  | { type: 'SELECT_TARGET'; pendingActionId: string; selectedTargets: string[] }
  | { type: 'DECLINE_OPTIONAL_EFFECT'; pendingEffectId: string }
  | { type: 'REORDER_EFFECTS'; selectedEffectId: string }
  | { type: 'FORFEIT'; reason: 'abandon' | 'timeout' | 'clock' | 'idle' }
  | { type: 'ADVANCE_PHASE' };





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
  gameMode?: 'casual' | 'ranked' | 'sealed';
}





export interface VisibleGameState {
  gameId: string;
  gameMode?: 'casual' | 'ranked' | 'sealed';
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
  effectOrderResolved?: boolean;
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
  isLastPlayed: boolean; // Was this character played directly in the current turn by the opponent?
}





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
