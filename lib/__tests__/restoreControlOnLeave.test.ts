import { describe, it, expect } from 'vitest';
import { EffectEngine } from '../effects/EffectEngine';
import { createActionPhaseState, mockCharacter, mockCharInPlay } from './testHelpers';

describe('restoreControlOnLeave — No Repetition on control return (Phase D)', () => {
  it('returns a face-up stolen char to its originalOwner side when no conflict', () => {
    const state = createActionPhaseState({});
    const controller = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-020-UC', name_fr: 'Ino Yamanaka', chakra: 2 },
    );
    const stolenChar = mockCharInPlay(
      {
        controlledBy: 'player1',
        originalOwner: 'player2',
        controllerInstanceId: controller.instanceId,
        missionIndex: 0,
        isHidden: false,
      },
      { id: 'KS-010-C', name_fr: 'Naruto', chakra: 3 },
    );
    state.activeMissions[0].player1Characters = [controller, stolenChar];

    const newState = EffectEngine.restoreControlOnLeave(state, controller.instanceId);

    const p1Side = newState.activeMissions[0].player1Characters;
    const p2Side = newState.activeMissions[0].player2Characters;
    expect(p1Side.find((c) => c.instanceId === stolenChar.instanceId)).toBeUndefined();
    const returned = p2Side.find((c) => c.instanceId === stolenChar.instanceId);
    expect(returned).toBeDefined();
    expect(returned!.controlledBy).toBe('player2');
    expect(returned!.controllerInstanceId).toBeUndefined();
    expect(newState.player2.discardPile).toHaveLength(0);
  });

  it('discards the returning char to originalOwner discard when same-name face-up conflict on owner side', () => {
    const state = createActionPhaseState({});
    const controller = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-020-UC', name_fr: 'Ino Yamanaka', chakra: 2 },
    );
    const stolenNaruto = mockCharInPlay(
      {
        controlledBy: 'player1',
        originalOwner: 'player2',
        controllerInstanceId: controller.instanceId,
        missionIndex: 0,
        isHidden: false,
      },
      { id: 'KS-009-C', name_fr: 'Naruto', chakra: 2 },
    );
    const newP2Naruto = mockCharInPlay(
      { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false },
      { id: 'KS-108-R', name_fr: 'Naruto', chakra: 5 },
    );
    state.activeMissions[0].player1Characters = [controller, stolenNaruto];
    state.activeMissions[0].player2Characters = [newP2Naruto];

    const p2DiscardBefore = state.player2.discardPile.length;
    const newState = EffectEngine.restoreControlOnLeave(state, controller.instanceId);

    expect(newState.activeMissions[0].player1Characters.find((c) => c.instanceId === stolenNaruto.instanceId)).toBeUndefined();
    expect(newState.activeMissions[0].player2Characters.find((c) => c.instanceId === stolenNaruto.instanceId)).toBeUndefined();
    expect(newState.activeMissions[0].player2Characters).toHaveLength(1);
    expect(newState.activeMissions[0].player2Characters[0].instanceId).toBe(newP2Naruto.instanceId);

    expect(newState.player2.discardPile.length).toBe(p2DiscardBefore + 1);
    expect(newState.player2.discardPile[newState.player2.discardPile.length - 1].id).toBe('KS-009-C');
  });

  it('returns a hidden stolen char to originalOwner side, no immediate discard (hidden has no visible name)', () => {
    const state = createActionPhaseState({});
    const controller = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-020-UC', name_fr: 'Ino Yamanaka', chakra: 2 },
    );
    const stolenHidden = mockCharInPlay(
      {
        controlledBy: 'player1',
        originalOwner: 'player2',
        controllerInstanceId: controller.instanceId,
        missionIndex: 0,
        isHidden: true,
        wasRevealedAtLeastOnce: false,
      },
      { id: 'KS-010-C', name_fr: 'Naruto', chakra: 3 },
    );
    const p2Naruto = mockCharInPlay(
      { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false },
      { id: 'KS-108-R', name_fr: 'Naruto', chakra: 5 },
    );
    state.activeMissions[0].player1Characters = [controller, stolenHidden];
    state.activeMissions[0].player2Characters = [p2Naruto];

    const p2DiscardBefore = state.player2.discardPile.length;
    const newState = EffectEngine.restoreControlOnLeave(state, controller.instanceId);

    const returned = newState.activeMissions[0].player2Characters.find((c) => c.instanceId === stolenHidden.instanceId);
    expect(returned).toBeDefined();
    expect(returned!.isHidden).toBe(true);
    expect(newState.player2.discardPile.length).toBe(p2DiscardBefore);
  });

  it('does NOT fire defeat triggers on No Rep discard (no pendingEffects added)', () => {
    const state = createActionPhaseState({});
    const controller = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-020-UC', name_fr: 'Ino Yamanaka', chakra: 2 },
    );
    const stolenNaruto = mockCharInPlay(
      {
        controlledBy: 'player1',
        originalOwner: 'player2',
        controllerInstanceId: controller.instanceId,
        missionIndex: 0,
        isHidden: false,
      },
      { id: 'KS-009-C', name_fr: 'Naruto', chakra: 2 },
    );
    const p2Naruto = mockCharInPlay(
      { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false },
      { id: 'KS-108-R', name_fr: 'Naruto', chakra: 5 },
    );
    state.activeMissions[0].player1Characters = [controller, stolenNaruto];
    state.activeMissions[0].player2Characters = [p2Naruto];

    const pendingBefore = state.pendingEffects.length;
    const newState = EffectEngine.restoreControlOnLeave(state, controller.instanceId);

    expect(newState.pendingEffects.length).toBe(pendingBefore);
  });

  it('discards the entire multi-card stack when the returning stolen char was upgraded', () => {
    const state = createActionPhaseState({});
    const controller = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-020-UC', name_fr: 'Ino Yamanaka', chakra: 2 },
    );
    const bottomCard = mockCharacter({ id: 'KS-009-C', name_fr: 'Naruto', chakra: 2 });
    const topUpgradeCard = mockCharacter({ id: 'KS-108-R', name_fr: 'Naruto', chakra: 5 });
    const stolenUpgradedNaruto = mockCharInPlay(
      {
        controlledBy: 'player1',
        originalOwner: 'player2',
        controllerInstanceId: controller.instanceId,
        missionIndex: 0,
        isHidden: false,
        stack: [bottomCard, topUpgradeCard],
      },
      topUpgradeCard,
    );
    const p2OtherNaruto = mockCharInPlay(
      { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false },
      { id: 'KS-010-C', name_fr: 'Naruto', chakra: 3 },
    );
    state.activeMissions[0].player1Characters = [controller, stolenUpgradedNaruto];
    state.activeMissions[0].player2Characters = [p2OtherNaruto];

    const p2DiscardBefore = state.player2.discardPile.length;
    const newState = EffectEngine.restoreControlOnLeave(state, controller.instanceId);

    expect(newState.player2.discardPile.length).toBe(p2DiscardBefore + 2);
    const discardedIds = newState.player2.discardPile.slice(p2DiscardBefore).map((c) => c.id);
    expect(discardedIds).toContain('KS-009-C');
    expect(discardedIds).toContain('KS-108-R');
  });

  it('returns multi-card stolen stack intact to originalOwner side when no conflict', () => {
    const state = createActionPhaseState({});
    const controller = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-020-UC', name_fr: 'Ino Yamanaka', chakra: 2 },
    );
    const bottomCard = mockCharacter({ id: 'KS-009-C', name_fr: 'Naruto', chakra: 2 });
    const topUpgradeCard = mockCharacter({ id: 'KS-108-R', name_fr: 'Naruto', chakra: 5 });
    const stolenUpgradedNaruto = mockCharInPlay(
      {
        controlledBy: 'player1',
        originalOwner: 'player2',
        controllerInstanceId: controller.instanceId,
        missionIndex: 0,
        isHidden: false,
        stack: [bottomCard, topUpgradeCard],
      },
      topUpgradeCard,
    );
    state.activeMissions[0].player1Characters = [controller, stolenUpgradedNaruto];
    state.activeMissions[0].player2Characters = [];

    const newState = EffectEngine.restoreControlOnLeave(state, controller.instanceId);

    const returned = newState.activeMissions[0].player2Characters.find((c) => c.instanceId === stolenUpgradedNaruto.instanceId);
    expect(returned).toBeDefined();
    expect(returned!.stack).toHaveLength(2);
    expect(returned!.stack[0].id).toBe('KS-009-C');
    expect(returned!.stack[1].id).toBe('KS-108-R');
    expect(returned!.controlledBy).toBe('player2');
    expect(returned!.controllerInstanceId).toBeUndefined();
    expect(newState.player2.discardPile).toHaveLength(0);
  });

  it('handles multiple controlled chars from same controller on same mission', () => {
    const state = createActionPhaseState({});
    const controller = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-140-S', name_fr: 'Itachi', chakra: 5 },
    );
    const stolenChar1 = mockCharInPlay(
      {
        controlledBy: 'player1',
        originalOwner: 'player2',
        controllerInstanceId: controller.instanceId,
        missionIndex: 0,
        isHidden: false,
      },
      { id: 'KS-013-C', name_fr: 'Sasuke', chakra: 2 },
    );
    const stolenChar2 = mockCharInPlay(
      {
        controlledBy: 'player1',
        originalOwner: 'player2',
        controllerInstanceId: controller.instanceId,
        missionIndex: 0,
        isHidden: false,
      },
      { id: 'KS-031-UC', name_fr: 'Hinata', chakra: 1 },
    );
    state.activeMissions[0].player1Characters = [controller, stolenChar1, stolenChar2];

    const newState = EffectEngine.restoreControlOnLeave(state, controller.instanceId);

    const sasukeReturned = newState.activeMissions[0].player2Characters.find((c) => c.instanceId === stolenChar1.instanceId);
    expect(sasukeReturned).toBeDefined();
    expect(sasukeReturned!.controlledBy).toBe('player2');
    const hinataReturned = newState.activeMissions[0].player2Characters.find((c) => c.instanceId === stolenChar2.instanceId);
    expect(hinataReturned).toBeDefined();
    expect(hinataReturned!.controlledBy).toBe('player2');
  });

  it('ignores chars with non-matching controllerInstanceId (only releases the right controller)', () => {
    const state = createActionPhaseState({});
    const controllerA = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-020-UC', name_fr: 'Ino Yamanaka', chakra: 2 },
    );
    const controllerB = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-140-S', name_fr: 'Itachi', chakra: 5 },
    );
    const stolenByA = mockCharInPlay(
      {
        controlledBy: 'player1',
        originalOwner: 'player2',
        controllerInstanceId: controllerA.instanceId,
        missionIndex: 0,
        isHidden: false,
      },
      { id: 'KS-009-C', name_fr: 'Sasuke', chakra: 2 },
    );
    const stolenByB = mockCharInPlay(
      {
        controlledBy: 'player1',
        originalOwner: 'player2',
        controllerInstanceId: controllerB.instanceId,
        missionIndex: 0,
        isHidden: false,
      },
      { id: 'KS-031-UC', name_fr: 'Hinata', chakra: 1 },
    );
    state.activeMissions[0].player1Characters = [controllerA, controllerB, stolenByA, stolenByB];

    const newState = EffectEngine.restoreControlOnLeave(state, controllerA.instanceId);

    const sasukeReturned = newState.activeMissions[0].player2Characters.find((c) => c.instanceId === stolenByA.instanceId);
    expect(sasukeReturned).toBeDefined();
    expect(sasukeReturned!.controlledBy).toBe('player2');

    const hinataStillControlled = newState.activeMissions[0].player1Characters.find((c) => c.instanceId === stolenByB.instanceId);
    expect(hinataStillControlled).toBeDefined();
    expect(hinataStillControlled!.controlledBy).toBe('player1');
    expect(hinataStillControlled!.controllerInstanceId).toBe(controllerB.instanceId);
  });

  it('returns state unchanged if no chars are controlled by the given controller', () => {
    const state = createActionPhaseState({});
    const controller = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-020-UC', name_fr: 'Ino Yamanaka', chakra: 2 },
    );
    state.activeMissions[0].player1Characters = [controller];

    const newState = EffectEngine.restoreControlOnLeave(state, controller.instanceId);
    expect(newState).toBe(state);
  });

  it('logs controlReturnedConflict key when discarding due to conflict', () => {
    const state = createActionPhaseState({});
    const controller = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-020-UC', name_fr: 'Ino Yamanaka', chakra: 2 },
    );
    const stolenNaruto = mockCharInPlay(
      {
        controlledBy: 'player1',
        originalOwner: 'player2',
        controllerInstanceId: controller.instanceId,
        missionIndex: 0,
        isHidden: false,
      },
      { id: 'KS-009-C', name_fr: 'Naruto', chakra: 2 },
    );
    const p2Naruto = mockCharInPlay(
      { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false },
      { id: 'KS-108-R', name_fr: 'Naruto', chakra: 5 },
    );
    state.activeMissions[0].player1Characters = [controller, stolenNaruto];
    state.activeMissions[0].player2Characters = [p2Naruto];

    const newState = EffectEngine.restoreControlOnLeave(state, controller.instanceId);

    const lastLog = newState.log[newState.log.length - 1];
    expect(lastLog.messageKey).toBe('game.log.effect.controlReturnedConflict');
  });

  it('logs controlReturned key on normal return without conflict', () => {
    const state = createActionPhaseState({});
    const controller = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-020-UC', name_fr: 'Ino Yamanaka', chakra: 2 },
    );
    const stolenChar = mockCharInPlay(
      {
        controlledBy: 'player1',
        originalOwner: 'player2',
        controllerInstanceId: controller.instanceId,
        missionIndex: 0,
        isHidden: false,
      },
      { id: 'KS-010-C', name_fr: 'Naruto', chakra: 3 },
    );
    state.activeMissions[0].player1Characters = [controller, stolenChar];

    const newState = EffectEngine.restoreControlOnLeave(state, controller.instanceId);

    const lastLog = newState.log[newState.log.length - 1];
    expect(lastLog.messageKey).toBe('game.log.effect.controlReturned');
  });
});
