import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import type { GameState, CharacterInPlay, ActiveMission, CharacterCard, MissionCard, PlayerID, PendingEffect } from '@/lib/engine/types';

function mockCard(ov: Partial<CharacterCard> = {}): CharacterCard {
  return { id: 'KS-999-C', cardId: 'KS-999-C', set: 'KS', number: 999, name_fr: 'Test', title_fr: 'Test', rarity: 'C', card_type: 'character', has_visual: true, chakra: 2, power: 2, keywords: [], group: 'Leaf Village', effects: [], ...ov } as CharacterCard;
}

function mockChar(ov: Partial<CharacterInPlay> = {}): CharacterInPlay {
  return { card: ov.card ?? mockCard(), instanceId: ov.instanceId ?? 'c-' + Math.random().toString(36).slice(2, 8), isHidden: false, powerTokens: 0, stack: ov.stack ?? [ov.card ?? mockCard()], controlledBy: ov.controlledBy ?? 'player1', originalOwner: ov.originalOwner ?? 'player1', wasRevealedAtLeastOnce: false, ...ov } as CharacterInPlay;
}

function mockMission(ov: Partial<ActiveMission> = {}): ActiveMission {
  return { card: { id: 'MSS', cardId: 'MSS', set: 'KS', number: 1, name_fr: 'M', title_fr: 'M', rarity: 'MMS', card_type: 'mission', has_visual: true, effects: [], chakra: 0, power: 0, keywords: [], group: '', basePoints: 1 } as MissionCard, rank: 'D', basePoints: 1, rankBonus: 1, player1Characters: [], player2Characters: [], wonBy: null, ...ov } as ActiveMission;
}

function makePlayer(ov: Partial<GameState['player1']> = {}) {
  return { id: (ov.id ?? 'player1') as PlayerID, userId: 'u1', isAI: false, deck: [], hand: [], discardPile: [], missionCards: [], chakra: 10, missionPoints: 0, hasPassed: false, charactersInPlay: 0, unusedMission: null, hasMulliganed: false, ...ov };
}

function makeState(ov: Partial<GameState> = {}): GameState {
  return { turn: 2, phase: 'action', activePlayer: 'player1', edgeHolder: 'player1', player1: makePlayer(), player2: makePlayer({ id: 'player2' as PlayerID, userId: 'u2' }), missionDeck: [], activeMissions: [mockMission(), mockMission({ rank: 'C', rankBonus: 2 })], log: [], pendingEffects: [], pendingActions: [], actionHistory: [], ...ov } as GameState;
}

