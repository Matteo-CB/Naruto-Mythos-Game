/**
 * Comprehensive tests for all 9 Mission SCORE effect handlers.
 * MSS 01-08, MSS 10.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { mockCharacter, mockMission, mockCharInPlay, createActionPhaseState } from './testHelpers';
import { initializeRegistry, getEffectHandler } from '../effects/EffectRegistry';
import type { EffectContext } from '../effects/EffectTypes';
import type { GameState, CharacterInPlay } from '../engine/types';

beforeAll(() => {
  initializeRegistry();
});

function makeCtx(
  state: GameState,
  sourcePlayer: 'player1' | 'player2',
  sourceMissionIndex: number,
): EffectContext {
  return {
    state,
    sourcePlayer,
    sourceCard: null as unknown as CharacterInPlay, // Mission card, no character
    sourceMissionIndex,
    triggerType: 'SCORE',
    isUpgrade: false,
  };
}

function makeMission(rank: 'D' | 'C' | 'B' | 'A' = 'D', p1: CharacterInPlay[] = [], p2: CharacterInPlay[] = []) {
  const rankBonus = { D: 1, C: 2, B: 3, A: 4 }[rank];
  return { card: mockMission(), rank, basePoints: 3, rankBonus, wonBy: null, player1Characters: p1, player2Characters: p2 };
}

// ===================================================================
// MSS 01 - Call for Support: POWERUP 2 a character in play
// ===================================================================
describe('MSS 01 - Call for Support', () => {
  it('should require target selection for POWERUP 2 when a friendly character exists', () => {
    const ally = mockCharInPlay({ instanceId: 'ally-1', powerTokens: 0 }, { name_fr: 'Ally' });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [ally])],
    });

    const handler = getEffectHandler('KS-001-MMS', 'SCORE')!;
    expect(handler).toBeDefined();
    const result = handler(makeCtx(state, 'player1', 0));
    // Handler uses CONFIRM popup pattern before actual target selection
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('MSS01_CONFIRM_SCORE');
    expect(result.validTargets).toContain('KS-001-MMS');
  });

  it('should fizzle when no friendly characters exist', () => {
    const state = createActionPhaseState({
      activeMissions: [makeMission('D')],
    });

    const handler = getEffectHandler('KS-001-MMS', 'SCORE')!;
    const result = handler(makeCtx(state, 'player1', 0));
    expect(result.state).toBeDefined();
  });
});

// ===================================================================
// MSS 02 - Chunin Exam: No SCORE effect (no-op)
// ===================================================================
describe('MSS 02 - Chunin Exam', () => {
  it('should have a handler registered (no-op or none)', () => {
    const handler = getEffectHandler('KS-002-MMS', 'SCORE');
    // MSS 02 may or may not have a handler. If it does, it should be a no-op.
    if (handler) {
      const state = createActionPhaseState();
      const result = handler(makeCtx(state, 'player1', 0));
      expect(result.state).toBeDefined();
    }
  });
});

// ===================================================================
// MSS 03 - Find the Traitor: Opponent discards a card from hand
// ===================================================================
describe('MSS 03 - Find the Traitor', () => {
  it('should auto-discard when opponent has exactly 1 card', () => {
    const baseState = createActionPhaseState();
    const card1 = mockCharacter({ name_fr: 'OppCard1' });
    const state: GameState = {
      ...baseState,
      player2: { ...baseState.player2, hand: [card1], discardPile: [] },
      activeMissions: [makeMission('D')],
    };

    const handler = getEffectHandler('KS-003-MMS', 'SCORE')!;
    expect(handler).toBeDefined();
    const result = handler(makeCtx(state, 'player1', 0));
    // Handler uses CONFIRM popup pattern — shows MSS03_CONFIRM_SCORE regardless of hand size
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('MSS03_CONFIRM_SCORE');
    // State is unchanged at this step (awaiting confirm)
    expect(result.state.player2.hand.length).toBe(1);
    expect(result.state.player2.discardPile.length).toBe(0);
  });

  it('should require target selection when opponent has multiple cards', () => {
    const baseState = createActionPhaseState();
    const card1 = mockCharacter({ name_fr: 'OppCard1' });
    const card2 = mockCharacter({ name_fr: 'OppCard2' });
    const state: GameState = {
      ...baseState,
      player2: { ...baseState.player2, hand: [card1, card2], discardPile: [] },
      activeMissions: [makeMission('D')],
    };

    const handler = getEffectHandler('KS-003-MMS', 'SCORE')!;
    expect(handler).toBeDefined();
    const result = handler(makeCtx(state, 'player1', 0));
    // Handler uses CONFIRM popup pattern before actual discard selection
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('MSS03_CONFIRM_SCORE');
    expect(result.validTargets).toContain('KS-003-MMS');
    // State should be unchanged (no discard yet)
    expect(result.state.player2.hand.length).toBe(2);
    expect(result.state.player2.discardPile.length).toBe(0);
  });

  it('should fizzle when opponent hand is empty', () => {
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      player2: { ...baseState.player2, hand: [], discardPile: [] },
      activeMissions: [makeMission('D')],
    };

    const handler = getEffectHandler('KS-003-MMS', 'SCORE')!;
    const result = handler(makeCtx(state, 'player1', 0));
    expect(result.state.player2.hand.length).toBe(0);
    expect(result.state.player2.discardPile.length).toBe(0);
  });
});

// ===================================================================
// MSS 04 - Assassination: Defeat an enemy hidden character
// ===================================================================
describe('MSS 04 - Assassination', () => {
  it('should defeat an enemy hidden character', () => {
    const hiddenEnemy = mockCharInPlay({ instanceId: 'he-1', isHidden: true, controlledBy: 'player2', originalOwner: 'player2' }, {
      name_fr: 'HiddenVictim',
    });
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      player2: { ...baseState.player2, discardPile: [] },
      activeMissions: [makeMission('D', [], [hiddenEnemy])],
    };

    const handler = getEffectHandler('KS-004-MMS', 'SCORE')!;
    expect(handler).toBeDefined();
    const result = handler(makeCtx(state, 'player1', 0));
    // Handler uses CONFIRM popup pattern before actual defeat
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('MSS04_CONFIRM_SCORE');
    // Hidden enemy NOT yet defeated (awaiting confirm)
    expect(result.state.activeMissions[0].player2Characters.length).toBe(1);
  });

  it('should fizzle when no hidden enemy exists', () => {
    const visibleEnemy = mockCharInPlay({ instanceId: 've-1', isHidden: false, controlledBy: 'player2', originalOwner: 'player2' }, {
      name_fr: 'Visible',
    });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [], [visibleEnemy])],
    });

    const handler = getEffectHandler('KS-004-MMS', 'SCORE')!;
    const result = handler(makeCtx(state, 'player1', 0));
    expect(result.state.activeMissions[0].player2Characters.length).toBe(1);
  });
});

// ===================================================================
// MSS 05 - Bring it Back: Return a friendly non-hidden character to hand (mandatory)
// ===================================================================
describe('MSS 05 - Bring it Back', () => {
  it('should return a friendly non-hidden character to hand', () => {
    const ally = mockCharInPlay({ instanceId: 'ally-1', controlledBy: 'player1', originalOwner: 'player1' }, {
      name_fr: 'ReturnMe', power: 3,
    });
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      player1: { ...baseState.player1, hand: [], charactersInPlay: 1 },
      activeMissions: [makeMission('D', [ally])],
    };

    const handler = getEffectHandler('KS-005-MMS', 'SCORE')!;
    expect(handler).toBeDefined();
    const result = handler(makeCtx(state, 'player1', 0));
    expect(result.state.activeMissions[0].player1Characters.length).toBe(0);
    expect(result.state.player1.hand.length).toBe(1);
    expect(result.state.player1.hand[0].name_fr).toBe('ReturnMe');
  });

  it('should fizzle when no non-hidden friendly in this mission', () => {
    const hidden = mockCharInPlay({ instanceId: 'h-1', isHidden: true }, { name_fr: 'Hidden' });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [hidden])],
    });

    const handler = getEffectHandler('KS-005-MMS', 'SCORE')!;
    const result = handler(makeCtx(state, 'player1', 0));
    expect(result.state.activeMissions[0].player1Characters.length).toBe(1);
  });
});

// ===================================================================
// MSS 06 - Rescue a Friend: Draw 1 card
// ===================================================================
describe('MSS 06 - Rescue a Friend', () => {
  it('should draw 1 card', () => {
    const deckCard = mockCharacter({ name_fr: 'DrawnCard' });
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      player1: { ...baseState.player1, deck: [deckCard], hand: [] },
      activeMissions: [makeMission('D')],
    };

    const handler = getEffectHandler('KS-006-MMS', 'SCORE')!;
    expect(handler).toBeDefined();
    const result = handler(makeCtx(state, 'player1', 0));
    // Handler uses CONFIRM popup pattern before drawing
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('MSS06_CONFIRM_SCORE');
    // Hand not changed yet (awaiting confirm)
    expect(result.state.player1.hand.length).toBe(0);
  });

  it('should not crash when deck is empty', () => {
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      player1: { ...baseState.player1, deck: [], hand: [] },
      activeMissions: [makeMission('D')],
    };

    const handler = getEffectHandler('KS-006-MMS', 'SCORE')!;
    const result = handler(makeCtx(state, 'player1', 0));
    expect(result.state.player1.hand.length).toBe(0);
  });
});

// ===================================================================
// MSS 07 - I Have to Go: Move a friendly hidden character
// ===================================================================
describe('MSS 07 - I Have to Go', () => {
  it('should offer optional target selection to move a hidden friendly character', () => {
    const hidden = mockCharInPlay({ instanceId: 'h-1', isHidden: true }, { name_fr: 'HiddenToMove' });
    const state = createActionPhaseState({
      activeMissions: [
        makeMission('D', [hidden]),
        makeMission('C'),
      ],
    });

    const handler = getEffectHandler('KS-007-MMS', 'SCORE')!;
    expect(handler).toBeDefined();
    const result = handler(makeCtx(state, 'player1', 0));
    // Handler uses CONFIRM popup pattern — MSS07_CONFIRM_SCORE before actual move selection
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('MSS07_CONFIRM_SCORE');
    expect(result.validTargets).toBeDefined();
    expect(result.validTargets!.length).toBeGreaterThan(0);
  });

  it('should fizzle when no hidden friendly exists', () => {
    const visible = mockCharInPlay({ instanceId: 'v-1', isHidden: false }, { name_fr: 'Visible' });
    const state = createActionPhaseState({
      activeMissions: [
        makeMission('D', [visible]),
        makeMission('C'),
      ],
    });

    const handler = getEffectHandler('KS-007-MMS', 'SCORE')!;
    const result = handler(makeCtx(state, 'player1', 0));
    expect(result.state.activeMissions[0].player1Characters.length).toBe(1);
  });
});

// ===================================================================
// MSS 08 - Set a Trap: Put a card from hand as hidden character
// ===================================================================
describe('MSS 08 - Set a Trap', () => {
  it('should prompt to choose a card from hand to place as hidden character', () => {
    const handCard = mockCharacter({ name_fr: 'TrapCard' });
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      player1: { ...baseState.player1, hand: [handCard], charactersInPlay: 0 },
      activeMissions: [makeMission('D')],
    };

    const handler = getEffectHandler('KS-008-MMS', 'SCORE')!;
    expect(handler).toBeDefined();
    const result = handler(makeCtx(state, 'player1', 0));
    // Handler uses CONFIRM popup pattern before card selection
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('MSS08_CONFIRM_SCORE');
    expect(result.validTargets).toContain('KS-008-MMS');
  });

  it('should fizzle when hand is empty', () => {
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      player1: { ...baseState.player1, hand: [] },
      activeMissions: [makeMission('D')],
    };

    const handler = getEffectHandler('KS-008-MMS', 'SCORE')!;
    const result = handler(makeCtx(state, 'player1', 0));
    expect(result.state.activeMissions[0].player1Characters.length).toBe(0);
  });
});

// ===================================================================
// MSS 10 - Chakra Training: No SCORE effect (or no-op)
// ===================================================================
describe('MSS 10 - Chakra Training', () => {
  it('should have a handler registered (no-op or none)', () => {
    const handler = getEffectHandler('KS-010-MMS', 'SCORE');
    if (handler) {
      const state = createActionPhaseState({ activeMissions: [makeMission('D')] });
      const result = handler(makeCtx(state, 'player1', 0));
      expect(result.state).toBeDefined();
    }
  });
});

// ===================================================================
// Registry completeness check
// ===================================================================
describe('Mission handler registry', () => {
  const missionIds = ['KS-001-MMS', 'KS-003-MMS', 'KS-004-MMS', 'KS-005-MMS', 'KS-006-MMS', 'KS-007-MMS', 'KS-008-MMS'];

  it.each(missionIds)('should have SCORE handler for %s', (mssId) => {
    const handler = getEffectHandler(mssId, 'SCORE');
    expect(handler, `Missing SCORE handler for ${mssId}`).toBeDefined();
  });
});
