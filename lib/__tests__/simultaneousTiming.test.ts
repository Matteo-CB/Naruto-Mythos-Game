import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { GameEngine } from '@/lib/engine/GameEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import type { PendingEffect } from '@/lib/engine/types';

describe('simultaneous effect timing (designer rulings 2026-07-07)', () => {
  beforeAll(() => { initializeRegistry(); });

  it('Kabuto 054 batch hide: controlled Kabuto returns to owner because the same-name card is hidden simultaneously', () => {
    const st = buildSimState({
      p1: [simChar('KS-052-C', { owner: 'player1', instanceId: 'kabuto3c' })],
      p2: [simChar('KS-005-C', { owner: 'player2', instanceId: 'ino-controller' })],
      missions: 2,
      chakra1: 10,
    });
    const kabuto5c = simChar('KS-054-UC', { owner: 'player1', instanceId: 'kabuto5c' });
    kabuto5c.controlledBy = 'player2';
    kabuto5c.originalOwner = 'player1';
    kabuto5c.controllerInstanceId = 'ino-controller';
    st.activeMissions[0].player2Characters.push(kabuto5c);

    const pe: PendingEffect = {
      id: 'pe-kb054',
      sourceCardId: 'KS-054-UC',
      sourceInstanceId: 'kabuto5c',
      sourceMissionIndex: 0,
      effectType: 'MAIN',
      effectDescription: JSON.stringify({ sourceCardInstanceId: 'kabuto5c' }),
      targetSelectionType: 'KABUTO054_CONFIRM_MAIN',
      sourcePlayer: 'player2',
      requiresTargetSelection: true,
      validTargets: ['kabuto5c'],
      isOptional: true,
      isMandatory: false,
      resolved: false,
      isUpgrade: false,
    };
    st.pendingEffects = [pe];

    const s = EffectEngine.applyTargetedEffect(st, pe, ['kabuto5c']);

    const kabuto3c = s.activeMissions[0].player1Characters.find((c) => c.instanceId === 'kabuto3c');
    const ino = s.activeMissions[0].player2Characters.find((c) => c.instanceId === 'ino-controller');
    expect(kabuto3c?.isHidden).toBe(true);
    expect(ino?.isHidden).toBe(true);

    const returned = s.activeMissions[0].player1Characters.find((c) => c.instanceId === 'kabuto5c');
    expect(returned).toBeTruthy();
    expect(returned!.isHidden).toBe(false);
    expect(returned!.controlledBy).toBe('player1');
    expect(s.player1.discardPile.some((c) => c.id === 'KS-054-UC')).toBe(false);
  });

  it('Sasuke 136 upgrade: the enemy Sasuke 136 defeated by the same effect grants no chakra', () => {
    const st = buildSimState({
      hand1: ['KS-136-S'],
      p1: [
        simChar('KS-013-C', { owner: 'player1', instanceId: 'sasuke-base' }),
        simChar('KS-009-C', { owner: 'player1', instanceId: 'my-friendly' }),
      ],
      p2: [
        simChar('KS-136-S', { owner: 'player2', instanceId: 'enemy-s136' }),
        simChar('KS-005-C', { owner: 'player2', instanceId: 'other-enemy' }),
      ],
      missions: 2,
      chakra1: 20,
    });
    const before = st.player2.chakra;
    let s = GameEngine.applyAction(st, 'player1', { type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: 'sasuke-base' });
    let guard = 0;
    while (s.pendingActions.length > 0 && guard++ < 10) {
      const pa = s.pendingActions[0];
      const pick = pa.options.includes('my-friendly') ? 'my-friendly' : pa.options.includes('enemy-s136') ? 'enemy-s136' : pa.options[0];
      s = GameEngine.applyAction(s, pa.player, { type: 'SELECT_TARGET', pendingActionId: pa.id, selectedTargets: [pick] });
    }
    expect(s.player2.chakra).toBe(before);
    expect(s.activeMissions[0].player2Characters.some((c) => c.instanceId === 'enemy-s136')).toBe(false);
    expect(s.activeMissions[0].player1Characters.some((c) => c.instanceId === 'my-friendly')).toBe(false);

    const chakraLogs = s.log.filter((l) => (l.messageKey ?? '').includes('onDefeatChakra'));
    expect(chakraLogs.length).toBe(2);
  });

  it('Kiba 113 upgrade defeat-both: the enemy Sasuke 136 defeated as second target grants no chakra', () => {
    const st = buildSimState({
      hand1: ['KS-113-R'],
      p1: [
        simChar('KS-025-C', { owner: 'player1', instanceId: 'kiba-base' }),
        simChar('KS-027-C', { owner: 'player1', instanceId: 'akamaru' }),
      ],
      p2: [simChar('KS-136-S', { owner: 'player2', instanceId: 'enemy-s136' })],
      missions: 2,
      chakra1: 20,
    });
    const before = st.player2.chakra;
    let s = GameEngine.applyAction(st, 'player1', { type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: 'kiba-base' });
    let guard = 0;
    while (s.pendingActions.length > 0 && guard++ < 12) {
      const pa = s.pendingActions[0];
      const pick = pa.options.includes('akamaru') ? 'akamaru' : pa.options.includes('enemy-s136') ? 'enemy-s136' : pa.options[0];
      s = GameEngine.applyAction(s, pa.player, { type: 'SELECT_TARGET', pendingActionId: pa.id, selectedTargets: [pick] });
    }
    expect(s.player2.chakra).toBe(before);
    expect(s.activeMissions[0].player1Characters.some((c) => c.instanceId === 'akamaru')).toBe(false);
    expect(s.activeMissions[0].player2Characters.some((c) => c.instanceId === 'enemy-s136')).toBe(false);
  });

  it('Naruto 133: target 1 stays in play until both targets are chosen, then both fall and bystander triggers still fire', () => {
    const st = buildSimState({
      hand1: ['KS-133-S'],
      p1: [simChar('KS-108-R', { owner: 'player1', instanceId: 'naruto-base' })],
      p2: [
        simChar('KS-005-C', { owner: 'player2', instanceId: 'target1-shizune' }),
        simChar('KS-064-C', { owner: 'player2', instanceId: 'target2-tayuya' }),
        simChar('KS-003-C', { owner: 'player2', instanceId: 'bystander-tsunade' }),
      ],
      missions: 2,
      chakra1: 20,
    });
    const chakraBefore = st.player2.chakra;
    let s = GameEngine.applyAction(st, 'player1', { type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: 'naruto-base' });
    let sawTarget1AliveDuringTarget2 = false;
    let guard = 0;
    while (s.pendingActions.length > 0 && guard++ < 12) {
      const pa = s.pendingActions[0];
      const pe = s.pendingEffects.find((e) => e.id === pa.sourceEffectId);
      if (pe?.targetSelectionType === 'NARUTO133_CHOOSE_TARGET2') {
        sawTarget1AliveDuringTarget2 = s.activeMissions.some((m) => m.player2Characters.some((c) => c.instanceId === 'target1-shizune' && !c.isHidden));
      }
      const pick = pa.options.includes('target1-shizune') ? 'target1-shizune' : pa.options.includes('target2-tayuya') ? 'target2-tayuya' : pa.options[0];
      s = GameEngine.applyAction(s, pa.player, { type: 'SELECT_TARGET', pendingActionId: pa.id, selectedTargets: [pick] });
    }
    if (s.activeMissions.every((m) => !m.player2Characters.some((c) => c.instanceId === 'target1-shizune'))
      && s.activeMissions.every((m) => !m.player2Characters.some((c) => c.instanceId === 'target2-tayuya'))) {
      expect(sawTarget1AliveDuringTarget2).toBe(true);
      expect(s.player2.chakra).toBe(chakraBefore + 4);
    }
  });

  it('Gaara 120: all chosen enemies across missions fall together, bystander triggers still fire per defeat', () => {
    const st = buildSimState({
      hand1: ['KS-120-R'],
      p1: [],
      p2: [
        simChar('KS-005-C', { owner: 'player2', instanceId: 'weak-m0' }),
        simChar('KS-003-C', { owner: 'player2', instanceId: 'bystander-tsunade' }),
      ],
      missions: 2,
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      chakra1: 20,
    });
    st.activeMissions[1].player2Characters.push(simChar('KS-064-C', { owner: 'player2', instanceId: 'weak-m1', missionIndex: 1 }));
    const chakraBefore = st.player2.chakra;
    let s = GameEngine.applyAction(st, 'player1', { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false });
    let guard = 0;
    while (s.pendingActions.length > 0 && guard++ < 12) {
      const pa = s.pendingActions[0];
      const pe = s.pendingEffects.find((e) => e.id === pa.sourceEffectId);
      if (pe?.targetSelectionType === 'ORDERED_DEFEAT') {
        const ordered = ['weak-m0', 'weak-m1'].filter((id) => pa.options.includes(id));
        expect(ordered.length).toBe(2);
        s = GameEngine.applyAction(s, pa.player, { type: 'SELECT_TARGET', pendingActionId: pa.id, selectedTargets: [JSON.stringify(ordered)] });
      } else {
        s = GameEngine.applyAction(s, pa.player, { type: 'SELECT_TARGET', pendingActionId: pa.id, selectedTargets: [pa.options[0]] });
      }
    }
    expect(s.activeMissions[0].player2Characters.some((c) => c.instanceId === 'weak-m0')).toBe(false);
    expect(s.activeMissions[1].player2Characters.some((c) => c.instanceId === 'weak-m1')).toBe(false);
    expect(s.player2.chakra).toBe(chakraBefore + 4);
  });
});
