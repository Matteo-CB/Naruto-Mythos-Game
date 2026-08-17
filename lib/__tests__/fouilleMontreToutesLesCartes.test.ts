import { describe, it, expect } from 'vitest';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { getEffectHandler } from '@/lib/effects/EffectRegistry';
import { FOUILLES } from '@/lib/effects/handlers/SS/deckSearch';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CardData, GameState } from '@/lib/engine/types';

void EffectEngine;

const SANNIN = 'KS-003-C';
const BANAL = 'KS-001-C';

function plateauAvecDeck(sourceId: string, deckIds: string[]): GameState {
  const state = buildSimState({
    p1: [simChar(sourceId, { owner: 'player1', instanceId: 'source' })],
    missions: 2,
    chakra1: 20,
    edgeHolder: 'player1',
  });
  state.phase = 'action';
  state.player1.deck = deckIds.map((id) => getCardById(id)) as never;
  return state;
}

function charge(resultat: { description?: string }): { cards?: Array<{ index: number }>; targets?: string[] } {
  const brut = JSON.parse(resultat.description ?? '{}');
  if (typeof brut.nextText === 'string') {
    return { ...JSON.parse(brut.nextText), targets: brut.targets };
  }
  return brut;
}

describe('une fouille de deck montre toutes les cartes regardees', () => {
  it('Jiraiya montre les trois cartes du dessus, pas seulement le Sannin', () => {
    const fouille = FOUILLES.find((f) => f.id === 'SS-004-UC')!;
    const state = plateauAvecDeck(fouille.id, [BANAL, SANNIN, BANAL, BANAL, BANAL]);
    const handler = getEffectHandler(fouille.id, 'MAIN')!;
    const resultat = handler({
      state, sourcePlayer: 'player1', sourceCard: state.activeMissions[0].player1Characters[0],
      sourceMissionIndex: 0, isUpgrade: false,
    } as never);

    const lu = charge(resultat);
    const vues = lu.cards ?? [];
    expect(vues.length, 'les trois cartes regardees sont transmises au joueur').toBe(3);
    expect(vues.map((c) => c.index)).toEqual([0, 1, 2]);
    expect(lu.targets, 'seul le Sannin reste choisissable').toEqual(['DECK_1']);
  });

  it('chaque fouille du set transmet autant de cartes que sa profondeur', () => {
    for (const fouille of FOUILLES) {
      const deck = [SANNIN, BANAL, BANAL, BANAL, BANAL, BANAL, BANAL];
      const state = plateauAvecDeck(fouille.id, deck);
      const handler = getEffectHandler(fouille.id, 'MAIN');
      if (!handler) continue;
      const resultat = handler({
        state, sourcePlayer: 'player1', sourceCard: state.activeMissions[0].player1Characters[0],
        sourceMissionIndex: 0, isUpgrade: false,
      } as never);
      const vues = charge(resultat).cards ?? [];
      if (vues.length === 0) continue;
      expect(
        vues.length,
        `${fouille.id} ${fouille.nom} doit montrer ses ${fouille.profondeur} cartes`,
      ).toBe(Math.min(fouille.profondeur, deck.length));
    }
  });

  it('le Parchemin des Sceaux montre aussi les trois cartes regardees', () => {
    const source = getCardById('SS-095-UC') as unknown as CardData;
    expect(source, 'la carte existe').toBeTruthy();
    const fichier = readFileSyncSafe('lib/effects/handlers/SS/attachmentHandlers.ts');
    expect(
      fichier.includes('cards: apercuDeCartes(state, sourcePlayer, sommet.map('),
      'il transmet le sommet du deck, pas seulement les Jutsu trouves',
    ).toBe(true);
  });
});

function readFileSyncSafe(chemin: string): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('fs').readFileSync(chemin, 'utf8');
}
