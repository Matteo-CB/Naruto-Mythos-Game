import { describe, it, expect } from 'vitest';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { registerAllSetHandlers } from '@/lib/effects/handlers';
import { getEffectHandler } from '@/lib/effects/EffectRegistry';
import { attachCardToMission, attachCardToCharacter } from '@/lib/effects/attachments';
import { actionTypeForSelectionType } from '@/lib/effects/selectionActionType';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import { allCardData } from '@/lib/data/sets';
import type { CardData, EffectType } from '@/lib/engine/types';

registerAllSetHandlers();
void EffectEngine;

function equipements(): CardData[] {
  return Object.values(allCardData.cards as Record<string, CardData>)
    .filter((c) => c.card_type === 'attachment');
}

const TYPES_RESOLUS: EffectType[] = ['ATTACH', 'MAIN', 'AMBUSH', 'FIRST_STRIKE', 'SCORE', 'UPGRADE', 'DUEL'];

describe('les effets des equipements arrivent tous quelque part', () => {
  it('chaque effet instantane imprime sur un equipement a son handler', () => {
    const muets: string[] = [];
    for (const carte of equipements()) {
      for (const effet of carte.effects ?? []) {
        if (effet.type === 'ATTACH') continue;
        if (effet.description.includes('[⧗]')) continue;
        if (!getEffectHandler(carte.id, effet.type as EffectType)) {
          muets.push(`${carte.id} ${effet.type}`);
        }
      }
    }
    expect(muets, 'aucun effet d_equipement sans code').toEqual([]);
  });

  it('aucun equipement ne porte un type d_effet que le moteur ne resout pas', () => {
    const inconnus: string[] = [];
    for (const carte of equipements()) {
      for (const effet of carte.effects ?? []) {
        if (!TYPES_RESOLUS.includes(effet.type as EffectType)) inconnus.push(`${carte.id} ${effet.type}`);
      }
    }
    expect(inconnus, 'tous les types sont connus du moteur').toEqual([]);
  });

  it('un equipement de mission declenche son MAIN instantane a la pose', async () => {
    let etat = buildSimState({ p1: [], p2: [], missions: 2, chakra1: 10 });
    etat = { ...etat, player1: { ...etat.player1, deck: [getCardById('KS-009-C') as never] } };

    const espion: CardData = {
      ...(getCardById('SS-109-UC') as CardData),
      id: 'SIM-MISSION-MAIN',
      effects: [
        { type: 'ATTACH', description: 'Attach to a mission.' },
        { type: 'MAIN', description: '[↯] Put the top card of your deck as a hidden character in this mission.' },
      ],
    } as CardData;

    const { registerEffect } = await import('@/lib/effects/EffectRegistry');
    const { putTopCardAsHidden } = await import('@/lib/effects/handlers/SS/attachmentReinforcements');
    registerEffect('SIM-MISSION-MAIN', 'MAIN', (ctx) => ({
      state: putTopCardAsHidden(ctx.state, ctx.sourcePlayer, ctx.sourceMissionIndex, 'SIMULATION', 'SIM-MISSION-MAIN'),
    }));

    const apres = attachCardToMission(etat, 'player1', espion, 0);
    expect(apres.activeMissions[0].player1Characters.length,
      'le MAIN instantane d_un equipement de mission agit a la pose').toBe(1);
  });

  it('un equipement de personnage declenche toujours son MAIN instantane', () => {
    const hote = simChar('SS-010-C', { owner: 'player1', instanceId: 'sim-hote' });
    let etat = buildSimState({ p1: [hote], p2: [], missions: 1, chakra1: 10 });
    etat = { ...etat, player1: { ...etat.player1, deck: [getCardById('KS-009-C') as never, getCardById('KS-010-C') as never] } };

    const apres = attachCardToCharacter(etat, 'player1', getCardById('SS-081-C') as CardData, 'sim-hote');
    const question = apres.pendingEffects[apres.pendingEffects.length - 1];
    expect(question?.targetSelectionType, 'le Ramen pose sa question a la pose').toBe('SS081_CONFIRM_MAIN');

    const fin = EffectEngine.applyTargetedEffect(apres, question, [question.validTargets![0]]);
    expect(fin.player1.hand.length, 'accepter fait piocher').toBe(1);
  });

  it('une question ouverte par un equipement porte le bon type de fenetre', () => {
    expect(actionTypeForSelectionType('SS_DECK_SEARCH_TAKE'), 'liste de cartes').toBe('CHOOSE_CARD_FROM_LIST');
    expect(actionTypeForSelectionType('SS095_TAKE_JUTSU'), 'liste de cartes').toBe('CHOOSE_CARD_FROM_LIST');
    expect(actionTypeForSelectionType('SS022_PLAY_ATTACHMENT'), 'liste de cartes').toBe('CHOOSE_CARD_FROM_LIST');
    expect(actionTypeForSelectionType('SS086_HIDE_AND_MOVE'), 'selection sur le plateau').toBe('SELECT_TARGET');
  });
});
