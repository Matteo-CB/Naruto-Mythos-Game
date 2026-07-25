import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry, getEffectHandler } from '@/lib/effects/EffectRegistry';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { getCharacterById } from '@/lib/data/cardIndex';
import { normalizeHoloCardForGame } from '@/lib/holo/holoId';
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
    card: { id: 'MSS 01', cardId: 'MSS-01', set: 'KS', number: 1, name_fr: 'Mission', title_fr: '', rarity: 'MMS', card_type: 'mission', has_visual: true, effects: [], chakra: 0, power: 0, keywords: [], group: '', basePoints: 1 } as MissionCard,
    rank: 'D', basePoints: 1, rankBonus: 1,
    player1Characters: [], player2Characters: [], wonBy: null,
    ...ov,
  } as ActiveMission;
}

function makePlayer(ov: Partial<GameState['player1']> = {}) {
  return {
    id: (ov.id ?? 'player1') as PlayerID, userId: 'u1', isAI: false,
    deck: [], hand: [], discardPile: [], missionCards: [],
    chakra: 11, missionPoints: 0, hasPassed: false, charactersInPlay: 0,
    unusedMission: null, hasMulliganed: false,
    ...ov,
  };
}

function makeState(ov: Partial<GameState> = {}): GameState {
  return {
    turn: 2, phase: 'action', activePlayer: 'player1', edgeHolder: 'player1',
    player1: makePlayer(),
    player2: makePlayer({ id: 'player2' as PlayerID, userId: 'u2' }),
    missionDeck: [], activeMissions: [mockMission(), mockMission({ rank: 'C', rankBonus: 2 })],
    log: [], pendingEffects: [], pendingActions: [], actionHistory: [],
    ...ov,
  } as GameState;
}

describe('Holo cards resolve effects exactly like their base card', () => {
  beforeAll(async () => { await initializeRegistry(); });

  it('getEffectHandler resolves a holo id to the same handler as the base id', () => {
    expect(getEffectHandler('KS-053-UC_H', 'MAIN')).toBeDefined();
    for (const baseId of ['KS-053-UC', 'KS-046-C', 'KS-018-C']) {
      for (const t of ['MAIN', 'UPGRADE', 'AMBUSH', 'SCORE'] as const) {
        expect(getEffectHandler(`${baseId}_H`, t)).toBe(getEffectHandler(baseId, t));
      }
    }
  });

  it('normalizeHoloCardForGame strips the holo id to the base id but keeps isHolo', () => {
    const holo = getCharacterById('KS-053-UC_H')!;
    expect(holo.id).toBe('KS-053-UC_H');
    expect(holo.isHolo).toBe(true);

    const norm = normalizeHoloCardForGame(holo);
    expect(norm.id).toBe('KS-053-UC');
    expect(norm.cardId).toBe('KS-053-UC');
    expect(norm.isHolo).toBe(true);
    expect((norm.effects ?? []).length).toBe((holo.effects ?? []).length);
  });

  it('a holo Kabuto (053) played still triggers its "play from discard" MAIN', () => {
    const kabutoHolo = getCharacterById('KS-053-UC_H')!;
    expect(kabutoHolo.id).toBe('KS-053-UC_H');

    const kabutoChar = mockChar({ instanceId: 'kab-1', card: kabutoHolo, stack: [kabutoHolo] });
    const discardChar = mockCard({ id: 'KS-122-RA', cardId: 'KS-122-RA', name_fr: 'JIROBO', chakra: 4 });

    const state = makeState({
      player1: makePlayer({ chakra: 11, discardPile: [discardChar] }),
      activeMissions: [
        mockMission({ player1Characters: [kabutoChar] }),
        mockMission({ rank: 'C', rankBonus: 2 }),
      ],
    });

    const result = EffectEngine.resolvePlayEffects(state, 'player1', kabutoChar, 0, false);

    const askedPlayer = result.pendingEffects.find((e) =>
      e.targetSelectionType === 'KABUTO053_CONFIRM_MAIN' || e.targetSelectionType === 'KABUTO053_CHOOSE_MISSION');
    const playedFromDiscard = result.player1.discardPile.length === 0;
    expect(Boolean(askedPlayer) || playedFromDiscard).toBe(true);
  });
});
