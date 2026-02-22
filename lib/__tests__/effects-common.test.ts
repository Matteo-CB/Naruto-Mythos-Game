/**
 * Comprehensive tests for all 48 Common card effect handlers.
 * Tests each handler's MAIN, AMBUSH, UPGRADE, and SCORE effects individually.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { mockCharacter, mockMission, mockCharInPlay, createActionPhaseState } from './testHelpers';
import { initializeRegistry } from '../effects/EffectRegistry';
import { getEffectHandler } from '../effects/EffectRegistry';
import type { EffectContext } from '../effects/EffectTypes';
import type { GameState, CharacterInPlay } from '../engine/types';

beforeAll(() => {
  initializeRegistry();
});

/** Helper: create a minimal EffectContext for testing */
function makeCtx(
  state: GameState,
  sourcePlayer: 'player1' | 'player2',
  sourceCard: CharacterInPlay,
  sourceMissionIndex: number,
  triggerType: 'MAIN' | 'UPGRADE' | 'AMBUSH' | 'SCORE' = 'MAIN',
  isUpgrade = false,
): EffectContext {
  return { state, sourcePlayer, sourceCard, sourceMissionIndex, triggerType, isUpgrade };
}

// ===================================================================
// 001/130 - HIRUZEN SARUTOBI: POWERUP 2 another friendly Leaf Village character
// ===================================================================
describe('001/130 - Hiruzen Sarutobi', () => {
  it('should POWERUP 2 a single valid Leaf Village target automatically', () => {
    const hiruzen = mockCharInPlay({ instanceId: 'hiruzen-1' }, {
      id: 'KS-001-C', number: 1, name_fr: 'Hiruzen Sarutobi', group: 'Leaf Village', power: 3, chakra: 3,
    });
    const leafAlly = mockCharInPlay({ instanceId: 'ally-1', powerTokens: 0 }, {
      id: 'KS-011-C', number: 11, name_fr: 'Sakura', group: 'Leaf Village', power: 2, chakra: 2,
    });
    const state = createActionPhaseState({
      activeMissions: [{
        card: mockMission(), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null,
        player1Characters: [hiruzen, leafAlly],
        player2Characters: [],
      }],
    });

    const handler = getEffectHandler('KS-001-C', 'MAIN')!;
    expect(handler).toBeDefined();
    const result = handler(makeCtx(state, 'player1', hiruzen, 0));
    const ally = result.state.activeMissions[0].player1Characters.find(c => c.instanceId === 'ally-1');
    expect(ally?.powerTokens).toBe(2);
  });

  it('should fizzle when no other Leaf Village character exists', () => {
    const hiruzen = mockCharInPlay({ instanceId: 'hiruzen-1' }, {
      id: 'KS-001-C', number: 1, name_fr: 'Hiruzen Sarutobi', group: 'Leaf Village',
    });
    const sandAlly = mockCharInPlay({ instanceId: 'sand-1' }, {
      id: 'KS-074-C', name_fr: 'Gaara', group: 'Sand Village',
    });
    const state = createActionPhaseState({
      activeMissions: [{
        card: mockMission(), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null,
        player1Characters: [hiruzen, sandAlly],
        player2Characters: [],
      }],
    });

    const handler = getEffectHandler('KS-001-C', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', hiruzen, 0));
    // No change
    expect(result.state.activeMissions[0].player1Characters[1].powerTokens).toBe(0);
  });

  it('should require target selection when multiple Leaf Village targets exist', () => {
    const hiruzen = mockCharInPlay({ instanceId: 'hiruzen-1' }, {
      id: 'KS-001-C', number: 1, name_fr: 'Hiruzen', group: 'Leaf Village',
    });
    const leafA = mockCharInPlay({ instanceId: 'leaf-a' }, { group: 'Leaf Village', name_fr: 'A' });
    const leafB = mockCharInPlay({ instanceId: 'leaf-b' }, { group: 'Leaf Village', name_fr: 'B' });
    const state = createActionPhaseState({
      activeMissions: [{
        card: mockMission(), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null,
        player1Characters: [hiruzen, leafA, leafB],
        player2Characters: [],
      }],
    });

    const handler = getEffectHandler('KS-001-C', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', hiruzen, 0));
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.validTargets).toContain('leaf-a');
    expect(result.validTargets).toContain('leaf-b');
  });
});

// ===================================================================
// 003/130 - TSUNADE: On-defeat trigger (continuous, tested in defeatUtils)
// ===================================================================
describe('003/130 - Tsunade', () => {
  it('should have a registered MAIN handler (continuous no-op)', () => {
    const handler = getEffectHandler('KS-003-C', 'MAIN');
    expect(handler).toBeDefined();
  });
});

// ===================================================================
// 007/130 - JIRAIYA: Play a Summon paying 1 less
// ===================================================================
describe('007/130 - Jiraiya', () => {
  it('should prompt to choose a Summon from hand when affordable Summons exist', () => {
    const jiraiya = mockCharInPlay({ instanceId: 'jiraiya-1' }, {
      id: 'KS-007-C', number: 7, name_fr: 'Jiraya', group: 'Leaf Village', keywords: ['Sannin'],
    });
    const summonCard = mockCharacter({ keywords: ['Summon'], name_fr: 'Gama Bunta', chakra: 3 });
    const otherCard = mockCharacter({ keywords: ['Team 7'], name_fr: 'Naruto' });
    const state = createActionPhaseState({
      player1: {
        ...createActionPhaseState().player1,
        hand: [summonCard, otherCard],
        chakra: 10,
      },
      activeMissions: [{
        card: mockMission(), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null,
        player1Characters: [jiraiya],
        player2Characters: [],
      }],
    });

    const handler = getEffectHandler('KS-007-C', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', jiraiya, 0));
    // Now returns target selection: choose which Summon from hand
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('JIRAIYA_CHOOSE_SUMMON');
    expect(result.validTargets).toContain('0'); // summonCard at index 0
    expect(result.validTargets).not.toContain('1'); // Naruto is not a Summon
  });

  it('should fizzle when no Summon cards in hand', () => {
    const jiraiya = mockCharInPlay({ instanceId: 'jiraiya-1' }, {
      id: 'KS-007-C', number: 7, name_fr: 'Jiraya',
    });
    const state = createActionPhaseState({
      player1: {
        ...createActionPhaseState().player1,
        hand: [mockCharacter({ keywords: ['Team 7'], name_fr: 'Naruto' })],
      },
      activeMissions: [{
        card: mockMission(), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null,
        player1Characters: [jiraiya],
        player2Characters: [],
      }],
    });

    const handler = getEffectHandler('KS-007-C', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', jiraiya, 0));
    expect(result.requiresTargetSelection).toBeUndefined();
  });
});

// ===================================================================
// 009/130 - NARUTO UZUMAKI (C): No effects
// ===================================================================
describe('009/130 - Naruto Uzumaki (C)', () => {
  it('should be a no-op handler', () => {
    const handler = getEffectHandler('KS-009-C', 'MAIN')!;
    expect(handler).toBeDefined();
    const state = createActionPhaseState();
    const naruto = mockCharInPlay({}, { id: 'KS-009-C', number: 9 });
    const result = handler(makeCtx(state, 'player1', naruto, 0));
    expect(result.state).toBeDefined();
  });
});

// ===================================================================
// 011/130 - SAKURA HARUNO: Draw 1 if another Team 7 in this mission
// ===================================================================
describe('011/130 - Sakura Haruno', () => {
  it('should draw 1 card when another Team 7 character is in the same mission', () => {
    const sakura = mockCharInPlay({ instanceId: 'sakura-1' }, {
      id: 'KS-011-C', number: 11, name_fr: 'Sakura', keywords: ['Team 7'], group: 'Leaf Village',
    });
    const naruto = mockCharInPlay({ instanceId: 'naruto-1' }, {
      id: 'KS-009-C', number: 9, name_fr: 'Naruto', keywords: ['Team 7'],
    });
    const deckCard = mockCharacter({ name_fr: 'DeckCard' });
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      player1: { ...baseState.player1, deck: [deckCard, ...baseState.player1.deck], hand: [] },
      activeMissions: [{
        card: mockMission(), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null,
        player1Characters: [sakura, naruto],
        player2Characters: [],
      }],
    };

    const handler = getEffectHandler('KS-011-C', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', sakura, 0));
    expect(result.state.player1.hand.length).toBe(1);
    expect(result.state.player1.hand[0].name_fr).toBe('DeckCard');
  });

  it('should not draw when no other Team 7 character exists', () => {
    const sakura = mockCharInPlay({ instanceId: 'sakura-1' }, {
      id: 'KS-011-C', number: 11, name_fr: 'Sakura', keywords: ['Team 7'],
    });
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      player1: { ...baseState.player1, deck: [mockCharacter()], hand: [] },
      activeMissions: [{
        card: mockMission(), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null,
        player1Characters: [sakura],
        player2Characters: [],
      }],
    };

    const handler = getEffectHandler('KS-011-C', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', sakura, 0));
    expect(result.state.player1.hand.length).toBe(0);
  });

  it('should not count hidden Team 7 characters', () => {
    const sakura = mockCharInPlay({ instanceId: 'sakura-1' }, {
      id: 'KS-011-C', number: 11, name_fr: 'Sakura', keywords: ['Team 7'],
    });
    const hiddenNaruto = mockCharInPlay({ instanceId: 'naruto-h', isHidden: true }, {
      id: 'KS-009-C', number: 9, name_fr: 'Naruto', keywords: ['Team 7'],
    });
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      player1: { ...baseState.player1, deck: [mockCharacter()], hand: [] },
      activeMissions: [{
        card: mockMission(), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null,
        player1Characters: [sakura, hiddenNaruto],
        player2Characters: [],
      }],
    };

    const handler = getEffectHandler('KS-011-C', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', sakura, 0));
    expect(result.state.player1.hand.length).toBe(0);
  });
});

// ===================================================================
// 013/130 - SASUKE: Continuous -1 Power per friendly (tested in ContinuousEffects)
// ===================================================================
describe('013/130 - Sasuke Uchiha (C)', () => {
  it('should have a registered handler', () => {
    const handler = getEffectHandler('KS-013-C', 'MAIN');
    expect(handler).toBeDefined();
  });
});

// ===================================================================
// 015/130 - KAKASHI: Continuous Team 7 +1 Power (tested in ContinuousEffects)
// ===================================================================
describe('015/130 - Kakashi Hatake (C)', () => {
  it('should have a registered handler', () => {
    const handler = getEffectHandler('KS-015-C', 'MAIN');
    expect(handler).toBeDefined();
  });
});

// ===================================================================
// 019/130 - INO YAMANAKA: POWERUP 1 if another Team 10 in this mission
// ===================================================================
describe('019/130 - Ino Yamanaka', () => {
  it('should POWERUP 1 self when another Team 10 character is present', () => {
    const ino = mockCharInPlay({ instanceId: 'ino-1', powerTokens: 0 }, {
      id: 'KS-019-C', number: 19, name_fr: 'Ino Yamanaka', keywords: ['Team 10'], group: 'Leaf Village',
    });
    const shikamaru = mockCharInPlay({ instanceId: 'shika-1' }, {
      id: 'KS-021-C', number: 21, name_fr: 'Shikamaru', keywords: ['Team 10'],
    });
    const state = createActionPhaseState({
      activeMissions: [{
        card: mockMission(), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null,
        player1Characters: [ino, shikamaru],
        player2Characters: [],
      }],
    });

    const handler = getEffectHandler('KS-019-C', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', ino, 0));
    const updatedIno = result.state.activeMissions[0].player1Characters.find(c => c.instanceId === 'ino-1');
    expect(updatedIno?.powerTokens).toBe(1);
  });

  it('should not POWERUP when no Team 10 ally present', () => {
    const ino = mockCharInPlay({ instanceId: 'ino-1', powerTokens: 0 }, {
      id: 'KS-019-C', number: 19, name_fr: 'Ino', keywords: ['Team 10'],
    });
    const state = createActionPhaseState({
      activeMissions: [{
        card: mockMission(), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null,
        player1Characters: [ino],
        player2Characters: [],
      }],
    });

    const handler = getEffectHandler('KS-019-C', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', ino, 0));
    const updatedIno = result.state.activeMissions[0].player1Characters.find(c => c.instanceId === 'ino-1');
    expect(updatedIno?.powerTokens).toBe(0);
  });
});

// ===================================================================
// 021/130 - SHIKAMARU: No effects (or minimal)
// ===================================================================
describe('021/130 - Shikamaru Nara', () => {
  it('should have a registered handler', () => {
    const handler = getEffectHandler('KS-021-C', 'MAIN');
    expect(handler).toBeDefined();
  });
});

// ===================================================================
// 023/130 - ASUMA SARUTOBI
// ===================================================================
describe('023/130 - Asuma Sarutobi', () => {
  it('should have a registered handler', () => {
    const handler = getEffectHandler('KS-023-C', 'MAIN');
    expect(handler).toBeDefined();
  });
});

// ===================================================================
// 025/130 - KIBA: Continuous CHAKRA+1 if Akamaru (tested in ContinuousEffects)
// ===================================================================
describe('025/130 - Kiba Inuzuka', () => {
  it('should have a registered handler', () => {
    const handler = getEffectHandler('KS-025-C', 'MAIN');
    expect(handler).toBeDefined();
  });
});

// ===================================================================
// 027/130 - AKAMARU: Continuous return to hand if no Kiba (tested in EndPhase)
// ===================================================================
describe('027/130 - Akamaru', () => {
  it('should have a registered handler', () => {
    const handler = getEffectHandler('KS-027-C', 'MAIN');
    expect(handler).toBeDefined();
  });
});

// ===================================================================
// 034/130 - KURENAI: Continuous Team 8 cost reduction (tested in ChakraValidation)
// ===================================================================
describe('034/130 - Yuhi Kurenai', () => {
  it('should have a registered handler', () => {
    const handler = getEffectHandler('KS-034-C', 'MAIN');
    expect(handler).toBeDefined();
  });
});

// ===================================================================
// 036/130 - NEJI: Remove up to 2 Power tokens from enemy character
// ===================================================================
describe('036/130 - Neji Hyuga', () => {
  it('should remove 2 power tokens from the only valid enemy target', () => {
    const neji = mockCharInPlay({ instanceId: 'neji-1' }, {
      id: 'KS-036-C', number: 36, name_fr: 'Neji', keywords: ['Team Guy'], group: 'Leaf Village',
    });
    const enemy = mockCharInPlay({ instanceId: 'enemy-1', powerTokens: 3, controlledBy: 'player2', originalOwner: 'player2' }, {
      name_fr: 'Enemy', group: 'Sand Village',
    });
    const state = createActionPhaseState({
      activeMissions: [{
        card: mockMission(), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null,
        player1Characters: [neji],
        player2Characters: [enemy],
      }],
    });

    const handler = getEffectHandler('KS-036-C', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', neji, 0));
    const updatedEnemy = result.state.activeMissions[0].player2Characters.find(c => c.instanceId === 'enemy-1');
    expect(updatedEnemy?.powerTokens).toBe(1); // 3 - 2 = 1
  });

  it('should fizzle when no enemy has power tokens', () => {
    const neji = mockCharInPlay({ instanceId: 'neji-1' }, {
      id: 'KS-036-C', number: 36, name_fr: 'Neji',
    });
    const enemy = mockCharInPlay({ instanceId: 'enemy-1', powerTokens: 0, controlledBy: 'player2', originalOwner: 'player2' }, {});
    const state = createActionPhaseState({
      activeMissions: [{
        card: mockMission(), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null,
        player1Characters: [neji],
        player2Characters: [enemy],
      }],
    });

    const handler = getEffectHandler('KS-036-C', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', neji, 0));
    expect(result.requiresTargetSelection).toBeUndefined();
  });
});

// ===================================================================
// 040/130 - TENTEN: Play only in winning mission (tested in ActionPhase validation)
// ===================================================================
describe('040/130 - Tenten', () => {
  it('should have a registered handler', () => {
    const handler = getEffectHandler('KS-040-C', 'MAIN');
    expect(handler).toBeDefined();
  });
});

// ===================================================================
// 042/130 - GAI: Continuous Team Guy +1 Power (tested in ContinuousEffects)
// ===================================================================
describe('042/130 - Gai Maito', () => {
  it('should have a registered handler', () => {
    const handler = getEffectHandler('KS-042-C', 'MAIN');
    expect(handler).toBeDefined();
  });
});

// ===================================================================
// 044/130 - ANKO: Continuous CHAKRA+1 if Leaf ally (tested in ContinuousEffects)
// ===================================================================
describe('044/130 - Anko Mitarashi', () => {
  it('should have a registered handler', () => {
    const handler = getEffectHandler('KS-044-C', 'MAIN');
    expect(handler).toBeDefined();
  });
});

// ===================================================================
// 046/130 - EBISU: Draw 1 if friendly has less Power in this mission
// ===================================================================
describe('046/130 - Ebisu', () => {
  it('should draw 1 card when a weaker friendly exists', () => {
    const ebisu = mockCharInPlay({ instanceId: 'ebisu-1' }, {
      id: 'KS-046-C', number: 46, name_fr: 'Ebisu', power: 3, chakra: 3,
    });
    const weakAlly = mockCharInPlay({ instanceId: 'weak-1' }, {
      name_fr: 'Weak', power: 1, chakra: 1,
    });
    const deckCard = mockCharacter({ name_fr: 'DeckCard' });
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      player1: { ...baseState.player1, deck: [deckCard], hand: [] },
      activeMissions: [{
        card: mockMission(), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null,
        player1Characters: [ebisu, weakAlly],
        player2Characters: [],
      }],
    };

    const handler = getEffectHandler('KS-046-C', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', ebisu, 0));
    expect(result.state.player1.hand.length).toBe(1);
  });

  it('should not draw when no weaker friendly exists', () => {
    const ebisu = mockCharInPlay({ instanceId: 'ebisu-1' }, {
      id: 'KS-046-C', number: 46, name_fr: 'Ebisu', power: 3,
    });
    const strongAlly = mockCharInPlay({ instanceId: 'strong-1' }, {
      name_fr: 'Strong', power: 5,
    });
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      player1: { ...baseState.player1, deck: [mockCharacter()], hand: [] },
      activeMissions: [{
        card: mockMission(), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null,
        player1Characters: [ebisu, strongAlly],
        player2Characters: [],
      }],
    };

    const handler = getEffectHandler('KS-046-C', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', ebisu, 0));
    expect(result.state.player1.hand.length).toBe(0);
  });
});

// ===================================================================
// 047/130 - IRUKA
// ===================================================================
describe('047/130 - Iruka', () => {
  it('should have a registered handler', () => {
    const handler = getEffectHandler('KS-047-C', 'MAIN');
    expect(handler).toBeDefined();
  });
});

// ===================================================================
// 048/130 - HAYATE: Continuous hide instead of defeat (tested in EffectEngine)
// ===================================================================
describe('048/130 - Hayate Gekko', () => {
  it('should have a registered handler', () => {
    const handler = getEffectHandler('KS-048-C', 'MAIN');
    expect(handler).toBeDefined();
  });
});

// ===================================================================
// 049/130 - GEMMA: Continuous sacrifice for Leaf ally (tested in EffectEngine)
// ===================================================================
describe('049/130 - Gemma Shiranui', () => {
  it('should have a registered handler', () => {
    const handler = getEffectHandler('KS-049-C', 'MAIN');
    expect(handler).toBeDefined();
  });
});

// ===================================================================
// 050/130 - OROCHIMARU: AMBUSH - look at hidden enemy, steal if cost<=3
// ===================================================================
describe('050/130 - Orochimaru', () => {
  it('should request target selection for hidden enemy in this mission (AMBUSH)', () => {
    const orochimaru = mockCharInPlay({ instanceId: 'oro-1' }, {
      id: 'KS-050-C', number: 50, name_fr: 'Orochimaru', keywords: ['Sannin'],
    });
    const hiddenEnemy = mockCharInPlay({ instanceId: 'hidden-e', isHidden: true, controlledBy: 'player2', originalOwner: 'player2' }, {
      name_fr: 'Hidden Enemy', chakra: 2,
    });
    const state = createActionPhaseState({
      activeMissions: [{
        card: mockMission(), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null,
        player1Characters: [orochimaru],
        player2Characters: [hiddenEnemy],
      }],
    });

    const handler = getEffectHandler('KS-050-C', 'AMBUSH')!;
    expect(handler).toBeDefined();
    const result = handler(makeCtx(state, 'player1', orochimaru, 0, 'AMBUSH'));
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('OROCHIMARU_LOOK_AND_STEAL');
    expect(result.validTargets).toContain('hidden-e');
  });

  it('should fizzle when no hidden enemies in this mission', () => {
    const orochimaru = mockCharInPlay({ instanceId: 'oro-1' }, {
      id: 'KS-050-C', number: 50, name_fr: 'Orochimaru',
    });
    const visibleEnemy = mockCharInPlay({ instanceId: 'vis-e', isHidden: false, controlledBy: 'player2', originalOwner: 'player2' }, {});
    const state = createActionPhaseState({
      activeMissions: [{
        card: mockMission(), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null,
        player1Characters: [orochimaru],
        player2Characters: [visibleEnemy],
      }],
    });

    const handler = getEffectHandler('KS-050-C', 'AMBUSH')!;
    const result = handler(makeCtx(state, 'player1', orochimaru, 0, 'AMBUSH'));
    expect(result.requiresTargetSelection).toBeUndefined();
  });
});

// ===================================================================
// 055/130 - KIMIMARO: AMBUSH - discard a card to hide a character cost<=3
// ===================================================================
describe('055/130 - Kimimaro', () => {
  it('should require hand selection to choose which card to discard (AMBUSH)', () => {
    const kimimaro = mockCharInPlay({ instanceId: 'kim-1' }, {
      id: 'KS-055-C', number: 55, name_fr: 'Kimimaro',
    });
    const lowCostChar = mockCharInPlay({ instanceId: 'low-1', controlledBy: 'player2', originalOwner: 'player2' }, {
      name_fr: 'Low Cost', chakra: 2,
    });
    const handCard = mockCharacter({ name_fr: 'HandCard' });
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      player1: { ...baseState.player1, hand: [handCard] },
      activeMissions: [{
        card: mockMission(), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null,
        player1Characters: [kimimaro],
        player2Characters: [lowCostChar],
      }],
    };

    const handler = getEffectHandler('KS-055-C', 'AMBUSH')!;
    expect(handler).toBeDefined();
    const result = handler(makeCtx(state, 'player1', kimimaro, 0, 'AMBUSH'));
    // Now returns requiresTargetSelection for hand card selection
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('KIMIMARO_CHOOSE_DISCARD');
    expect(result.validTargets).toEqual(['0']); // 1 card in hand
    // Hand unchanged until player selects
    expect(result.state.player1.hand.length).toBe(1);
  });

  it('should fizzle when hand is empty', () => {
    const kimimaro = mockCharInPlay({ instanceId: 'kim-1' }, {
      id: 'KS-055-C', number: 55, name_fr: 'Kimimaro',
    });
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      player1: { ...baseState.player1, hand: [] },
      activeMissions: [{
        card: mockMission(), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null,
        player1Characters: [kimimaro],
        player2Characters: [],
      }],
    };

    const handler = getEffectHandler('KS-055-C', 'AMBUSH')!;
    const result = handler(makeCtx(state, 'player1', kimimaro, 0, 'AMBUSH'));
    expect(result.requiresTargetSelection).toBeUndefined();
  });
});

// ===================================================================
// 057/130 - JIROBO: POWERUP X (X = missions with Sound Four)
// ===================================================================
describe('057/130 - Jirobo', () => {
  it('should POWERUP based on number of missions with Sound Four', () => {
    const jirobo = mockCharInPlay({ instanceId: 'jirobo-1', powerTokens: 0 }, {
      id: 'KS-057-C', number: 57, name_fr: 'Jirobo', keywords: ['Sound Four'], group: 'Sound Village',
    });
    const soundFour2 = mockCharInPlay({ instanceId: 'sf-2' }, {
      name_fr: 'Tayuya', keywords: ['Sound Four'], group: 'Sound Village',
    });
    const state = createActionPhaseState({
      activeMissions: [
        {
          card: mockMission(), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null,
          player1Characters: [jirobo],
          player2Characters: [],
        },
        {
          card: mockMission(), rank: 'C', basePoints: 3, rankBonus: 2, wonBy: null,
          player1Characters: [soundFour2],
          player2Characters: [],
        },
      ],
    });

    const handler = getEffectHandler('KS-057-C', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', jirobo, 0));
    const updated = result.state.activeMissions[0].player1Characters.find(c => c.instanceId === 'jirobo-1');
    expect(updated?.powerTokens).toBe(2); // 2 missions with Sound Four
  });

  it('should get 0 POWERUP when no Sound Four anywhere', () => {
    const jirobo = mockCharInPlay({ instanceId: 'jirobo-1', powerTokens: 0, isHidden: true }, {
      id: 'KS-057-C', number: 57, name_fr: 'Jirobo', keywords: ['Sound Four'],
    });
    const state = createActionPhaseState({
      activeMissions: [{
        card: mockMission(), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null,
        player1Characters: [jirobo],
        player2Characters: [],
      }],
    });

    const handler = getEffectHandler('KS-057-C', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', jirobo, 0));
    const updated = result.state.activeMissions[0].player1Characters.find(c => c.instanceId === 'jirobo-1');
    expect(updated?.powerTokens).toBe(0); // jirobo is hidden, so 0 Sound Four missions
  });
});

// ===================================================================
// 059/130 - KIDOMARU: Move X friendly characters (X = Sound Four missions)
// ===================================================================
describe('059/130 - Kidomaru', () => {
  it('should auto-move friendly characters when Sound Four missions exist', () => {
    const kidomaru = mockCharInPlay({ instanceId: 'kid-1' }, {
      id: 'KS-059-C', number: 59, name_fr: 'Kidomaru', keywords: ['Sound Four'], group: 'Sound Village',
    });
    const ally = mockCharInPlay({ instanceId: 'ally-1' }, {
      name_fr: 'Ally', keywords: [],
    });
    const state = createActionPhaseState({
      activeMissions: [
        {
          card: mockMission(), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null,
          player1Characters: [kidomaru, ally],
          player2Characters: [],
        },
        {
          card: mockMission(), rank: 'C', basePoints: 3, rankBonus: 2, wonBy: null,
          player1Characters: [],
          player2Characters: [],
        },
      ],
    });

    const handler = getEffectHandler('KS-059-C', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', kidomaru, 0));
    // X=1 (one mission with Sound Four), so 1 move available
    // Now returns target selection: choose which character to move
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('KIDOMARU_CHOOSE_CHARACTER');
    expect(result.validTargets!.length).toBe(2); // both chars in mission 0 are movable
  });
});

// ===================================================================
// 061/130 - SAKON: Draw X cards (X = Sound Four missions)
// ===================================================================
describe('061/130 - Sakon', () => {
  it('should draw cards based on Sound Four mission count', () => {
    const sakon = mockCharInPlay({ instanceId: 'sakon-1' }, {
      id: 'KS-061-C', number: 61, name_fr: 'Sakon', keywords: ['Sound Four'], group: 'Sound Village',
    });
    const sf2 = mockCharInPlay({ instanceId: 'sf2' }, {
      name_fr: 'Tayuya', keywords: ['Sound Four'], group: 'Sound Village',
    });
    const baseState = createActionPhaseState();
    const deckCards = [mockCharacter({ name_fr: 'D1' }), mockCharacter({ name_fr: 'D2' }), mockCharacter({ name_fr: 'D3' })];
    const state: GameState = {
      ...baseState,
      player1: { ...baseState.player1, deck: deckCards, hand: [] },
      activeMissions: [
        { card: mockMission(), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null, player1Characters: [sakon], player2Characters: [] },
        { card: mockMission(), rank: 'C', basePoints: 3, rankBonus: 2, wonBy: null, player1Characters: [sf2], player2Characters: [] },
      ],
    };

    const handler = getEffectHandler('KS-061-C', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', sakon, 0));
    expect(result.state.player1.hand.length).toBe(2); // 2 Sound Four missions
  });
});

// ===================================================================
// 064/130 - TAYUYA: Continuous CHAKRA+X (tested in ContinuousEffects)
// ===================================================================
describe('064/130 - Tayuya', () => {
  it('should have a registered handler', () => {
    const handler = getEffectHandler('KS-064-C', 'MAIN');
    expect(handler).toBeDefined();
  });
});

// ===================================================================
// 068/130 - DOSU KINUTA: MAIN look at hidden; AMBUSH defeat hidden
// ===================================================================
describe('068/130 - Dosu Kinuta', () => {
  it('should request target selection for MAIN (look at hidden)', () => {
    const dosu = mockCharInPlay({ instanceId: 'dosu-1' }, {
      id: 'KS-068-C', number: 68, name_fr: 'Dosu Kinuta',
    });
    const hidden = mockCharInPlay({ instanceId: 'hidden-1', isHidden: true }, { name_fr: 'H' });
    const state = createActionPhaseState({
      activeMissions: [{
        card: mockMission(), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null,
        player1Characters: [dosu],
        player2Characters: [hidden],
      }],
    });

    const handler = getEffectHandler('KS-068-C', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', dosu, 0));
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('LOOK_AT_HIDDEN_CHARACTER');
  });

  it('should request target selection for AMBUSH (defeat hidden)', () => {
    const dosu = mockCharInPlay({ instanceId: 'dosu-1' }, {
      id: 'KS-068-C', number: 68, name_fr: 'Dosu Kinuta',
    });
    const hidden = mockCharInPlay({ instanceId: 'hidden-1', isHidden: true }, { name_fr: 'H' });
    const state = createActionPhaseState({
      activeMissions: [{
        card: mockMission(), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null,
        player1Characters: [dosu],
        player2Characters: [hidden],
      }],
    });

    const handler = getEffectHandler('KS-068-C', 'AMBUSH')!;
    expect(handler).toBeDefined();
    const result = handler(makeCtx(state, 'player1', dosu, 0, 'AMBUSH'));
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('DEFEAT_HIDDEN_CHARACTER');
  });

  it('should fizzle when no hidden characters exist', () => {
    const dosu = mockCharInPlay({ instanceId: 'dosu-1' }, {
      id: 'KS-068-C', number: 68, name_fr: 'Dosu',
    });
    const state = createActionPhaseState({
      activeMissions: [{
        card: mockMission(), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null,
        player1Characters: [dosu],
        player2Characters: [],
      }],
    });

    const handler = getEffectHandler('KS-068-C', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', dosu, 0));
    expect(result.requiresTargetSelection).toBeUndefined();
  });
});

// ===================================================================
// 070/130 - ZAKU: Opponent gains 1 Chakra
// ===================================================================
describe('070/130 - Zaku Abumi', () => {
  it('should give opponent 1 chakra', () => {
    const zaku = mockCharInPlay({ instanceId: 'zaku-1' }, {
      id: 'KS-070-C', number: 70, name_fr: 'Zaku Abumi', power: 4,
    });
    const state = createActionPhaseState({
      player2: { ...createActionPhaseState().player2, chakra: 5 },
      activeMissions: [{
        card: mockMission(), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null,
        player1Characters: [zaku],
        player2Characters: [],
      }],
    });

    const handler = getEffectHandler('KS-070-C', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', zaku, 0));
    expect(result.state.player2.chakra).toBe(6);
  });
});

// ===================================================================
// 072/130 - KIN TSUCHI: Opponent draws a card
// ===================================================================
describe('072/130 - Kin Tsuchi', () => {
  it('should make opponent draw 1 card', () => {
    const kin = mockCharInPlay({ instanceId: 'kin-1' }, {
      id: 'KS-072-C', number: 72, name_fr: 'Kin Tsuchi', power: 3,
    });
    const deckCard = mockCharacter({ name_fr: 'OppDeck' });
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      player2: { ...baseState.player2, deck: [deckCard], hand: [] },
      activeMissions: [{
        card: mockMission(), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null,
        player1Characters: [kin],
        player2Characters: [],
      }],
    };

    const handler = getEffectHandler('KS-072-C', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', kin, 0));
    expect(result.state.player2.hand.length).toBe(1);
    expect(result.state.player2.hand[0].name_fr).toBe('OppDeck');
  });

  it('should not crash when opponent deck is empty', () => {
    const kin = mockCharInPlay({ instanceId: 'kin-1' }, {
      id: 'KS-072-C', number: 72, name_fr: 'Kin',
    });
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      player2: { ...baseState.player2, deck: [], hand: [] },
      activeMissions: [{
        card: mockMission(), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null,
        player1Characters: [kin],
        player2Characters: [],
      }],
    };

    const handler = getEffectHandler('KS-072-C', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', kin, 0));
    expect(result.state.player2.hand.length).toBe(0);
  });
});

// ===================================================================
// 074/130 - GAARA (C, first version): POWERUP X (X = friendly hidden in this mission)
// ===================================================================
describe('074/130 - Gaara (C)', () => {
  it('should POWERUP based on friendly hidden characters in this mission', () => {
    const gaara = mockCharInPlay({ instanceId: 'gaara-1', powerTokens: 0 }, {
      id: 'KS-074-C', number: 74, name_fr: 'Gaara', group: 'Sand Village',
    });
    const hidden1 = mockCharInPlay({ instanceId: 'h1', isHidden: true }, {});
    const hidden2 = mockCharInPlay({ instanceId: 'h2', isHidden: true }, {});
    const state = createActionPhaseState({
      activeMissions: [{
        card: mockMission(), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null,
        player1Characters: [gaara, hidden1, hidden2],
        player2Characters: [],
      }],
    });

    const handler = getEffectHandler('KS-074-C', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', gaara, 0));
    const updated = result.state.activeMissions[0].player1Characters.find(c => c.instanceId === 'gaara-1');
    expect(updated?.powerTokens).toBe(2);
  });

  it('should get 0 when no hidden friendlies', () => {
    const gaara = mockCharInPlay({ instanceId: 'gaara-1', powerTokens: 0 }, {
      id: 'KS-074-C', number: 74, name_fr: 'Gaara',
    });
    const state = createActionPhaseState({
      activeMissions: [{
        card: mockMission(), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null,
        player1Characters: [gaara],
        player2Characters: [],
      }],
    });

    const handler = getEffectHandler('KS-074-C', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', gaara, 0));
    const updated = result.state.activeMissions[0].player1Characters.find(c => c.instanceId === 'gaara-1');
    expect(updated?.powerTokens).toBe(0);
  });
});

// ===================================================================
// 075/130 - GAARA (C, second version): Continuous (tested in EffectEngine + ChakraValidation)
// ===================================================================
describe('075/130 - Gaara (C alt)', () => {
  it('should have a registered handler', () => {
    const handler = getEffectHandler('KS-075-C', 'MAIN');
    expect(handler).toBeDefined();
  });
});

// ===================================================================
// 077/130 - KANKURO: Continuous CHAKRA+1 if enemy (tested in ContinuousEffects)
// ===================================================================
describe('077/130 - Kankuro', () => {
  it('should have a registered handler', () => {
    const handler = getEffectHandler('KS-077-C', 'MAIN');
    expect(handler).toBeDefined();
  });
});

// ===================================================================
// 079/130 - TEMARI: Continuous +2 Power if Edge (tested in ContinuousEffects)
// ===================================================================
describe('079/130 - Temari', () => {
  it('should have a registered handler', () => {
    const handler = getEffectHandler('KS-079-C', 'MAIN');
    expect(handler).toBeDefined();
  });
});

// ===================================================================
// 081/130 - BAKI: SCORE draw 1 card
// ===================================================================
describe('081/130 - Baki', () => {
  it('should draw 1 card on SCORE', () => {
    const baki = mockCharInPlay({ instanceId: 'baki-1' }, {
      id: 'KS-081-C', number: 81, name_fr: 'Baki',
    });
    const deckCard = mockCharacter({ name_fr: 'BakiDraw' });
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      player1: { ...baseState.player1, deck: [deckCard], hand: [] },
      activeMissions: [{
        card: mockMission(), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null,
        player1Characters: [baki],
        player2Characters: [],
      }],
    };

    const handler = getEffectHandler('KS-081-C', 'SCORE')!;
    expect(handler).toBeDefined();
    const result = handler(makeCtx(state, 'player1', baki, 0, 'SCORE'));
    expect(result.state.player1.hand.length).toBe(1);
    expect(result.state.player1.hand[0].name_fr).toBe('BakiDraw');
  });
});

// ===================================================================
// 084/130 - YASHAMARU: Continuous +2 Power if Gaara (tested in ContinuousEffects)
// ===================================================================
describe('084/130 - Yashamaru', () => {
  it('should have a registered handler', () => {
    const handler = getEffectHandler('KS-084-C', 'MAIN');
    expect(handler).toBeDefined();
  });
});

// ===================================================================
// 086/130 - ZABUZA MOMOCHI: No effects
// ===================================================================
describe('086/130 - Zabuza Momochi', () => {
  it('should be a no-op handler', () => {
    const handler = getEffectHandler('KS-086-C', 'MAIN')!;
    expect(handler).toBeDefined();
    const state = createActionPhaseState();
    const zabuza = mockCharInPlay({}, { id: 'KS-086-C', number: 86 });
    const result = handler(makeCtx(state, 'player1', zabuza, 0));
    expect(result.state).toBeDefined();
  });
});

// ===================================================================
// 088/130 - HAKU: Draw 1, then put 1 card on top of deck
// ===================================================================
describe('088/130 - Haku', () => {
  it('should draw 1 card and require hand selection to choose which to put back', () => {
    const haku = mockCharInPlay({ instanceId: 'haku-1' }, {
      id: 'KS-088-C', number: 88, name_fr: 'Haku',
    });
    const deckCard = mockCharacter({ name_fr: 'HakuDraw' });
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      player1: { ...baseState.player1, deck: [deckCard], hand: [mockCharacter({ name_fr: 'InHand' })] },
      activeMissions: [{
        card: mockMission(), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null,
        player1Characters: [haku],
        player2Characters: [],
      }],
    };

    const handler = getEffectHandler('KS-088-C', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', haku, 0));
    // Draws the card, then asks which to put back
    expect(result.state.player1.hand.length).toBe(2); // InHand + HakuDraw
    expect(result.state.player1.deck.length).toBe(0); // deck empty after draw
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('PUT_CARD_ON_DECK');
    expect(result.validTargets).toEqual(['0', '1']); // both hand indices
  });

  it('should do nothing when deck is empty', () => {
    const haku = mockCharInPlay({ instanceId: 'haku-1' }, {
      id: 'KS-088-C', number: 88, name_fr: 'Haku',
    });
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      player1: { ...baseState.player1, deck: [], hand: [] },
      activeMissions: [{
        card: mockMission(), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null,
        player1Characters: [haku],
        player2Characters: [],
      }],
    };

    const handler = getEffectHandler('KS-088-C', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', haku, 0));
    expect(result.state.player1.hand.length).toBe(0);
    expect(result.requiresTargetSelection).toBeUndefined();
  });
});

// ===================================================================
// 090/130 - ITACHI (C): Continuous cost reduction (tested in ChakraValidation)
// ===================================================================
describe('090/130 - Itachi Uchiha (C)', () => {
  it('should have a registered handler', () => {
    const handler = getEffectHandler('KS-090-C', 'MAIN');
    expect(handler).toBeDefined();
  });
});

// ===================================================================
// 092/130 - KISAME (C): AMBUSH steal up to 2 Power tokens from enemy
// ===================================================================
describe('092/130 - Kisame Hoshigaki (C)', () => {
  it('should steal power tokens from a single valid enemy (AMBUSH)', () => {
    const kisame = mockCharInPlay({ instanceId: 'kisame-1', powerTokens: 0 }, {
      id: 'KS-092-C', number: 92, name_fr: 'Kisame', group: 'Akatsuki',
    });
    const enemy = mockCharInPlay({ instanceId: 'enemy-1', powerTokens: 3, controlledBy: 'player2', originalOwner: 'player2' }, {
      name_fr: 'PowerEnemy',
    });
    const state = createActionPhaseState({
      activeMissions: [{
        card: mockMission(), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null,
        player1Characters: [kisame],
        player2Characters: [enemy],
      }],
    });

    const handler = getEffectHandler('KS-092-C', 'AMBUSH')!;
    expect(handler).toBeDefined();
    const result = handler(makeCtx(state, 'player1', kisame, 0, 'AMBUSH'));
    const updatedEnemy = result.state.activeMissions[0].player2Characters.find(c => c.instanceId === 'enemy-1');
    const updatedKisame = result.state.activeMissions[0].player1Characters.find(c => c.instanceId === 'kisame-1');
    expect(updatedEnemy?.powerTokens).toBe(1); // 3 - 2 = 1
    expect(updatedKisame?.powerTokens).toBe(2); // 0 + 2 = 2
  });

  it('should fizzle when no enemy has power tokens', () => {
    const kisame = mockCharInPlay({ instanceId: 'kisame-1', powerTokens: 0 }, {
      id: 'KS-092-C', number: 92, name_fr: 'Kisame',
    });
    const enemy = mockCharInPlay({ instanceId: 'enemy-1', powerTokens: 0, controlledBy: 'player2', originalOwner: 'player2' }, {});
    const state = createActionPhaseState({
      activeMissions: [{
        card: mockMission(), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null,
        player1Characters: [kisame],
        player2Characters: [enemy],
      }],
    });

    const handler = getEffectHandler('KS-092-C', 'AMBUSH')!;
    const result = handler(makeCtx(state, 'player1', kisame, 0, 'AMBUSH'));
    expect(result.requiresTargetSelection).toBeUndefined();
  });
});

// ===================================================================
// 094-098 - SUMMON characters (Gama Bunta, Gamahiro, Gamakichi, Gamatatsu, Katsuyu)
// These are continuous effects tested in EndPhase (return to hand)
// ===================================================================
describe('Summon characters (094-098)', () => {
  it('094/130 - Gama Bunta should have a handler', () => {
    const handler = getEffectHandler('KS-094-C', 'MAIN');
    expect(handler).toBeDefined();
  });
  it('095/130 - Gamahiro should have a handler', () => {
    const handler = getEffectHandler('KS-095-C', 'MAIN');
    expect(handler).toBeDefined();
  });
  it('096/130 - Gamakichi should have a handler', () => {
    const handler = getEffectHandler('KS-096-C', 'MAIN');
    expect(handler).toBeDefined();
  });
  it('097/130 - Gamatatsu should have a handler', () => {
    const handler = getEffectHandler('KS-097-C', 'MAIN');
    expect(handler).toBeDefined();
  });
  it('098/130 - Katsuyu should have a handler', () => {
    const handler = getEffectHandler('KS-098-C', 'MAIN');
    expect(handler).toBeDefined();
  });
});

// ===================================================================
// 099/130 - PAKKUN: SCORE move self to another mission
// ===================================================================
describe('099/130 - Pakkun', () => {
  it('should auto-move Pakkun to the first other mission on SCORE', () => {
    const pakkun = mockCharInPlay({ instanceId: 'pakkun-1' }, {
      id: 'KS-099-C', number: 99, name_fr: 'Pakkun',
    });
    const state = createActionPhaseState({
      activeMissions: [
        { card: mockMission(), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null, player1Characters: [pakkun], player2Characters: [] },
        { card: mockMission(), rank: 'C', basePoints: 3, rankBonus: 2, wonBy: null, player1Characters: [], player2Characters: [] },
      ],
    });

    const handler = getEffectHandler('KS-099-C', 'SCORE')!;
    expect(handler).toBeDefined();
    const result = handler(makeCtx(state, 'player1', pakkun, 0, 'SCORE'));
    // Pakkun auto-moved from mission 0 to mission 1
    expect(result.state.activeMissions[0].player1Characters.length).toBe(0);
    expect(result.state.activeMissions[1].player1Characters.length).toBe(1);
    expect(result.state.activeMissions[1].player1Characters[0].instanceId).toBe('pakkun-1');
    expect(result.requiresTargetSelection).toBeUndefined();
  });

  it('should fizzle when only one mission exists', () => {
    const pakkun = mockCharInPlay({ instanceId: 'pakkun-1' }, {
      id: 'KS-099-C', number: 99, name_fr: 'Pakkun',
    });
    const state = createActionPhaseState({
      activeMissions: [
        { card: mockMission(), rank: 'D', basePoints: 3, rankBonus: 1, wonBy: null, player1Characters: [pakkun], player2Characters: [] },
      ],
    });

    const handler = getEffectHandler('KS-099-C', 'SCORE')!;
    const result = handler(makeCtx(state, 'player1', pakkun, 0, 'SCORE'));
    expect(result.requiresTargetSelection).toBeUndefined();
  });
});

// ===================================================================
// 100/130 - NINJA HOUNDS: Continuous move trigger (no-op handler)
// ===================================================================
describe('100/130 - Ninja Hounds', () => {
  it('should have a registered handler (no-op)', () => {
    const handler = getEffectHandler('KS-100-C', 'MAIN');
    expect(handler).toBeDefined();
  });
});

// ===================================================================
// 101/130 - TON TON: Continuous +1 Power if Tsunade/Shizune (tested in ContinuousEffects)
// ===================================================================
describe('101/130 - Ton Ton', () => {
  it('should have a registered handler', () => {
    const handler = getEffectHandler('KS-101-C', 'MAIN');
    expect(handler).toBeDefined();
  });
});

// ===================================================================
// Registry completeness check
// ===================================================================
describe('Registry completeness', () => {
  const commonCardIds = [
    'KS-001-C', 'KS-003-C', 'KS-007-C', 'KS-009-C', 'KS-011-C', 'KS-013-C', 'KS-015-C',
    'KS-019-C', 'KS-021-C', 'KS-023-C', 'KS-025-C', 'KS-027-C', 'KS-034-C', 'KS-036-C',
    'KS-040-C', 'KS-042-C', 'KS-044-C', 'KS-046-C', 'KS-047-C', 'KS-048-C', 'KS-049-C',
    'KS-050-C', 'KS-055-C', 'KS-057-C', 'KS-059-C', 'KS-061-C', 'KS-064-C', 'KS-068-C',
    'KS-070-C', 'KS-072-C', 'KS-074-C', 'KS-075-C', 'KS-077-C', 'KS-079-C', 'KS-081-C',
    'KS-084-C', 'KS-086-C', 'KS-088-C', 'KS-090-C', 'KS-092-C', 'KS-094-C', 'KS-095-C',
    'KS-096-C', 'KS-097-C', 'KS-098-C', 'KS-099-C', 'KS-100-C', 'KS-101-C',
  ];

  it.each(commonCardIds)('should have handler registered for %s', (cardId) => {
    const handler = getEffectHandler(cardId, 'MAIN') || getEffectHandler(cardId, 'AMBUSH') || getEffectHandler(cardId, 'SCORE');
    expect(handler).toBeDefined();
  });
});
