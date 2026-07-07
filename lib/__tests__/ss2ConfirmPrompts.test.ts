import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { GameEngine } from '@/lib/engine/GameEngine';
import { getCharacterById } from '@/lib/data/cardIndex';
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

  it('Kurenai SS-134: with two tied strongest enemies the player chooses which one to defeat', () => {
    const st = buildSimState({
      hand1: ['SS-134-R'],
      p1: [simChar('KS-140-S', { owner: 'player1', instanceId: 'itachi-partner' })],
      p2: [
        simChar('KS-113-R', { owner: 'player2', instanceId: 'tied-kiba' }),
        simChar('SS-121-R', { owner: 'player2', instanceId: 'tied-naruto' }),
      ],
      missions: 2,
      chakra1: 20,
    });
    let s = GameEngine.applyAction(st, 'player1', { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false } as GameAction);
    const seen: string[] = [];
    let guard = 0;
    while (s.pendingActions.length > 0 && guard++ < 10) {
      const pa = s.pendingActions[0];
      seen.push(firstTst(s));
      const pick = pa.options.includes('tied-naruto') ? 'tied-naruto' : pa.options[0];
      s = GameEngine.applyAction(s, pa.player, { type: 'SELECT_TARGET', pendingActionId: pa.id, selectedTargets: [pick] });
    }
    expect(seen).toContain('SS134_CONFIRM_MAIN');
    expect(seen).toContain('SS134_CHOOSE_TARGET');
    expect(s.activeMissions[0].player2Characters.some((c) => c.instanceId === 'tied-naruto')).toBe(false);
    expect(s.activeMissions[0].player2Characters.some((c) => c.instanceId === 'tied-kiba')).toBe(true);
  });

  it('Kurenai SS-134 upgraded: DUEL confirm first, then the UPGRADE modifier confirm, accept defeats at threshold 5', () => {
    const st = buildSimState({
      hand1: ['SS-134-R'],
      p1: [
        simChar('KS-034-C', { owner: 'player1', instanceId: 'kurenai-base' }),
        simChar('KS-140-S', { owner: 'player1', instanceId: 'itachi-partner' }),
      ],
      p2: [simChar('KS-086-C', { owner: 'player2', instanceId: 'zabuza-5' })],
      missions: 2,
      chakra1: 20,
    });
    let s = GameEngine.applyAction(st, 'player1', { type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: 'kurenai-base' } as GameAction);
    const seen: string[] = [];
    let guard = 0;
    while (s.pendingActions.length > 0 && guard++ < 10) {
      const pa = s.pendingActions[0];
      seen.push(firstTst(s));
      s = GameEngine.applyAction(s, pa.player, { type: 'SELECT_TARGET', pendingActionId: pa.id, selectedTargets: [pa.options[0]] });
    }
    expect(seen.indexOf('SS134_CONFIRM_MAIN')).toBeGreaterThanOrEqual(0);
    expect(seen.indexOf('SS134_CONFIRM_UPGRADE_MODIFIER')).toBeGreaterThan(seen.indexOf('SS134_CONFIRM_MAIN'));
    expect(s.activeMissions[0].player2Characters.some((c) => c.instanceId === 'zabuza-5')).toBe(false);
  });

  it('Kurenai SS-134 upgraded: declining the modifier keeps the base threshold 6, power 5 enemy survives', () => {
    const st = buildSimState({
      hand1: ['SS-134-R'],
      p1: [
        simChar('KS-034-C', { owner: 'player1', instanceId: 'kurenai-base' }),
        simChar('KS-140-S', { owner: 'player1', instanceId: 'itachi-partner' }),
      ],
      p2: [simChar('KS-086-C', { owner: 'player2', instanceId: 'zabuza-5' })],
      missions: 2,
      chakra1: 20,
    });
    let s = GameEngine.applyAction(st, 'player1', { type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: 'kurenai-base' } as GameAction);
    let guard = 0;
    while (s.pendingActions.length > 0 && guard++ < 10) {
      const pa = s.pendingActions[0];
      const tst = firstTst(s);
      if (tst === 'SS134_CONFIRM_UPGRADE_MODIFIER') {
        const pe = s.pendingEffects.find((e) => e.id === pa.sourceEffectId)!;
        s = GameEngine.applyAction(s, pa.player, { type: 'DECLINE_OPTIONAL_EFFECT', pendingEffectId: pe.id });
      } else {
        s = GameEngine.applyAction(s, pa.player, { type: 'SELECT_TARGET', pendingActionId: pa.id, selectedTargets: [pa.options[0]] });
      }
    }
    expect(s.activeMissions[0].player2Characters.some((c) => c.instanceId === 'zabuza-5')).toBe(true);
    expect(s.log.some((l) => (l.messageKey ?? '') === 'game.log.effect.noTarget' && String(l.details).includes('Kurenai'))).toBe(true);
  });

  it('MSS-03 forced opponent discard stays mandatory (no skip) even after the optional score confirm', () => {
    const st = buildSimState({
      p1: [simChar('KS-009-C', { owner: 'player1', instanceId: 'winner-char' })],
      p2: [],
      missions: 2,
      missionIds: ['KS-003-MMS', 'KS-006-MMS'],
      chakra1: 10,
    });
    st.player2.hand = ['KS-005-C', 'KS-011-C', 'KS-021-C'].map((id: string) => getCharacterById(id)!);
    let s = GameEngine.applyAction(st, 'player1', { type: 'PASS' } as GameAction);
    s = GameEngine.applyAction(s, 'player2', { type: 'PASS' } as GameAction);
    const confirm = s.pendingActions[0];
    s = GameEngine.applyAction(s, confirm.player, { type: 'SELECT_TARGET', pendingActionId: confirm.id, selectedTargets: [confirm.options[0]] });
    const discardPe = s.pendingEffects.find((e) => e.targetSelectionType === 'MSS03_OPPONENT_DISCARD')!;
    expect(discardPe).toBeTruthy();
    expect(discardPe.isMandatory).toBe(true);
    expect(discardPe.rootOptional ?? false).toBe(false);
  });

  it('Kakashi SS-000-L still prompts when the deck has no hound but a hound is playable from hand', () => {
    const st = buildSimState({
      hand1: ['SS-000-L', 'KS-099-C'],
      p1: [],
      p2: [],
      missions: 2,
      chakra1: 12,
    });
    let s = GameEngine.applyAction(st, 'player1', { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false } as GameAction);
    expect(firstTst(s)).toBe('SS000_CONFIRM_MAIN');
    const pa = s.pendingActions[0];
    s = GameEngine.applyAction(s, pa.player, { type: 'SELECT_TARGET', pendingActionId: pa.id, selectedTargets: [pa.options[0]] });
    expect(firstTst(s)).toBe('PLAY_LESS_CATEGORY');
  });

  it('revealing a hidden card triggers its DUEL when the partner is present (Kiba SS-120)', () => {
    const st = buildSimState({
      p1: [
        simChar('SS-120-CHIBIV', { owner: 'player1', instanceId: 'hidden-kiba', hidden: true }),
        simChar('KS-009-C', { owner: 'player1', instanceId: 'naruto-partner' }),
      ],
      p2: [simChar('KS-005-C', { owner: 'player2', instanceId: 'weak-enemy' })],
      missions: 2,
      chakra1: 20,
    });
    let s = GameEngine.applyAction(st, 'player1', { type: 'REVEAL_CHARACTER', missionIndex: 0, characterInstanceId: 'hidden-kiba' } as GameAction);
    expect(firstTst(s)).toBe('SS120_CONFIRM_DUEL');
    let guard = 0;
    while (s.pendingActions.length > 0 && guard++ < 10) {
      const pa = s.pendingActions[0];
      s = GameEngine.applyAction(s, pa.player, { type: 'SELECT_TARGET', pendingActionId: pa.id, selectedTargets: [pa.options[0]] });
    }
    expect(s.activeMissions[0].player2Characters.filter((c) => c.isHidden).length).toBe(1);
  });

  it('revealing Kakashi SS-000-L chains MAIN then the Zabuza DUEL repeat', () => {
    const st = buildSimState({
      p1: [simChar('SS-000-L', { owner: 'player1', instanceId: 'hidden-kakashi', hidden: true })],
      p2: [simChar('KS-086-C', { owner: 'player2', instanceId: 'zabuza-partner' })],
      missions: 2,
      chakra1: 20,
    });
    st.player1.deck = ['KS-099-C', 'KS-100-C', 'KS-099-C'].map((id) => getCharacterById(id)!);
    let s = GameEngine.applyAction(st, 'player1', { type: 'REVEAL_CHARACTER', missionIndex: 0, characterInstanceId: 'hidden-kakashi' } as GameAction);
    let confirms = 0;
    let guard = 0;
    while (s.pendingActions.length > 0 && guard++ < 30) {
      const pa = s.pendingActions[0];
      const tst = firstTst(s);
      if (tst === 'SS000_CONFIRM_MAIN') confirms++;
      if (tst === 'PLAY_LESS_CATEGORY') {
        const pe = s.pendingEffects.find((e) => e.id === pa.sourceEffectId)!;
        s = GameEngine.applyAction(s, pa.player, { type: 'DECLINE_OPTIONAL_EFFECT', pendingEffectId: pe.id });
      } else {
        s = GameEngine.applyAction(s, pa.player, { type: 'SELECT_TARGET', pendingActionId: pa.id, selectedTargets: [pa.options[0]] });
      }
    }
    expect(confirms).toBe(2);
    expect(s.player1.hand.filter((c) => (c.keywords ?? []).includes('Ninja Hound')).length).toBe(3);
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
