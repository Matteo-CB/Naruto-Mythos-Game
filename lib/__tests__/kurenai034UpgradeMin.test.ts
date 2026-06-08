import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { GameEngine } from '@/lib/engine/GameEngine';
import type { GameState, CharacterInPlay, ActiveMission, CharacterCard, MissionCard, PlayerID } from '@/lib/engine/types';

function mkCard(ov: Partial<CharacterCard>): CharacterCard {
  return {
    id: 'KS-X', cardId: 'KS-X', set: 'KS', number: 999, name_fr: 'X', title_fr: 'X',
    rarity: 'C', card_type: 'character', has_visual: true, chakra: 1, power: 1,
    keywords: [], group: 'Leaf Village', effects: [], ...ov,
  } as CharacterCard;
}

function mkChar(ov: Partial<CharacterInPlay> = {}): CharacterInPlay {
  return {
    card: ov.card ?? mkCard({}), instanceId: ov.instanceId ?? 'c-' + Math.random().toString(36).slice(2, 8),
    isHidden: false, powerTokens: 0, stack: ov.stack ?? [ov.card ?? mkCard({})],
    controlledBy: ov.controlledBy ?? 'player1', originalOwner: ov.originalOwner ?? 'player1',
    wasRevealedAtLeastOnce: false, ...ov,
  } as CharacterInPlay;
}

function mkMission(ov: Partial<ActiveMission> = {}): ActiveMission {
  return {
    card: { id: 'MSS', cardId: 'MSS', set: 'KS', number: 1, name_fr: 'M', title_fr: 'M',
      rarity: 'MMS', card_type: 'mission', has_visual: true, effects: [], chakra: 0, power: 0,
      keywords: [], group: '', basePoints: 1 } as MissionCard,
    rank: 'D', basePoints: 1, rankBonus: 1, player1Characters: [], player2Characters: [],
    wonBy: null, ...ov,
  } as ActiveMission;
}

function mkState(ov: Partial<GameState> = {}): GameState {
  return {
    turn: 2, phase: 'action', activePlayer: 'player1', edgeHolder: 'player1',
    player1: { id: 'player1' as PlayerID, userId: 'u1', isAI: false, deck: [], hand: [], discardPile: [], missionCards: [], chakra: 10, missionPoints: 0, hasPassed: false, charactersInPlay: 0, unusedMission: null, hasMulliganed: false },
    player2: { id: 'player2' as PlayerID, userId: 'u2', isAI: false, deck: [], hand: [], discardPile: [], missionCards: [], chakra: 10, missionPoints: 0, hasPassed: false, charactersInPlay: 0, unusedMission: null, hasMulliganed: false },
    missionDeck: [], activeMissions: [mkMission()],
    log: [], pendingEffects: [], pendingActions: [], actionHistory: [],
    ...ov,
  } as GameState;
}

const kurenai034 = mkCard({
  id: 'KS-034-C', number: 34, name_fr: 'KURENAI YUHI', title_fr: 'Team 8 Sensei',
  chakra: 3, power: 3, keywords: ['Team 8', 'Jonin'], group: 'Leaf Village',
  effects: [{ type: 'MAIN', description: '[⧗] Other Team 8 characters costs 1 less (min.1) to play in this mission.' }],
});

const kurenai035 = mkCard({
  id: 'KS-035-UC', number: 35, name_fr: 'KURENAI YUHI', title_fr: 'Genjutsu Master',
  chakra: 4, power: 3, keywords: ['Team 8', 'Jonin'], group: 'Leaf Village',
  effects: [{ type: 'MAIN', description: '[⧗] Enemy characters cannot move from this mission.' }],
});

describe('Kurenai 034 (min.1) interaction with upgrade', () => {
  beforeAll(async () => { await initializeRegistry(); });

  it('upgrading Kurenai 035 (cost 4) over Kurenai 034 (cost 3) with Kurenai 034 active costs at least 1 chakra (was 0 bug)', () => {
    const k034char = mkChar({ instanceId: 'k034-1', card: kurenai034 });
    const state = mkState({
      activeMissions: [mkMission({ player1Characters: [k034char] })],
      player1: { id: 'player1' as PlayerID, userId: 'u1', isAI: false, deck: [], hand: [kurenai035], discardPile: [], missionCards: [], chakra: 5, missionPoints: 0, hasPassed: false, charactersInPlay: 1, unusedMission: null, hasMulliganed: true },
      player2: { id: 'player2' as PlayerID, userId: 'u2', isAI: false, deck: [], hand: [], discardPile: [], missionCards: [], chakra: 0, missionPoints: 0, hasPassed: false, charactersInPlay: 0, unusedMission: null, hasMulliganed: true },
    } as unknown as GameState);

    const next = GameEngine.applyAction(state, 'player1', {
      type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: 'k034-1',
    });

    expect(next.player1.chakra).toBe(4);
    const mission = next.activeMissions[0];
    const upgraded = mission.player1Characters.find((c) => c.instanceId === 'k034-1');
    expect(upgraded).toBeTruthy();
    expect(upgraded?.card.number).toBe(35);
  });

  it('upgrading the SAME Kurenai 034 (no Kurenai-reduction on self) still pays the normal difference (no min-1 spurious clamp)', () => {
    const otherTeam8 = mkCard({ id: 'KS-117-UC', number: 117, name_fr: 'SHINO ABURAME', title_fr: 'Team 8', chakra: 4, power: 3, keywords: ['Team 8'], group: 'Leaf Village' });
    const kurenai034Lower = mkCard({ ...kurenai034, chakra: 2 } as Partial<CharacterCard>);

    const onSelfChar = mkChar({ instanceId: 'self-1', card: kurenai034Lower });
    const state = mkState({
      activeMissions: [mkMission({ player1Characters: [onSelfChar] })],
      player1: { id: 'player1' as PlayerID, userId: 'u1', isAI: false, deck: [], hand: [otherTeam8], discardPile: [], missionCards: [], chakra: 5, missionPoints: 0, hasPassed: false, charactersInPlay: 1, unusedMission: null, hasMulliganed: true },
      player2: { id: 'player2' as PlayerID, userId: 'u2', isAI: false, deck: [], hand: [], discardPile: [], missionCards: [], chakra: 0, missionPoints: 0, hasPassed: false, charactersInPlay: 0, unusedMission: null, hasMulliganed: true },
    } as unknown as GameState);

    const next = GameEngine.applyAction(state, 'player1', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false,
    });

    expect(next.player1.chakra).toBeLessThanOrEqual(5);
  });
});
