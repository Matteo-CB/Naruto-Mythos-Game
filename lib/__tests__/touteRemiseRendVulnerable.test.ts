import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { calculateEffectiveCost } from '@/lib/engine/rules/ChakraValidation';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getAllCards } from '@/lib/data/cardLoader';
import type { CharacterCard, GameState } from '@/lib/engine/types';

void EffectEngine;

function plateauRiche(): GameState {
  const s = buildSimState({
    p1: [
      simChar('KS-057-C', { owner: 'player1', instanceId: 'son4' }),
      simChar('KS-009-C', { owner: 'player1', instanceId: 'naruto' }),
      simChar('KS-030-C', { owner: 'player1', instanceId: 'team8' }),
      simChar('SS-051-UC', { owner: 'player1', instanceId: 'sable' }),
    ],
    p2: [simChar('KS-062-UC', { owner: 'player2', instanceId: 'jutsuEnnemi' })],
    missions: 2, chakra1: 60, edgeHolder: 'player1',
  });
  s.phase = 'action';
  s.player1.discardPile = [getAllCards().find((c) => c.card_type === 'character') as CharacterCard];
  return s;
}

function joue(carte: CharacterCard): { attendu: boolean; obtenu: boolean | undefined } | null {
  const s = plateauRiche();
  s.player1.hand = [carte];
  const imprime = carte.chakra ?? 0;
  const effectif = calculateEffectiveCost(s, 'player1', carte, 0, false);
  const attendu = effectif < imprime;

  const apres = GameEngine.applyAction(s, 'player1', {
    type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false,
  } as never);
  const pose = apres.activeMissions[0].player1Characters.find(
    (c) => c.instanceId !== 'son4' && c.instanceId !== 'naruto' && c.instanceId !== 'team8' && c.instanceId !== 'sable',
  );
  if (!pose) return null;
  return { attendu, obtenu: pose.playedBelowPrintedCost };
}

describe('toute carte payee sous son cout imprime est vulnerable a ZABUZA 136', () => {
  it('le marqueur suit exactement le calcul de prix, sur toutes les cartes du jeu', () => {
    const incoherentes: string[] = [];
    let remisesObservees = 0;

    for (const carte of getAllCards()) {
      if (carte.card_type !== 'character') continue;
      if ((carte.chakra ?? 0) > 8) continue;
      let r: { attendu: boolean; obtenu: boolean | undefined } | null = null;
      try { r = joue(carte as CharacterCard); } catch { continue; }
      if (!r) continue;
      if (r.attendu) remisesObservees += 1;
      if (r.attendu !== (r.obtenu === true)) {
        incoherentes.push(`${carte.id} ${carte.name_fr}: remise=${r.attendu} marqueur=${r.obtenu}`);
      }
    }

    expect(remisesObservees, 'le plateau declenche bien des remises').toBeGreaterThan(0);
    expect(
      incoherentes,
      `Ces cartes sont payees sous leur cout imprime sans etre marquees, ZABUZA MOMOCHI 136 les ignorerait:\n  ${incoherentes.join('\n  ')}`,
    ).toEqual([]);
  });
});

function revele(carte: CharacterCard): { attendu: boolean; obtenu: boolean | undefined } | null {
  const s = plateauRiche();
  s.activeMissions[0].player1Characters.push(
    simChar(carte.id, { owner: 'player1', instanceId: 'sujet', hidden: true }),
  );
  const imprime = carte.chakra ?? 0;
  const sujet = s.activeMissions[0].player1Characters.find((c) => c.instanceId === 'sujet')!;
  const effectif = calculateEffectiveCost(s, 'player1', carte, 0, true, sujet);
  const attendu = effectif < imprime;

  const apres = GameEngine.applyAction(s, 'player1', {
    type: 'REVEAL_CHARACTER', missionIndex: 0, characterInstanceId: 'sujet',
  } as never);
  const vu = apres.activeMissions.flatMap((m) => m.player1Characters).find((c) => c.instanceId === 'sujet');
  if (!vu || vu.isHidden) return null;
  return { attendu, obtenu: vu.playedBelowPrintedCost };
}

describe('la revelation marque aussi les cartes payees moins cher', () => {
  it('TENTEN 021 revelee en premiere carte du tour coute zero et reste vulnerable', () => {
    const tenten = getAllCards().find((c) => c.id === 'SS-021-C') as CharacterCard;
    const r = revele(tenten);
    expect(r, 'la revelation aboutit').not.toBeNull();
    expect(r!.attendu, 'un chakra de moins sur un cout de un, donc zero').toBe(true);
    expect(r!.obtenu, 'et elle est bien marquee').toBe(true);
  });

  it('le marqueur suit le calcul de prix sur toutes les revelations', () => {
    const incoherentes: string[] = [];
    for (const carte of getAllCards()) {
      if (carte.card_type !== 'character') continue;
      if ((carte.chakra ?? 0) > 8) continue;
      let r: { attendu: boolean; obtenu: boolean | undefined } | null = null;
      try { r = revele(carte as CharacterCard); } catch { continue; }
      if (!r) continue;
      if (r.attendu !== (r.obtenu === true)) {
        incoherentes.push(`${carte.id} ${carte.name_fr}: remise=${r.attendu} marqueur=${r.obtenu}`);
      }
    }
    expect(
      incoherentes,
      `Ces revelations sont payees moins cher sans etre marquees:\n  ${incoherentes.join('\n  ')}`,
    ).toEqual([]);
  });
});
