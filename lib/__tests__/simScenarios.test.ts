import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { runScenario } from '@/lib/cards/sim/runScenario';
import { getScenario, hasCuratedScenario } from '@/lib/cards/sim/scenarios';
import { hasScenario } from '@/lib/cards/sim/keys';
import { generatedScenarioFires, generatedScenarioFiresReal } from '@/lib/cards/sim/generate';
import { getAllCards } from '@/lib/data/cardLoader';

describe('card effect simulations (verified through the real engine)', () => {
  beforeAll(() => { initializeRegistry(); });

  it('EVERY character card that has an effect actually fires a real effect in its simulation', () => {
    const broken = getAllCards()
      .filter((c) => c.card_type === 'character' && (c.effects ?? []).length > 0)
      .filter((c) => !generatedScenarioFires(c.id) && !hasCuratedScenario(c.id))
      .map((c) => c.id);
    expect(broken).toEqual([]);
  });

  it('phases 1-7: EVERY active-effect card (non-static, non-SCORE) STRICTLY executes its effect', () => {
    const broken = getAllCards()
      .filter((c) => c.card_type === 'character' &&
        (c.effects ?? []).some((e) => e.type !== 'SCORE' && !e.description.includes('[⧗]')))
      .filter((c) => !generatedScenarioFiresReal(c.id) && !hasCuratedScenario(c.id))
      .map((c) => c.id);
    expect(broken).toEqual([]);
  });

  it('hasScenario matches the "has effects" rule so new cards auto-get a simulation', () => {
    for (const c of getAllCards()) {
      if (c.card_type !== 'character') continue;
      expect(hasScenario(c.id)).toBe((c.effects ?? []).length > 0);
    }
  });

  it('getScenario returns a runnable, cleanly-completing scenario for covered cards', () => {
    for (const cardId of ['KS-108-R', 'KS-107-R', 'KS-001-C', 'KS-140-S', 'SS-112-SPV', 'KS-099-C']) {
      const scenario = getScenario(cardId, 0);
      expect(scenario).toBeTruthy();
      const states = runScenario(scenario!);
      expect(states.length).toBeGreaterThan(1);
      expect(states[states.length - 1].pendingActions.length).toBe(0);
    }
  });
});
