import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import { GameEngine } from '@/lib/engine/GameEngine';
import type { CardData, CharacterCard, GameState } from '@/lib/engine/types';

beforeAll(() => { initializeRegistry(); });

const JIRAIYA_FOUILLE = 'SS-004-UC';
const SANNIN = 'KS-007-C';
const SANS_SANNIN = ['KS-013-C', 'KS-032-C', 'KS-011-C'];
const AVEC_SANNIN = [SANNIN, 'KS-032-C', 'KS-011-C'];
const RESTE = ['KS-021-C', 'KS-022-UC', 'KS-025-C'];

function plateau(sommet: string[]): GameState {
  const s = buildSimState({
    p1: [simChar('KS-013-C', { owner: 'player1', instanceId: 'socle' })],
    p2: [], missions: 1, chakra1: 40,
  });
  s.phase = 'action';
  s.activePlayer = 'player1';
  s.player1.chakra = 40;
  s.player1.hand = [getCardById(JIRAIYA_FOUILLE) as CharacterCard];
  s.player1.deck = [...sommet, ...RESTE].map((id) => getCardById(id) as unknown as CardData) as never;
  return s;
}

const deckDe = (s: GameState) => (s.player1.deck as unknown as CardData[]).map((c) => c.id);
const mainDe = (s: GameState) => (s.player1.hand as unknown as CardData[]).map((c) => c.id);

function jouer(s: GameState): GameState {
  return GameEngine.applyAction(s, 'player1', {
    type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0,
  } as never);
}

function repondre(s: GameState, choix: 'accepte' | 'refuse'): GameState {
  const pa = s.pendingActions[0];
  if (!pa) return s;
  if (choix === 'refuse') {
    return GameEngine.applyAction(s, pa.player, {
      type: 'DECLINE_OPTIONAL_EFFECT', pendingEffectId: pa.sourceEffectId,
    } as never);
  }
  return GameEngine.applyAction(s, pa.player, {
    type: 'SELECT_TARGET', pendingActionId: pa.id, selectedTargets: [(pa.options ?? [])[0]],
  } as never);
}

describe('JIRAIYA 004 met bien les cartes regardees au fond, comme la carte le dit', () => {
  it('quand la fouille trouve, le Sannin part en main et les autres au fond', () => {
    let s = jouer(plateau(AVEC_SANNIN));
    s = repondre(s, 'accepte');
    s = repondre(s, 'accepte');

    expect(mainDe(s), 'le Sannin revele rejoint la main').toContain(SANNIN);
    const deck = deckDe(s);
    expect(deck.slice(0, RESTE.length), 'le dessus reprend la ou la fouille s est arretee').toEqual(RESTE);
    expect(deck.slice(RESTE.length).sort(), 'les deux autres sont au fond').toEqual(['KS-011-C', 'KS-032-C']);
  });

  it('quand la fouille manque, les trois cartes vues partent au fond', () => {
    let s = jouer(plateau(SANS_SANNIN));
    s = repondre(s, 'accepte');
    s = repondre(s, 'accepte');

    expect(mainDe(s), 'rien a prendre').toEqual([]);
    const deck = deckDe(s);
    expect(deck.slice(0, RESTE.length), 'le dessus a change').toEqual(RESTE);
    expect(deck.slice(RESTE.length).sort(), 'les trois cartes vues sont au fond').toEqual([...SANS_SANNIN].sort());
  });
});

describe('refuser la fenetre apres avoir regarde ne garde pas les cartes sur le dessus', () => {
  it('fouille manquee puis fenetre refusee: les cartes vues descendent quand meme', () => {
    let s = jouer(plateau(SANS_SANNIN));
    s = repondre(s, 'accepte');
    s = repondre(s, 'refuse');

    const deck = deckDe(s);
    expect(
      deck.slice(0, RESTE.length),
      'sinon le joueur connait ses trois prochaines pioches dans l ordre: '
      + 'c est mieux que ce que la carte accorde',
    ).toEqual(RESTE);
    expect(deck.slice(RESTE.length).sort()).toEqual([...SANS_SANNIN].sort());
  });

  it('fouille reussie puis fenetre refusee: rien en main, et rien ne reste sur le dessus', () => {
    let s = jouer(plateau(AVEC_SANNIN));
    s = repondre(s, 'accepte');
    s = repondre(s, 'refuse');

    expect(mainDe(s), 'refuser la prise ne donne aucune carte').toEqual([]);
    const deck = deckDe(s);
    expect(deck.slice(0, RESTE.length), 'le dessus a bien change').toEqual(RESTE);
    expect(deck.slice(RESTE.length).sort()).toEqual([...AVEC_SANNIN].sort());
  });

  it('refuser l effet AVANT de regarder ne touche pas le deck', () => {
    const depart = plateau(SANS_SANNIN);
    const avant = deckDe(depart);
    let s = jouer(depart);
    s = repondre(s, 'refuse');
    expect(
      deckDe(s),
      'renoncer a l effet est permis, et on n a alors rien regarde: le deck ne bouge pas',
    ).toEqual(avant);
    expect(mainDe(s)).toEqual([]);
  });
});

describe('le deck se lit bien du dessus vers le fond', () => {
  it('la pioche prend la premiere carte du tableau', () => {
    const source = readFileSyncSafe('lib/engine/phases/StartPhase.ts');
    expect(
      source,
      'toute la fouille suppose que l index 0 est le dessus du deck',
    ).toContain('deck.splice(0, drawn)');
  });

  it('une seule fonction envoie les cartes regardees au fond', () => {
    const moteur = readFileSyncSafe('lib/effects/EffectEngine.ts');
    const partie = readFileSyncSafe('lib/engine/GameEngine.ts');
    expect(moteur, 'la resolution normale').toContain('envoyerLesCartesRegardeesAuFond(');
    expect(partie, 'le refus de la fenetre').toContain('envoyerLesCartesRegardeesAuFond(');
    expect(
      moteur + partie,
      'l aide vit dans un module feuille: la mettre a cote des fouilles cree une boucle d imports '
      + 'qui casse l enregistrement des effets au demarrage',
    ).not.toContain("from '../effects/handlers/SS/deckSearch'");
    expect(
      moteur,
      'plus de remise au fond ecrite a la main a cote du helper',
    ).not.toContain('deck: [...deckVue.slice(profondeurVue), ...sommetVue]');
  });
});

function readFileSyncSafe(relatif: string): string {
  const { readFileSync } = require('fs') as typeof import('fs');
  const { join } = require('path') as typeof import('path');
  return readFileSync(join(__dirname, '..', '..', relatif), 'utf8');
}
