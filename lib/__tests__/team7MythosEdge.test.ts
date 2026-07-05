import { describe, it, expect } from 'vitest';
import { mockCharInPlay, mockMission, createActionPhaseState } from './testHelpers';
import { calculateCharacterPower } from '../engine/phases/PowerCalculation';
import { GameEngine } from '../engine/GameEngine';
import { getEffectHandler } from '../effects/EffectRegistry';
import { registerAllSetHandlers } from '../effects/handlers';
import { getCharacterById } from '../data/cardIndex';
import { isVariantRarity } from '../variants/constants';
import type { GameState } from '../engine/types';

registerAllSetHandlers();

function missionWith(p1: ReturnType<typeof mockCharInPlay>[], p2: ReturnType<typeof mockCharInPlay>[]) {
  return { card: mockMission({ id: 'm0' }), rank: 'D' as const, basePoints: 3, rankBonus: 1, player1Characters: p1, player2Characters: p2, wonBy: null };
}

describe('Mythos Team 7 Edge-conditional power (145/146/147)', () => {
  it('147 Sakura: +3 Power only while its owner holds the Edge', () => {
    const sakura = mockCharInPlay(
      { instanceId: 's147', missionIndex: 0, controlledBy: 'player1', originalOwner: 'player1' },
      { number: 147, power: 4, keywords: ['Team 7'], effects: [{ type: 'MAIN', description: '[⧗] If you have the Edge, this character has +3 Power.' }] },
    );
    const withEdge = createActionPhaseState({ edgeHolder: 'player1', activeMissions: [missionWith([sakura], [])] });
    expect(calculateCharacterPower(withEdge, sakura, 'player1')).toBe(7);
    const noEdge = createActionPhaseState({ edgeHolder: 'player2', activeMissions: [missionWith([sakura], [])] });
    expect(calculateCharacterPower(noEdge, sakura, 'player1')).toBe(4);
  });

  it('145 Naruto: friendly hidden character +1 Power while owner holds the Edge', () => {
    const naruto = mockCharInPlay(
      { instanceId: 'n145', missionIndex: 0, controlledBy: 'player1', originalOwner: 'player1' },
      { number: 145, power: 4, keywords: ['Team 7'], effects: [{ type: 'MAIN', description: '[⧗] If you have the Edge, your hidden characters in this mission have +1 Power.' }] },
    );
    const hiddenAlly = mockCharInPlay(
      { instanceId: 'h1', missionIndex: 0, isHidden: true, controlledBy: 'player1', originalOwner: 'player1' },
      { number: 90, power: 5 },
    );
    const withEdge = createActionPhaseState({ edgeHolder: 'player1', activeMissions: [missionWith([naruto, hiddenAlly], [])] });
    expect(calculateCharacterPower(withEdge, hiddenAlly, 'player1')).toBe(1);
    const noEdge = createActionPhaseState({ edgeHolder: 'player2', activeMissions: [missionWith([naruto, hiddenAlly], [])] });
    expect(calculateCharacterPower(noEdge, hiddenAlly, 'player1')).toBe(0);
  });

  it('146 Sasuke: enemy hidden character -1 Power while 146 owner holds the Edge', () => {
    const sasuke = mockCharInPlay(
      { instanceId: 's146', missionIndex: 0, controlledBy: 'player2', originalOwner: 'player2' },
      { number: 146, power: 4, keywords: ['Team 7'], effects: [{ type: 'MAIN', description: '[⧗] If you have the Edge, enemy hidden characters in this mission have -1 Power.' }] },
    );
    const hiddenEnemy = mockCharInPlay(
      { instanceId: 'h2', missionIndex: 0, isHidden: true, controlledBy: 'player1', originalOwner: 'player1' },
      { number: 91, power: 5 },
    );
    const p2HasEdge = createActionPhaseState({ edgeHolder: 'player2', activeMissions: [missionWith([hiddenEnemy], [sasuke])] });
    const p1HasEdge = createActionPhaseState({ edgeHolder: 'player1', activeMissions: [missionWith([hiddenEnemy], [sasuke])] });
    expect(calculateCharacterPower(p2HasEdge, hiddenEnemy, 'player1')).toBe(calculateCharacterPower(p1HasEdge, hiddenEnemy, 'player1') - 1);
  });
});

