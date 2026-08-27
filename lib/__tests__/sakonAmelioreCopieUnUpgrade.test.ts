import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import { GameEngine } from '@/lib/engine/GameEngine';
import { isCopyableEffect } from '@/lib/effects/handlers/KS/shared/copyExclusions';
import type { CardData, GameState } from '@/lib/engine/types';

beforeAll(() => { initializeRegistry(); });

const SAKON_PETIT = 'KS-061-C';
const SAKON_GRAND = 'KS-062-UC';
const TAYUYA_RARE = 'KS-125-R';
const JIROBO = 'KS-122-R';

function upgradeDeTayuya() {
  const carte = getCardById(TAYUYA_RARE) as unknown as CardData;
  return (carte.effects ?? []).find((e) => e.type === 'UPGRADE');
}

describe('la carte visee a bien un UPGRADE instantane a copier', () => {
  it('TAYUYA 125 porte un effet UPGRADE', () => {
    expect(upgradeDeTayuya(), `${TAYUYA_RARE} doit porter un UPGRADE`).toBeTruthy();
  });

  it('SAKON 062 n a aucune restriction imprimee contre les UPGRADE', () => {
    const sakon = getCardById(SAKON_GRAND) as unknown as CardData;
    const texte = (sakon.effects ?? []).map((e) => e.description).join(' ');
    expect(
      /non[- ]upgrade/i.test(texte),
      'KAKASHI refuse les UPGRADE parce que sa carte le dit, SAKON ne le dit pas',
    ).toBe(false);
  });
});

describe('la condition depend de ce que le copieur a fait, pas du maillon de la chaine', () => {
  const effet = upgradeDeTayuya()!;
  const commun = { wasRevealed: true, wasFirstCard: false, copieur: SAKON_GRAND };

  it('un SAKON pose en amelioration peut copier un UPGRADE', () => {
    expect(isCopyableEffect(effet, { ...commun, wasUpgrade: true })).toBe(true);
  });

  it('un SAKON pose normalement ne le peut pas', () => {
    expect(isCopyableEffect(effet, { ...commun, wasUpgrade: false })).toBe(false);
  });

  it('oublier de transmettre l information revient a refuser', () => {
    expect(
      isCopyableEffect(effet, { wasRevealed: true, wasFirstCard: false, copieur: SAKON_GRAND }),
      'c est exactement ce qui se passait entre le choix et la resolution',
    ).toBe(false);
  });
});

describe('le SAKON du set 2 est lui aussi copiable en amelioration', () => {
  const SAKON_SECOND_ETAT = 'SS-037-UC';

  it('son UPGRADE est un instantane que SAKON 062 peut reprendre', () => {
    const carte = getCardById(SAKON_SECOND_ETAT) as unknown as CardData;
    const up = (carte.effects ?? []).find((e) => e.type === 'UPGRADE');
    expect(up, 'la carte porte bien un UPGRADE').toBeTruthy();
    expect(
      isCopyableEffect(up!, { wasRevealed: true, wasFirstCard: false, wasUpgrade: true, copieur: SAKON_GRAND }),
      'revele en amelioration, SAKON 062 remplit la condition de l effet',
    ).toBe(true);
    expect(
      isCopyableEffect(up!, { wasRevealed: true, wasFirstCard: false, wasUpgrade: false, copieur: SAKON_GRAND }),
      'pose a plat, il ne la remplit pas',
    ).toBe(false);
  });

  it('il porte bien le mot cle qui le rend visible par SAKON 062', () => {
    const carte = getCardById(SAKON_SECOND_ETAT) as unknown as CardData;
    expect(carte.keywords ?? [], 'SAKON 062 ne copie que les Quatre du Son allies').toContain('Sound Four');
  });
});

describe('reveler SAKON 062 en amelioration mene jusqu au choix de l effet', () => {
  function plateau(): GameState {
    const s = buildSimState({
      p1: [
        simChar(SAKON_PETIT, { owner: 'player1', instanceId: 'socle' }),
        simChar(TAYUYA_RARE, { owner: 'player1', instanceId: 'tayuya' }),
        simChar(JIROBO, { owner: 'player1', instanceId: 'jirobo' }),
        simChar(SAKON_GRAND, { owner: 'player1', instanceId: 'cache', hidden: true }),
      ],
      p2: [], missions: 2, chakra1: 40,
    });
    s.phase = 'action';
    s.activePlayer = 'player1';
    s.player1.chakra = 40;
    return s;
  }

  function repondre(etat: GameState, garde = 6): { state: GameState; etapes: string[] } {
    let s = etat;
    const etapes: string[] = [];
    for (let i = 0; i < garde && s.pendingActions.length > 0; i += 1) {
      const pa = s.pendingActions[0];
      const options = (pa.options ?? []) as string[];
      etapes.push(`${pa.type}:${options.length} option(s)`);
      const suivant = GameEngine.applyAction(s, pa.player, {
        type: 'SELECT_TARGET', pendingActionId: pa.id, selectedTargets: [options[0]],
      } as never);
      if (suivant === s) { etapes.push('(bloque)'); break; }
      s = suivant;
    }
    return { state: s, etapes };
  }

  it('la copie va au bout sans jamais annoncer aucun effet valide', () => {
    const revele = GameEngine.applyAction(plateau(), 'player1', {
      type: 'REVEAL_CHARACTER', characterInstanceId: 'cache', missionIndex: 0,
    } as never);

    expect(
      revele.pendingActions.length,
      'SAKON revele par-dessus le petit SAKON doit proposer sa copie',
    ).toBeGreaterThan(0);

    const premier = revele.pendingActions[0];
    expect(
      ((premier.options ?? []) as string[]).length >= 1,
      'la confirmation de l AMBUSH est proposee',
    ).toBe(true);

    const { state, etapes } = repondre(revele);

    const choixCible = etapes.some((e) => e.includes('2 option(s)'));
    expect(
      choixCible,
      `il faut passer par le choix entre plusieurs Quatre du Son, sinon le bug ne se produit pas. Etapes: ${etapes.join(' -> ')}`,
    ).toBe(true);

    const echecs = state.log.filter((l) => l.messageKey === 'game.log.effect.copyFailed');
    expect(
      echecs.map((l) => l.messageKey ?? ''),
      'la carte etait proposee au choix: la refuser a la resolution est le bug remonte',
    ).toEqual([]);
    expect(
      state.log.some((l) => l.messageKey === 'game.log.effect.copySuccess'),
      'la copie doit aboutir',
    ).toBe(true);
  });

  it('aucune etape de la chaine ne remet isUpgrade a faux', () => {
    const revele = GameEngine.applyAction(plateau(), 'player1', {
      type: 'REVEAL_CHARACTER', characterInstanceId: 'cache', missionIndex: 0,
    } as never);
    let s = revele;
    for (let i = 0; i < 6 && s.pendingActions.length > 0; i += 1) {
      const pa = s.pendingActions[0];
      const lie = s.pendingEffects.find((e) => e.id === pa.sourceEffectId);
      if (lie && String(lie.targetSelectionType ?? '').includes('COPY')) {
        expect(
          lie.isUpgrade,
          `${lie.targetSelectionType} doit se souvenir que SAKON a ete pose en amelioration`,
        ).toBe(true);
      }
      const suivant = GameEngine.applyAction(s, pa.player, {
        type: 'SELECT_TARGET', pendingActionId: pa.id, selectedTargets: [((pa.options ?? []) as string[])[0]],
      } as never);
      if (suivant === s) break;
      s = suivant;
    }
  });
});
