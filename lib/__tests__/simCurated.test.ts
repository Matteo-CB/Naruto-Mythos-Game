import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { getScenario } from '@/lib/cards/sim/scenarios';
import { runScenario } from '@/lib/cards/sim/runScenario';
import type { GameState } from '@/lib/engine/types';

// Curated cards whose generic-board demo no-targeted; each now has a bespoke board.
const CURATED_IDS = [
  'KS-022-UC', 'KS-002-UC', 'KS-010-C', 'KS-011-C', 'KS-018-UC', 'KS-028-UC', 'KS-033-UC',
  'KS-047-C', 'KS-057-C', 'KS-058-UC', 'KS-059-C', 'KS-061-C', 'KS-062-UC', 'KS-066-UC',
  'KS-087-UC', 'KS-098-C', 'KS-102-UC', 'KS-106-R', 'KS-110-R', 'KS-113-R', 'KS-138-S', 'SS-122-SPV',
];

const ANNOUNCE = new Set(['EFFECT_NO_TARGET', 'EFFECT_CONTINUOUS', 'EFFECT_SCORE_ANNOUNCE']);

function charState(s: GameState) {
  const m = new Map<string, string>();
  for (const mi of s.activeMissions) for (const c of [...mi.player1Characters, ...mi.player2Characters]) {
    m.set(c.instanceId, `${c.missionIndex ?? 0}:${c.isHidden}:${c.powerTokens}`);
  }
  return m;
}

function executesEffect(states: GameState[]): boolean {
  const first = states[0]; const last = states[states.length - 1];
  const realLog = last.log.slice(first.log.length).some((l) => {
    const a = l.action ?? '';
    return a.startsWith('EFFECT') && !ANNOUNCE.has(a);
  });
  if (realLog) return true;
  const A = charState(first); const B = charState(last);
  for (const [id, a] of A) { if (!B.has(id) || B.get(id) !== a) return true; }
  return last.player1.deck.length !== first.player1.deck.length ||
    last.player2.chakra !== first.player2.chakra ||
    last.player1.missionPoints !== first.player1.missionPoints;
}

describe('curated card simulations', () => {
  beforeAll(() => { initializeRegistry(); });

  it('every curated card has a scenario that completes cleanly (no dangling prompt)', () => {
    const broken: string[] = [];
    for (const id of CURATED_IDS) {
      const sc = getScenario(id, 0);
      if (!sc) { broken.push(`${id}:noscenario`); continue; }
      let states: GameState[];
      try { states = runScenario(sc); } catch { broken.push(`${id}:threw`); continue; }
      if (states[states.length - 1].pendingActions.length > 0) broken.push(`${id}:dangling`);
    }
    expect(broken).toEqual([]);
  });

  it('every curated card actually executes its effect', () => {
    const failed: string[] = [];
    for (const id of CURATED_IDS) {
      const sc = getScenario(id, 0)!;
      if (!executesEffect(runScenario(sc))) failed.push(id);
    }
    expect(failed).toEqual([]);
  });
});
