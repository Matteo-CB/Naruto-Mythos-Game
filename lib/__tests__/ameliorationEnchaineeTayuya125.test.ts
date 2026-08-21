import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { GameEngine } from '@/lib/engine/GameEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { GameState } from '@/lib/engine/types';

const TAYUYA_125 = 'KS-125-R';
const TAYUYA_064 = 'KS-064-C';
const JIROBO_122 = 'KS-122-R';
const JIROBO_057 = 'KS-057-C';
const ENNEMI_FAIBLE = 'KS-064-C';

beforeAll(() => { initializeRegistry(); });

function plateau(): GameState {
  const s = buildSimState({
    p1: [
      simChar(TAYUYA_064, { owner: 'player1', instanceId: 'tayuya' }),
      simChar(JIROBO_057, { owner: 'player1', instanceId: 'jirobo' }),
    ],
    p2: [simChar(ENNEMI_FAIBLE, { owner: 'player2', instanceId: 'proie' })],
    missions: 2, chakra1: 30, edgeHolder: 'player1',
  });
  s.phase = 'action';
  s.activePlayer = 'player1';
  s.player1.hand = [getCardById(TAYUYA_125) as never, getCardById(JIROBO_122) as never];
  return s;
}

function sommet(s: GameState, instanceId: string): string | null {
  for (const m of s.activeMissions) {
    for (const c of [...m.player1Characters, ...m.player2Characters]) {
      if (c.instanceId !== instanceId) continue;
      const top = c.stack?.length > 0 ? c.stack[c.stack.length - 1] : c.card;
      return top.id;
    }
  }
  return null;
}

function enJeu(s: GameState, instanceId: string): boolean {
  return s.activeMissions.some((m) =>
    [...m.player1Characters, ...m.player2Characters].some((c) => c.instanceId === instanceId));
}

function repond(s: GameState, choisir: (options: string[], type: string) => string | null): GameState {
  let courant = s;
  let garde = 0;
  while (courant.pendingActions.length > 0 && garde < 15) {
    const q = courant.pendingActions[0];
    const eff = courant.pendingEffects.find((e) => e.id === q.sourceEffectId);
    const type = eff?.targetSelectionType ?? '';
    const choix = choisir(q.options, type);
    courant = choix === null
      ? GameEngine.applyAction(courant, q.player, { type: 'DECLINE_OPTIONAL_EFFECT', pendingActionId: q.id } as never)
      : GameEngine.applyAction(courant, q.player, {
        type: 'SELECT_TARGET', pendingActionId: q.id, selectedTargets: [choix],
      } as never);
    garde += 1;
  }
  return courant;
}

function joueTayuyaPuisJirobo(): { fin: GameState; vus: string[] } {
  const vus: string[] = [];
  const depart = GameEngine.applyAction(plateau(), 'player1', {
    type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: 'tayuya',
  } as never);

  const fin = repond(depart, (options, type) => {
    vus.push(type);
    if (type === 'TAYUYA125_CONFIRM_UPGRADE') return options[0];
    if (type === 'TAYUYA125_CHOOSE_SOUND') {
      return options.find((o) => o.startsWith('HAND_')) ?? options[0];
    }
    if (type === 'EFFECT_PLAY_UPGRADE_OR_FRESH') {
      return options.find((o) => o !== 'FRESH') ?? options[0];
    }
    return options[0];
  });

  return { fin, vus };
}

describe('un personnage joue par un effet garde son effet d amelioration', () => {
  it('TAYUYA 125 posee en amelioration propose bien son effet', () => {
    const { vus } = joueTayuyaPuisJirobo();
    expect(vus[0], 'l effet d amelioration de Tayuya s ouvre').toBe('TAYUYA125_CONFIRM_UPGRADE');
  });

  it('le personnage joue par l effet peut se poser en amelioration', () => {
    const { fin } = joueTayuyaPuisJirobo();
    expect(sommet(fin, 'tayuya'), 'Tayuya 125 est bien au sommet de sa pile').toBe(TAYUYA_125);
    expect(sommet(fin, 'jirobo'), 'Jirobo 122 est bien pose sur Jirobo 057').toBe(JIROBO_122);
  });

  it('son effet d amelioration s applique, il n est pas avale par la chaine', () => {
    const { fin } = joueTayuyaPuisJirobo();
    expect(
      enJeu(fin, 'proie'),
      'JIROBO 122 pose en amelioration doit vaincre l ennemi de Puissance 1 ou moins',
    ).toBe(false);
  });

  it('la chaine laisse une trace dans le journal', () => {
    const { fin } = joueTayuyaPuisJirobo();
    const cles = fin.log.map((l) => l.messageKey);
    expect(cles, 'la pose par effet est journalisee').toContain('game.log.effect.upgradeFromHand');
  });
});
