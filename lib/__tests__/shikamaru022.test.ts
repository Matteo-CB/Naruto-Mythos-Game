import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry, getEffectHandler } from '../effects/EffectRegistry';
import { createLogEntry } from '../engine/utils/gameLog';
import { createActionPhaseState, mockCharInPlay, mockMission } from './testHelpers';
import type { CharacterInPlay } from '../engine/types';

beforeAll(() => {
  initializeRegistry();
});

describe('Shikamaru 022 — AMBUSH no-target bug repro', () => {
  it('finds the opponent character even when Shikamaru is revealed as the player\'s first action of the round', () => {
    const enemy: CharacterInPlay = mockCharInPlay(
      { instanceId: 'naruto-1', controlledBy: 'player2', originalOwner: 'player2' },
      { id: 'KS-005-C', name_fr: 'NARUTO UZUMAKI', power: 3, chakra: 3 },
    );
    const shikamaruHidden: CharacterInPlay = mockCharInPlay(
      { instanceId: 'shika-1', isHidden: true, wasRevealedAtLeastOnce: false },
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
          player1Characters: [shikamaruHidden],
          player2Characters: [enemy],
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
      createLogEntry(1, 'action', 'PLAY_HIDDEN', 'p1 plays hidden', 'player1',
        'game.log.playHidden', { mission: 1, instanceId: 'shika-1' }),
      createLogEntry(2, 'action', 'PASS', 'p1 passes', 'player1', 'game.log.pass', {}),
      createLogEntry(2, 'action', 'PASS', 'p2 passes', 'player2', 'game.log.pass', {}),
      createLogEntry(3, 'action', 'PLAY_CHARACTER', 'p2 plays NARUTO UZUMAKI', 'player2',
        'game.log.playCharacter',
        { card: 'NARUTO UZUMAKI', mission: 1, cost: 3 }),
      createLogEntry(3, 'action', 'REVEAL_CHARACTER', 'p1 reveals SHIKAMARU NARA', 'player1',
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
      effectType: 'AMBUSH',
      effectDescription: '',
    });

    const pendingEffectsBefore = new Set(state.pendingEffects.map((p) => p.id));
    const newPending = result.state.pendingEffects.filter((p) => !pendingEffectsBefore.has(p.id));

    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('SHIKAMARU022_CONFIRM_AMBUSH');

    const lastLog = result.state.log[result.state.log.length - 1];
    expect(lastLog.action).not.toBe('EFFECT_NO_TARGET');
  });
});
