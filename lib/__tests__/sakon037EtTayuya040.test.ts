import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { tayuya040Reductions } from '@/lib/effects/handlers/SS/tayuya040';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CharacterCard, GameState } from '@/lib/engine/types';

void EffectEngine;

const SAKON_037 = 'SS-037-UC';
const SON_QUATRE = 'KS-057-C';
const TAYUYA_040 = 'SS-040-UC';

describe('SAKON 037 compte toutes les cartes revelees, pas seulement la premiere', () => {
  function plateau(): GameState {
    const s = buildSimState({
      p1: [simChar('KS-061-C', { owner: 'player1', instanceId: 'sakon' })],
      p2: [simChar('KS-009-C', { owner: 'player2', instanceId: 'cible' })],
      missions: 2, chakra1: 30, edgeHolder: 'player1',
    });
    s.phase = 'action';
    s.player1.hand = [
      getCardById(SON_QUATRE) as CharacterCard,
      getCardById(SON_QUATRE) as CharacterCard,
      getCardById(SON_QUATRE) as CharacterCard,
    ];
    return s;
  }

  it('reveler trois cartes autorise a vaincre un ennemi de cout 2', () => {
    const depart = plateau();
    const pendingEffect = {
      id: 'e1', sourceCardId: SAKON_037, sourceInstanceId: 'sakon', sourceMissionIndex: 0,
      effectType: 'UPGRADE', effectDescription: '{}', targetSelectionType: 'SS037_REVEAL_SOUND_FOUR',
      sourcePlayer: 'player1', requiresTargetSelection: true, validTargets: ['0', '1', '2'],
      isOptional: true, isMandatory: false, resolved: false, isUpgrade: true,
    };
    const apres = EffectEngine.applyTargetedEffect(depart, pendingEffect as never, ['0', '1', '2']);
    expect(
      apres.log.some((l) => l.messageKey === 'game.log.effect.revealFromHand' && String(l.messageParams?.count) === '3'),
      'les trois cartes sont comptees',
    ).toBe(true);
    expect(apres.pendingActions.length, 'une cible peut etre choisie').toBeGreaterThan(0);
  });
});

describe('TAYUYA 040 ne se compte pas elle-meme dans sa remise', () => {
  it('seule dans sa mission, elle n accorde aucune remise', () => {
    const s = buildSimState({
      p1: [simChar(TAYUYA_040, { owner: 'player1', instanceId: 'tayuya' })],
      missions: 2, chakra1: 30, edgeHolder: 'player1',
    });
    s.phase = 'action';
    expect(tayuya040Reductions(s, 'player1', [0], 'tayuya')[0], 'aucun autre Son 4 present').toBe(0);
    expect(tayuya040Reductions(s, 'player1', [0])[0], 'sans exclusion elle se comptait').toBe(1);
  });

  it('avec un vrai allie Son 4, la remise vaut 1', () => {
    const s = buildSimState({
      p1: [
        simChar(TAYUYA_040, { owner: 'player1', instanceId: 'tayuya' }),
        simChar(SON_QUATRE, { owner: 'player1', instanceId: 'allie' }),
      ],
      missions: 2, chakra1: 30, edgeHolder: 'player1',
    });
    s.phase = 'action';
    expect(tayuya040Reductions(s, 'player1', [0], 'tayuya')[0], 'un seul allie compte').toBe(1);
  });
});
