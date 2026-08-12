import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { getAllCards } from '@/lib/data/cardLoader';
import { getScenario, hasCuratedScenario } from '@/lib/cards/sim/scenarios';
import { runScenario } from '@/lib/cards/sim/runScenario';
import { generatedScenarioFiresReal } from '@/lib/cards/sim/generate';
import { phase810KindForEffect, phase810Fires } from '@/lib/cards/sim/phase810';
import type { GameState } from '@/lib/engine/types';
import { awaitsEffectImplementation } from '@/lib/cards/sim/pendingImplementation';

const ANNOUNCE = new Set(['EFFECT_NO_TARGET', 'EFFECT_CONTINUOUS', 'EFFECT_SCORE_ANNOUNCE']);

function charMap(s: GameState): Map<string, string> {
  const m = new Map<string, string>();
  for (const mi of s.activeMissions) {
    for (const c of [...mi.player1Characters, ...mi.player2Characters]) {
      m.set(c.instanceId, `${c.missionIndex}:${c.isHidden}:${c.powerTokens}:${c.card.id}:${c.stack?.length ?? 1}`);
    }
  }
  return m;
}

function executes(states: GameState[]): boolean {
  const first = states[0];
  const last = states[states.length - 1];
  if (last.pendingActions.length > 0) return false;
  if (last.log.slice(first.log.length).some((l) => {
    const a = l.action ?? '';
    return a.startsWith('EFFECT') && !ANNOUNCE.has(a);
  })) return true;
  const A = charMap(first);
  const B = charMap(last);
  for (const [id, a] of A) if (!B.has(id) || B.get(id) !== a) return true;
  for (const id of B.keys()) if (!A.has(id)) return true;
  return last.player1.hand.length !== first.player1.hand.length ||
    last.player1.deck.length !== first.player1.deck.length ||
    last.player2.deck.length !== first.player2.deck.length ||
    last.player2.chakra !== first.player2.chakra ||
    last.player1.chakra !== first.player1.chakra ||
    last.player1.missionPoints !== first.player1.missionPoints ||
    last.player2.missionPoints !== first.player2.missionPoints ||
    last.player1.discardPile.length !== first.player1.discardPile.length ||
    last.player2.hand.length !== first.player2.hand.length;
}

describe('phases 8-10: static / SCORE / triggered effects strictly execute', () => {
  beforeAll(() => { initializeRegistry(); });

  it('every card with a static or SCORE effect has a firing scenario', () => {
    const broken: string[] = [];
    for (const c of getAllCards()) {
      if (c.card_type !== 'character') continue;
      const hasSS = (c.effects ?? []).some((e) => e.type === 'SCORE' || e.description.includes('[⧗]'));
      if (!hasSS) continue;
      if (awaitsEffectImplementation(c.id)) continue;
      if (!(generatedScenarioFiresReal(c.id) || hasCuratedScenario(c.id) || phase810Fires(c.id))) broken.push(c.id);
    }
    expect(broken).toEqual([]);
  }, 180000);

  const BLOCK_KINDS = new Set(['moveblock', 'revealblock', 'hideallyblock', 'winrestrict', 'immunity']);

  it('every static / SCORE effect index resolves to a scenario that executes', () => {
    const broken: string[] = [];
    for (const c of getAllCards()) {
      if (c.card_type !== 'character') continue;
      const effs = c.effects ?? [];
      for (let i = 0; i < effs.length; i++) {
        if (!(effs[i].type === 'SCORE' || effs[i].description.includes('[⧗]'))) continue;
        const kind = phase810KindForEffect(c.id, i);
        if (!kind) {
          if (awaitsEffectImplementation(c.id)) continue;
          if (!(generatedScenarioFiresReal(c.id) || hasCuratedScenario(c.id) || phase810Fires(c.id))) broken.push(`${c.id}#${i}:uncovered`);
          continue;
        }
        const scenario = getScenario(c.id, i);
        if (!scenario) { broken.push(`${c.id}#${i}:noscenario`); continue; }
        let states: GameState[];
        try { states = runScenario(scenario); } catch { broken.push(`${c.id}#${i}:threw`); continue; }
        if (states[states.length - 1].pendingActions.length > 0) { broken.push(`${c.id}#${i}:${kind}:dangling`); continue; }
        if (BLOCK_KINDS.has(kind)) continue;
        if (!executes(states)) broken.push(`${c.id}#${i}:${kind}:noexec`);
      }
    }
    expect(broken).toEqual([]);
  }, 180000);
});
