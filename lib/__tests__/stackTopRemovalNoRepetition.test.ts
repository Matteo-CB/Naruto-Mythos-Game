import { describe, it, expect } from 'vitest';
import { EffectEngine } from '../effects/EffectEngine';
import type { PendingEffect, EffectType } from '../engine/types';
import { createActionPhaseState, mockCharacter, mockCharInPlay } from './testHelpers';

function makePending(sourcePlayer: 'player1' | 'player2'): PendingEffect {
  return {
    id: 'pe-kakashi106',
    sourceCardId: 'KS-106-R',
    sourceInstanceId: 'inst-kakashi',
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

describe('devolveUpgradedCharacter (Kakashi 106) — Stack-top removal No Rep (Phase F)', () => {
  it('normal devolve: removes top, surfaces new top, no conflict', () => {
    const state = createActionPhaseState({});
    const bottomCard = mockCharacter({ id: 'KS-014-R', name_fr: 'Sasuke', chakra: 3 });
    const topCard = mockCharacter({ id: 'KS-142-M', name_fr: 'Sasuke', chakra: 5 });
    const enemyChar = mockCharInPlay(
      {
        controlledBy: 'player2',
        originalOwner: 'player2',
        missionIndex: 0,
        isHidden: false,
        stack: [bottomCard, topCard],
      },
      topCard,
    );
    state.activeMissions[0].player2Characters = [enemyChar];

    const p2DiscardBefore = state.player2.discardPile.length;
    const newState = EffectEngine.devolveUpgradedCharacter(state, makePending('player1'), enemyChar.instanceId);

    const remaining = newState.activeMissions[0].player2Characters.find((c) => c.instanceId === enemyChar.instanceId);
    expect(remaining).toBeDefined();
    expect(remaining!.stack).toHaveLength(1);
    expect(remaining!.stack[0].id).toBe('KS-014-R');

    expect(newState.player2.discardPile.length).toBe(p2DiscardBefore + 1);
    expect(newState.player2.discardPile[newState.player2.discardPile.length - 1].id).toBe('KS-142-M');
  });

  it('Ichibi/Gaara scenario: devolve surfaces a name that conflicts → entire stack discarded', () => {
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
    const standaloneGaara = mockCharInPlay(
      { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false },
      { id: 'KS-076-UC', name_fr: 'Gaara', chakra: 4 },
    );
    state.activeMissions[0].player2Characters = [ichibiStack, standaloneGaara];

    const p2DiscardBefore = state.player2.discardPile.length;
    const newState = EffectEngine.devolveUpgradedCharacter(state, makePending('player1'), ichibiStack.instanceId);

    expect(newState.activeMissions[0].player2Characters.find((c) => c.instanceId === ichibiStack.instanceId)).toBeUndefined();
    const stillStanding = newState.activeMissions[0].player2Characters.find((c) => c.instanceId === standaloneGaara.instanceId);
    expect(stillStanding).toBeDefined();

    expect(newState.player2.discardPile.length).toBe(p2DiscardBefore + 2);
    const discardedIds = newState.player2.discardPile.slice(p2DiscardBefore).map((c) => c.id);
    expect(discardedIds).toContain('KS-117-S');
    expect(discardedIds).toContain('KS-075-R');
  });

  it('No Rep discard does NOT fire defeat triggers (no pendingEffects added)', () => {
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
    const standaloneGaara = mockCharInPlay(
      { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false },
      { id: 'KS-076-UC', name_fr: 'Gaara', chakra: 4 },
    );
    state.activeMissions[0].player2Characters = [ichibiStack, standaloneGaara];

    const pendingBefore = state.pendingEffects.length;
    const newState = EffectEngine.devolveUpgradedCharacter(state, makePending('player1'), ichibiStack.instanceId);

    expect(newState.pendingEffects.length).toBe(pendingBefore);
  });

  it('discarded top card goes to originalOwner, not controller (when char is stolen)', () => {
    const state = createActionPhaseState({});
    const bottomCard = mockCharacter({ id: 'KS-014-R', name_fr: 'Sasuke', chakra: 3 });
    const topCard = mockCharacter({ id: 'KS-142-M', name_fr: 'Sasuke', chakra: 5 });
    const stolenStack = mockCharInPlay(
      {
        controlledBy: 'player1',
        originalOwner: 'player2',
        controllerInstanceId: 'inst-ino',
        missionIndex: 0,
        isHidden: false,
        stack: [bottomCard, topCard],
      },
      topCard,
    );
    state.activeMissions[0].player1Characters = [stolenStack];

    const p1DiscardBefore = state.player1.discardPile.length;
    const p2DiscardBefore = state.player2.discardPile.length;
    const newState = EffectEngine.devolveUpgradedCharacter(state, makePending('player1'), stolenStack.instanceId);

    expect(newState.player1.discardPile.length).toBe(p1DiscardBefore);
    expect(newState.player2.discardPile.length).toBe(p2DiscardBefore + 1);
    expect(newState.player2.discardPile[newState.player2.discardPile.length - 1].id).toBe('KS-142-M');
  });

  it('No-op when targeting a single-card stack (cannot devolve)', () => {
    const state = createActionPhaseState({});
    const singleCardChar = mockCharInPlay(
      { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false },
      { id: 'KS-014-R', name_fr: 'Sasuke', chakra: 3 },
    );
    state.activeMissions[0].player2Characters = [singleCardChar];

    const newState = EffectEngine.devolveUpgradedCharacter(state, makePending('player1'), singleCardChar.instanceId);
    expect(newState).toBe(state);
  });

  it('Hidden char on side does NOT trigger No Rep conflict (hidden has no visible name)', () => {
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
    const hiddenGaara = mockCharInPlay(
      { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: true, wasRevealedAtLeastOnce: false },
      { id: 'KS-076-UC', name_fr: 'Gaara', chakra: 4 },
    );
    state.activeMissions[0].player2Characters = [ichibiStack, hiddenGaara];

    const newState = EffectEngine.devolveUpgradedCharacter(state, makePending('player1'), ichibiStack.instanceId);

    const remaining = newState.activeMissions[0].player2Characters.find((c) => c.instanceId === ichibiStack.instanceId);
    expect(remaining).toBeDefined();
    expect(remaining!.stack).toHaveLength(1);
    expect(remaining!.stack[0].id).toBe('KS-075-R');

    const stillHidden = newState.activeMissions[0].player2Characters.find((c) => c.instanceId === hiddenGaara.instanceId);
    expect(stillHidden).toBeDefined();
    expect(stillHidden!.isHidden).toBe(true);
  });

  it('Stolen char devolved with name conflict → entire stack discarded to originalOwner', () => {
    const state = createActionPhaseState({});
    const gaaraBottom = mockCharacter({ id: 'KS-075-R', name_fr: 'Gaara', chakra: 3 });
    const ichibiTop = mockCharacter({ id: 'KS-117-S', name_fr: 'Ichibi', chakra: 5 });
    const stolenIchibi = mockCharInPlay(
      {
        controlledBy: 'player1',
        originalOwner: 'player2',
        controllerInstanceId: 'inst-ino',
        missionIndex: 0,
        isHidden: false,
        stack: [gaaraBottom, ichibiTop],
      },
      ichibiTop,
    );
    const friendlyGaara = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-076-UC', name_fr: 'Gaara', chakra: 4 },
    );
    state.activeMissions[0].player1Characters = [stolenIchibi, friendlyGaara];

    const p1DiscardBefore = state.player1.discardPile.length;
    const p2DiscardBefore = state.player2.discardPile.length;
    const newState = EffectEngine.devolveUpgradedCharacter(state, makePending('player1'), stolenIchibi.instanceId);

    expect(newState.activeMissions[0].player1Characters.find((c) => c.instanceId === stolenIchibi.instanceId)).toBeUndefined();
    const stillFriendlyGaara = newState.activeMissions[0].player1Characters.find((c) => c.instanceId === friendlyGaara.instanceId);
    expect(stillFriendlyGaara).toBeDefined();

    expect(newState.player1.discardPile.length).toBe(p1DiscardBefore);
    expect(newState.player2.discardPile.length).toBe(p2DiscardBefore + 2);
    const discardedIds = newState.player2.discardPile.slice(p2DiscardBefore).map((c) => c.id);
    expect(discardedIds).toContain('KS-117-S');
    expect(discardedIds).toContain('KS-075-R');
  });
});
