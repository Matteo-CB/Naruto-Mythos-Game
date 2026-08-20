import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { GameEngine } from '@/lib/engine/GameEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CharacterCard, GameState } from '@/lib/engine/types';

const SAKON_BASE = 'SS-036-C';
const SAKON_AMELIORE = 'SS-037-UC';

function plateau(): GameState {
  const s = buildSimState({
    p1: [simChar(SAKON_BASE, { owner: 'player1', instanceId: 'sakon' })],
    p2: [simChar('KS-019-C', { owner: 'player2', instanceId: 'cible' })],
    missions: 2, chakra1: 40, edgeHolder: 'player1',
  });
  s.phase = 'action';
  s.activePlayer = 'player1';
  s.player1.hand = [
    getCardById(SAKON_AMELIORE) as CharacterCard,
    getCardById('KS-057-C') as CharacterCard,
    getCardById('KS-059-C') as CharacterCard,
    getCardById('KS-064-C') as CharacterCard,
  ];
  return s;
}

function joueLAmelioration(): GameState {
  return GameEngine.applyAction(plateau(), 'player1', {
    type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: 'sakon',
  } as never);
}

describe('SAKON 037 laisse reveler plusieurs cartes de la main', () => {
  it('la question ouverte au joueur autorise bien plusieurs cartes', () => {
    let etat = joueLAmelioration();
    let garde = 0;
    let question = etat.pendingActions[0];
    while (question && question.type !== 'CHOOSE_CARD_FROM_LIST' && garde < 4) {
      etat = GameEngine.applyAction(etat, question.player, {
        type: 'SELECT_TARGET', pendingActionId: question.id, selectedTargets: [question.options[0]],
      } as never);
      question = etat.pendingActions[0];
      garde += 1;
    }

    expect(question, 'la fenetre de choix dans la main est bien ouverte').toBeTruthy();
    expect(question.options.length, 'les trois Sound Four de la main sont proposes').toBe(3);
    expect(question.maxSelections, 'on peut en reveler plusieurs').toBeGreaterThan(1);
  });

  it('deux cartes revelees permettent de vaincre un ennemi de cout inferieur a deux', () => {
    let etat = joueLAmelioration();
    let garde = 0;
    while (etat.pendingActions.length > 0 && garde < 6) {
      const q = etat.pendingActions[0];
      const plusieurs = (q.maxSelections ?? 1) > 1 && q.options.length >= 2;
      etat = GameEngine.applyAction(etat, q.player, {
        type: 'SELECT_TARGET', pendingActionId: q.id,
        selectedTargets: plusieurs ? q.options.slice(0, 2) : [q.options[0]],
      } as never);
      garde += 1;
    }
    const cles = etat.log.map((l) => l.messageKey);
    expect(cles, 'la revelation est journalisee').toContain('game.log.effect.revealFromHand');
    expect(
      etat.activeMissions.some((m) => m.player2Characters.length === 0),
      'un ennemi de cout 1 tombe apres deux cartes revelees',
    ).toBe(true);
  });
});

describe('la fenetre de main sait gerer un choix multiple', () => {
  const source = readFileSync(join(__dirname, '..', '..', 'components', 'game', 'HandCardSelector.tsx'), 'utf8');

  it('elle lit le nombre maximum de cartes au lieu de valider au premier clic', () => {
    expect(source).toContain('maxSelections');
    expect(source, 'un clic accumule au lieu de partir tout de suite').toContain('choixMultiple');
  });

  it('elle envoie les cartes choisies ensemble', () => {
    expect(source).toContain("choix.join(',')");
  });

  it('elle montre ou en est le joueur et ne valide pas a vide', () => {
    expect(source).toContain('game.board.chosenCount');
    expect(source).toContain('disabled={choix.length <');
  });
});
