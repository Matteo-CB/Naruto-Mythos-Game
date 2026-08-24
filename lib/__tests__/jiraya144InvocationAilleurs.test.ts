import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import { GameEngine } from '@/lib/engine/GameEngine';
import type { CharacterCard, GameState } from '@/lib/engine/types';

beforeAll(() => { initializeRegistry(); });

const JIRAYA = 'SS-144-S';
const GAMA_BUNTA = 'KS-094-C';

function socle(chakra: number): GameState {
  const s = buildSimState({
    p1: [simChar('SS-004-UC', { owner: 'player1', instanceId: 'socle' })],
    p2: [], missions: 3, chakra1: chakra, edgeHolder: 'player1',
  });
  s.phase = 'action';
  s.activePlayer = 'player1';
  s.player1.hand = [getCardById(JIRAYA) as CharacterCard];
  return s;
}

function ameliore(s: GameState): GameState {
  return GameEngine.applyAction(s, 'player1', {
    type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: 'socle',
  } as never);
}

function repondJusquA(s: GameState, cle: string, max = 4): GameState {
  let etat = s;
  let garde = 0;
  while (etat.pendingActions.length > 0 && garde < max) {
    const q = etat.pendingActions[0];
    if (q.descriptionKey === cle) return etat;
    etat = GameEngine.applyAction(etat, q.player, {
      type: 'SELECT_TARGET', pendingActionId: q.id, selectedTargets: [q.options[0]],
    } as never);
    garde += 1;
  }
  return etat;
}

describe('JIRAYA 144 propose une invocation cachee de n importe quelle mission', () => {
  for (const mission of [0, 1, 2]) {
    it(`invocation cachee posee sur la mission ${mission}`, () => {
      const s = socle(40);
      s.activeMissions[mission].player1Characters.push({
        ...simChar(GAMA_BUNTA, { owner: 'player1', instanceId: 'cachee', missionIndex: mission }),
        isHidden: true,
      } as never);

      const apres = repondJusquA(ameliore(s), 'game.effect.desc.ss002PlaySummon');
      const question = apres.pendingActions[0];
      expect(question?.descriptionKey, `la mission ${mission} doit etre proposee`)
        .toBe('game.effect.desc.ss002PlaySummon');
      expect(question.options, 'l invocation cachee est bien dans la liste').toContain('HIDDEN_cachee');
    });
  }

  it('une invocation prise en main peut etre posee sur n importe quelle mission', () => {
    const s = socle(40);
    s.player1.hand.push(getCardById('KS-095-C') as CharacterCard);

    let etat = repondJusquA(ameliore(s), 'game.effect.desc.ss002PlaySummon');
    const choix = etat.pendingActions[0];
    expect(choix.options, 'la carte en main est proposee').toContain('HAND_0');
    etat = GameEngine.applyAction(etat, 'player1', {
      type: 'SELECT_TARGET', pendingActionId: choix.id, selectedTargets: ['HAND_0'],
    } as never);

    const missions = etat.pendingActions[0];
    expect(missions?.descriptionKey).toBe('game.effect.desc.chooseMissionPlayReduced');
    expect(missions.options, 'anywhere veut dire les trois missions').toEqual(['0', '1', '2']);
  });
});

describe('quand aucune invocation ne peut etre jouee, le joueur apprend pourquoi', () => {
  it('une invocation cachee bloquee par un homonyme visible est expliquee', () => {
    const s = socle(40);
    s.activeMissions[1].player1Characters.push(
      simChar(GAMA_BUNTA, { owner: 'player1', instanceId: 'visible', missionIndex: 1 }) as never,
    );
    s.activeMissions[1].player1Characters.push({
      ...simChar(GAMA_BUNTA, { owner: 'player1', instanceId: 'cachee', missionIndex: 1 }),
      isHidden: true,
    } as never);

    const confirme = ameliore(s);
    const question = confirme.pendingActions[0];
    expect(question?.descriptionKey, 'la confirmation s ouvre').toBe('game.effect.desc.ss002ConfirmUpgrade');

    const apres = GameEngine.applyAction(confirme, 'player1', {
      type: 'SELECT_TARGET', pendingActionId: question.id, selectedTargets: [question.options[0]],
    } as never);

    expect(apres.pendingActions.length, 'aucune invocation jouable, la chaine s arrete').toBe(0);
    expect(
      apres.log.map((l) => l.messageKey),
      "sans explication, le joueur croit a un bug: il a accepte l effet et rien ne s est passe",
    ).toContain('game.log.effect.duplicateNameReveal');
  });

  it('le POWERUP de la carte s applique quand meme', () => {
    const s = socle(40);
    s.activeMissions[1].player1Characters.push(
      simChar(GAMA_BUNTA, { owner: 'player1', instanceId: 'visible', missionIndex: 1 }) as never,
    );
    s.activeMissions[1].player1Characters.push({
      ...simChar(GAMA_BUNTA, { owner: 'player1', instanceId: 'cachee', missionIndex: 1 }),
      isHidden: true,
    } as never);

    const confirme = ameliore(s);
    const question = confirme.pendingActions[0];
    const apres = GameEngine.applyAction(confirme, 'player1', {
      type: 'SELECT_TARGET', pendingActionId: question.id, selectedTargets: [question.options[0]],
    } as never);

    const visible = apres.activeMissions[1].player1Characters.find((c) => c.instanceId === 'visible');
    expect(visible?.powerTokens, 'la seconde phrase de la carte reste appliquee').toBe(2);
  });
});
