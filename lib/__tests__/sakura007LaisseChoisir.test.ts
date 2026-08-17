import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { applyStartOfRoundTriggers, SAKURA_007_POWERUP } from '@/lib/engine/rules/startOfRoundTriggers';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import type { GameState } from '@/lib/engine/types';

void EffectEngine;

const SAKURA = 'SS-007-C';
const TEAM7_A = 'KS-009-C';
const TEAM7_B = 'KS-013-C';

function plateau(nombreAllies: number): GameState {
  const p1 = [simChar(SAKURA, { owner: 'player1', instanceId: 'sakura' })];
  if (nombreAllies >= 1) p1.push(simChar(TEAM7_A, { owner: 'player1', instanceId: 'allieA' }));
  if (nombreAllies >= 2) p1.push(simChar(TEAM7_B, { owner: 'player1', instanceId: 'allieB' }));
  const s = buildSimState({ p1, missions: 2, chakra1: 30, edgeHolder: 'player1' });
  s.phase = 'start';
  return s;
}

function jetons(state: GameState, id: string): number {
  for (const m of state.activeMissions) {
    const c = m.player1Characters.find((x) => x.instanceId === id);
    if (c) return c.powerTokens;
  }
  return -1;
}

describe('SAKURA HARUNO 007 laisse choisir sa cible', () => {
  it('avec deux Team 7 allies, elle pose la question au lieu de decider', () => {
    const apres = applyStartOfRoundTriggers(plateau(2));
    const question = apres.pendingActions[0];
    expect(question, 'une question est posee').toBeDefined();
    expect(question.descriptionKey).toBe('game.effect.desc.ss007ChoosePowerup');
    expect(question.options.sort(), 'les deux allies sont proposes').toEqual(['allieA', 'allieB']);
    expect(jetons(apres, 'allieA'), 'rien n est applique avant la reponse').toBe(0);
    expect(jetons(apres, 'allieB'), 'rien n est applique avant la reponse').toBe(0);
  });

  it('le joueur peut renforcer celui qu il veut, meme le plus faible', () => {
    const avant: GameState = { ...applyStartOfRoundTriggers(plateau(2)), phase: 'action' };
    const question = avant.pendingActions[0];
    const apres = GameEngine.applyAction(avant, 'player1', {
      type: 'SELECT_TARGET', pendingActionId: question.id, selectedTargets: ['allieA'],
    } as never);
    expect(jetons(apres, 'allieA'), 'le choix du joueur recoit les jetons').toBe(SAKURA_007_POWERUP);
    expect(jetons(apres, 'allieB'), 'l autre ne recoit rien').toBe(0);
  });

  it('avec un seul allie possible, aucune question inutile', () => {
    const apres = applyStartOfRoundTriggers(plateau(1));
    expect(apres.pendingActions.length, 'pas de question quand il n y a pas de choix').toBe(0);
    expect(jetons(apres, 'allieA'), 'le seul allie est renforce directement').toBe(SAKURA_007_POWERUP);
  });

  it('sans allie Team 7, le refus est journalise', () => {
    const apres = applyStartOfRoundTriggers(plateau(0));
    expect(apres.pendingActions.length).toBe(0);
    expect(apres.log.some((l) => l.messageKey === 'game.log.effect.noTarget'), 'refus journalise').toBe(true);
  });
});
