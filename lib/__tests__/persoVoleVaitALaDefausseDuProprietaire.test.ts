import { describe, it, expect } from 'vitest';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import type { GameState } from '@/lib/engine/types';

const VOLE = 'KS-013-C';
const VOLEUR = 'KS-011-C';

function plateauAvecVol(): GameState {
  const s = buildSimState({
    p1: [
      simChar(VOLEUR, { owner: 'player1', instanceId: 'voleur' }),
      simChar(VOLE, { owner: 'player2', instanceId: 'vole' }),
    ],
    missions: 2, chakra1: 30, edgeHolder: 'player1',
  });
  s.phase = 'action';
  const vole = s.activeMissions[0].player1Characters.find((c) => c.instanceId === 'vole')!;
  vole.controlledBy = 'player1';
  vole.originalOwner = 'player2';
  vole.controllerInstanceId = 'voleur';
  return s;
}

describe('un personnage vole rejoint la defausse de son proprietaire quand il est vaincu', () => {
  it('la carte ne disparait pas et va chez son proprietaire', () => {
    const depart = plateauAvecVol();
    expect(depart.player2.discardPile.length, 'defausse du proprietaire vide au depart').toBe(0);

    const apres = EffectEngine.defeatCharacter(depart, 'vole', 'player2');

    expect(
      apres.activeMissions[0].player1Characters.some((c) => c.instanceId === 'vole'),
      'il quitte bien le plateau',
    ).toBe(false);
    expect(
      apres.player2.discardPile.map((c) => c.id),
      'la carte revient a son proprietaire',
    ).toContain(VOLE);
    expect(
      apres.player1.discardPile.map((c) => c.id),
      'et pas dans la defausse du voleur',
    ).not.toContain(VOLE);
  });

  it('une pile volee entiere part chez le proprietaire', () => {
    const depart = plateauAvecVol();
    const vole = depart.activeMissions[0].player1Characters.find((c) => c.instanceId === 'vole')!;
    vole.stack = [vole.card, { ...vole.card, id: 'KS-015-C' } as never];

    const apres = EffectEngine.defeatCharacter(depart, 'vole', 'player2');
    expect(apres.player2.discardPile.length, 'les deux cartes de la pile').toBe(2);
    expect(apres.player1.discardPile.length, 'rien pour le voleur').toBe(0);
  });

  it('aucune carte ne se perd en route', () => {
    const depart = plateauAvecVol();
    const total = () => (s: GameState) => s.player1.discardPile.length + s.player2.discardPile.length
      + s.activeMissions.flatMap((m) => [...m.player1Characters, ...m.player2Characters]).length;
    const avant = total()(depart);
    const apres = EffectEngine.defeatCharacter(depart, 'vole', 'player2');
    expect(total()(apres), 'le compte des cartes est conserve').toBe(avant);
  });
});

describe('quand le voleur meurt, la carte volee revient a son proprietaire', () => {
  it('elle retourne en jeu du cote de son proprietaire', () => {
    const depart = plateauAvecVol();
    const apres = EffectEngine.defeatCharacter(depart, 'voleur', 'player2');
    const chezProprietaire = apres.activeMissions[0].player2Characters.some((c) => c.instanceId === 'vole');
    const chezVoleur = apres.activeMissions[0].player1Characters.some((c) => c.instanceId === 'vole');
    expect(chezProprietaire || chezVoleur, 'la carte existe toujours quelque part').toBe(true);
    expect(chezProprietaire, 'elle est rendue a son proprietaire').toBe(true);
  });

  it('si un homonyme occupe deja la place, elle part a la defausse du proprietaire, pas dans le vide', () => {
    const depart = plateauAvecVol();
    depart.activeMissions[0].player2Characters.push(
      simChar(VOLE, { owner: 'player2', instanceId: 'jumeau' }),
    );

    const apres = EffectEngine.defeatCharacter(depart, 'voleur', 'player2');
    const encoreEnJeu = apres.activeMissions
      .flatMap((m) => [...m.player1Characters, ...m.player2Characters])
      .some((c) => c.instanceId === 'vole');

    expect(encoreEnJeu, 'la regle du nom unique la retire du plateau').toBe(false);
    expect(
      apres.player2.discardPile.map((c) => c.id),
      'mais elle rejoint bien la defausse de son proprietaire',
    ).toContain(VOLE);
  });
});
