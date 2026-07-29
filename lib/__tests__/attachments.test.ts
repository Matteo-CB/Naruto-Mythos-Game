import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { getCardById } from '@/lib/data/cardIndex';
import { GameEngine } from '@/lib/engine/GameEngine';
import { getEffectivePower } from '@/lib/effects/powerUtils';
import { defeatEnemyCharacter } from '@/lib/effects/defeatUtils';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import type { CharacterCard, GameState } from '@/lib/engine/types';

function att(id: string): CharacterCard {
  return getCardById(id) as CharacterCard;
}

describe('attachments (new set 2 mechanic)', () => {
  beforeAll(() => { initializeRegistry(); });

  it('Curry of Life attaches to the friendly character, POWERUP 3 when no tokens, adds its own Power', () => {
    const st = buildSimState({ p1: [simChar('KS-009-C', { owner: 'player1', instanceId: 'naruto' })], p2: [], missions: 2, chakra1: 10 });
    st.player1.hand = [att('SS-082-C')];
    const s = GameEngine.applyAction(st, 'player1', { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false });
    const naruto = s.activeMissions[0].player1Characters.find((c) => c.instanceId === 'naruto')!;
    expect(naruto.attachments?.length).toBe(1);
    expect(naruto.powerTokens).toBe(3);
    expect(getEffectivePower(s, naruto, 'player1')).toBe(7);
    expect(s.player1.chakra).toBe(9);
  });

  it('Curry of Life gives no POWERUP when the host already has tokens', () => {
    const st = buildSimState({ p1: [simChar('KS-009-C', { owner: 'player1', instanceId: 'naruto', powerTokens: 1 })], p2: [], missions: 2, chakra1: 10 });
    st.player1.hand = [att('SS-082-C')];
    const s = GameEngine.applyAction(st, 'player1', { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false });
    const naruto = s.activeMissions[0].player1Characters.find((c) => c.instanceId === 'naruto')!;
    expect(naruto.powerTokens).toBe(1);
    expect(naruto.attachments?.length).toBe(1);
  });

  it('cannot play Curry of Life face up without a friendly non-hidden character on the mission', () => {
    const st = buildSimState({ p1: [], p2: [], missions: 2, chakra1: 10 });
    st.player1.hand = [att('SS-082-C')];
    const s = GameEngine.applyAction(st, 'player1', { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false });
    expect(s.player1.hand.length).toBe(1);
    expect(s.player1.chakra).toBe(10);
  });

  it('Choji SS-128 doubles Food attachment power on himself', () => {
    const st = buildSimState({ p1: [simChar('SS-128-R', { owner: 'player1', instanceId: 'choji' })], p2: [], missions: 2, chakra1: 10 });
    st.player1.hand = [att('SS-082-C')];
    const s = GameEngine.applyAction(st, 'player1', { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false });
    const choji = s.activeMissions[0].player1Characters.find((c) => c.instanceId === 'choji')!;
    expect(getEffectivePower(s, choji, 'player1')).toBe(11);
  });

  it('a face down attachment generates start-of-turn chakra, being treated as a character', () => {
    const st = buildSimState({ p1: [simChar('KS-009-C', { owner: 'player1', instanceId: 'naruto' })], p2: [], missions: 2, missionIds: ['KS-002-MMS', 'KS-009-MMS'], chakra1: 10 });
    st.player1.hand = [att('SS-082-C')];
    let s = GameEngine.applyAction(st, 'player1', { type: 'PLAY_HIDDEN', cardIndex: 0, missionIndex: 0 });
    expect(s.activeMissions[0].player1Characters.length).toBe(2);
    s = GameEngine.applyAction(s, 'player2', { type: 'PASS' });
    s = GameEngine.applyAction(s, 'player1', { type: 'PASS' });
    let guard = 0;
    while (s.phase !== 'action' && s.phase !== 'gameOver' && guard++ < 6) {
      s = GameEngine.applyAction(s, 'player1', { type: 'ADVANCE_PHASE' });
    }
    expect(s.turn).toBe(3);
    expect(s.player1.chakra, 'one character plus one face down attachment').toBe(7);
  });

  it('hidden attachment reveals into an attach, leaving no pseudo character behind', () => {
    const st = buildSimState({ p1: [simChar('KS-009-C', { owner: 'player1', instanceId: 'naruto' })], p2: [simChar('KS-005-C', { owner: 'player2' })], missions: 2, chakra1: 10 });
    st.player1.hand = [att('SS-082-C')];
    let s = GameEngine.applyAction(st, 'player1', { type: 'PLAY_HIDDEN', cardIndex: 0, missionIndex: 0 });
    const hiddenAtt = s.activeMissions[0].player1Characters.find((c) => c.card.id === 'SS-082-C')!;
    s = GameEngine.applyAction(s, 'player2', { type: 'PASS' });
    s = GameEngine.applyAction(s, 'player1', { type: 'REVEAL_CHARACTER', missionIndex: 0, characterInstanceId: hiddenAtt.instanceId });
    const naruto = s.activeMissions[0].player1Characters.find((c) => c.instanceId === 'naruto')!;
    expect(naruto.attachments?.length).toBe(1);
    expect(s.activeMissions[0].player1Characters.length).toBe(1);
  });

  it('host defeat sends the attachment to its owner discard pile', () => {
    const st = buildSimState({ p1: [simChar('KS-009-C', { owner: 'player1', instanceId: 'naruto' })], p2: [], missions: 2, chakra1: 10 });
    st.player1.hand = [att('SS-082-C')];
    let s: GameState = GameEngine.applyAction(st, 'player1', { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false });
    s = defeatEnemyCharacter(s, 0, 'naruto', 'player2');
    expect(s.player1.discardPile.some((c) => c.id === 'SS-082-C')).toBe(true);
    expect(s.player1.discardPile.some((c) => c.id === 'KS-009-C')).toBe(true);
  });

  it('Exam Stadium attaches to the mission and its SCORE forces a friendly DUEL ignoring requirements', () => {
    const st = buildSimState({
      p1: [simChar('SS-120-CHIBIV', { owner: 'player1', instanceId: 'kiba' })],
      p2: [simChar('KS-005-C', { owner: 'player2', instanceId: 'weak' })],
      missions: 2,
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      chakra1: 10,
    });
    st.player1.hand = [att('SS-108-C')];
    let s = GameEngine.applyAction(st, 'player1', { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false });
    expect(s.activeMissions[0].attachments?.length).toBe(1);
    s = GameEngine.applyAction(s, 'player2', { type: 'PASS' });
    s = GameEngine.applyAction(s, 'player1', { type: 'PASS' });
    const seen: string[] = [];
    let guard = 0;
    while (s.pendingActions.length > 0 && guard++ < 15) {
      const pa = s.pendingActions[0];
      const pe = s.pendingEffects.find((e) => e.id === pa.sourceEffectId);
      seen.push(String(pe?.targetSelectionType));
      s = GameEngine.applyAction(s, pa.player, { type: 'SELECT_TARGET', pendingActionId: pa.id, selectedTargets: [pa.options[0]] });
    }
    expect(seen).toContain('SS108_CONFIRM_SCORE');
    expect(seen).toContain('SS108_CHOOSE_CHARACTER');
    expect(seen).toContain('SS120_CONFIRM_DUEL');
    const weak = s.activeMissions[0].player2Characters.find((c) => c.instanceId === 'weak');
    expect(weak?.isHidden).toBe(true);
  });

  it('Choji SS-128 DUEL Jirobo defeats an enemy with Power 8 or more after confirmation', () => {
    const st = buildSimState({
      hand1: ['SS-128-R'],
      p1: [simChar('KS-057-C', { owner: 'player1', instanceId: 'jirobo' })],
      p2: [simChar('KS-136-S', { owner: 'player2', instanceId: 'big' })],
      missions: 2,
      chakra1: 20,
    });
    let s = GameEngine.applyAction(st, 'player1', { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false });
    const seen: string[] = [];
    let guard = 0;
    while (s.pendingActions.length > 0 && guard++ < 10) {
      const pa = s.pendingActions[0];
      const pe = s.pendingEffects.find((e) => e.id === pa.sourceEffectId);
      seen.push(String(pe?.targetSelectionType));
      s = GameEngine.applyAction(s, pa.player, { type: 'SELECT_TARGET', pendingActionId: pa.id, selectedTargets: [pa.options[0]] });
    }
    expect(seen).toContain('SS128_CONFIRM_DUEL');
    expect(s.activeMissions[0].player2Characters.some((c) => c.instanceId === 'big')).toBe(false);
  });
});
