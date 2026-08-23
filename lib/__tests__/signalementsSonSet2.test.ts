import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import { GameEngine } from '@/lib/engine/GameEngine';
import type { CharacterCard, GameState } from '@/lib/engine/types';

beforeAll(() => { initializeRegistry(); });

describe('SAKON 062 revele en premiere action peut copier un FIRST STRIKE', () => {
  function plateau(): GameState {
    const s = buildSimState({
      p1: [simChar('SS-032-C', { owner: 'player1', instanceId: 'jirobo' })],
      p2: [], missions: 2, chakra1: 40, edgeHolder: 'player1',
    });
    s.phase = 'action';
    s.activePlayer = 'player1';
    s.player1.hand = [];
    s.firstStrike = { player1: 'available', player2: 'available' };
    s.activeMissions[0].player1Characters.push({
      ...simChar('KS-062-UC', { owner: 'player1', instanceId: 'sakon' }),
      isHidden: true,
    } as never);
    return s;
  }

  function revele(depart: GameState): GameState {
    return GameEngine.applyAction(depart, 'player1', {
      type: 'REVEAL_CHARACTER', missionIndex: 0, characterInstanceId: 'sakon',
    } as never);
  }

  it('la fenetre de copie s ouvre au lieu d annoncer aucune cible', () => {
    const apres = revele(plateau());
    expect(
      apres.pendingActions.some((p) => p.descriptionKey === 'game.effect.desc.sakon062ConfirmAmbush'),
      'JIROBO 032 ne porte quun FIRST STRIKE: sans savoir que cest la premiere carte du tour, '
      + 'le copieur le jugeait incopiable et annoncait aucune cible',
    ).toBe(true);
    expect(apres.log.map((l) => l.messageKey)).not.toContain('game.log.effect.noTarget');
  });

  it('la copie va au bout', () => {
    let etat = revele(plateau());
    let garde = 0;
    while (etat.pendingActions.length > 0 && garde < 6) {
      const q = etat.pendingActions[0];
      etat = GameEngine.applyAction(etat, q.player, {
        type: 'SELECT_TARGET', pendingActionId: q.id, selectedTargets: [q.options[0]],
      } as never);
      garde += 1;
    }
    expect(etat.log.map((l) => l.messageKey)).toContain('game.log.effect.copySuccess');
  });

  it('sans etre la premiere carte du tour, le FIRST STRIKE reste incopiable', () => {
    const s = plateau();
    s.firstStrike = { player1: 'used', player2: 'available' };
    const apres = revele(s);
    expect(apres.log.map((l) => l.messageKey), 'la condition de la carte copiee est respectee')
      .toContain('game.log.effect.noTarget');
  });
});

describe('le contexte dune revelation transporte la premiere carte du tour', () => {
  const MOTEUR = readFileSync(join(__dirname, '..', 'effects', 'EffectEngine.ts'), 'utf8');

  it('les trois effets resolus a la revelation le savent', () => {
    const at = MOTEUR.indexOf('static resolveRevealEffects(');
    const corps = MOTEUR.slice(at, MOTEUR.indexOf('static resolveScoreEffects(', at));
    const contextes = corps.match(/const ctx: EffectContext = \{[\s\S]*?\};/g) ?? [];
    expect(contextes.length, 'MAIN, AMBUSH et DUEL').toBeGreaterThanOrEqual(3);
    for (const c of contextes) {
      expect(c, 'un handler qui lit wasFirstCard doit le recevoir').toContain('wasFirstCard');
      expect(c).toContain('wasRevealed');
    }
  });

  it('un effet FIRST STRIKE resolu sait quil est la premiere carte', () => {
    const at = MOTEUR.indexOf('static resolveFirstStrikeEffect(');
    const corps = MOTEUR.slice(at, at + 1400);
    expect(corps).toContain('wasFirstCard: true');
  });
});

