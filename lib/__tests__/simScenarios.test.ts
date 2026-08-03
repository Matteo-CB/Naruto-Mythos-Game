import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { runScenario } from '@/lib/cards/sim/runScenario';
import { getScenario, hasCuratedScenario } from '@/lib/cards/sim/scenarios';
import { hasScenario } from '@/lib/cards/sim/keys';
import { generatedScenarioFires, generatedScenarioFiresReal } from '@/lib/cards/sim/generate';
import { getAllCards } from '@/lib/data/cardLoader';
import { getEffectivePower } from '@/lib/effects/powerUtils';
import type { GameState, CharacterInPlay } from '@/lib/engine/types';

function calc(s: GameState, c: CharacterInPlay): number {
  return getEffectivePower(s, c, 'player1');
}

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

  it('attachment cards and Choji SS-128 have simulations that STRICTLY execute their effects', () => {
    for (const id of ['SS-082-C', 'SS-108-C', 'SS-128-R']) {
      expect(hasScenario(id), `${id} hasScenario`).toBe(true);
      const scenario = getScenario(id, 0);
      expect(scenario, `${id} scenario`).toBeTruthy();
      const states = runScenario(scenario!);
      const last = states[states.length - 1];
      expect(last.pendingActions.length, `${id} pending drain`).toBe(0);

      if (id === 'SS-082-C') {
        const host = last.activeMissions[0].player1Characters.find((c) => (c.attachments?.length ?? 0) > 0);
        expect(host, 'curry attached').toBeTruthy();
        expect(host!.powerTokens).toBe(3);
      }
      if (id === 'SS-108-C') {
        expect(states.some((s) => (s.activeMissions[0].attachments?.length ?? 0) > 0), 'stadium attached').toBe(true);
        expect(states.some((s) => s.activeMissions[0].player2Characters.some((c) => c.instanceId === 'sim-weak' && c.isHidden)), 'forced duel hid enemy').toBe(true);
      }
      if (id === 'SS-128-R') {
        expect(states.some((s) => s.activeMissions.every((m) => !m.player2Characters.some((c) => c.instanceId === 'sim-big'))), 'choji duel defeated 8+ enemy').toBe(true);
        const choji = last.activeMissions[0].player1Characters.find((c) => c.card.id === 'SS-128-R');
        expect(choji && (choji.attachments?.length ?? 0) > 0, 'curry attached to choji in followup').toBe(true);
        expect(calc(last, choji!)).toBe(11);
      }
    }
  });

  it('EVERY mission card with an effect has a simulation, and each one STRICTLY executes it', () => {
    const missionIds = getAllCards()
      .filter((c) => c.card_type === 'mission' && (c.effects ?? []).length > 0)
      .map((c) => c.id);
    expect(missionIds.length).toBeGreaterThanOrEqual(10);

    for (const id of missionIds) {
      expect(hasScenario(id), `${id} hasScenario`).toBe(true);
      const scenario = getScenario(id, 0);
      expect(scenario, `${id} scenario`).toBeTruthy();
      const states = runScenario(scenario!);
      const last = states[states.length - 1];
      expect(last.pendingActions.length, `${id} pending drain`).toBe(0);

      const executed = (() => {
        switch (id) {
          case 'KS-001-MMS':
            return states.some((s) => s.activeMissions[0].player1Characters.some((c) => c.powerTokens >= 2));
          case 'KS-002-MMS': {
            const zab = last.activeMissions[0].player1Characters.find((c) => c.card.id === 'KS-086-C');
            return !!zab && calc(last, zab) === 6;
          }
          case 'KS-003-MMS':
            return states.some((s) => s.player2.discardPile.length === 1 && s.player2.hand.length === 0);
          case 'KS-004-MMS':
            return states.some((s) => s.player1.missionPoints > 0 && s.activeMissions.every((m) => m.player2Characters.length === 0) && s.player2.discardPile.length === 1);
          case 'KS-005-MMS':
            return states.some((s) => s.turn === 2 && s.player1.hand.some((c) => c.id === 'KS-009-C'));
          case 'KS-006-MMS':
            return states.some((s) => s.turn === 2 && s.player1.missionPoints > 0 && s.player1.hand.length === 1);
          case 'KS-007-MMS':
            return states.some((s) => s.activeMissions[1].player1Characters.some((c) => c.instanceId === 'sim-hid-ally'));
          case 'KS-008-MMS':
            return states.some((s) => s.turn === 2 && s.player1.hand.length === 0 && s.activeMissions.some((m) => m.player1Characters.some((c) => c.isHidden && c.card.id === 'KS-005-C')));
          case 'KS-009-MMS': {
            const zab = last.activeMissions[0].player1Characters.find((c) => c.card.id === 'KS-086-C');
            const shizune = last.activeMissions[0].player1Characters.find((c) => c.card.id === 'KS-005-C');
            return !!zab && calc(last, zab) === 6 && !!shizune && calc(last, shizune) === 1;
          }
          case 'KS-010-MMS':
            return states.some((s) => s.turn === 3 && s.player1.chakra === 7 && s.player2.chakra === 6);
          case 'SS-001-MMS':
          case 'SS-001_2-MMS':
            return states.some((s) => s.activeMissions[0].player1Characters.some((c) => c.card.id === 'KS-086-C' && c.powerTokens >= 2));
          case 'SS-002-MMS':
          case 'SS-002_2-MMS':
            return states.some((s) => s.activeMissions[1].player2Characters.some((c) => c.instanceId === 'sim-hid-enemy'))
              || states.some((s) => s.log.some((l) => l.messageKey === 'game.log.effect.ssMss02Looked'));
          case 'SS-003-MMS':
          case 'SS-003_2-MMS': {
            const solo = last.activeMissions[0].player1Characters[0];
            return !!solo && calc(last, solo) >= 5;
          }
          case 'SS-004-MMS':
          case 'SS-004_2-MMS':
            return states.some((s) => s.player1.missionPoints === 2);
          case 'SS-005-MMS':
          case 'SS-005_2-MMS':
            return states.some((s) => s.turn === 2 && s.player1.chakra >= 8);
          case 'SS-006-MMS':
          case 'SS-006_2-MMS':
            return states.some((s) => s.activeMissions[0].player1Characters.some((c) => c.instanceId === 'sim-hid-ally' && !c.isHidden && c.powerTokens >= 2));
          case 'SS-007-MMS':
          case 'SS-007_2-MMS': {
            const king = last.activeMissions[0].player1Characters.find((c) => c.card.id === 'KS-009-C');
            return !!king && calc(last, king) >= 4;
          }
          case 'SS-008-MMS':
          case 'SS-008_2-MMS':
            return states.some((s) => s.player1.missionPoints > 0);
          case 'SS-009-MMS':
          case 'SS-009_2-MMS':
            return states.some((s) => s.log.some((l) => l.messageKey === 'game.log.effect.ssMss09ForcedDraw'));
          case 'SS-010-MMS':
          case 'SS-010_2-MMS':
            return states.some((s) => s.player1.missionPoints > 0);
          default:
            return false;
        }
      })();
      expect(executed, `${id} effect really executed`).toBe(true);
    }
  });
});
