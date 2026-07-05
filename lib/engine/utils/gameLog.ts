import type { GameLogEntry, GamePhase, PlayerID, CharacterCard } from '../types';
import { getCardEffectDescription } from '@/lib/data/effectDescriptions';

export function stripEffectMarkers(text: string): string {
  return text.replace(/\[⧗\]/g, '').replace(/\[↯\]/g, '').replace(/\s+/g, ' ').trim();
}

export function createLogEntry(
  turn: number,
  phase: GamePhase,
  action: string,
  details: string,
  player?: PlayerID,
  messageKey?: string,
  messageParams?: Record<string, string | number>,
): GameLogEntry {
  return {
    turn,
    phase,
    player,
    action,
    details,
    messageKey,
    messageParams,
    timestamp: Date.now(),
  };
}

export function logAction(
  log: GameLogEntry[],
  turn: number,
  phase: GamePhase,
  player: PlayerID,
  action: string,
  details: string,
  messageKey?: string,
  messageParams?: Record<string, string | number>,
): GameLogEntry[] {
  return [...log, createLogEntry(turn, phase, action, details, player, messageKey, messageParams)];
}

export function logSystem(
  log: GameLogEntry[],
  turn: number,
  phase: GamePhase,
  action: string,
  details: string,
  messageKey?: string,
  messageParams?: Record<string, string | number>,
): GameLogEntry[] {
  return [...log, createLogEntry(turn, phase, action, details, undefined, messageKey, messageParams)];
}

export function logContinuousEffectsOnPlay(
  log: GameLogEntry[],
  turn: number,
  phase: GamePhase,
  player: PlayerID,
  card: CharacterCard,
): GameLogEntry[] {
  let out = log;
  const effects = card.effects ?? [];
  for (let i = 0; i < effects.length; i++) {
    const eff = effects[i];
    const desc = eff?.description ?? '';
    const isStatic = desc.includes('[⧗]');
    const isScore = eff?.type === 'SCORE';
    if (!isStatic && !isScore) continue;
    const frText = stripEffectMarkers(getCardEffectDescription(card.id, i, 'fr', desc));
    const enText = stripEffectMarkers(getCardEffectDescription(card.id, i, 'en', desc));
    const key = isStatic ? 'game.log.effect.continuousActive' : 'game.log.effect.scoreAnnounce';
    out = logAction(
      out, turn, phase, player, isStatic ? 'EFFECT_CONTINUOUS' : 'EFFECT_SCORE_ANNOUNCE',
      `${isStatic ? 'Continuous' : 'SCORE'} effect of ${card.name_fr}: ${frText}`,
      key,
      { card: card.name_fr, card_en: card.name_en ?? card.name_fr, id: card.id, effectIndex: i, effect: frText, effect_en: enText },
    );
  }
  return out;
}