describe('Kakashi 148 edge-lock', () => {
  it('locked Edge does not transfer when the other player passes first', () => {
    const base = createActionPhaseState({
      activePlayer: 'player2',
      edgeHolder: 'player1',
      edgeLockedFor: 'player1',
      firstPasser: null,
    });
    const state: GameState = { ...base, activeMissions: [missionWith([], [])] };
    const after = GameEngine.applyAction(state, 'player2', { type: 'PASS' });
    expect(after.edgeHolder).toBe('player1');
    expect(after.firstPasser).toBe('player2');
  });

  it('without lock, the first passer takes the Edge', () => {
    const base = createActionPhaseState({ activePlayer: 'player2', edgeHolder: 'player1', edgeLockedFor: null, firstPasser: null });
    const state: GameState = { ...base, activeMissions: [missionWith([], [])] };
    const after = GameEngine.applyAction(state, 'player2', { type: 'PASS' });
    expect(after.edgeHolder).toBe('player2');
  });

  it('a second Kakashi cannot override an opponent-locked Edge', () => {
    const handler = getEffectHandler('KS-148-M', 'MAIN');
    expect(handler).toBeTruthy();
    const kakashi = mockCharInPlay(
      { instanceId: 'kak2', missionIndex: 0, controlledBy: 'player1', originalOwner: 'player1' },
      { number: 148, name_fr: 'KAKASHI HATAKE', id: 'KS-148-M' },
    );
    const base = createActionPhaseState({ edgeHolder: 'player2', edgeLockedFor: 'player2' });
    const state: GameState = { ...base, activeMissions: [missionWith([kakashi], [])] };
    const result = handler!({ state, sourcePlayer: 'player1', sourceCard: kakashi, sourceMissionIndex: 0, triggerType: 'MAIN', isUpgrade: false });
    expect(result.requiresTargetSelection).toBeFalsy();
    expect(result.state.edgeHolder).toBe('player2');
    expect(result.state.edgeLockedFor).toBe('player2');
  });

  it('Kakashi prompts a confirm (does not auto-apply) when the Edge is free', () => {
    const handler = getEffectHandler('KS-148-M', 'MAIN');
    const kakashi = mockCharInPlay(
      { instanceId: 'kak3', missionIndex: 0, controlledBy: 'player1', originalOwner: 'player1' },
      { number: 148, name_fr: 'KAKASHI HATAKE', id: 'KS-148-M' },
    );
    const base = createActionPhaseState({ edgeHolder: 'player2', edgeLockedFor: null });
    const state: GameState = { ...base, activeMissions: [missionWith([kakashi], [])] };
    const result = handler!({ state, sourcePlayer: 'player1', sourceCard: kakashi, sourceMissionIndex: 0, triggerType: 'MAIN', isUpgrade: false });
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('KAKASHI148_CONFIRM_MAIN');
    expect(result.state.edgeHolder).toBe('player2');
  });
});

describe('Minato Namikaze SS-122-SPV (Special Variant)', () => {
  it('card loads with SPV rarity, Hokage keyword and is NOT a locked variant', () => {
    const minato = getCharacterById('SS-122-SPV');
    expect(minato).toBeDefined();
    expect(minato!.rarity).toBe('SPV');
    expect(minato!.keywords).toContain('Hokage');
    expect(minato!.set).toBe('SS');
    expect(isVariantRarity('SPV')).toBe(false);
  });

  it('MAIN handler is registered and offers both an enemy Tailed Beast discard and a friendly Tailed Beast move', () => {
    const handler = getEffectHandler('SS-122-SPV', 'MAIN');
    expect(handler).toBeDefined();

    const minato = mockCharInPlay(
      { instanceId: 'minato', missionIndex: 0, controlledBy: 'player1', originalOwner: 'player1' },
      { id: 'SS-122-SPV', number: 122, power: 5, keywords: ['Hokage'] },
    );
    const friendlyTB = mockCharInPlay(
      { instanceId: 'kurama', missionIndex: 0, controlledBy: 'player1', originalOwner: 'player1' },
      { number: 200, power: 6, keywords: ['Tailed Beast'] },
    );
    const enemyTB = mockCharInPlay(
      { instanceId: 'shukaku', missionIndex: 0, controlledBy: 'player2', originalOwner: 'player2' },
      { number: 201, power: 4, keywords: ['Tailed Beast'] },
    );
    const m0 = missionWith([minato, friendlyTB], [enemyTB]);
    const m1 = { ...missionWith([], []), card: mockMission({ id: 'm1' }) };
    const state = createActionPhaseState({ activeMissions: [m0, m1] });

    const result = handler!({ state, sourcePlayer: 'player1', sourceCard: minato, sourceMissionIndex: 0, triggerType: 'MAIN', isUpgrade: false });
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('MINATO122_SELECT');
    expect(result.validTargets).toContain('shukaku');
    expect(result.validTargets).toContain('kurama');
  });
});