describe('KIMIMARO 031 defausse au plus un exemplaire de chaque nom', () => {
  it('deux JIROBO en main ne donnent quune seule defausse de JIROBO', () => {
    const s = buildSimState({
      p1: [simChar('SS-032-C', { owner: 'player1', instanceId: 'ally' })],
      p2: [], missions: 2, chakra1: 40, edgeHolder: 'player1',
    });
    s.phase = 'action';
    s.activePlayer = 'player1';
    s.player1.hand = [
      getCardById('SS-031-UC') as CharacterCard,
      getCardById('SS-032-C') as CharacterCard,
      getCardById('SS-032-C') as CharacterCard,
      getCardById('SS-039-C') as CharacterCard,
    ];

    let etat: GameState = GameEngine.applyAction(s, 'player1', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0,
    } as never);
    let garde = 0;
    while (etat.pendingActions.length > 0 && garde < 12) {
      const q = etat.pendingActions[0];
      etat = GameEngine.applyAction(etat, q.player, {
        type: 'SELECT_TARGET', pendingActionId: q.id, selectedTargets: [q.options[0]],
      } as never);
      garde += 1;
    }

    const noms = etat.player1.discardPile.map((c) => c.name_fr);
    expect(noms.filter((n) => n === 'JIRÔBÔ').length, 'la carte dit un exemplaire de chacun').toBe(1);
    expect(noms.filter((n) => n === 'TAYUYA').length).toBe(1);
    expect(noms.length, 'un par nom present en main, jamais deux du meme').toBe(2);
  });

  it('un nom deja utilise ne revient jamais dans les choix', async () => {
    const { discardableSoundFour } = await import('@/lib/effects/handlers/SS/kimimaro031');
    const s = buildSimState({ p1: [], p2: [], missions: 2, chakra1: 10, edgeHolder: 'player1' });
    s.player1.hand = [
      getCardById('SS-032-C') as CharacterCard,
      getCardById('SS-032-C') as CharacterCard,
      getCardById('SS-039-C') as CharacterCard,
    ];
    expect(discardableSoundFour(s, 'player1', []).length, 'un choix par nom distinct').toBe(2);
    expect(discardableSoundFour(s, 'player1', ['JIROBO']).map((c) => c.name)).toEqual(['TAYUYA']);
    expect(discardableSoundFour(s, 'player1', ['JIROBO', 'TAYUYA'])).toEqual([]);
  });
});

describe('KIMIMARO 077 se propose une fois par exemplaire en jeu', () => {
  function deuxKimimaro(): GameState {
    const s = buildSimState({
      p1: [simChar('SS-077-UC', { owner: 'player1', instanceId: 'kimi-a' })],
      p2: [simChar('KS-019-C', { owner: 'player2', instanceId: 'e1' })],
      missions: 2, chakra1: 40, edgeHolder: 'player1',
    });
    s.phase = 'action';
    s.activePlayer = 'player1';
    s.activeMissions[1].player1Characters.push(
      simChar('SS-077-UC', { owner: 'player1', instanceId: 'kimi-b', missionIndex: 1 }) as never,
    );
    s.activeMissions[1].player2Characters.push(
      simChar('KS-005-C', { owner: 'player2', instanceId: 'e2', missionIndex: 1 }) as never,
    );
    return s;
  }

  function propositions(s: GameState) {
    const apres = GameEngine.applyAction(s, 'player1', { type: 'PASS' } as never);
    return {
      etat: apres,
      prompts: apres.pendingActions.filter((p) => (p.descriptionKey ?? '').includes('ss077Confirm')),
    };
  }

  it('deux exemplaires donnent deux propositions', () => {
    const { prompts } = propositions(deuxKimimaro());
    expect(prompts.length, 'chaque Kimimaro porte son propre effet continu').toBe(2);
    expect(prompts.map((p) => p.options[0]).sort()).toEqual(['kimi-a', 'kimi-b']);
  });

  it('un seul exemplaire donne une seule proposition', () => {
    const s = deuxKimimaro();
    s.activeMissions[1].player1Characters = [];
    expect(propositions(s).prompts.length).toBe(1);
  });

  it('un Kimimaro cache ne propose rien', () => {
    const s = deuxKimimaro();
    s.activeMissions[0].player1Characters[0].isHidden = true;
    expect(propositions(s).prompts.map((p) => p.options[0])).toEqual(['kimi-b']);
  });

  it('il ne se sacrifie pas quand plus aucun ennemi nest a sa portee', () => {
    let etat = propositions(deuxKimimaro()).etat;
    let garde = 0;
    while (etat.pendingActions.length > 0 && garde < 12) {
      const q = etat.pendingActions[0];
      etat = GameEngine.applyAction(etat, q.player, {
        type: 'SELECT_TARGET', pendingActionId: q.id, selectedTargets: [q.options[0]],
      } as never);
      garde += 1;
    }
    const restants = etat.activeMissions.flatMap((m) => m.player1Characters).length;
    const ennemis = etat.activeMissions.flatMap((m) => m.player2Characters).length;
    expect(ennemis, 'les ennemis a portee tombent').toBe(0);
    expect(
      restants,
      'le second Kimimaro ne meurt pas pour rien une fois le plateau adverse vide',
    ).toBeGreaterThan(0);
  });
});
