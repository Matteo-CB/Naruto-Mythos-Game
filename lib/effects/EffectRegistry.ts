import type { EffectType } from '../engine/types';
import type { EffectHandler } from './EffectTypes';

/**
 * Registry mapping card IDs to their effect handlers.
 * Each card can have multiple handlers for different effect types.
 */
const registry: Map<string, Map<EffectType, EffectHandler>> = new Map();

/**
 * Register an effect handler for a specific card and effect type.
 */
export function registerEffect(cardId: string, effectType: EffectType, handler: EffectHandler): void {
  if (!registry.has(cardId)) {
    registry.set(cardId, new Map());
  }
  registry.get(cardId)!.set(effectType, handler);
}

/**
 * Get the effect handler for a specific card and effect type.
 */
export function getEffectHandler(cardId: string, effectType: EffectType): EffectHandler | undefined {
  // Try exact ID match first
  const cardHandlers = registry.get(cardId);
  if (cardHandlers) {
    const handler = cardHandlers.get(effectType);
    if (handler) return handler;
  }

  // RA variants share the same effects as their R counterpart
  const raFallbackId = cardId.replace(/-RA$/, '-R');
  if (raFallbackId !== cardId) {
    const raHandlers = registry.get(raFallbackId);
    if (raHandlers) {
      return raHandlers.get(effectType);
    }
  }

  // MV (Mythos Variant) falls back to M, then R, then S counterpart
  if (cardId.endsWith('-MV')) {
    const baseId = cardId.replace(/-MV$/, '');
    for (const suffix of ['-M', '-R', '-S']) {
      const fallbackHandlers = registry.get(baseId + suffix);
      if (fallbackHandlers) {
        const handler = fallbackHandlers.get(effectType);
        if (handler) return handler;
      }
    }
  }

  // SV (Secret Variant) falls back to S (Secret) counterpart
  const svFallbackId = cardId.replace(/-SV$/, '-S');
  if (svFallbackId !== cardId) {
    const svHandlers = registry.get(svFallbackId);
    if (svHandlers) {
      return svHandlers.get(effectType);
    }
  }

  return undefined;
}

/**
 * Check if a card has a registered handler.
 */
export function hasHandler(cardId: string, effectType: EffectType): boolean {
  return getEffectHandler(cardId, effectType) !== undefined;
}

/**
 * Get all registered card IDs.
 */
export function getRegisteredCardIds(): string[] {
  return Array.from(registry.keys());
}

// =============================================================
// Import and register all handlers
// =============================================================
import { registerAllCommonHandlers } from './handlers/common/index';
import { registerAllUncommonHandlers } from './handlers/uncommon/index';
import { registerAllRareHandlers } from './handlers/rare/index';
import { registerAllSecretHandlers } from './handlers/secret/index';
import { registerAllMythosHandlers } from './handlers/mythos/index';
import { registerAllMissionHandlers } from './handlers/missions/index';
import { registerAllLegendaryHandlers } from './handlers/legendary/index';

export function initializeRegistry(): void {
  registerAllCommonHandlers();
  registerAllUncommonHandlers();
  registerAllRareHandlers();
  registerAllSecretHandlers();
  registerAllMythosHandlers();
  registerAllMissionHandlers();
  registerAllLegendaryHandlers();
}

// Auto-initialize on import
initializeRegistry();
