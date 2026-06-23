import { describe, it, expect } from 'vitest';
import { EffectEngine } from '../effects/EffectEngine';
import type { PendingEffect, EffectType } from '../engine/types';
import { createActionPhaseState, mockCharacter, mockCharInPlay } from './testHelpers';

function makeTakeControlPending(sourcePlayer: 'player1' | 'player2', sourceInstanceId = 'inst-ino'): PendingEffect {
  return {
    id: 'pe-takecontrol',
    sourceCardId: 'KS-020-UC',
    sourceInstanceId,
    sourceMissionIndex: 0,
    effectType: 'MAIN' as EffectType,
    effectDescription: '',
    targetSelectionType: 'TAKE_CONTROL_ENEMY_THIS_MISSION',
    sourcePlayer,
    requiresTargetSelection: true,
    validTargets: [],
    isOptional: false,
    isMandatory: true,
    resolved: false,
    isUpgrade: false,
  };
}

function makeDevolvePending(sourcePlayer: 'player1' | 'player2'): PendingEffect {
  return {
    id: 'pe-kakashi106',
    sourceCardId: 'KS-106-R',
    sourceInstanceId: 'inst-kakashi106',
    sourceMissionIndex: 0,
    effectType: 'MAIN' as EffectType,
    effectDescription: '',
    targetSelectionType: '',
    sourcePlayer,
    requiresTargetSelection: false,
    validTargets: [],
    isOptional: false,
    isMandatory: false,
    resolved: false,
    isUpgrade: false,
  };
}

