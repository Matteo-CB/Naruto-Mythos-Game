import { describe, it, expect, beforeAll } from 'vitest';
import { allCardData } from '@/lib/data/sets';
import { isCopyableEffect, isEffectAlteration } from '@/lib/effects/handlers/KS/shared/copyExclusions';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { GameEngine } from '@/lib/engine/GameEngine';
import type { CardData, GameState } from '@/lib/engine/types';

beforeAll(() => { initializeRegistry(); });

interface EffetImprime { type: string; description: string }

function personnages(): Array<CardData & { effects?: EffetImprime[] }> {
  return Object.values(allCardData.cards as Record<string, CardData & { effects?: EffetImprime[] }>)
    .filter((c) => c.card_type === 'character');
}

function estContinu(e: EffetImprime): boolean {
  return (e.description ?? '').includes('[⧗]');
}

function raisonDeNonCopie(e: EffetImprime): string | null {
  if (e.type === 'SCORE') return 'SCORE';
  if (estContinu(e)) return 'continu';
  if (isEffectAlteration(e.description)) return 'alteration';
  return null;
}

function contexteQuiRemplitLaCondition(e: EffetImprime) {
  if (e.type === 'AMBUSH') return { wasRevealed: true };
  if (e.type === 'FIRST_STRIKE') return { wasFirstCard: true };
  if (e.type === 'UPGRADE') return { wasUpgrade: true };
  return {};
}

const TOUS_LES_CONTEXTES = [
  { wasRevealed: false, wasFirstCard: false, wasUpgrade: false },
  { wasRevealed: true, wasFirstCard: true, wasUpgrade: true },
];

describe('aucune carte ne devient incopiable par accident', () => {
  it('tout effet instantane du jeu est copiable dans le contexte qui le permet', () => {
    const fautifs: string[] = [];

    for (const carte of personnages()) {
      for (const effet of carte.effects ?? []) {
        if (raisonDeNonCopie(effet)) continue;

        if (!isCopyableEffect(effet, contexteQuiRemplitLaCondition(effet))) {
          fautifs.push(`${carte.id} ${carte.name_fr}: ${effet.type} refuse alors que rien ne l interdit`);
        }
      }
    }

    expect(
      fautifs,
      'un effet instantane qui n est ni SCORE, ni continu, ni une alteration doit '
      + 'toujours pouvoir etre copie par un copieur qui remplit sa condition:\n' + fautifs.join('\n'),
    ).toEqual([]);
  });

  it('une carte dont rien n est copiable a toujours une raison imprimee', () => {
    const sansRaison: string[] = [];
    let muettes = 0;

    for (const carte of personnages()) {
      const effets = carte.effects ?? [];
      if (effets.length === 0) continue;

      const copiable = effets.some((e) => TOUS_LES_CONTEXTES.some((ctx) => isCopyableEffect(e, ctx)));
      if (copiable) continue;

      muettes += 1;
      const sansExplication = effets.filter((e) => !raisonDeNonCopie(e));
      if (sansExplication.length > 0) {
        sansRaison.push(`${carte.id} ${carte.name_fr}: ${sansExplication.map((e) => e.type).join(', ')}`);
      }
    }

    expect(muettes, 'le jeu contient bien des cartes purement continues ou SCORE').toBeGreaterThan(0);
    expect(
      sansRaison,
      'une carte que personne ne peut copier doit le devoir a son texte imprime, jamais a une '
      + 'donnee mal saisie: un marqueur oublie ou un type errone rend l effet muet en silence.\n'
      + sansRaison.join('\n'),
    ).toEqual([]);
  });

  it('la condition de chaque type suit le texte imprime, sans exception de carte', () => {
    for (const carte of personnages()) {
      for (const effet of carte.effects ?? []) {
        if (raisonDeNonCopie(effet)) {
          for (const ctx of TOUS_LES_CONTEXTES) {
            expect(isCopyableEffect(effet, ctx), `${carte.id} ${effet.type} ne doit jamais etre copiable`).toBe(false);
          }
          continue;
        }
        if (effet.type === 'AMBUSH') {
          expect(isCopyableEffect(effet, { wasRevealed: false, wasFirstCard: true, wasUpgrade: true }), `${carte.id} AMBUSH sans revelation`).toBe(false);
          expect(isCopyableEffect(effet, { wasRevealed: true }), `${carte.id} AMBUSH apres revelation`).toBe(true);
        } else if (effet.type === 'FIRST_STRIKE') {
          expect(isCopyableEffect(effet, { wasRevealed: true, wasFirstCard: false, wasUpgrade: true }), `${carte.id} FIRST STRIKE hors premiere carte`).toBe(false);
          expect(isCopyableEffect(effet, { wasFirstCard: true }), `${carte.id} FIRST STRIKE en premiere carte`).toBe(true);
        } else if (effet.type === 'UPGRADE') {
          expect(isCopyableEffect(effet, { wasRevealed: true, wasFirstCard: true, wasUpgrade: false }), `${carte.id} UPGRADE sans amelioration`).toBe(false);
          expect(isCopyableEffect(effet, { wasUpgrade: true }), `${carte.id} UPGRADE apres amelioration`).toBe(true);
        } else {
          expect(isCopyableEffect(effet, {}), `${carte.id} ${effet.type} toujours copiable`).toBe(true);
        }
      }
    }
  });
});

