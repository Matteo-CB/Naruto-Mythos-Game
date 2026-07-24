import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { mockCharInPlay, mockMission, createActionPhaseState, mockCharacter } from './testHelpers';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { generateInstanceId } from '@/lib/engine/utils/id';
import type { GameState } from '@/lib/engine/types';

function setup053(missionCount: number): { state: GameState; kabInstance: string } {
  const missions = [];
  for (let i = 0; i < missionCount; i++) {
    missions.push({ card: mockMission({ id: `m${i}` }), rank: 'D' as const, basePoints: 3, rankBonus: 1, player1Characters: [], player2Characters: [], wonBy: null });
  }
  const state = createActionPhaseState({ activeMissions: missions });
  const kabInstance = generateInstanceId();
  const kabuto = mockCharInPlay({ instanceId: kabInstance, controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0 }, {
    id: 'KS-053-UC', number: 53, name_fr: 'KABUTO YAKUSHI', chakra: 4, power: 4, group: 'Sound Village',
    effects: [
      { type: 'UPGRADE', description: 'Discard a card.' },
      { type: 'MAIN', description: 'Play a character from your discard pile anywhere paying 3 less.' },
    ],
  });
  state.activeMissions[0].player1Characters.push(kabuto);
  state.player1.discardPile = [mockCharacter({ id: 'KS-010-C', name_fr: 'NARUTO', chakra: 3, power: 3 })];
  state.player1.chakra = 10;
  return { state, kabInstance };
}

describe('Kabuto 053 MAIN — requires an explicit confirmation before replaying from discard', () => {
  beforeAll(async () => { await initializeRegistry(); });

  it('playing it creates a CONFIRM_MAIN popup and does NOT auto-play the discard card', () => {
    const { state } = setup053(1);
    const kabuto = state.activeMissions[0].player1Characters[0];
    const after = EffectEngine.resolvePlayEffects(state, 'player1', kabuto, 0, false);
    expect(after.pendingEffects.map((p) => p.targetSelectionType)).toContain('KABUTO053_CONFIRM_MAIN');
    expect(after.player1.discardPile.length).toBe(1);
    expect(after.activeMissions[0].player1Characters).toHaveLength(1);
  });

  it('confirming plays the top discard character (single valid mission auto-resolves after confirm)', () => {
    const { state, kabInstance } = setup053(1);
    const kabuto = state.activeMissions[0].player1Characters[0];
    let after = EffectEngine.resolvePlayEffects(state, 'player1', kabuto, 0, false);
    const pending = after.pendingEffects.find((p) => p.targetSelectionType === 'KABUTO053_CONFIRM_MAIN')!;
    after = EffectEngine.applyTargetedEffect(after, pending, [kabInstance]);
    const played = after.activeMissions[0].player1Characters.find((c) => {
      const top = c.stack?.length ? c.stack[c.stack.length - 1] : c.card;
      return top.name_fr === 'NARUTO';
    });
    expect(played).toBeDefined();
    expect(after.player1.discardPile.length).toBe(0);
  });

  it('declining the confirmation skips the effect (discard untouched, nothing replayed)', () => {
    const { state, kabInstance } = setup053(1);
    const kabuto = state.activeMissions[0].player1Characters[0];
    let after = EffectEngine.resolvePlayEffects(state, 'player1', kabuto, 0, false);
    const pending = after.pendingEffects.find((p) => p.targetSelectionType === 'KABUTO053_CONFIRM_MAIN')!;
    after = EffectEngine.applyTargetedEffect(after, pending, ['skip']);
    expect(after.player1.discardPile.length).toBe(1);
    expect(after.activeMissions[0].player1Characters).toHaveLength(1);
    expect(after.activeMissions[0].player1Characters[0].instanceId).toBe(kabInstance);
  });

  it('with multiple valid missions, confirming then opens the mission choice (still no silent auto-play)', () => {
    const { state } = setup053(2);
    const kabuto = state.activeMissions[0].player1Characters[0];
    let after = EffectEngine.resolvePlayEffects(state, 'player1', kabuto, 0, false);
    const pending = after.pendingEffects.find((p) => p.targetSelectionType === 'KABUTO053_CONFIRM_MAIN')!;
    after = EffectEngine.applyTargetedEffect(after, pending, [kabuto.instanceId]);
    expect(after.pendingEffects.map((p) => p.targetSelectionType)).toContain('KABUTO053_CHOOSE_MISSION');
    expect(after.player1.discardPile.length).toBe(1);
  });
});
