import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { getCardById } from '@/lib/data/cardIndex';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { defeatCharacterInPlay } from '@/lib/effects/defeatUtils';
import { rescueOrphanedAttachments } from '@/lib/effects/attachments';
import type { CharacterCard, GameState, PlayerID } from '@/lib/engine/types';

const RACINE = process.cwd();
const PORTEUR = 'KS-009-C';
const AMELIORATION = 'KS-010-C';
const EQUIPEMENT = 'SS-084-C';
const AUTRE_EQUIPEMENT = 'SS-101-UC';

function carte(id: string): CharacterCard {
  return getCardById(id) as CharacterCard;
}

function plateau(equipements: Array<{ id: string; owner: PlayerID }>, pile?: string[]): GameState {
  const state = buildSimState({
    p1: [simChar(PORTEUR, { owner: 'player1', instanceId: 'porteur' })],
    p2: [],
    missions: 2,
    chakra1: 5,
  });
  const c = state.activeMissions[0].player1Characters[0];
  if (pile) c.stack = pile.map(carte);
  (c as unknown as { attachments: unknown[] }).attachments = equipements.map((e, i) => ({
    instanceId: `eq${i}`, card: carte(e.id), owner: e.owner, isHidden: false,
  }));
  state.activePlayer = 'player1';
  state.phase = 'action';
  return state;
}

function pile(state: GameState, joueur: PlayerID = 'player1'): string[] {
  return state[joueur].discardPile.map((c) => c.id);
}

function vaincre(state: GameState): GameState {
  return defeatCharacterInPlay(state, 0, 'porteur', 'player1Characters', false, 'player1');
}

describe("l equipement rejoint la defausse SOUS le personnage, comme une amelioration", () => {
  beforeAll(() => { initializeRegistry(); });

  it('la defausse se lit du bas vers le haut, la derniere carte posee est celle du dessus', () => {
    const vue = readFileSync(join(RACINE, 'components/game/SidePiles.tsx'), 'utf8');
    expect(vue, 'la carte visible sur la pile est la derniere du tableau')
      .toContain('discardPile[discardCount - 1]');
    const apercu = readFileSync(join(RACINE, 'components/game/DiscardPileViewer.tsx'), 'utf8');
    expect(apercu, 'et l apercu montre la plus recente en premier').toContain('[...cards].reverse()');
  });

  it('un personnage vaincu laisse son equipement dessous', () => {
    const apres = vaincre(plateau([{ id: EQUIPEMENT, owner: 'player1' }]));
    expect(pile(apres)).toEqual([EQUIPEMENT, PORTEUR]);
  });

  it('avec une pile amelioree, l equipement passe sous toute la pile', () => {
    const apres = vaincre(plateau([{ id: EQUIPEMENT, owner: 'player1' }], [PORTEUR, AMELIORATION]));
    expect(pile(apres), 'exactement comme les cartes d une amelioration')
      .toEqual([EQUIPEMENT, PORTEUR, AMELIORATION]);
  });

  it('deux equipements finissent tous les deux sous le personnage', () => {
    const apres = vaincre(plateau([
      { id: EQUIPEMENT, owner: 'player1' },
      { id: AUTRE_EQUIPEMENT, owner: 'player1' },
    ]));
    const ids = pile(apres);
    expect(ids[ids.length - 1], 'le personnage reste au sommet').toBe(PORTEUR);
    expect(ids.slice(0, -1).sort(), 'les deux equipements sont dessous')
      .toEqual([EQUIPEMENT, AUTRE_EQUIPEMENT].sort());
  });

  it('le filet de securite depose lui aussi l equipement dessous', () => {
    const avant = plateau([{ id: EQUIPEMENT, owner: 'player1' }]);
    const brut = JSON.parse(JSON.stringify(avant)) as GameState;
    const perso = brut.activeMissions[0].player1Characters[0];
    brut.activeMissions[0].player1Characters = [];
    brut.player1.discardPile = [...brut.player1.discardPile, perso.card];

    const apres = rescueOrphanedAttachments(avant, brut);
    expect(
      pile(apres),
      'un chemin de retrait qui oublie l equipement ne doit pas le poser sur le personnage',
    ).toEqual([EQUIPEMENT, PORTEUR]);
  });

  it('le filet respecte ce qui etait deja dans la defausse avant l action', () => {
    const avant = plateau([{ id: EQUIPEMENT, owner: 'player1' }]);
    avant.player1.discardPile = [carte(AMELIORATION)];
    const brut = JSON.parse(JSON.stringify(avant)) as GameState;
    const perso = brut.activeMissions[0].player1Characters[0];
    brut.activeMissions[0].player1Characters = [];
    brut.player1.discardPile = [...brut.player1.discardPile, perso.card];

    const apres = rescueOrphanedAttachments(avant, brut);
    expect(
      pile(apres),
      'l ancienne carte reste tout en bas, l equipement se glisse juste sous le personnage',
    ).toEqual([AMELIORATION, EQUIPEMENT, PORTEUR]);
  });

  it('appliquer le filet apres un chemin qui a deja range ne duplique rien', () => {
    const avant = plateau([{ id: EQUIPEMENT, owner: 'player1' }]);
    const apres = rescueOrphanedAttachments(avant, vaincre(avant));
    expect(pile(apres)).toEqual([EQUIPEMENT, PORTEUR]);
  });

  it('un equipement appartenant a l adversaire va dans SA defausse, pas dans celle du porteur', () => {
    const apres = vaincre(plateau([{ id: EQUIPEMENT, owner: 'player2' }]));
    expect(pile(apres), 'le porteur ne recupere que ses propres cartes').toEqual([PORTEUR]);
    expect(pile(apres, 'player2'), 'le proprietaire recupere son equipement').toEqual([EQUIPEMENT]);
  });

  it('la fonction de glissement est bien celle utilisee par le filet', () => {
    const source = readFileSync(join(RACINE, 'lib/effects/attachments.ts'), 'utf8');
    const bloc = source.slice(
      source.indexOf('export function rescueOrphanedAttachments'),
      source.indexOf('export function enforceAttachmentConditions'),
    );
    expect(bloc, 'le filet insere au lieu d empiler').toContain('glisserSousLesCartesDeLAction');
    expect(bloc, 'le point d insertion est la hauteur de la defausse avant l action')
      .toContain('before[owner].discardPile.length');
    expect(bloc, 'plus d ajout en fin de pile').not.toContain('discardAttachmentsOnLeave');
  });
});
