import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry, getEffectHandler } from '../effects/EffectRegistry';
import { EffectEngine } from '../effects/EffectEngine';
import { createLogEntry } from '../engine/utils/gameLog';
import { createActionPhaseState, mockCharInPlay, mockMission } from './testHelpers';
import type { CharacterInPlay, PendingEffect, EffectType } from '../engine/types';

beforeAll(() => {
  initializeRegistry();
});

describe('Shikamaru 022 — reveal counts as a play (bug report 2026-05-15)', () => {
  it('captures the opponent character REVEALED on their previous turn', () => {
    const revealedNaruto: CharacterInPlay = mockCharInPlay(
      { instanceId: 'naruto-1', controlledBy: 'player2', originalOwner: 'player2', isHidden: false, wasRevealedAtLeastOnce: true },
      { id: 'KS-005-C', name_fr: 'NARUTO UZUMAKI', power: 3, chakra: 3 },
    );
    const shikamaruHidden: CharacterInPlay = mockCharInPlay(
      { instanceId: 'shika-1', isHidden: true, wasRevealedAtLeastOnce: false },
      { id: 'KS-022-UC', name_fr: 'SHIKAMARU NARA', power: 3, chakra: 3 },
    );

    const state = createActionPhaseState({
      turn: 2,
      activeMissions: [
        {
          card: mockMission({ basePoints: 3 }),
          rank: 'C',
          basePoints: 3,
          rankBonus: 2,
          wonBy: null,
          player1Characters: [shikamaruHidden],
          player2Characters: [revealedNaruto],
        },
        {
          card: mockMission({ basePoints: 4 }),
          rank: 'B',
          basePoints: 4,
          rankBonus: 3,
          wonBy: null,
          player1Characters: [],
          player2Characters: [],
        },
      ],
    });

    state.log = [
      ...state.log,
      createLogEntry(1, 'action', 'PLAY_HIDDEN', 'p1 plays Shikamaru hidden', 'player1',
        'game.log.playHidden', { mission: 1, instanceId: 'shika-1' }),
      createLogEntry(1, 'action', 'PLAY_HIDDEN', 'p2 plays Naruto hidden', 'player2',
        'game.log.playHidden', { mission: 1, instanceId: 'naruto-1' }),
      createLogEntry(1, 'action', 'PASS', 'p1 passes', 'player1', 'game.log.pass', {}),
      createLogEntry(1, 'action', 'PASS', 'p2 passes', 'player2', 'game.log.pass', {}),
      createLogEntry(2, 'action', 'REVEAL_CHARACTER', 'p2 reveals NARUTO', 'player2',
        'game.log.revealCharacter',
        { card: 'NARUTO UZUMAKI', mission: 1, cost: 3 }),
      createLogEntry(2, 'action', 'REVEAL_CHARACTER', 'p1 reveals SHIKAMARU NARA', 'player1',
        'game.log.revealCharacter',
        { card: 'SHIKAMARU NARA', mission: 1, cost: 3 }),
    ];

    const handler = getEffectHandler('KS-022-UC', 'AMBUSH');
    expect(handler).toBeDefined();
    if (!handler) return;

    const result = handler({
      state,
      sourceCard: shikamaruHidden,
      sourcePlayer: 'player1',
      sourceMissionIndex: 0,
      triggerType: 'AMBUSH',
      isUpgrade: false,
      wasRevealed: true,
    });

    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('SHIKAMARU022_CONFIRM_AMBUSH');
    const lastLog = result.state.log[result.state.log.length - 1];
    expect(lastLog.action).not.toBe('EFFECT_NO_TARGET');
  });

  it('confirm-path also captures opponent characters revealed in a PREVIOUS round (the real bug)', () => {
    const revealedNaruto: CharacterInPlay = mockCharInPlay(
      { instanceId: 'naruto-1', controlledBy: 'player2', originalOwner: 'player2', isHidden: false, wasRevealedAtLeastOnce: true },
      { id: 'KS-005-C', name_fr: 'NARUTO UZUMAKI', power: 3, chakra: 3 },
    );
    const shikamaruVisible: CharacterInPlay = mockCharInPlay(
      { instanceId: 'shika-1', isHidden: false, wasRevealedAtLeastOnce: true },
      { id: 'KS-022-UC', name_fr: 'SHIKAMARU NARA', power: 3, chakra: 3 },
    );

    const state = createActionPhaseState({
      turn: 3,
      activeMissions: [
        {
          card: mockMission({ basePoints: 3 }),
          rank: 'B',
          basePoints: 3,
          rankBonus: 3,
          wonBy: null,
          player1Characters: [shikamaruVisible],
          player2Characters: [revealedNaruto],
        },
        {
          card: mockMission({ basePoints: 4 }),
          rank: 'C',
          basePoints: 4,
          rankBonus: 2,
          wonBy: null,
          player1Characters: [],
          player2Characters: [],
        },
      ],
    });

    state.log = [
      ...state.log,
      createLogEntry(2, 'action', 'PLAY_HIDDEN', 'p2 plays Naruto hidden', 'player2',
        'game.log.playHidden', { mission: 1, instanceId: 'naruto-1' }),
      createLogEntry(2, 'action', 'REVEAL_CHARACTER', 'p2 reveals NARUTO', 'player2',
        'game.log.revealCharacter',
        { card: 'NARUTO UZUMAKI', mission: 1, cost: 3 }),
      createLogEntry(2, 'action', 'PASS', 'p2 passes', 'player2', 'game.log.pass', {}),
      createLogEntry(2, 'action', 'PASS', 'p1 passes', 'player1', 'game.log.pass', {}),
      createLogEntry(3, 'action', 'REVEAL_CHARACTER', 'p1 reveals SHIKAMARU NARA', 'player1',
        'game.log.revealCharacter',
        { card: 'SHIKAMARU NARA', mission: 1, cost: 3 }),
    ];

    const confirmPending: PendingEffect = {
      id: 'pe-shika',
      sourceCardId: 'KS-022-UC',
      sourceInstanceId: shikamaruVisible.instanceId,
      sourceMissionIndex: 0,
      effectType: 'AMBUSH' as EffectType,
      effectDescription: JSON.stringify({ sourceCardInstanceId: shikamaruVisible.instanceId }),
      targetSelectionType: 'SHIKAMARU022_CONFIRM_AMBUSH',
      sourcePlayer: 'player1',
      requiresTargetSelection: true,
      validTargets: [shikamaruVisible.instanceId],
      isOptional: true,
      isMandatory: false,
      resolved: false,
      isUpgrade: false,
    };
    state.pendingEffects = [confirmPending];

    const newState = EffectEngine.applyTargetedEffect(state, confirmPending, [shikamaruVisible.instanceId]);

    const movePending = newState.pendingEffects.find((e) => e.targetSelectionType === 'SHIKAMARU_MOVE_ENEMY');
    expect(movePending).toBeDefined();
    expect(movePending!.validTargets).toContain(revealedNaruto.instanceId);

    const noTargetLog = newState.log.find((l) => l.action === 'EFFECT_NO_TARGET' && (l.messageParams?.id as string) === 'KS-022-UC');
    expect(noTargetLog).toBeUndefined();
  });

  it('captures the opponent character revealed AS UPGRADE on their previous turn', () => {
    const upgradedChar: CharacterInPlay = mockCharInPlay(
      { instanceId: 'sasuke-1', controlledBy: 'player2', originalOwner: 'player2', isHidden: false, wasRevealedAtLeastOnce: true },
      { id: 'KS-142-M', name_fr: 'SASUKE UCHIWA', power: 5, chakra: 5 },
    );
    const shikamaruHidden: CharacterInPlay = mockCharInPlay(
      { instanceId: 'shika-1', isHidden: true, wasRevealedAtLeastOnce: false },
      { id: 'KS-022-UC', name_fr: 'SHIKAMARU NARA', power: 3, chakra: 3 },
    );

    const state = createActionPhaseState({
      turn: 2,
      activeMissions: [
        {
          card: mockMission({ basePoints: 3 }),
          rank: 'C',
          basePoints: 3,
          rankBonus: 2,
          wonBy: null,
          player1Characters: [shikamaruHidden],
          player2Characters: [upgradedChar],
        },
        {
          card: mockMission({ basePoints: 4 }),
          rank: 'B',
          basePoints: 4,
          rankBonus: 3,
          wonBy: null,
          player1Characters: [],
          player2Characters: [],
        },
      ],
    });

    state.log = [
      ...state.log,
      createLogEntry(2, 'action', 'REVEAL_UPGRADE', 'p2 reveals upgrade SASUKE', 'player2',
        'game.log.revealUpgrade',
        { card: 'SASUKE UCHIWA', mission: 1, cost: 2 }),
      createLogEntry(2, 'action', 'REVEAL_CHARACTER', 'p1 reveals SHIKAMARU NARA', 'player1',
        'game.log.revealCharacter',
        { card: 'SHIKAMARU NARA', mission: 1, cost: 3 }),
    ];

    const handler = getEffectHandler('KS-022-UC', 'AMBUSH');
    expect(handler).toBeDefined();
    if (!handler) return;

    const result = handler({
      state,
      sourceCard: shikamaruHidden,
      sourcePlayer: 'player1',
      sourceMissionIndex: 0,
      triggerType: 'AMBUSH',
      isUpgrade: false,
      wasRevealed: true,
    });

    expect(result.requiresTargetSelection).toBe(true);
    const lastLog = result.state.log[result.state.log.length - 1];
    expect(lastLog.action).not.toBe('EFFECT_NO_TARGET');
  });
});
