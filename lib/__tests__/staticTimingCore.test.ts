import { describe, it, expect } from 'vitest';
import { calculateContinuousPowerModifier, applyRempartTokenRemoval } from '../effects/ContinuousEffects';
import { calculateCharacterPower } from '../engine/phases/PowerCalculation';
import { createActionPhaseState, mockMission, mockCharInPlay } from './testHelpers';

describe('Static Timing — CORE-card resolution (Phase G)', () => {
  describe('G1: Mission "4+ Power" threshold reads CORE only (printed + tokens)', () => {
    it('grants +1 mission bonus when CORE >= 4 even if final power would be less', () => {
      const state = createActionPhaseState({});
      state.activeMissions[0] = {
        ...state.activeMissions[0],
        card: mockMission({
          id: 'KS-XXX-MMS',
          name_fr: 'Protect the Leader',
          effects: [{ type: 'MAIN', description: '[⧗] All characters with 4 Power or more receive +1 Power.' }],
        }),
        player1Characters: [],
        player2Characters: [],
      };

      const sasuke = mockCharInPlay(
        { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
        { id: 'KS-014-R', name_fr: 'Sasuke', chakra: 4, power: 4 },
      );
      const itachiAura = mockCharInPlay(
        { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false },
        {
          id: 'KS-128-R',
          name_fr: 'Itachi',
          chakra: 5,
          power: 6,
          number: 128,
          effects: [{ type: 'MAIN', description: '[⧗] All enemy characters receive -1 Power (Amaterasu).' }],
        },
      );
      state.activeMissions[0].player1Characters = [sasuke];
      state.activeMissions[0].player2Characters = [itachiAura];

      const modifier = calculateContinuousPowerModifier(state, 'player1', 0, sasuke);
      const finalPower = calculateCharacterPower(state, sasuke, 'player1');
      expect(finalPower).toBe(4);
      expect(modifier).toBeDefined();
    });

    it('does NOT grant +1 mission bonus when CORE < 4 even if final power would be 4+', () => {
      const state = createActionPhaseState({});
      state.activeMissions[0] = {
        ...state.activeMissions[0],
        card: mockMission({
          id: 'KS-XXX-MMS',
          name_fr: 'Protect the Leader',
          effects: [{ type: 'MAIN', description: '[⧗] All characters with 4 Power or more receive +1 Power.' }],
        }),
        player1Characters: [],
        player2Characters: [],
      };

      const temari = mockCharInPlay(
        { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
        {
          id: 'KS-079-R',
          name_fr: 'Temari',
          chakra: 2,
          power: 2,
          number: 79,
          effects: [{ type: 'MAIN', description: '[⧗] +2 Power if you have the Edge.' }],
        },
      );
      state.activeMissions[0].player1Characters = [temari];
      state.edgeHolder = 'player1';

      const finalPower = calculateCharacterPower(state, temari, 'player1');
      expect(finalPower).toBe(4);
    });

    it('CORE = printed + tokens (power tokens count toward threshold)', () => {
      const state = createActionPhaseState({});
      state.activeMissions[0] = {
        ...state.activeMissions[0],
        card: mockMission({
          id: 'KS-XXX-MMS',
          name_fr: 'Protect the Leader',
          effects: [{ type: 'MAIN', description: '[⧗] All characters with 4 Power or more receive +1 Power.' }],
        }),
        player1Characters: [],
        player2Characters: [],
      };

      const kakashi = mockCharInPlay(
        {
          controlledBy: 'player1',
          originalOwner: 'player1',
          missionIndex: 0,
          isHidden: false,
          powerTokens: 1,
        },
        { id: 'KS-015-R', name_fr: 'Kakashi', chakra: 4, power: 3 },
      );
      state.activeMissions[0].player1Characters = [kakashi];

      const finalPower = calculateCharacterPower(state, kakashi, 'player1');
      expect(finalPower).toBe(5);
    });
  });

  describe('G2: Rashomon "set to 0" is absolute (ignores all other modifiers)', () => {
    it('Rashomon zeroes target, Itachi -1 aura ignored → final power exactly 0', () => {
      const state = createActionPhaseState({});
      state.activeMissions[0] = {
        ...state.activeMissions[0],
        player1Characters: [],
        player2Characters: [],
      };

      const sasuke = mockCharInPlay(
        { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
        { id: 'KS-014-R', name_fr: 'Sasuke', chakra: 4, power: 4 },
      );
      const rashomon = mockCharInPlay(
        { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false, rempartLockedTargetId: sasuke.instanceId },
        {
          id: 'KS-067-UC',
          name_fr: 'Rashomon',
          chakra: 3,
          power: 0,
          number: 67,
          effects: [{ type: 'MAIN', description: '[⧗] Set strongest enemy in this mission to 0 Power and remove its tokens.' }],
        },
      );
      const itachiAura = mockCharInPlay(
        { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false },
        {
          id: 'KS-128-R',
          name_fr: 'Itachi',
          chakra: 5,
          power: 6,
          number: 128,
          effects: [{ type: 'MAIN', description: '[⧗] All enemy characters receive -1 Power (Amaterasu).' }],
        },
      );
      state.activeMissions[0].player1Characters = [sasuke];
      state.activeMissions[0].player2Characters = [rashomon, itachiAura];

      const finalPower = calculateCharacterPower(state, sasuke, 'player1');
      expect(finalPower).toBe(0);
    });

    it('Rashomon zeroes target with power tokens → tokens count toward CORE for selection', () => {
      const state = createActionPhaseState({});
      state.activeMissions[0] = {
        ...state.activeMissions[0],
        player1Characters: [],
        player2Characters: [],
      };

      const jirobo = mockCharInPlay(
        { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false, powerTokens: 5 },
        { id: 'KS-122-R', name_fr: 'Jirobo', chakra: 4, power: 6 },
      );
      const jiraiya = mockCharInPlay(
        { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
        { id: 'KS-105-R', name_fr: 'Jiraiya', chakra: 5, power: 8 },
      );
      const rashomon = mockCharInPlay(
        { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false },
        {
          id: 'KS-067-UC',
          name_fr: 'Rashomon',
          chakra: 3,
          power: 0,
          number: 67,
          effects: [{ type: 'MAIN', description: '[⧗] Set strongest enemy in this mission to 0 Power and remove its tokens.' }],
        },
      );
      state.activeMissions[0].player1Characters = [jirobo, jiraiya];
      state.activeMissions[0].player2Characters = [rashomon];

      const jiroboFinal = calculateCharacterPower(state, jirobo, 'player1');
      const jiraiyaFinal = calculateCharacterPower(state, jiraiya, 'player1');
      expect(jiroboFinal).toBe(0);
      expect(jiraiyaFinal).toBe(8);
    });

    it('Non-targeted chars are unaffected by Rashomon zero', () => {
      const state = createActionPhaseState({});
      state.activeMissions[0] = {
        ...state.activeMissions[0],
        player1Characters: [],
        player2Characters: [],
      };

      const naruto = mockCharInPlay(
        { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
        { id: 'KS-010-C', name_fr: 'Naruto', chakra: 3, power: 3 },
      );
      const sasuke = mockCharInPlay(
        { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
        { id: 'KS-014-R', name_fr: 'Sasuke', chakra: 4, power: 5 },
      );
      const rashomon = mockCharInPlay(
        { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false, rempartLockedTargetId: sasuke.instanceId },
        {
          id: 'KS-067-UC',
          name_fr: 'Rashomon',
          chakra: 3,
          power: 0,
          number: 67,
          effects: [{ type: 'MAIN', description: '[⧗] Set strongest enemy in this mission to 0 Power and remove its tokens.' }],
        },
      );
      state.activeMissions[0].player1Characters = [naruto, sasuke];
      state.activeMissions[0].player2Characters = [rashomon];

      const narutoFinal = calculateCharacterPower(state, naruto, 'player1');
      const sasukeFinal = calculateCharacterPower(state, sasuke, 'player1');
      expect(narutoFinal).toBe(3);
      expect(sasukeFinal).toBe(0);
    });
  });

  describe('G3: Rashomon lock re-checks on situation change (via applyRempartTokenRemoval)', () => {
    it('clears all Rashomon locks at start of applyRempartTokenRemoval (forces re-pick)', () => {
      const state = createActionPhaseState({});
      state.activeMissions[0] = {
        ...state.activeMissions[0],
        player1Characters: [],
        player2Characters: [],
      };

      const weakChar = mockCharInPlay(
        { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
        { id: 'KS-010-C', name_fr: 'Naruto', chakra: 3, power: 3 },
      );
      const strongChar = mockCharInPlay(
        { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
        { id: 'KS-014-R', name_fr: 'Sasuke', chakra: 5, power: 8 },
      );
      const rashomon = mockCharInPlay(
        { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false, rempartLockedTargetId: weakChar.instanceId },
        {
          id: 'KS-067-UC',
          name_fr: 'Rashomon',
          chakra: 3,
          power: 0,
          number: 67,
          effects: [{ type: 'MAIN', description: '[⧗] Set strongest enemy in this mission to 0 Power and remove its tokens.' }],
        },
      );
      state.activeMissions[0].player1Characters = [weakChar, strongChar];
      state.activeMissions[0].player2Characters = [rashomon];

      const after = applyRempartTokenRemoval(state);
      const rashomonAfter = after.activeMissions[0].player2Characters.find((c) => c.instanceId === rashomon.instanceId);
      expect(rashomonAfter).toBeDefined();
      expect(rashomonAfter!.rempartLockedTargetId).toBe(strongChar.instanceId);
    });

    it('re-picks target when previously-locked target has lost power tokens', () => {
      const state = createActionPhaseState({});
      state.activeMissions[0] = {
        ...state.activeMissions[0],
        player1Characters: [],
        player2Characters: [],
      };

      const jirobo = mockCharInPlay(
        { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false, powerTokens: 0 },
        { id: 'KS-122-R', name_fr: 'Jirobo', chakra: 4, power: 6 },
      );
      const jiraiya = mockCharInPlay(
        { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
        { id: 'KS-105-R', name_fr: 'Jiraiya', chakra: 5, power: 8 },
      );
      const rashomon = mockCharInPlay(
        { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false, rempartLockedTargetId: jirobo.instanceId },
        {
          id: 'KS-067-UC',
          name_fr: 'Rashomon',
          chakra: 3,
          power: 0,
          number: 67,
          effects: [{ type: 'MAIN', description: '[⧗] Set strongest enemy in this mission to 0 Power and remove its tokens.' }],
        },
      );
      state.activeMissions[0].player1Characters = [jirobo, jiraiya];
      state.activeMissions[0].player2Characters = [rashomon];

      const after = applyRempartTokenRemoval(state);
      const rashomonAfter = after.activeMissions[0].player2Characters.find((c) => c.instanceId === rashomon.instanceId);
      expect(rashomonAfter!.rempartLockedTargetId).toBe(jiraiya.instanceId);
    });

    it('keeps the same target if it is still the highest CORE', () => {
      const state = createActionPhaseState({});
      state.activeMissions[0] = {
        ...state.activeMissions[0],
        player1Characters: [],
        player2Characters: [],
      };

      const strongChar = mockCharInPlay(
        { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
        { id: 'KS-105-R', name_fr: 'Jiraiya', chakra: 5, power: 8 },
      );
      const weakChar = mockCharInPlay(
        { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
        { id: 'KS-010-C', name_fr: 'Naruto', chakra: 3, power: 3 },
      );
      const rashomon = mockCharInPlay(
        { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false, rempartLockedTargetId: strongChar.instanceId },
        {
          id: 'KS-067-UC',
          name_fr: 'Rashomon',
          chakra: 3,
          power: 0,
          number: 67,
          effects: [{ type: 'MAIN', description: '[⧗] Set strongest enemy in this mission to 0 Power and remove its tokens.' }],
        },
      );
      state.activeMissions[0].player1Characters = [strongChar, weakChar];
      state.activeMissions[0].player2Characters = [rashomon];

      const after = applyRempartTokenRemoval(state);
      const rashomonAfter = after.activeMissions[0].player2Characters.find((c) => c.instanceId === rashomon.instanceId);
      expect(rashomonAfter!.rempartLockedTargetId).toBe(strongChar.instanceId);
    });
  });
});
