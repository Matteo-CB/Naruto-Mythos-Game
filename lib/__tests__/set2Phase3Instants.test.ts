import { describe, it, expect } from 'vitest';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { registerAllSetHandlers } from '@/lib/effects/handlers';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import { GameEngine } from '@/lib/engine/GameEngine';
import { FOUILLES, candidatsDeFouille } from '@/lib/effects/handlers/SS/deckSearch';
import type { GameState } from '@/lib/engine/types';

registerAllSetHandlers();

function avecDeck(base: GameState, ids: string[]): GameState {
  return { ...base, player1: { ...base.player1, deck: ids.map((i) => getCardById(i) as never) } };
}

function jusquAuBout(depart: GameState): GameState {
  let s = depart;
  for (let i = 0; i < 5 && s.pendingEffects.length > 0; i++) {
    const p = s.pendingEffects[s.pendingEffects.length - 1];
    const cibles = p.validTargets ?? [];
    if (cibles.length === 0) break;
    s = EffectEngine.applyTargetedEffect(s, p, [cibles[0]]);
    s = {
      ...s,
      pendingEffects: s.pendingEffects.filter((pe) => pe.id !== p.id),
      pendingActions: s.pendingActions.filter((pa) => pa.sourceEffectId !== p.id),
    };
  }
  return s;
}

describe('phase 3, la fouille de deck partagee par trois cartes', () => {
  it('chaque fouille ne retient que ce que son texte accepte', () => {
    const base = buildSimState({ p1: [], p2: [], missions: 1 });
    const deck = avecDeck(base, ['KS-009-C', 'SS-004-UC', 'SS-080-C', 'SS-126-R', 'SS-090-UC']);

    const jiraiya = FOUILLES.find((f) => f.id === 'SS-004-UC')!;
    const fugaku = FOUILLES.find((f) => f.id === 'SS-058-UC')!;
    const suiko = FOUILLES.find((f) => f.id === 'SS-074-C')!;

    expect(candidatsDeFouille(deck, 'player1', jiraiya), 'le Sannin dans les trois premieres').toEqual([1]);
    expect(candidatsDeFouille(deck, 'player1', fugaku), 'aucun Uchiwa dans les trois premieres').toEqual([]);
    expect(candidatsDeFouille(deck, 'player1', suiko), 'les deux armes dans les cinq premieres').toEqual([2, 4]);
  });

  it('la carte choisie part en main et les autres repartent au fond', () => {
    const jiraiya = simChar('SS-004-UC', { owner: 'player1' });
    const base = buildSimState({ p1: [jiraiya], p2: [], missions: 1 });
    const s = avecDeck(base, ['KS-009-C', 'SS-004-UC', 'KS-010-C', 'KS-005-C']);

    const joue = EffectEngine.resolvePlayEffects(s, 'player1', jiraiya, 0, false);
    const fin = jusquAuBout(joue);

    expect(fin.player1.hand.some((c) => c.id === 'SS-004-UC'), 'le Sannin est en main').toBe(true);
    expect(fin.player1.deck.length, 'les deux autres et la quatrieme restent').toBe(3);
    expect(fin.player1.deck[0].id, 'la carte hors des trois premieres est passee devant').toBe('KS-005-C');
  });

  it('une fouille sans candidat se contente de le dire', () => {
    const fugaku = simChar('SS-058-UC', { owner: 'player1' });
    const base = buildSimState({ p1: [fugaku], p2: [], missions: 1 });
    const s = avecDeck(base, ['KS-009-C', 'KS-010-C', 'KS-005-C']);

    const joue = EffectEngine.resolvePlayEffects(s, 'player1', fugaku, 0, false);
    expect(joue.pendingEffects.length, 'aucune question posee').toBe(0);
    expect(joue.log.some((l) => l.messageKey === 'game.log.effect.noTarget'), 'le refus est journalise').toBe(true);
  });

  it('les textes de la fouille existent dans les sept langues', async () => {
    const manquantes: string[] = [];
    for (const langue of ['en', 'fr', 'es', 'ja', 'pt', 'it', 'pl']) {
      const messages = (await import(`@/messages/${langue}.json`)).default as Record<string, unknown>;
      for (const cle of ['game.effect.desc.ssDeckSearchTake', 'game.log.effect.ssDeckSearchTaken']) {
        let noeud: unknown = messages;
        for (const partie of cle.split('.')) noeud = (noeud as Record<string, unknown> | undefined)?.[partie];
        if (typeof noeud !== 'string' || noeud.trim() === '') manquantes.push(`${langue}:${cle}`);
      }
    }
    expect(manquantes).toEqual([]);
  });
});

