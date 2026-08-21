import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { GameEngine } from '@/lib/engine/GameEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { GameState } from '@/lib/engine/types';

const EPEE = 'SS-101-UC';
const HOTE_SON = 'KS-072-C';
const AUTRE_HOTE_SON = 'KS-055-C';
const FAIBLE = 'SS-020-C';

beforeAll(() => { initializeRegistry(); });

function plateau(deuxHotes: boolean): GameState {
  const p1 = [
    simChar(HOTE_SON, { owner: 'player1', instanceId: 'hote' }),
    simChar(FAIBLE, { owner: 'player1', instanceId: 'faible-ami' }),
  ];
  if (deuxHotes) p1.push(simChar(AUTRE_HOTE_SON, { owner: 'player1', instanceId: 'hote2' }));

  const s = buildSimState({
    p1,
    p2: [simChar(FAIBLE, { owner: 'player2', instanceId: 'faible-ennemi' })],
    missions: 2, chakra1: 20, edgeHolder: 'player1',
  });
  s.phase = 'action';
  s.activePlayer = 'player1';
  s.player1.hand = [getCardById(EPEE) as never];
  return s;
}

function enJeu(s: GameState, instanceId: string): boolean {
  return s.activeMissions.some((m) =>
    [...m.player1Characters, ...m.player2Characters].some((c) => c.instanceId === instanceId));
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

function joue(deuxHotes: boolean): GameState {
  const depart = GameEngine.applyAction(plateau(deuxHotes), 'player1', {
    type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0,
  } as never);
  return repondTout(depart, (options) => (options.includes('hote') ? 'hote' : options[0]));
}

describe('l EPEE SERPENT vainc les plus faibles des deux camps', () => {
  it('avec un seul hote possible, l ami et l ennemi les plus faibles tombent tous les deux', () => {
    const apres = joue(false);
    expect(enJeu(apres, 'faible-ennemi'), 'le plus faible ennemi est vaincu').toBe(false);
    expect(enJeu(apres, 'faible-ami'), 'le texte ne dit pas ennemi, l ami tombe aussi').toBe(false);
    expect(enJeu(apres, 'hote'), 'le porteur est plus fort, il reste').toBe(true);
  });

  it('quand il faut choisir le porteur, la premiere frappe n est pas perdue', () => {
    const apres = joue(true);
    expect(enJeu(apres, 'faible-ennemi'), 'le plus faible ennemi est vaincu').toBe(false);
    expect(enJeu(apres, 'faible-ami'), 'l ami le plus faible aussi').toBe(false);
    expect(enJeu(apres, 'hote'), 'le porteur choisi reste').toBe(true);
    expect(enJeu(apres, 'hote2'), 'l autre porteur possible reste').toBe(true);
  });

  it('le choix du porteur ne change pas ce qui est vaincu', () => {
    const unSeul = joue(false);
    const avecChoix = joue(true);
    const mortsA = ['faible-ami', 'faible-ennemi'].filter((id) => !enJeu(unSeul, id));
    const mortsB = ['faible-ami', 'faible-ennemi'].filter((id) => !enJeu(avecChoix, id));
    expect(mortsB, 'poser l equipement soi-meme ou le choisir donne le meme resultat').toEqual(mortsA);
  });

  it('la premiere frappe est journalisee, jamais silencieuse', () => {
    const apres = joue(true);
    expect(
      apres.log.some((l) => l.messageKey === 'game.log.effect.defeat' && l.messageParams?.id === EPEE),
      'chaque personnage vaincu laisse une ligne',
    ).toBe(true);
  });
});

describe('une premiere frappe d equipement survit au choix du porteur', () => {
  it('le declencheur ne regarde plus la file d attente', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const source = readFileSync(join(__dirname, '..', 'effects', 'attachments.ts'), 'utf8');
    const debut = source.indexOf('function resolveAttachmentFirstStrike');
    const declencheur = source.slice(debut, source.indexOf('let newState', debut));
    expect(
      declencheur,
      'une file non vide ne doit plus annuler silencieusement la premiere frappe',
    ).not.toContain('pendingActions.length > 0');
  });
});
