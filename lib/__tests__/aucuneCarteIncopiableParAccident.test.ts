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
  if (e.type === 'UPGRADE') return 'UPGRADE';
  if (estContinu(e)) return 'continu';
  if (isEffectAlteration(e.description)) return 'alteration';
  return null;
}

const TOUS_LES_CONTEXTES = [
  { wasRevealed: false, wasFirstCard: false },
  { wasRevealed: true, wasFirstCard: false },
  { wasRevealed: false, wasFirstCard: true },
  { wasRevealed: true, wasFirstCard: true },
];

describe('aucune carte ne devient incopiable par accident', () => {
  it('tout effet instantane du jeu est copiable dans le contexte qui le permet', () => {
    const fautifs: string[] = [];

    for (const carte of personnages()) {
      for (const effet of carte.effects ?? []) {
        if (raisonDeNonCopie(effet)) continue;

        const contexte = effet.type === 'AMBUSH'
          ? { wasRevealed: true, wasFirstCard: true }
          : effet.type === 'FIRST_STRIKE'
            ? { wasRevealed: false, wasFirstCard: true }
            : { wasRevealed: false, wasFirstCard: false };

        if (!isCopyableEffect(effet, contexte)) {
          fautifs.push(`${carte.id} ${carte.name_fr}: ${effet.type} refuse alors que rien ne l interdit`);
        }
      }
    }

    expect(
      fautifs,
      'un effet instantane qui n est ni SCORE, ni UPGRADE, ni continu, ni une alteration doit '
      + 'toujours pouvoir etre copie dans le bon contexte:\n' + fautifs.join('\n'),
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
          expect(isCopyableEffect(effet, { wasRevealed: false, wasFirstCard: true }), `${carte.id} AMBUSH sans revelation`).toBe(false);
          expect(isCopyableEffect(effet, { wasRevealed: true, wasFirstCard: false }), `${carte.id} AMBUSH apres revelation`).toBe(true);
        } else if (effet.type === 'FIRST_STRIKE') {
          expect(isCopyableEffect(effet, { wasRevealed: true, wasFirstCard: false }), `${carte.id} FIRST STRIKE hors premiere carte`).toBe(false);
          expect(isCopyableEffect(effet, { wasRevealed: false, wasFirstCard: true }), `${carte.id} FIRST STRIKE en premiere carte`).toBe(true);
        } else {
          expect(isCopyableEffect(effet, { wasRevealed: false, wasFirstCard: false }), `${carte.id} ${effet.type} toujours copiable`).toBe(true);
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
