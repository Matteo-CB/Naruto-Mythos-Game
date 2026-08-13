import type { EffectType } from '../engine/types';
import type { EffectHandler } from './EffectTypes';
import { isHoloId, holoBaseId } from '../holo/holoId';


const registry: Map<string, Map<EffectType, EffectHandler>> = new Map();


export function registerEffect(cardId: string, effectType: EffectType, handler: EffectHandler): void {
  if (!registry.has(cardId)) {
    registry.set(cardId, new Map());
  }
  registry.get(cardId)!.set(effectType, handler);
}


export function getEffectHandler(cardId: string, effectType: EffectType): EffectHandler | undefined {

  const cardHandlers = registry.get(cardId);
  if (cardHandlers) {
    const handler = cardHandlers.get(effectType);
    if (handler) return handler;
  }


  if (isHoloId(cardId)) {
    const holoBaseHandler = getEffectHandler(holoBaseId(cardId), effectType);
    if (holoBaseHandler) return holoBaseHandler;
  }

  
  const raFallbackId = cardId.replace(/-RA$/, '-R');
  if (raFallbackId !== cardId) {
    const raHandlers = registry.get(raFallbackId);
    if (raHandlers) {
      return raHandlers.get(effectType);
    }
  }

  
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

  
  const svFallbackId = cardId.replace(/-SV$/, '-S');
  if (svFallbackId !== cardId) {
    const svHandlers = registry.get(svFallbackId);
    if (svHandlers) {
      return svHandlers.get(effectType);
    }
  }

  return undefined;
}


export function hasHandler(cardId: string, effectType: EffectType): boolean {
  return getEffectHandler(cardId, effectType) !== undefined;
}


export function getRegisteredEffectTypes(cardId: string): EffectType[] {
  const handlers = registry.get(cardId);
  return handlers ? Array.from(handlers.keys()) : [];
}

export function getRegisteredCardIds(): string[] {
  return Array.from(registry.keys());
}




import { registerAllSetHandlers } from './handlers/index';

export function initializeRegistry(): void {
  registerAllSetHandlers();
}


initializeRegistry();
