import { describe, it, expect } from 'vitest';
import { EffectEngine } from '../effects/EffectEngine';
import { createActionPhaseState, mockMission, mockCharInPlay } from './testHelpers';

function addSecondMission(state: ReturnType<typeof createActionPhaseState>) {
  const m2 = mockMission({ id: 'KS-002-MMS', name_fr: 'Mission 2', basePoints: 4 });
  state.activeMissions = [
    state.activeMissions[0],
    {
      card: m2,
      rank: 'C',
      basePoints: 4,
      rankBonus: 2,
      player1Characters: [],
      player2Characters: [],
      wonBy: null,
    },
  ];
  return state;
}

describe('Move with No Repetition conflict — BLOCKED at destination (Phase H)', () => {
  it('move from mission 0 → mission 1 with same-name conflict on destination side is BLOCKED', () => {
    const state = addSecondMission(createActionPhaseState({}));
    const myNarutoAtM0 = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-108-R', name_fr: 'Naruto', chakra: 4 },
    );
    const myNarutoAtM1 = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 1, isHidden: false },
      { id: 'KS-010-C', name_fr: 'Naruto', chakra: 3 },
    );
    state.activeMissions[0].player1Characters = [myNarutoAtM0];
    state.activeMissions[1].player1Characters = [myNarutoAtM1];

    const newState = EffectEngine.moveCharToMissionDirectPublic(
      state, myNarutoAtM0.instanceId, 1, 'player1', 'Temari', 'KS-079-R',
    );

    const stillAtM0 = newState.activeMissions[0].player1Characters.find((c) => c.instanceId === myNarutoAtM0.instanceId);
    expect(stillAtM0).toBeDefined();

    const charsAtM1 = newState.activeMissions[1].player1Characters;
    expect(charsAtM1.length).toBe(1);
    expect(charsAtM1[0].instanceId).toBe(myNarutoAtM1.instanceId);

    expect(state.player1.discardPile.length).toBe(0);
    expect(state.player2.discardPile.length).toBe(0);
  });

  it('blocked move logs moveNameConflictBlocked', () => {
    const state = addSecondMission(createActionPhaseState({}));
    const myNarutoAtM0 = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-108-R', name_fr: 'Naruto', chakra: 4 },
    );
    const myNarutoAtM1 = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 1, isHidden: false },
      { id: 'KS-010-C', name_fr: 'Naruto', chakra: 3 },
    );
    state.activeMissions[0].player1Characters = [myNarutoAtM0];
    state.activeMissions[1].player1Characters = [myNarutoAtM1];

    const newState = EffectEngine.moveCharToMissionDirectPublic(
      state, myNarutoAtM0.instanceId, 1, 'player1', 'Temari', 'KS-079-R',
    );

    const lastLog = newState.log[newState.log.length - 1];
    expect(lastLog.messageKey).toBe('game.log.effect.moveNameConflictBlocked');
  });

  it('enemy-initiated move into a friendly-occupied-by-same-name mission is BLOCKED (Itachi 143 enemy move semantic)', () => {
    const state = addSecondMission(createActionPhaseState({}));
    const enemyNarutoAtM0 = mockCharInPlay(
      { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false },
      { id: 'KS-009-C', name_fr: 'Naruto', chakra: 3 },
    );
    const enemyNarutoAtM1 = mockCharInPlay(
      { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 1, isHidden: false },
      { id: 'KS-108-R', name_fr: 'Naruto', chakra: 4 },
    );
    state.activeMissions[0].player2Characters = [enemyNarutoAtM0];
    state.activeMissions[1].player2Characters = [enemyNarutoAtM1];

    const newState = EffectEngine.moveCharToMissionDirectPublic(
      state, enemyNarutoAtM0.instanceId, 1, 'player2', 'Itachi Uchiwa', 'KS-143-M', 'player1',
    );

    const stillAtM0 = newState.activeMissions[0].player2Characters.find((c) => c.instanceId === enemyNarutoAtM0.instanceId);
    expect(stillAtM0).toBeDefined();
    expect(newState.activeMissions[1].player2Characters.length).toBe(1);
    expect(newState.activeMissions[1].player2Characters[0].instanceId).toBe(enemyNarutoAtM1.instanceId);

    expect(state.player2.discardPile.length).toBe(0);
  });

  it('move to mission without conflict succeeds (no block)', () => {
    const state = addSecondMission(createActionPhaseState({}));
    const myNaruto = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-108-R', name_fr: 'Naruto', chakra: 4 },
    );
    const mySasuke = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 1, isHidden: false },
      { id: 'KS-014-R', name_fr: 'Sasuke', chakra: 4 },
    );
    state.activeMissions[0].player1Characters = [myNaruto];
    state.activeMissions[1].player1Characters = [mySasuke];

    const newState = EffectEngine.moveCharToMissionDirectPublic(
      state, myNaruto.instanceId, 1, 'player1', 'Temari', 'KS-079-R',
    );

    expect(newState.activeMissions[0].player1Characters.length).toBe(0);
    expect(newState.activeMissions[1].player1Characters.length).toBe(2);
    const ids = newState.activeMissions[1].player1Characters.map((c) => c.instanceId).sort();
    expect(ids).toContain(myNaruto.instanceId);
    expect(ids).toContain(mySasuke.instanceId);
  });

  it('hidden character can move into mission with same-name visible (hidden has no visible name)', () => {
    const state = addSecondMission(createActionPhaseState({}));
    const hiddenNarutoAtM0 = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: true, wasRevealedAtLeastOnce: false },
      { id: 'KS-108-R', name_fr: 'Naruto', chakra: 4 },
    );
    const visibleNarutoAtM1 = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 1, isHidden: false },
      { id: 'KS-010-C', name_fr: 'Naruto', chakra: 3 },
    );
    state.activeMissions[0].player1Characters = [hiddenNarutoAtM0];
    state.activeMissions[1].player1Characters = [visibleNarutoAtM1];

    const newState = EffectEngine.moveCharToMissionDirectPublic(
      state, hiddenNarutoAtM0.instanceId, 1, 'player1', 'Temari', 'KS-079-R',
    );

    expect(newState.activeMissions[0].player1Characters.length).toBe(0);
    expect(newState.activeMissions[1].player1Characters.length).toBe(2);
  });

  it('move blocked: source character keeps power tokens (no state mutation on block)', () => {
    const state = addSecondMission(createActionPhaseState({}));
    const myNarutoAtM0 = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false, powerTokens: 3 },
      { id: 'KS-108-R', name_fr: 'Naruto', chakra: 4 },
    );
    const myNarutoAtM1 = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 1, isHidden: false },
      { id: 'KS-010-C', name_fr: 'Naruto', chakra: 3 },
    );
    state.activeMissions[0].player1Characters = [myNarutoAtM0];
    state.activeMissions[1].player1Characters = [myNarutoAtM1];

    const newState = EffectEngine.moveCharToMissionDirectPublic(
      state, myNarutoAtM0.instanceId, 1, 'player1', 'Temari', 'KS-079-R',
    );

    const stillAtM0 = newState.activeMissions[0].player1Characters.find((c) => c.instanceId === myNarutoAtM0.instanceId);
    expect(stillAtM0).toBeDefined();
    expect(stillAtM0!.powerTokens).toBe(3);
  });
});
