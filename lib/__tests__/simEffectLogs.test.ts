import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { getAllCards } from '@/lib/data/cardLoader';
import { getScenario } from '@/lib/cards/sim/scenarios';
import { runScenario } from '@/lib/cards/sim/runScenario';
import type { GameState } from '@/lib/engine/types';

const WRAPPER = new Set(['PLAY_CHARACTER', 'PLAY_HIDDEN', 'REVEAL_CHARACTER', 'REVEAL_UPGRADE', 'UPGRADE_CHARACTER', 'PASS', 'ADVANCE_PHASE', 'MULLIGAN']);
const ANNOUNCE = new Set(['EFFECT_NO_TARGET', 'EFFECT_CONTINUOUS', 'EFFECT_SCORE_ANNOUNCE']);
const ACTIVE_TYPES = new Set(['MAIN', 'UPGRADE', 'AMBUSH', 'DUEL', 'SCORE']);

function realEffectLogCount(states: GameState[]): number {
  const first = states[0];
  const last = states[states.length - 1];
  return last.log.slice(first.log.length).filter((l) => {
    const a = l.action ?? '';
    return !!l.messageKey && !WRAPPER.has(a) && !ANNOUNCE.has(a);
  }).length;
}

describe('every active effect emits a precise game-log line', () => {
  beforeAll(() => { initializeRegistry(); });

  it('every non-static MAIN/UPGRADE/AMBUSH/DUEL/SCORE effect logs when it executes', () => {
    const seen = new Set<string>();
    const missing: string[] = [];
    for (const card of getAllCards()) {
      if (card.card_type !== 'character') continue;
      const effs = card.effects ?? [];
      for (let i = 0; i < effs.length; i++) {
        const e = effs[i];
        if (!ACTIVE_TYPES.has(e.type)) continue;
        if (e.type !== 'SCORE' && e.description.includes('[⧗]')) continue;
        const key = `${card.set}-${card.number}#${i}-${e.type}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const scenario = getScenario(card.id, i);
        if (!scenario) { missing.push(`${card.id}#${i}:noscenario`); continue; }
        let states: GameState[];
        try { states = runScenario(scenario); } catch { missing.push(`${card.id}#${i}:threw`); continue; }
        if (realEffectLogCount(states) === 0) missing.push(`${card.id}#${i}[${e.type}]`);
      }
    }
    expect(missing).toEqual([]);
  }, 180000);
});
