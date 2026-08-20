import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { GameEngine } from '@/lib/engine/GameEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { GameState } from '@/lib/engine/types';

const AIGUILLES = 'SS-084-C';
const ALLIE = 'KS-011-C';
const AUTRE = 'KS-032-C';

beforeAll(() => { initializeRegistry(); });

function plateau(nombreEnnemis: number): GameState {
  const ennemis = [simChar(ALLIE, { owner: 'player2', instanceId: 'ennemi' })];
  if (nombreEnnemis > 1) ennemis.push(simChar(AUTRE, { owner: 'player2', instanceId: 'ennemi2' }));

  const s = buildSimState({
    p1: [simChar(ALLIE, { owner: 'player1', instanceId: 'moi' })],
    p2: ennemis,
    missions: 2, chakra1: 30, edgeHolder: 'player1',
  });
  s.phase = 'action';
  s.activePlayer = 'player1';
  s.activeMissions[0].player2Characters[0].powerTokens = 3;
  s.player1.hand = [getCardById(AIGUILLES) as never];
  return s;
}

function jetons(s: GameState): number {
  return s.activeMissions[0].player2Characters.find((c) => c.instanceId === 'ennemi')?.powerTokens ?? -1;
}

function repondTout(depart: GameState, choix: (options: string[]) => string): GameState {
  let courant = depart;
  let garde = 0;
  while (courant.pendingActions.length > 0 && garde < 8) {
    const q = courant.pendingActions[0];
    courant = GameEngine.applyAction(courant, q.player, {
      type: 'SELECT_TARGET', pendingActionId: q.id, selectedTargets: [choix(q.options)],
    } as never);
    garde += 1;
  }
  return courant;
}

function revele(nombreEnnemis: number): GameState {
  let courant = GameEngine.applyAction(plateau(nombreEnnemis), 'player1', {
    type: 'PLAY_HIDDEN', cardIndex: 0, missionIndex: 0,
  } as never);
  courant = GameEngine.applyAction(courant, 'player2', { type: 'PASS' } as never);
  const cache = courant.activeMissions[0].player1Characters.find((c) => c.isHidden)!;
  courant = GameEngine.applyAction(courant, 'player1', {
    type: 'REVEAL_CHARACTER', missionIndex: 0, characterInstanceId: cache.instanceId,
  } as never);
  return repondTout(courant, (options) => (options.includes('ennemi') ? 'ennemi' : options[0]));
}

describe('les AIGUILLES EMPOISONNEES vident les jetons du porteur a la revelation', () => {
  it('avec un seul ennemi visible, les jetons tombent a zero', () => {
    const apres = revele(1);
    expect(jetons(apres), 'les trois jetons sont retires').toBe(0);
    expect(
      apres.log.some((l) => l.messageKey === 'game.log.effect.ss084Removed'),
      'le retrait est journalise',
    ).toBe(true);
  });

  it('avec deux ennemis, le choix de l hote ne fait plus perdre l embuscade', () => {
    const apres = revele(2);
    expect(jetons(apres), 'le porteur choisi perd bien ses jetons').toBe(0);
    expect(apres.log.some((l) => l.messageKey === 'game.log.effect.ss084Removed')).toBe(true);
  });

  it('posee face visible depuis la main, elle ne retire rien: l embuscade demande une revelation', () => {
    let courant = GameEngine.applyAction(plateau(1), 'player1', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0,
    } as never);
    courant = repondTout(courant, (options) => options[0]);
    expect(jetons(courant), 'les jetons restent').toBe(3);
    expect(courant.log.some((l) => l.messageKey === 'game.log.effect.ss084Removed')).toBe(false);
  });

  it('le porteur ne peut plus recevoir de jeton ensuite, quelle que soit la pose', () => {
    const apresRevelation = revele(1);
    const porteur = apresRevelation.activeMissions[0].player2Characters.find((c) => c.instanceId === 'ennemi')!;
    expect(
      (porteur.attachments ?? []).some((a) => a.card.id === AIGUILLES),
      'les aiguilles sont bien accrochees',
    ).toBe(true);
  });
});

describe('une embuscade d equipement n est jamais perdue parce qu une question etait ouverte', () => {
  it('le declencheur ne regarde plus la file d attente pour decider de se lancer', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const source = readFileSync(join(__dirname, '..', 'effects', 'attachments.ts'), 'utf8');
    const declencheur = source.slice(source.indexOf('function resolveAttachmentTrigger'));
    expect(
      declencheur.slice(0, declencheur.indexOf('const source =')),
      'une file non vide ne doit plus annuler silencieusement l embuscade',
    ).not.toContain('pendingActions.length > 0');
  });
});
