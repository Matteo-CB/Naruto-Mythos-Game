import type { GameState, PlayerID, PlayerState, CharacterInPlay, CharacterCard, MissionCard, ActiveMission } from '@/lib/engine/types';
import { generateGameId, generateInstanceId } from '@/lib/engine/utils/id';
import { getCharacterById, getMissionById } from '@/lib/data/cardIndex';

const MISSION_IDS = ['KS-001-MMS', 'KS-002-MMS', 'KS-003-MMS', 'KS-004-MMS'];

export function simChar(
  cardId: string,
  opts: { instanceId?: string; owner?: PlayerID; hidden?: boolean; powerTokens?: number; missionIndex?: number } = {},
): CharacterInPlay {
  const card = getCharacterById(cardId);
  if (!card) throw new Error(`sim: unknown character ${cardId}`);
  const owner = opts.owner ?? 'player1';
  return {
    instanceId: opts.instanceId ?? generateInstanceId(),
    card,
    isHidden: opts.hidden ?? false,
    wasRevealedAtLeastOnce: !(opts.hidden ?? false),
    powerTokens: opts.powerTokens ?? 0,
    stack: [card],
    controlledBy: owner,
    originalOwner: owner,
    missionIndex: opts.missionIndex ?? 0,
  };
}

function makePlayer(id: PlayerID, hand: CharacterCard[], charactersInPlay: number, chakra: number): PlayerState {
  return {
    id,
    userId: `sim-${id}`,
    isAI: false,
    deck: [],
    hand,
    discardPile: [],
    missionCards: [],
    chakra,
    missionPoints: 0,
    hasPassed: false,
    hasMulliganed: true,
    charactersInPlay,
    unusedMission: null,
  } as PlayerState;
}

export interface BuildSimOpts {
  hand1?: string[];
  p1?: CharacterInPlay[];
  p2?: CharacterInPlay[];
  missions?: number;
  chakra1?: number;
  edgeHolder?: PlayerID;
}

export function buildSimState(opts: BuildSimOpts = {}): GameState {
  const missionCount = Math.max(1, opts.missions ?? 2);
  const activeMissions: ActiveMission[] = [];
  for (let i = 0; i < missionCount; i++) {
    const mcard = getMissionById(MISSION_IDS[i] ?? MISSION_IDS[0]) as MissionCard;
    activeMissions.push({
      card: mcard,
      rank: 'D',
      basePoints: mcard?.basePoints ?? 2,
      rankBonus: 1,
      player1Characters: i === 0 ? (opts.p1 ?? []) : [],
      player2Characters: i === 0 ? (opts.p2 ?? []) : [],
      wonBy: null,
    });
  }

  const hand1 = (opts.hand1 ?? [])
    .map((id) => getCharacterById(id))
    .filter((c): c is CharacterCard => !!c);

  return {
    gameId: generateGameId(),
    turn: 2 as GameState['turn'],
    phase: 'action',
    activePlayer: 'player1',
    edgeHolder: opts.edgeHolder ?? 'player1',
    firstPasser: null,
    player1: makePlayer('player1', hand1, opts.p1?.length ?? 0, opts.chakra1 ?? 10),
    player2: makePlayer('player2', [], opts.p2?.length ?? 0, 10),
    missionDeck: [],
    activeMissions,
    log: [],
    pendingEffects: [],
    pendingActions: [],
    turnMissionRevealed: true,
    consecutiveTimeouts: { player1: 0, player2: 0 },
  } as GameState;
}