describe('No Repetition discard vs Defeat (Phase H)', () => {
  describe('takeControlOfEnemy: No Rep discard does NOT fire defeat triggers', () => {
    it('Tsunade (003) ON_FRIENDLY_DEFEAT does NOT gain chakra when controlled enemy is No-Rep discarded', () => {
      const state = createActionPhaseState({});
      const tsunade = mockCharInPlay(
        { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
        {
          id: 'KS-003-C',
          name_fr: 'Tsunade',
          chakra: 4,
          power: 3,
          number: 3,
          effects: [{ type: 'MAIN', description: '[⧗] When a friendly character is defeated, gain 2 chakra.' }],
        },
      );
      const myNaruto = mockCharInPlay(
        { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
        { id: 'KS-108-R', name_fr: 'Naruto', chakra: 4 },
      );
      const enemyNaruto = mockCharInPlay(
        { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false },
        { id: 'KS-009-C', name_fr: 'Naruto', chakra: 2 },
      );
      state.activeMissions[0].player1Characters = [tsunade, myNaruto];
      state.activeMissions[0].player2Characters = [enemyNaruto];

      const chakraBefore = state.player1.chakra;
      const newState = EffectEngine.takeControlOfEnemy(state, makeTakeControlPending('player1'), enemyNaruto.instanceId);

      expect(newState.player1.chakra).toBe(chakraBefore);
      expect(newState.player2.discardPile.length).toBe(1);
      expect(newState.player2.discardPile[0].id).toBe('KS-009-C');
    });

    it('Sasuke Uchiwa (136) ON_ANY_DEFEAT does NOT gain chakra when controlled enemy is No-Rep discarded', () => {
      const state = createActionPhaseState({});
      const sasuke136 = mockCharInPlay(
        { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
        {
          id: 'KS-136-S',
          name_fr: 'Sasuke Uchiwa',
          chakra: 6,
          power: 6,
          number: 136,
          effects: [{ type: 'MAIN', description: '[⧗] When a character is defeated, gain 1 chakra.' }],
        },
      );
      const myNaruto = mockCharInPlay(
        { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
        { id: 'KS-108-R', name_fr: 'Naruto', chakra: 4 },
      );
      const enemyNaruto = mockCharInPlay(
        { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false },
        { id: 'KS-009-C', name_fr: 'Naruto', chakra: 2 },
      );
      state.activeMissions[0].player1Characters = [sasuke136, myNaruto];
      state.activeMissions[0].player2Characters = [enemyNaruto];

      const chakraBefore = state.player1.chakra;
      const newState = EffectEngine.takeControlOfEnemy(state, makeTakeControlPending('player1'), enemyNaruto.instanceId);

      expect(newState.player1.chakra).toBe(chakraBefore);
    });

    it('No defeat log entry is appended when No Rep discard happens', () => {
      const state = createActionPhaseState({});
      const myNaruto = mockCharInPlay(
        { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
        { id: 'KS-108-R', name_fr: 'Naruto', chakra: 4 },
      );
      const enemyNaruto = mockCharInPlay(
        { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false },
        { id: 'KS-009-C', name_fr: 'Naruto', chakra: 2 },
      );
      state.activeMissions[0].player1Characters = [myNaruto];
      state.activeMissions[0].player2Characters = [enemyNaruto];

      const newState = EffectEngine.takeControlOfEnemy(state, makeTakeControlPending('player1'), enemyNaruto.instanceId);

      const defeatLogs = newState.log.filter((l) => l.messageKey === 'game.log.effect.defeat');
      expect(defeatLogs.length).toBe(0);

      const onDefeatLogs = newState.log.filter((l) => l.messageKey === 'game.log.effect.onDefeatChakra');
      expect(onDefeatLogs.length).toBe(0);
    });

    it('No new pendingEffects (no defeat-triggered chain) when No Rep discard happens', () => {
      const state = createActionPhaseState({});
      const myNaruto = mockCharInPlay(
        { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
        { id: 'KS-108-R', name_fr: 'Naruto', chakra: 4 },
      );
      const enemyNaruto = mockCharInPlay(
        { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false },
        { id: 'KS-009-C', name_fr: 'Naruto', chakra: 2 },
      );
      state.activeMissions[0].player1Characters = [myNaruto];
      state.activeMissions[0].player2Characters = [enemyNaruto];

      const pendingBefore = state.pendingEffects.length;
      const newState = EffectEngine.takeControlOfEnemy(state, makeTakeControlPending('player1'), enemyNaruto.instanceId);

      expect(newState.pendingEffects.length).toBe(pendingBefore);
    });

    it('Discarded Summon is NOT marked for end-phase return (it is in discardPile, not in play)', () => {
      const state = createActionPhaseState({});
      const myKuchiyose = mockCharInPlay(
        { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
        { id: 'KS-100-C', name_fr: 'Gamabunta', chakra: 4, keywords: ['Summon'] },
      );
      const enemyKuchiyose = mockCharInPlay(
        { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false },
        { id: 'KS-101-C', name_fr: 'Gamabunta', chakra: 3, keywords: ['Summon'] },
      );
      state.activeMissions[0].player1Characters = [myKuchiyose];
      state.activeMissions[0].player2Characters = [enemyKuchiyose];

      const newState = EffectEngine.takeControlOfEnemy(state, makeTakeControlPending('player1'), enemyKuchiyose.instanceId);

      const stillInPlay = newState.activeMissions[0].player1Characters.find((c) => c.instanceId === enemyKuchiyose.instanceId)
        || newState.activeMissions[0].player2Characters.find((c) => c.instanceId === enemyKuchiyose.instanceId);
      expect(stillInPlay).toBeUndefined();

      const p2Discard = newState.player2.discardPile;
      expect(p2Discard.length).toBe(1);
      expect(p2Discard[0].id).toBe('KS-101-C');
    });
  });

  describe('devolveUpgradedCharacter (Kakashi 106): No Rep discard does NOT fire defeat triggers', () => {
    it('Tsunade does NOT gain chakra when Ichibi/Gaara surfaces and entire stack is discarded', () => {
      const state = createActionPhaseState({});

      const tsunade = mockCharInPlay(
        { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
        {
          id: 'KS-003-C',
          name_fr: 'Tsunade',
          chakra: 4,
          power: 3,
          number: 3,
          effects: [{ type: 'MAIN', description: '[⧗] When a friendly character is defeated, gain 2 chakra.' }],
        },
      );

      const gaaraBottom = mockCharacter({ id: 'KS-075-R', name_fr: 'Gaara', chakra: 3 });
      const ichibiTop = mockCharacter({ id: 'KS-117-S', name_fr: 'Ichibi', chakra: 5 });
      const ichibiStack = mockCharInPlay(
        {
          controlledBy: 'player2',
          originalOwner: 'player2',
          missionIndex: 0,
          isHidden: false,
          stack: [gaaraBottom, ichibiTop],
        },
        ichibiTop,
      );
      const enemyGaara = mockCharInPlay(
        { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false },
        { id: 'KS-076-UC', name_fr: 'Gaara', chakra: 4 },
      );
      state.activeMissions[0].player1Characters = [tsunade];
      state.activeMissions[0].player2Characters = [ichibiStack, enemyGaara];

      const tsunade003 = mockCharInPlay(
        { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false },
        {
          id: 'KS-003-C',
          name_fr: 'Tsunade2',
          chakra: 4,
          power: 3,
          number: 3,
          effects: [{ type: 'MAIN', description: '[⧗] When a friendly character is defeated, gain 2 chakra.' }],
        },
      );
      state.activeMissions[0].player2Characters.push(tsunade003);

      const p2ChakraBefore = state.player2.chakra;
      const newState = EffectEngine.devolveUpgradedCharacter(state, makeDevolvePending('player1'), ichibiStack.instanceId);

      expect(newState.player2.chakra).toBe(p2ChakraBefore);

      const onDefeatLogs = newState.log.filter((l) => l.messageKey === 'game.log.effect.onDefeatChakra');
      expect(onDefeatLogs.length).toBe(0);
    });

    it('No defeat-triggered pendingEffects added when stack is discarded for No Rep', () => {
      const state = createActionPhaseState({});

      const gaaraBottom = mockCharacter({ id: 'KS-075-R', name_fr: 'Gaara', chakra: 3 });
      const ichibiTop = mockCharacter({ id: 'KS-117-S', name_fr: 'Ichibi', chakra: 5 });
      const ichibiStack = mockCharInPlay(
        {
          controlledBy: 'player2',
          originalOwner: 'player2',
          missionIndex: 0,
          isHidden: false,
          stack: [gaaraBottom, ichibiTop],
        },
        ichibiTop,
      );
      const enemyGaara = mockCharInPlay(
        { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false },
        { id: 'KS-076-UC', name_fr: 'Gaara', chakra: 4 },
      );
      state.activeMissions[0].player2Characters = [ichibiStack, enemyGaara];

      const pendingBefore = state.pendingEffects.length;
      const newState = EffectEngine.devolveUpgradedCharacter(state, makeDevolvePending('player1'), ichibiStack.instanceId);

      expect(newState.pendingEffects.length).toBe(pendingBefore);
    });

    it('Normal devolve (top to discard, no conflict) does NOT fire defeat triggers either', () => {
      const state = createActionPhaseState({});
      const tsunade = mockCharInPlay(
        { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false },
        {
          id: 'KS-003-C',
          name_fr: 'Tsunade',
          chakra: 4,
          power: 3,
          number: 3,
          effects: [{ type: 'MAIN', description: '[⧗] When a friendly character is defeated, gain 2 chakra.' }],
        },
      );
      const bottomCard = mockCharacter({ id: 'KS-014-R', name_fr: 'Sasuke', chakra: 3 });
      const topCard = mockCharacter({ id: 'KS-142-M', name_fr: 'Sasuke', chakra: 5 });
      const enemyStack = mockCharInPlay(
        {
          controlledBy: 'player2',
          originalOwner: 'player2',
          missionIndex: 0,
          isHidden: false,
          stack: [bottomCard, topCard],
        },
        topCard,
      );
      state.activeMissions[0].player2Characters = [tsunade, enemyStack];

      const p2ChakraBefore = state.player2.chakra;
      const newState = EffectEngine.devolveUpgradedCharacter(state, makeDevolvePending('player1'), enemyStack.instanceId);

      expect(newState.player2.chakra).toBe(p2ChakraBefore);

      const onDefeatLogs = newState.log.filter((l) => l.messageKey === 'game.log.effect.onDefeatChakra');
      expect(onDefeatLogs.length).toBe(0);
    });
  });

  describe('Contrast: real defeat DOES fire defeat triggers (sanity check)', () => {
    it('Tsunade (003) DOES gain chakra when a friendly character is properly defeated', () => {
      const state = createActionPhaseState({});
      const tsunade = mockCharInPlay(
        { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
        {
          id: 'KS-003-C',
          name_fr: 'Tsunade',
          chakra: 4,
          power: 3,
          number: 3,
          effects: [{ type: 'MAIN', description: '[⧗] When a friendly character is defeated, gain 2 chakra.' }],
        },
      );
      const friendlyNaruto = mockCharInPlay(
        { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
        { id: 'KS-108-R', name_fr: 'Naruto', chakra: 4 },
      );
      state.activeMissions[0].player1Characters = [tsunade, friendlyNaruto];

      const p1ChakraBefore = state.player1.chakra;
      const newState = EffectEngine.defeatCharacter(state, friendlyNaruto.instanceId, 'player2');

      expect(newState.player1.chakra).toBe(p1ChakraBefore + 2);

      const onDefeatLogs = newState.log.filter((l) => l.messageKey === 'game.log.effect.onDefeatChakra');
      expect(onDefeatLogs.length).toBe(1);
    });

    it('Sasuke Uchiwa (136) DOES gain chakra when ANY character is defeated', () => {
      const state = createActionPhaseState({});
      const sasuke136 = mockCharInPlay(
        { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
        {
          id: 'KS-136-S',
          name_fr: 'Sasuke Uchiwa',
          chakra: 6,
          power: 6,
          number: 136,
          effects: [{ type: 'MAIN', description: '[⧗] When a character is defeated, gain 1 chakra.' }],
        },
      );
      const enemyVictim = mockCharInPlay(
        { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false },
        { id: 'KS-009-C', name_fr: 'Naruto', chakra: 2 },
      );
      state.activeMissions[0].player1Characters = [sasuke136];
      state.activeMissions[0].player2Characters = [enemyVictim];

      const p1ChakraBefore = state.player1.chakra;
      const newState = EffectEngine.defeatCharacter(state, enemyVictim.instanceId, 'player1');

      expect(newState.player1.chakra).toBe(p1ChakraBefore + 1);
    });

    it('Sasuke Uchiwa (136) does NOT gain chakra when Sasuke himself is the defeated character', () => {
      const state = createActionPhaseState({});
      const sasuke136 = mockCharInPlay(
        { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
        {
          id: 'KS-136-S',
          name_fr: 'Sasuke Uchiwa',
          chakra: 6,
          power: 6,
          number: 136,
          effects: [{ type: 'MAIN', description: '[⧗] When a character is defeated, gain 1 chakra.' }],
        },
      );
      state.activeMissions[0].player1Characters = [sasuke136];

      const p1ChakraBefore = state.player1.chakra;
      const newState = EffectEngine.defeatCharacter(state, sasuke136.instanceId, 'player2');

      expect(newState.player1.chakra).toBe(p1ChakraBefore);
    });
  });
});
