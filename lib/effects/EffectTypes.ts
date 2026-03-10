import type { GameState, PlayerID, CharacterInPlay, EffectType } from '../engine/types';

/**
 * Context provided to each effect handler.
 */
export interface EffectContext {
  state: GameState;
  sourcePlayer: PlayerID;
  sourceCard: CharacterInPlay;
  sourceMissionIndex: number;
  triggerType: EffectType;
  isUpgrade: boolean; // Whether this is being triggered by an upgrade
  // For sub-play effects (e.g., Jiraiya playing a Summon)
  subPlayCostReduction?: number;
}

/**
 * Result returned by an effect handler.
 */
export interface EffectResult {
  state: GameState;
  requiresTargetSelection?: boolean;
  targetSelectionType?: string;
  validTargets?: string[];
  description?: string;
  /** i18n key for the description (used by TargetSelector/HandCardSelector for translation). */
  descriptionKey?: string;
  /** Interpolation params for descriptionKey. */
  descriptionParams?: Record<string, string | number>;
  /** Override which player performs the target selection (e.g., opponent discards in MSS 03). */
  selectingPlayer?: PlayerID;
  /** If true, the player may skip/decline this effect (no "you must" in card text). */
  isOptional?: boolean;
  /** If true, the effect cannot be skipped (e.g., "you must" effects). */
  isMandatory?: boolean;
  /** Minimum number of targets the player must select (0 = can skip). */
  minSelections?: number;
  /** Maximum number of targets the player can select. */
  maxSelections?: number;
}

/**
 * Handler function type for individual card effects.
 */
export type EffectHandler = (ctx: EffectContext) => EffectResult;

/**
 * A registered handler for a specific card and effect type.
 */
export interface RegisteredHandler {
  cardId: string;
  effectType: EffectType;
  handler: EffectHandler;
  description: string;
}
