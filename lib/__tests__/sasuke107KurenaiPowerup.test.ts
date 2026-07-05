import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry, getEffectHandler } from '@/lib/effects/EffectRegistry';
import type { EffectContext } from '@/lib/effects/EffectTypes';
import type { GameState, CharacterInPlay, ActiveMission, CharacterCard, MissionCard, PlayerID } from '@/lib/engine/types';

function mockCard(ov: Partial<CharacterCard> = {}): CharacterCard {
  return {
    id: 'KS-999-C', cardId: 'KS-999-C', set: 'KS', number: 999,
    name_fr: 'Test', title_fr: 'Test', rarity: 'C', card_type: 'character',
    has_visual: true, chakra: 2, power: 2, keywords: [], group: 'Leaf Village', effects: [],
    ...ov,
  } as CharacterCard;
}

function mockChar(ov: Partial<CharacterInPlay> = {}): CharacterInPlay {
  return {
    card: ov.card ?? mockCard(),
    instanceId: ov.instanceId ?? 'c-' + Math.random().toString(36).slice(2, 8),
    isHidden: false, powerTokens: 0, stack: ov.stack ?? [],
    controlledBy: ov.controlledBy ?? 'player1',
    originalOwner: ov.originalOwner ?? 'player1',
    wasRevealedAtLeastOnce: false,
    ...ov,
  } as CharacterInPlay;
}

function mockMission(ov: Partial<ActiveMission> = {}): ActiveMission {
  return {
    card: { id: 'MSS-01', cardId: 'MSS-01', set: 'KS', number: 1, name_fr: 'Mission', title_fr: '', rarity: 'MMS', card_type: 'mission', has_visual: true, effects: [], chakra: 0, power: 0, keywords: [], group: '', basePoints: 1 } as MissionCard,
    rank: 'D', basePoints: 1, rankBonus: 1,
    player1Characters: [], player2Characters: [], wonBy: null,
    ...ov,
  } as ActiveMission;
}

function makePlayer(ov: Partial<GameState['player1']> = {}) {
  return {
    id: (ov.id ?? 'player1') as PlayerID, userId: 'u1', isAI: false,
    deck: [], hand: [], discardPile: [], missionCards: [],
    chakra: 10, missionPoints: 0, hasPassed: false, charactersInPlay: 0,
    unusedMission: null, hasMulliganed: false,
    ...ov,
  };
}

function makeState(missions: ActiveMission[]): GameState {
  return {
    turn: 10, phase: 'action', activePlayer: 'player1', edgeHolder: 'player1',
    player1: makePlayer(),
    player2: makePlayer({ id: 'player2' as PlayerID, userId: 'u2' }),
    missionDeck: [], activeMissions: missions,
    log: [], pendingEffects: [], pendingActions: [], actionHistory: [],
  } as unknown as GameState;
}

const sasukeCard = mockCard({ id: 'KS-107-R', number: 107, name_fr: 'Sasuke Uchiwa', name_en: 'Sasuke Uchiha' } as Partial<CharacterCard>);
const allyCard = mockCard({ id: 'KS-018-C', number: 18, name_fr: 'Choji', name_en: 'Choji' } as Partial<CharacterCard>);
const kurenaiCard = mockCard({
  id: 'KS-035-UC', number: 35, name_fr: 'Kurenai Yuhi', name_en: 'Kurenai Yuhi',
  effects: [{ type: 'MAIN', description: '[⧗] Enemy characters cannot move from this mission.' }],
} as Partial<CharacterCard>);

function buildContext(withKurenai: boolean): { ctx: EffectContext; sasuke: CharacterInPlay } {
  const sasuke = mockChar({ instanceId: 'sasuke', card: sasukeCard });
  const ally = mockChar({ instanceId: 'ally', card: allyCard });
  const mission0 = mockMission({
    player1Characters: [sasuke, ally],
    player2Characters: withKurenai ? [mockChar({ instanceId: 'kurenai', card: kurenaiCard, controlledBy: 'player2', originalOwner: 'player2' })] : [],
  });
  const mission1 = mockMission();
  const state = makeState([mission0, mission1]);
  const ctx: EffectContext = {
    state, sourcePlayer: 'player1', sourceCard: sasuke, sourceMissionIndex: 0,
    triggerType: 'MAIN', isUpgrade: true,
  };
  return { ctx, sasuke };
}

describe('Sasuke Chidori (KS-107) UPGRADE POWERUP counts only actually-moved characters', () => {
  beforeAll(() => { initializeRegistry(); });

  it('does NOT grant a POWERUP when the opponent Kurenai (035) blocks all movement out of the mission', () => {
    const handler = getEffectHandler('KS-107-R', 'MAIN');
    expect(handler).toBeTruthy();
    const { ctx } = buildContext(true);
    const result = handler!(ctx);

    expect(result.targetSelectionType).not.toBe('SASUKE107_CONFIRM_UPGRADE');
    expect(result.targetSelectionType).toBeUndefined();
    const sasukeAfter = result.state.activeMissions[0].player1Characters.find((c) => c.instanceId === 'sasuke');
    expect(sasukeAfter?.powerTokens).toBe(0);
  });

  it('still grants the POWERUP prompt when movement is NOT blocked (one character actually moves)', () => {
    const handler = getEffectHandler('KS-107-R', 'MAIN');
    const { ctx } = buildContext(false);
    const result = handler!(ctx);

    expect(result.targetSelectionType).toBe('SASUKE107_CONFIRM_UPGRADE');
    const data = JSON.parse(result.description ?? '{}');
    expect(data.movedCount).toBe(1);
  });
});
