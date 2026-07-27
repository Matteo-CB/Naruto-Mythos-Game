import type { GameState, MissionRank } from '@/lib/engine/types';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';

const PREVIEW_HAND = ['KS-021-C', 'KS-011-C', 'KS-007-C', 'KS-086-C'];
const PREVIEW_MISSION_IDS = ['KS-001-MMS', 'KS-002-MMS', 'KS-003-MMS'];
const PREVIEW_RANKS: MissionRank[] = ['D', 'C', 'B'];
const PREVIEW_RANK_BONUS = [1, 2, 3];

export function buildPreviewBoardState(): GameState {
  const state = buildSimState({
    missions: 3,
    missionIds: PREVIEW_MISSION_IDS,
    chakra1: 8,
    edgeHolder: 'player1',
    hand1: PREVIEW_HAND,
    p1: [
      simChar('KS-021-C', { instanceId: 'preview-me-1', owner: 'player1', powerTokens: 2 }),
      simChar('KS-011-C', { instanceId: 'preview-me-2', owner: 'player1' }),
    ],
    p2: [
      simChar('KS-007-C', { instanceId: 'preview-opp-1', owner: 'player2' }),
      simChar('KS-086-C', { instanceId: 'preview-opp-2', owner: 'player2', hidden: true }),
    ],
  });

  state.activeMissions.forEach((mission, index) => {
    mission.rank = PREVIEW_RANKS[index] ?? 'D';
    mission.rankBonus = PREVIEW_RANK_BONUS[index] ?? 1;
  });

  if (state.activeMissions[1]) {
    state.activeMissions[1].player1Characters = [
      simChar('KS-052-C', { instanceId: 'preview-me-3', owner: 'player1', missionIndex: 1 }),
    ];
    state.activeMissions[1].player2Characters = [
      simChar('KS-011-C', { instanceId: 'preview-opp-3', owner: 'player2', missionIndex: 1, powerTokens: 1 }),
    ];
    state.activeMissions[1].wonBy = 'player2';
  }
  if (state.activeMissions[0]) {
    state.activeMissions[0].wonBy = 'player1';
  }

  state.player1.chakra = 8;
  state.player2.chakra = 5;
  state.player1.missionPoints = 6;
  state.player2.missionPoints = 4;
  state.player1.charactersInPlay = 3;
  state.player2.charactersInPlay = 3;
  state.player2.deck = state.player1.deck;

  const baseTimestamp = 0;
  state.log = [
    {
      turn: 2,
      phase: 'start',
      player: 'player1',
      action: 'preview',
      details: '',
      messageKey: 'game.log.draw',
      messageParams: { count: 2 },
      timestamp: baseTimestamp,
    },
    {
      turn: 2,
      phase: 'action',
      player: 'player2',
      action: 'preview',
      details: '',
      messageKey: 'game.log.playHidden',
      messageParams: { mission: 1 },
      timestamp: baseTimestamp + 1,
    },
  ];

  return state;
}
