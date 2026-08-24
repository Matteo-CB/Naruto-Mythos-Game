import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import { GameEngine } from '@/lib/engine/GameEngine';
import type { CharacterCard, GameState } from '@/lib/engine/types';

beforeAll(() => { initializeRegistry(); });

const SANNIN = 'KS-003-C';
const QUELCONQUE = 'KS-005-C';

function plateau(fouilleur: string, sommet: string[]): GameState {
  const s = buildSimState({ p1: [], p2: [], missions: 2, chakra1: 40, edgeHolder: 'player1' });
  s.phase = 'action';
  s.activePlayer = 'player1';
  s.player1.hand = [getCardById(fouilleur) as CharacterCard];
  s.player1.deck = [...sommet, QUELCONQUE, QUELCONQUE]
    .map((id) => getCardById(id) as CharacterCard) as never;
  return s;
}

function joue(s: GameState): GameState {
  return GameEngine.applyAction(s, 'player1', {
    type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0,
  } as never);
}

function premierEffet(s: GameState) {
  const pa = s.pendingActions[0];
  return s.pendingEffects.find((e) => e.id === pa?.sourceEffectId);
}

describe('une fouille de deck peut toujours etre refusee', () => {
  it('avec une cible dans les cartes regardees', () => {
    const apres = joue(plateau('SS-004-UC', [SANNIN, QUELCONQUE, QUELCONQUE]));
    const effet = premierEffet(apres)!;
    expect(effet.isMandatory, 'un effet instantane est optionnel sauf mention MUST').not.toBe(true);
    expect(effet.isOptional || effet.rootOptional).toBe(true);
  });

  it('sans aucune cible dans les cartes regardees', () => {
    const apres = joue(plateau('SS-004-UC', [QUELCONQUE, QUELCONQUE, QUELCONQUE]));
    const effet = premierEffet(apres)!;
    expect(
      effet.isMandatory,
      "sans Sannin, le joueur etait force de regarder et d envoyer ses trois cartes au fond",
    ).not.toBe(true);
    expect(effet.isOptional || effet.rootOptional).toBe(true);
  });

  it('refuser laisse le deck exactement en place et la main vide', () => {
    for (const sommet of [[SANNIN, QUELCONQUE, QUELCONQUE], [QUELCONQUE, QUELCONQUE, QUELCONQUE]]) {
      const apres = joue(plateau('SS-004-UC', sommet));
      const effet = premierEffet(apres)!;
      const deckAvant = apres.player1.deck.map((c) => c.id).join(',');

      const refus = GameEngine.applyAction(apres, 'player1', {
        type: 'DECLINE_OPTIONAL_EFFECT', pendingEffectId: effet.id,
      } as never);

      expect(refus.pendingActions.length, 'le refus est accepte').toBe(0);
      expect(refus.player1.deck.map((c) => c.id).join(','), 'aucune carte deplacee').toBe(deckAvant);
      expect(refus.player1.hand.length, 'aucune carte prise').toBe(0);
    }
  });

  it('refuser ne revele pas au journal ce que contenait le dessus du deck', () => {
    const apres = joue(plateau('SS-004-UC', [QUELCONQUE, QUELCONQUE, QUELCONQUE]));
    const effet = premierEffet(apres)!;
    const refus = GameEngine.applyAction(apres, 'player1', {
      type: 'DECLINE_OPTIONAL_EFFECT', pendingEffectId: effet.id,
    } as never);
    expect(
      refus.log.map((l) => l.messageKey),
      "annoncer l absence de cible apres un refus renseigne l adversaire sur le deck",
    ).not.toContain('game.log.effect.noTarget');
  });

  it('accepter sans cible envoie bien les cartes regardees au fond', () => {
    let etat = joue(plateau('SS-004-UC', [QUELCONQUE, QUELCONQUE, QUELCONQUE]));
    const tailleAvant = etat.player1.deck.length;
    let garde = 0;
    while (etat.pendingActions.length > 0 && garde < 6) {
      const q = etat.pendingActions[0];
      etat = GameEngine.applyAction(etat, q.player, {
        type: 'SELECT_TARGET', pendingActionId: q.id, selectedTargets: [q.options[0]],
      } as never);
      garde += 1;
    }
    expect(etat.player1.deck.length, 'le deck garde sa taille').toBe(tailleAvant);
    expect(etat.log.map((l) => l.messageKey)).toContain('game.log.effect.ssDeckSearchBottom');
    expect(etat.log.map((l) => l.messageKey), "l absence de cible est annoncee une fois accepte")
      .toContain('game.log.effect.noTarget');
  });

  it('accepter avec une cible met le personnage en main', () => {
    let etat = joue(plateau('SS-004-UC', [SANNIN, QUELCONQUE, QUELCONQUE]));
    let garde = 0;
    while (etat.pendingActions.length > 0 && garde < 6) {
      const q = etat.pendingActions[0];
      etat = GameEngine.applyAction(etat, q.player, {
        type: 'SELECT_TARGET', pendingActionId: q.id, selectedTargets: [q.options[0]],
      } as never);
      garde += 1;
    }
    expect(etat.player1.hand.map((c) => c.id), 'le Sannin rejoint la main').toContain(SANNIN);
  });

  it('un deck vide ne pose aucune fenetre', () => {
    const s = plateau('SS-004-UC', []);
    s.player1.deck = [] as never;
    const apres = joue(s);
    expect(apres.pendingActions.length).toBe(0);
    expect(apres.log.map((l) => l.messageKey)).toContain('game.log.effect.noTarget');
  });
});

describe('aucune fouille de deck du jeu ne force le joueur', () => {
  it('les fenetres de fouille ne sont jamais declarees obligatoires', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const racine = join(__dirname, '..', '..');
    for (const f of ['lib/effects/handlers/SS/deckSearch.ts', 'lib/effects/handlers/SS/attachmentHandlers.ts']) {
      const src = readFileSync(join(racine, f), 'utf8');
      const bloc = src.slice(0, src.length);
      expect(
        bloc.includes("targetSelectionType: 'SS_DECK_SEARCH_SHOW'") && bloc.includes('isMandatory: true'),
        `${f}: une fouille rendue obligatoire prive le joueur du choix de ne pas activer un effet instantane`,
      ).toBe(false);
    }
  });
});
