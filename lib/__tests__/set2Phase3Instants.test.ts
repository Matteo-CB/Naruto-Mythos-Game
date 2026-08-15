import { describe, it, expect } from 'vitest';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { registerAllSetHandlers } from '@/lib/effects/handlers';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
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
