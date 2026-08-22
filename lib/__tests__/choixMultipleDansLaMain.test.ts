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

describe('le moteur accepte le choix multiple exactement comme la fenetre l envoie', () => {
  function joueEtRepond(nombreRevele: number): GameState {
    let etat = joueLAmelioration();
    let garde = 0;
    while (etat.pendingActions.length > 0 && garde < 8) {
      const q = etat.pendingActions[0];
      const multi = (q.maxSelections ?? 1) > 1 && q.options.length >= nombreRevele;
      const envoi = multi ? [q.options.slice(0, nombreRevele).join(',')] : [q.options[0]];
      etat = GameEngine.applyAction(etat, q.player, {
        type: 'SELECT_TARGET', pendingActionId: q.id, selectedTargets: envoi,
      } as never);
      garde += 1;
    }
    return etat;
  }

  it('trois cartes envoyees ensemble sont bien trois cartes revelees', () => {
    const etat = joueEtRepond(3);
    const revelation = etat.log.find((l) => l.messageKey === 'game.log.effect.revealFromHand');
    expect(revelation, 'la revelation a bien eu lieu').toBeTruthy();
    expect(
      (revelation!.messageParams as Record<string, string>).count,
      'le compte annonce doit etre celui des cartes choisies, pas un',
    ).toBe('3');
    expect(etat.pendingActions.length, 'la chaine va jusqu au bout').toBe(0);
  });

  it('une seule carte continue de fonctionner', () => {
    const etat = joueEtRepond(1);
    const revelation = etat.log.find((l) => l.messageKey === 'game.log.effect.revealFromHand');
    expect((revelation!.messageParams as Record<string, string>).count).toBe('1');
  });

  it('la fenetre ne se rouvre pas indefiniment sans rien faire', () => {
    let etat = joueLAmelioration();
    const q1 = etat.pendingActions[0];
    etat = GameEngine.applyAction(etat, q1.player, {
      type: 'SELECT_TARGET', pendingActionId: q1.id, selectedTargets: [q1.options[0]],
    } as never);

    const q2 = etat.pendingActions[0];
    expect(q2.maxSelections ?? 1, 'la question autorise plusieurs cartes').toBeGreaterThan(1);
    const apres = GameEngine.applyAction(etat, q2.player, {
      type: 'SELECT_TARGET', pendingActionId: q2.id, selectedTargets: [q2.options.slice(0, 2).join(',')],
    } as never);
    expect(
      apres.log.length,
      'envoyer deux cartes doit faire avancer la partie, pas la laisser sur place',
    ).toBeGreaterThan(etat.log.length);
  });

  it('un choix qui contient une carte interdite est toujours refuse', () => {
    let etat = joueLAmelioration();
    const q1 = etat.pendingActions[0];
    etat = GameEngine.applyAction(etat, q1.player, {
      type: 'SELECT_TARGET', pendingActionId: q1.id, selectedTargets: [q1.options[0]],
    } as never);

    const q2 = etat.pendingActions[0];
    const apres = GameEngine.applyAction(etat, q2.player, {
      type: 'SELECT_TARGET', pendingActionId: q2.id, selectedTargets: [`${q2.options[0]},99`],
    } as never);
    expect(apres.log.length, 'rien ne se passe sur un choix invalide').toBe(etat.log.length);
  });
});

describe('la validation du choix ne connait aucune carte par son nom', () => {
  const moteur = readFileSync(join(__dirname, '..', 'effects', 'EffectEngine.ts'), 'utf8');
  const debut = moteur.indexOf('static dispatchTargetedEffect');
  const bloc = moteur.slice(debut, debut + 4200);

  it('elle ne contient plus de liste de types autorises a choisir plusieurs cibles', () => {
    expect(
      bloc,
      "une liste en dur de types multi-selection a laisse SAKON 037 muet: tout envoi de plusieurs cartes "
      + "etait refuse en silence, la fenetre se rouvrait sans que rien ne se passe",
    ).not.toContain('KIBA026_UPGRADE_CHOOSE');
    expect(bloc).not.toContain("isMultiSelectType");
  });

  it('elle valide chaque partie du choix, quel que soit le type', () => {
    expect(bloc, 'le choix est decoupe puis valide morceau par morceau').toContain('partiesDuChoix');
    expect(bloc, 'chaque morceau doit etre une cible permise').toContain('validTargets!.includes(part)');
  });

  it('les cartes recoivent la liste complete des choix', () => {
    expect(bloc, 'un effet qui lit selectedTargets voit toutes les cartes choisies')
      .toContain('selectedTargets = partiesDuChoix');
  });
});
