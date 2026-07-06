import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { GameEngine } from '@/lib/engine/GameEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import type { GameState, GameAction } from '@/lib/engine/types';

function firstTst(s: GameState): string {
  const pa = s.pendingActions[0];
  if (!pa) return 'NONE';
  return s.pendingEffects.find((e) => e.id === pa.sourceEffectId)?.targetSelectionType ?? 'NONE';
}

describe('set 2 optional effects always prompt a confirmation first', () => {
  beforeAll(() => { initializeRegistry(); });

  it('Kiba SS-120 DUEL prompts with a confirm popup, then resolves fully', () => {
    const st = buildSimState({
      hand1: ['SS-120-CHIBIV'],
      p1: [simChar('KS-009-C', { owner: 'player1' })],
      p2: [simChar('KS-005-C', { owner: 'player2' })],
      missions: 2,
      chakra1: 20,
    });
    let s = GameEngine.applyAction(st, 'player1', { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false } as GameAction);
    expect(firstTst(s)).toBe('SS120_CONFIRM_DUEL');

    let guard = 0;
    while (s.pendingActions.length > 0 && guard++ < 15) {
      const pa = s.pendingActions[0];
      s = GameEngine.applyAction(s, pa.player, { type: 'SELECT_TARGET', pendingActionId: pa.id, selectedTargets: [pa.options[0]] });
    }
    expect(s.pendingActions.length).toBe(0);
    expect(s.activeMissions[0].player2Characters.filter((c) => c.isHidden).length).toBe(1);
  });

  it('declining the Kiba confirm skips the DUEL entirely', () => {
    const st = buildSimState({
      hand1: ['SS-120-CHIBIV'],
      p1: [simChar('KS-009-C', { owner: 'player1' })],
      p2: [simChar('KS-005-C', { owner: 'player2' })],
      missions: 2,
      chakra1: 20,
    });
    let s = GameEngine.applyAction(st, 'player1', { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false } as GameAction);
    const pe = s.pendingEffects.find((e) => e.id === s.pendingActions[0].sourceEffectId)!;
    s = GameEngine.applyAction(s, 'player1', { type: 'DECLINE_OPTIONAL_EFFECT', pendingEffectId: pe.id });
    expect(s.pendingActions.length).toBe(0);
    expect(s.activeMissions[0].player2Characters.filter((c) => c.isHidden).length).toBe(0);
  });

  it('Neji SS-112 upgrade chain: confirm UPGRADE, remove tokens, confirm DUEL, hide', () => {
    const st = buildSimState({
      hand1: ['SS-112-SPV'],
      p1: [simChar('KS-036-C', { owner: 'player1', instanceId: 'neji-base' }), simChar('KS-030-C', { owner: 'player1' })],
      p2: [simChar('KS-005-C', { owner: 'player2', instanceId: 'tok', powerTokens: 2 }), simChar('KS-011-C', { owner: 'player2', instanceId: 'notok' })],
      missions: 2,
      chakra1: 20,
    });
    let s = GameEngine.applyAction(st, 'player1', { type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: 'neji-base' } as GameAction);
    const seen: string[] = [];
    let guard = 0;
    while (s.pendingActions.length > 0 && guard++ < 15) {
      const pa = s.pendingActions[0];
      seen.push(firstTst(s));
      s = GameEngine.applyAction(s, pa.player, { type: 'SELECT_TARGET', pendingActionId: pa.id, selectedTargets: [pa.options[0]] });
    }
    expect(seen).toContain('SS112_CONFIRM_UPGRADE');
    expect(seen).toContain('SS112_REMOVE_TOKENS');
    expect(seen).toContain('SS112_CONFIRM_DUEL');
    expect(seen).toContain('SS120_HIDE');
    const tok = s.activeMissions[0].player2Characters.find((c) => c.instanceId === 'tok');
    expect(tok?.powerTokens ?? -1).toBe(0);
    expect(s.activeMissions[0].player2Characters.filter((c) => c.isHidden).length).toBe(1);
  });
});