describe('SAKON 062 offre exactement les Sound Four que la regle autorise', () => {
  function soundFour(): Array<CardData & { effects?: EffetImprime[] }> {
    return personnages().filter((c) => (c.keywords ?? []).includes('Sound Four') && c.id !== 'KS-062-UC');
  }

  function plateau(autre: string): GameState {
    const s = buildSimState({ p1: [], p2: [], missions: 2, chakra1: 40, edgeHolder: 'player1' });
    s.phase = 'action';
    s.activePlayer = 'player1';
    s.player1.hand = [];
    s.firstStrike = { player1: 'available', player2: 'available' };
    s.activeMissions[1].player1Characters.push(
      simChar(autre, { owner: 'player1', instanceId: 'autre', missionIndex: 1 }) as never,
    );
    s.activeMissions[0].player1Characters.push({
      ...simChar('KS-062-UC', { owner: 'player1', instanceId: 'sakon' }),
      isHidden: true,
    } as never);
    return s;
  }

  it('chaque Sound Four est propose si et seulement si son texte le permet', () => {
    const divergences: string[] = [];
    const cartes = soundFour();
    expect(cartes.length, 'le jeu contient bien des Sound Four').toBeGreaterThan(5);

    for (const carte of cartes) {
      const attendu = (carte.effects ?? []).some((e) => isCopyableEffect(e, { wasRevealed: true, wasFirstCard: true }));

      const apres = GameEngine.applyAction(plateau(carte.id), 'player1', {
        type: 'REVEAL_CHARACTER', missionIndex: 0, characterInstanceId: 'sakon',
      } as never);
      const propose = apres.pendingActions.some((p) => p.descriptionKey === 'game.effect.desc.sakon062ConfirmAmbush');

      if (propose !== attendu) {
        const detail = (carte.effects ?? []).map((e) => `${e.type}${estContinu(e) ? '[continu]' : ''}`).join(' + ');
        divergences.push(`${carte.id} ${carte.name_fr} (${detail}): propose=${propose}, attendu=${attendu}`);
      }
    }

    expect(
      divergences,
      'ce que Sakon propose doit coller exactement au texte des cartes en jeu:\n' + divergences.join('\n'),
    ).toEqual([]);
  });

  it('le refus est journalise, il ne reste jamais silencieux', () => {
    const apres = GameEngine.applyAction(plateau('KS-125-R'), 'player1', {
      type: 'REVEAL_CHARACTER', missionIndex: 0, characterInstanceId: 'sakon',
    } as never);
    expect(
      apres.log.some((l) => l.messageKey === 'game.log.effect.noTarget'),
      'TAYUYA 125 ne porte quun MAIN continu et un UPGRADE, le refus doit etre annonce',
    ).toBe(true);
  });
});

describe('SAKON 062 pose en amelioration peut copier un UPGRADE', () => {
  function plateauAmelioration(autre: string): GameState {
    const s = buildSimState({ p1: [], p2: [], missions: 2, chakra1: 40, edgeHolder: 'player1' });
    s.phase = 'action';
    s.activePlayer = 'player1';
    s.player1.hand = [];
    s.firstStrike = { player1: 'available', player2: 'available' };
    s.activeMissions[1].player1Characters.push(
      simChar(autre, { owner: 'player1', instanceId: 'autre', missionIndex: 1 }) as never,
    );
    s.activeMissions[0].player1Characters.push(
      simChar('KS-061-C', { owner: 'player1', instanceId: 'socle' }) as never,
    );
    s.activeMissions[0].player1Characters.push({
      ...simChar('KS-062-UC', { owner: 'player1', instanceId: 'sakon' }),
      isHidden: true,
    } as never);
    return s;
  }

  function reveleEnAmelioration(autre: string): GameState {
    return GameEngine.applyAction(plateauAmelioration(autre), 'player1', {
      type: 'REVEAL_CHARACTER', missionIndex: 0, characterInstanceId: 'sakon',
      upgradeTargetInstanceId: 'socle',
    } as never);
  }

  function proposeLaCopie(s: GameState): boolean {
    return s.pendingActions.some((p) => p.descriptionKey === 'game.effect.desc.sakon062ConfirmAmbush');
  }

  it('TAYUYA 125, dont seul l UPGRADE est copiable, devient une cible', () => {
    expect(
      proposeLaCopie(reveleEnAmelioration('KS-125-R')),
      'son MAIN est continu et son UPGRADE demande une amelioration: SAKON ameliore remplit la condition',
    ).toBe(true);
  });

  it('la meme TAYUYA reste refusee quand SAKON est revele sans ameliorer', () => {
    const sansSocle = plateauAmelioration('KS-125-R');
    sansSocle.activeMissions[0].player1Characters =
      sansSocle.activeMissions[0].player1Characters.filter((c) => c.instanceId !== 'socle');
    const apres = GameEngine.applyAction(sansSocle, 'player1', {
      type: 'REVEAL_CHARACTER', missionIndex: 0, characterInstanceId: 'sakon',
    } as never);
    expect(proposeLaCopie(apres), 'sans amelioration, aucun UPGRADE n est copiable').toBe(false);
  });

  it('KAKASHI 016 refuse les UPGRADE meme en amelioration, son texte l interdit', async () => {
    const { isCopyableEffect: predicat } = await import('@/lib/effects/handlers/KS/shared/copyExclusions');
    const upgradeDeTayuya = (allCardData.cards as Record<string, CardData & { effects?: EffetImprime[] }>)['KS-125-R']
      .effects!.find((e) => e.type === 'UPGRADE')!;
    expect(predicat(upgradeDeTayuya, { wasUpgrade: true, copieur: 'KS-062-UC' })).toBe(true);
    expect(
      predicat(upgradeDeTayuya, { wasUpgrade: true, copieur: 'KS-016-UC' }),
      'KAKASHI 016 imprime "non-upgrade"',
    ).toBe(false);
  });
});
