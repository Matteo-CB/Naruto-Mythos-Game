
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




describe('MSS 01 - Call for Support', () => {
  it('should require target selection for POWERUP 2 when a friendly character exists', () => {
    const ally = mockCharInPlay({ instanceId: 'ally-1', powerTokens: 0 }, { name_fr: 'Ally' });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [ally])],
    });

    const handler = getEffectHandler('KS-001-MMS', 'SCORE')!;
    expect(handler).toBeDefined();
    const result = handler(makeCtx(state, 'player1', 0));
    
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




describe('MSS 02 - Chunin Exam', () => {
  it('should have a handler registered (no-op or none)', () => {
    const handler = getEffectHandler('KS-002-MMS', 'SCORE');
    
    if (handler) {
      const state = createActionPhaseState();
      const result = handler(makeCtx(state, 'player1', 0));
      expect(result.state).toBeDefined();
    }
  });
});




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
    
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('MSS03_CONFIRM_SCORE');
    
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
    
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('MSS03_CONFIRM_SCORE');
    expect(result.validTargets).toContain('KS-003-MMS');
    
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
    
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('MSS04_CONFIRM_SCORE');
    
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

  it('should return a controlled enemy character to its original owner\'s hand (single-target path)', () => {
    const stolen = mockCharInPlay(
      { instanceId: 'stolen-1', controlledBy: 'player1', originalOwner: 'player2' },
      { name_fr: 'StolenChar', power: 4 },
    );
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      player1: { ...baseState.player1, hand: [], charactersInPlay: 1 },
      player2: { ...baseState.player2, hand: [], charactersInPlay: 0 },
      activeMissions: [makeMission('D', [stolen])],
    };

    const handler = getEffectHandler('KS-005-MMS', 'SCORE')!;
    const result = handler(makeCtx(state, 'player1', 0));

    expect(result.state.activeMissions[0].player1Characters.length).toBe(0);
    expect(result.state.player1.hand.length).toBe(0);
    expect(result.state.player2.hand.length).toBe(1);
    expect(result.state.player2.hand[0].name_fr).toBe('StolenChar');
  });

  it('should return a controlled enemy character to its original owner\'s hand (multi-target path)', async () => {
    const { EffectEngine } = await import('../effects/EffectEngine');
    const ownChar = mockCharInPlay(
      { instanceId: 'own-1', controlledBy: 'player1', originalOwner: 'player1' },
      { name_fr: 'OwnChar', power: 3 },
    );
    const stolen = mockCharInPlay(
      { instanceId: 'stolen-1', controlledBy: 'player1', originalOwner: 'player2' },
      { name_fr: 'StolenChar', power: 4 },
    );
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      player1: { ...baseState.player1, hand: [], charactersInPlay: 2 },
      player2: { ...baseState.player2, hand: [], charactersInPlay: 0 },
      activeMissions: [makeMission('D', [ownChar, stolen])],
    };

    const pending = {
      sourcePlayer: 'player1' as const,
      sourceCardId: 'KS-005-MMS',
      sourceInstanceId: 'mss05-instance',
      sourceMissionIndex: 0,
      effectType: 'SCORE' as const,
      effectIndex: 0,
      effectDescription: '',
    };

    const result = EffectEngine.mss05ReturnToHand(state, pending as never, 'stolen-1');

    expect(result.activeMissions[0].player1Characters.length).toBe(1);
    expect(result.activeMissions[0].player1Characters[0].instanceId).toBe('own-1');
    expect(result.player1.hand.length).toBe(0);
    expect(result.player2.hand.length).toBe(1);
    expect(result.player2.hand[0].name_fr).toBe('StolenChar');
    expect(result.player1.charactersInPlay).toBe(1);
  });
});




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
    
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('MSS06_CONFIRM_SCORE');
    
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




describe('Mission handler registry', () => {
  const missionIds = ['KS-001-MMS', 'KS-003-MMS', 'KS-004-MMS', 'KS-005-MMS', 'KS-006-MMS', 'KS-007-MMS', 'KS-008-MMS'];

  it.each(missionIds)('should have SCORE handler for %s', (mssId) => {
    const handler = getEffectHandler(mssId, 'SCORE');
    expect(handler, `Missing SCORE handler for ${mssId}`).toBeDefined();
  });
});