describe('un controleur vole libere ce qu il controlait', () => {
  beforeAll(async () => { await initializeRegistry(); });

  it('rend la carte controlee a son proprietaire quand le controleur est vole', () => {
    const kabutoCard = mockCard({ id: 'KS-052-C', number: 52, name_fr: 'KABUTO YAKUSHI', title_fr: 'The Mole', chakra: 3, power: 1 });
    const stolenCard = mockCard({ id: 'KS-100-C', number: 100, name_fr: 'STOLEN ENEMY', chakra: 2, power: 2 });
    const inoCard = mockCard({ id: 'KS-020-UC', number: 20, name_fr: 'INO YAMANAKA', chakra: 3, keywords: ['Team 10', 'Jutsu'] });

    const kabuto = mockChar({
      instanceId: 'kabuto-1', card: kabutoCard,
      controlledBy: 'player2', originalOwner: 'player2',
    });
    const stolenInDifferentMission = mockChar({
      instanceId: 'stolen-1', card: stolenCard, isHidden: true,
      controlledBy: 'player2', originalOwner: 'player1',
      controllerInstanceId: 'kabuto-1',
    });
    const ino = mockChar({ instanceId: 'ino-1', card: inoCard });

    const state = makeState({
      activeMissions: [
        mockMission({ rank: 'D', player1Characters: [ino], player2Characters: [kabuto] }),
        mockMission({ rank: 'C', rankBonus: 2, player2Characters: [stolenInDifferentMission] }),
      ],
    });

    const pending: PendingEffect = {
      id: 'pe-ino', sourceCardId: 'KS-020-UC', sourceInstanceId: 'ino-1',
      sourceMissionIndex: 0, effectType: 'MAIN', sourcePlayer: 'player1',
      requiresTargetSelection: true, validTargets: ['kabuto-1'],
      isOptional: true, isMandatory: false, resolved: false, isUpgrade: false,
      effectDescription: '', targetSelectionType: 'TAKE_CONTROL_ENEMY_THIS_MISSION',
    };

    const after = EffectEngine.takeControlOfEnemy(state, pending, 'kabuto-1');

    const m0 = after.activeMissions[0];
    expect(m0.player1Characters.find((c) => c.instanceId === 'kabuto-1')).toBeTruthy();
    expect(m0.player2Characters.find((c) => c.instanceId === 'kabuto-1')).toBeFalsy();

    const m1 = after.activeMissions[1];
    const stolenAfter = m1.player1Characters.find((c) => c.instanceId === 'stolen-1');
    expect(stolenAfter).toBeTruthy();
    expect(stolenAfter?.originalOwner).toBe('player1');
    expect(stolenAfter?.controlledBy).toBe('player1');
    expect(stolenAfter?.controllerInstanceId).toBeUndefined();
    expect(m1.player2Characters.find((c) => c.instanceId === 'stolen-1')).toBeFalsy();
  });

  it('defausse la carte rendue si son proprietaire a deja ce nom en jeu (Repetition interdite)', () => {
    const inoCard = mockCard({ id: 'KS-020-UC', number: 20, name_fr: 'INO YAMANAKA', chakra: 3, keywords: ['Team 10', 'Jutsu'] });
    const kabutoCard = mockCard({ id: 'KS-052-C', number: 52, name_fr: 'KABUTO YAKUSHI', chakra: 3, power: 1 });
    const naruto = mockCard({ id: 'KS-108-R', number: 108, name_fr: 'NARUTO UZUMAKI', chakra: 5, power: 4 });

    const kabuto = mockChar({ instanceId: 'kabuto-1', card: kabutoCard, controlledBy: 'player2', originalOwner: 'player2' });
    const stolenNaruto = mockChar({
      instanceId: 'stolen-naruto', card: naruto, isHidden: false,
      controlledBy: 'player2', originalOwner: 'player1',
      controllerInstanceId: 'kabuto-1',
    });
    const ino = mockChar({ instanceId: 'ino-1', card: inoCard });
    const ownNarutoOnPlayer1 = mockChar({
      instanceId: 'own-naruto', card: naruto,
      controlledBy: 'player1', originalOwner: 'player1', isHidden: false,
    });

    const state = makeState({
      activeMissions: [
        mockMission({ rank: 'D', player1Characters: [ino], player2Characters: [kabuto] }),
        mockMission({ rank: 'C', rankBonus: 2, player1Characters: [ownNarutoOnPlayer1], player2Characters: [stolenNaruto] }),
      ],
    });

    const pending: PendingEffect = {
      id: 'pe-ino', sourceCardId: 'KS-020-UC', sourceInstanceId: 'ino-1',
      sourceMissionIndex: 0, effectType: 'MAIN', sourcePlayer: 'player1',
      requiresTargetSelection: true, validTargets: ['kabuto-1'],
      isOptional: true, isMandatory: false, resolved: false, isUpgrade: false,
      effectDescription: '', targetSelectionType: 'TAKE_CONTROL_ENEMY_THIS_MISSION',
    };

    const after = EffectEngine.takeControlOfEnemy(state, pending, 'kabuto-1');

    const m1 = after.activeMissions[1];
    expect(m1.player1Characters.find((c) => c.instanceId === 'stolen-naruto')).toBeFalsy();
    expect(m1.player2Characters.find((c) => c.instanceId === 'stolen-naruto')).toBeFalsy();
    expect(after.player1.discardPile.some((c) => c.id === 'KS-108-R')).toBe(true);
    expect(m1.player1Characters.find((c) => c.instanceId === 'own-naruto')).toBeTruthy();
  });

  it('ne touche a rien quand le personnage vole ne controlait personne', () => {
    const inoCard = mockCard({ id: 'KS-020-UC', number: 20, name_fr: 'INO YAMANAKA', chakra: 3 });
    const enemy = mockCard({ id: 'KS-046-C', number: 46, name_fr: 'EBISU', chakra: 2, power: 1 });
    const ino = mockChar({ instanceId: 'ino-1', card: inoCard });
    const enemyChar = mockChar({ instanceId: 'enemy-1', card: enemy, controlledBy: 'player2', originalOwner: 'player2' });
    const state = makeState({
      activeMissions: [mockMission({ player1Characters: [ino], player2Characters: [enemyChar] })],
    });

    const pending: PendingEffect = {
      id: 'pe', sourceCardId: 'KS-020-UC', sourceInstanceId: 'ino-1',
      sourceMissionIndex: 0, effectType: 'MAIN', sourcePlayer: 'player1',
      requiresTargetSelection: true, validTargets: ['enemy-1'],
      isOptional: true, isMandatory: false, resolved: false, isUpgrade: false,
      effectDescription: '', targetSelectionType: 'TAKE_CONTROL_ENEMY_THIS_MISSION',
    };

    const after = EffectEngine.takeControlOfEnemy(state, pending, 'enemy-1');
    const m = after.activeMissions[0];
    expect(m.player1Characters.find((c) => c.instanceId === 'enemy-1')).toBeTruthy();
    expect(m.player2Characters).toHaveLength(0);
  });
});