describe('phase 3, la consultation des cartes cachees', () => {
  it('Shikamaru 11 propose les caches des deux camps, le Corps de Chiens 59 seulement ceux d en face', () => {
    const shika = simChar('SS-011-C', { owner: 'player1' });
    const chiens = simChar('SS-059-C', { owner: 'player1' });
    const cacheAllie = simChar('KS-009-C', { owner: 'player1', hidden: true });
    const cacheEnnemi = simChar('KS-010-C', { owner: 'player2', hidden: true });
    const s = buildSimState({ p1: [shika, chiens, cacheAllie], p2: [cacheEnnemi], missions: 1 });

    const parShika = EffectEngine.resolvePlayEffects(s, 'player1', shika, 0, false);
    const relaisShika = JSON.parse(parShika.pendingEffects[0].effectDescription) as { targets?: string[] };
    expect(relaisShika.targets?.sort(), 'les deux caches').toEqual([cacheAllie.instanceId, cacheEnnemi.instanceId].sort());

    const parChiens = EffectEngine.resolvePlayEffects(s, 'player1', chiens, 0, false);
    const relaisChiens = JSON.parse(parChiens.pendingEffects[0].effectDescription) as { targets?: string[] };
    expect(relaisChiens.targets, 'seulement l ennemi').toEqual([cacheEnnemi.instanceId]);
  });

  it('regarder une carte cachee la rend visible pour celui qui a regarde, pas pour l autre', () => {
    const shika = simChar('SS-011-C', { owner: 'player1' });
    const cacheEnnemi = simChar('KS-010-C', { owner: 'player2', hidden: true });
    const s = buildSimState({ p1: [shika], p2: [cacheEnnemi], missions: 1 });

    const fin = jusquAuBout(EffectEngine.resolvePlayEffects(s, 'player1', shika, 0, false));
    const vuParMoi = GameEngine.getVisibleState(fin, 'player1').activeMissions[0].player2Characters[0];
    const vuParLui = GameEngine.getVisibleState(fin, 'player2').activeMissions[0].player1Characters[0];
    expect(vuParMoi.card, 'je vois la carte que j ai regardee').toBeTruthy();
    expect(vuParLui, 'et lui ne voit rien de nouveau chez moi').toBeTruthy();
  });

  it('le Corps de Chiens 59 gagne autant de jetons que le cout du cache regarde', () => {
    const chiens = simChar('SS-059-C', { owner: 'player1' });
    const cacheEnnemi = simChar('SS-054-UC', { owner: 'player2', hidden: true });
    const s = buildSimState({ p1: [chiens], p2: [cacheEnnemi], missions: 1 });

    const fin = jusquAuBout(EffectEngine.resolvePlayEffects(s, 'player1', chiens, 0, false));
    const chiensFin = fin.activeMissions[0].player1Characters.find((c) => c.instanceId === chiens.instanceId)!;
    expect(chiensFin.powerTokens, 'le cout imprime du cache, cinq').toBe(5);
  });

  it('Ibiki 28 envoie vraiment la carte du dessus adverse au fond', () => {
    const ibiki = simChar('SS-028-UC', { owner: 'player1' });
    const base = buildSimState({ p1: [ibiki], p2: [], missions: 1 });
    const s: GameState = {
      ...base,
      player2: { ...base.player2, deck: ['KS-009-C', 'KS-010-C', 'KS-005-C'].map((i) => getCardById(i) as never) },
    };

    const fin = jusquAuBout(EffectEngine.resolvePlayEffects(s, 'player1', ibiki, 0, false));
    expect(fin.player2.deck.map((c) => c.id), 'la premiere est passee derniere').toEqual(['KS-010-C', 'KS-005-C', 'KS-009-C']);
  });

  it('les textes de la consultation existent dans les sept langues', async () => {
    const manquantes: string[] = [];
    const cles = [
      'game.effect.desc.ssPeekHidden',
      'game.effect.desc.ssPeekHiddenPowerup',
      'game.effect.desc.ss028BottomOrKeep',
      'game.log.effect.ssPeeked',
      'game.log.effect.ss028Bottom',
    ];
    for (const langue of ['en', 'fr', 'es', 'ja', 'pt', 'it', 'pl']) {
      const messages = (await import(`@/messages/${langue}.json`)).default as Record<string, unknown>;
      for (const cle of cles) {
        let noeud: unknown = messages;
        for (const partie of cle.split('.')) noeud = (noeud as Record<string, unknown> | undefined)?.[partie];
        if (typeof noeud !== 'string' || noeud.trim() === '') manquantes.push(`${langue}:${cle}`);
      }
    }
    expect(manquantes).toEqual([]);
  });
});
