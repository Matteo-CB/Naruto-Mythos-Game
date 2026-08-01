import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

vi.mock('@/lib/db/prisma', () => {
  const mock = {
    tournament: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
    tournamentParticipant: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    tournamentMatch: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    sealedPoolClaim: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    bannedCard: { findMany: vi.fn() },
    deck: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    userBan: { findFirst: vi.fn() },
    game: { deleteMany: vi.fn() },
  };
  return { prisma: mock };
});

vi.mock('@/lib/socket/tournamentHandlers', () => ({
  registerTournamentHandlers: vi.fn(),
  handleTournamentMatchEnd: vi.fn(),
  rehydrateAbsenceTimers: vi.fn(),
  sweepOrphanTournamentMatches: vi.fn(),
  handleSwissDoubleAbsence: vi.fn(),
  reopenTournamentMatch: vi.fn(),
  handleMatchForfeit: vi.fn(),
}));

vi.mock('@/lib/auth/authOptions', () => ({ auth: vi.fn() }));

vi.mock('@/lib/moderation/sanctions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/moderation/sanctions')>();
  return { ...actual, isSuspended: vi.fn(async () => false) };
});

import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/authOptions';
import { POST as joinByCodePOST } from '../../app/api/tournaments/join-by-code/route';
import { POST as leaveTournamentPOST } from '../../app/api/tournaments/[id]/leave/route';
import { executeTournamentStart } from '@/lib/tournament/startLogic';
import { computeSwissRoundCount } from '@/lib/tournament/swissEngine';
import { syncChessClock, whoseInputIsAwaited, type RoomData } from '@/lib/socket/server';
import {
  createChessClock,
  CHESS_CLOCK_INITIAL_MS,
  CHESS_CLOCK_IDLE_LIMIT_MS,
  CHESS_CLOCK_MULLIGAN_IDLE_MS,
} from '@/lib/timing/chessClock';
import { useSocketStore, computeChessClockRemainingMs } from '@/lib/socket/client';
import { GameEngine } from '@/lib/engine/GameEngine';
import { validateDeck } from '@/lib/engine/rules/DeckValidation';
import { generateSealedPool, separateSealedPool, type BoosterCard, type SealedPool } from '@/lib/sealed/boosterGenerator';
import { buildAISealedDeck } from '@/lib/sealed/aiSealedDeckBuilder';
import {
  checkSealedDeckAgainstPool,
  SEALED_BUILD_RESERVATION_MS,
  SEALED_BUILD_WINDOW_MS,
  SEALED_BUILD_SUBMIT_GRACE_MS,
  SEALED_MIN_DECK_SIZE,
  SEALED_REQUIRED_MISSIONS,
} from '@/lib/tournament/sealedRegistration';
import { getPlayableCharacters, getPlayableMissions } from '@/lib/data/cardLoader';
import { isVariantRarity } from '@/lib/variants/constants';
import { isLockedVariantCard } from '@/lib/variants/isVariant';
import { getCardById } from '@/lib/data/cardIndex';
import type { CardData, CharacterCard, GameState, MissionCard, PlayerID } from '@/lib/engine/types';

const REPO_ROOT = process.cwd();

function readSource(relative: string): string {
  return readFileSync(path.resolve(REPO_ROOT, relative), 'utf8').replace(/\r\n/g, '\n');
}

const SERVER_SRC = readSource('lib/socket/server.ts');
const SEALED_BUILDER_SRC = readSource('components/sealed/SealedDeckBuilder.tsx');
const SEALED_AI_PAGE_SRC = readSource('app/[locale]/play/sealed/page.tsx');
const SEALED_BUILD_PAGE_SRC = readSource('app/[locale]/tournaments/[id]/sealed-build/page.tsx');
const TOURNAMENT_HANDLERS_SRC = readSource('lib/socket/tournamentHandlers.ts');
const SEALED_DECK_ROUTE_SRC = readSource('app/api/tournaments/[id]/sealed-deck/route.ts');
const SEALED_POOL_ROUTE_SRC = readSource('app/api/tournaments/[id]/sealed-pool/route.ts');

const KS_COMMONS = getPlayableCharacters().filter((c) => c.set === 'KS' && c.rarity === 'C');
const KS_RARE_ARTS = getPlayableCharacters().filter((c) => c.set === 'KS' && c.rarity === 'RA');
const KS_MISSIONS = getPlayableMissions().filter((m) => m.set === 'KS');

let craftCounter = 0;
function craftBoosterCard(card: CardData, isHolo = false): BoosterCard {
  craftCounter++;
  return {
    ...card,
    isHolo,
    isTemporaryVariant: isVariantRarity(card.rarity),
    sealedInstanceId: `crafted-${craftCounter}`,
  };
}

function craftPool(cards: BoosterCard[]): SealedPool {
  return {
    boosters: [{ cards, boosterIndex: 0, setId: 'KS' }],
    allCards: cards,
    temporaryVariants: cards.filter((c) => c.isTemporaryVariant).map((c) => c.id),
  };
}

function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: 'sealed-game',
    turn: 1,
    phase: 'action',
    activePlayer: 'player1',
    edgeHolder: 'player1',
    firstPasser: null,
    player1: { hasMulliganed: true } as never,
    player2: { hasMulliganed: true } as never,
    missionDeck: [],
    activeMissions: [],
    log: [],
    pendingEffects: [],
    pendingActions: [],
    turnMissionRevealed: false,
    consecutiveTimeouts: { player1: 0, player2: 0 },
    ...overrides,
  } as unknown as GameState;
}

function makeOnlineRoom(gameMode: RoomData['gameMode'], state: GameState | null): RoomData {
  return {
    code: 'SEAL01',
    gameMode,
    isSealed: gameMode === 'sealed',
    gameState: state,
    chessClock: createChessClock(),
    chessClockLastInputKey: null,
    chessClockTickTimer: null,
    chessClockMulliganTimer: null,
    sealedTimer: null,
    sealedDeadline: null,
    sealedBoosterCount: 5,
  } as unknown as RoomData;
}

describe('sealed modes: the chess clock covers sealed online and sealed tournament, never sealed vs AI', () => {
  it('arms the clock for every online mode, sealed included, with the documented 15 minute bank', () => {
    for (const mode of ['casual', 'ranked', 'sealed', 'evolving'] as const) {
      const room = makeOnlineRoom(mode, makeGameState());
      syncChessClock(room, 1_000);
      expect(room.chessClock.active).toBe('player1');
      expect(room.chessClock.player1.remainingMs).toBe(CHESS_CLOCK_INITIAL_MS);
      expect(room.chessClock.player2.remainingMs).toBe(CHESS_CLOCK_INITIAL_MS);
    }
  });

  it('gives a sealed room the exact same clock as a ranked room, input for input', () => {
    const sealed = makeOnlineRoom('sealed', makeGameState({ activePlayer: 'player2' }));
    const ranked = makeOnlineRoom('ranked', makeGameState({ activePlayer: 'player2' }));
    syncChessClock(sealed, 5_000);
    syncChessClock(ranked, 5_000);
    expect(sealed.chessClock).toEqual(ranked.chessClock);
    expect(sealed.chessClockLastInputKey).toBe(ranked.chessClockLastInputKey);
  });

  it('disarms the sealed room clock while no input is awaited', () => {
    const room = makeOnlineRoom('sealed', makeGameState({ phase: 'mulligan' }));
    expect(whoseInputIsAwaited(room.gameState)).toBeNull();
    syncChessClock(room, 1_000);
    expect(room.chessClock.active).toBeNull();
    expect(room.chessClockLastInputKey).toBeNull();
  });

  it('carries the anti-AFK and mulligan-cancel constants that only online sealed games can trigger', () => {
    expect(CHESS_CLOCK_IDLE_LIMIT_MS).toBe(2 * 60 * 1000);
    expect(CHESS_CLOCK_MULLIGAN_IDLE_MS).toBe(60 * 1000);
    expect(SERVER_SRC.includes('CHESS_CLOCK_IDLE_LIMIT_MS')).toBe(true);
    expect(SERVER_SRC.includes('CHESS_CLOCK_MULLIGAN_IDLE_MS')).toBe(true);
  });

  it('creates the clock unconditionally on the room, so a sealed tournament match inherits it', () => {
    expect(SERVER_SRC.includes('chessClock: createChessClock(),')).toBe(true);
    expect(TOURNAMENT_HANDLERS_SRC.includes('chessClock: createChessClock(),')).toBe(true);
    expect(SERVER_SRC.includes('chessClock: room.isSealed')).toBe(false);
    expect(TOURNAMENT_HANDLERS_SRC.includes("gameMode === 'sealed' ? null")).toBe(false);
  });

  it('leaves a pure engine sealed game with no clock state of any kind', () => {
    const state = buildSealedGame().state;
    expect(state.gameMode).toBe('sealed');
    expect('chessClock' in state).toBe(false);
    expect('chessClockLastInputKey' in state).toBe(false);
    expect(Object.keys(state).some((k) => k.toLowerCase().includes('clock'))).toBe(false);
  });

  it('leaves the client clock empty outside an online room, so the sealed vs AI board shows none', () => {
    expect(useSocketStore.getState().chessClock).toBeNull();
    expect(computeChessClockRemainingMs(null, 'player1')).toBe(0);
    expect(computeChessClockRemainingMs(null, 'player2')).toBe(0);
  });

  it('never mentions the chess clock on any sealed building surface', () => {
    for (const src of [SEALED_AI_PAGE_SRC, SEALED_BUILDER_SRC, SEALED_BUILD_PAGE_SRC]) {
      expect(src.includes('chessClock')).toBe(false);
      expect(src.includes('ChessClockDisplay')).toBe(false);
      expect(src.includes('CHESS_CLOCK')).toBe(false);
    }
  });
});

describe('sealed modes: the pool building timer is its own mechanism, separate from the chess clock', () => {
  it('holds the seat strictly longer than the build window, so nobody is released mid build', () => {
    expect(SEALED_BUILD_RESERVATION_MS).toBeGreaterThan(SEALED_BUILD_WINDOW_MS);
    expect(SEALED_BUILD_RESERVATION_MS).toBeGreaterThanOrEqual(onlineSealedTimeoutMs());
  });

  it('gives the tournament build the documented 15 minute window computed from the join time', () => {
    expect(SEALED_BUILD_WINDOW_MS).toBe(15 * 60 * 1000);
    expect(SEALED_POOL_ROUTE_SRC.includes('participant.joinedAt.getTime() + SEALED_BUILD_WINDOW_MS')).toBe(true);
    expect(SEALED_POOL_ROUTE_SRC.includes('chessClock')).toBe(false);
  });

  it('derives the seat reservation from the build window instead of hardcoding a second value', () => {
    expect(SEALED_BUILD_RESERVATION_MS).toBe(SEALED_BUILD_WINDOW_MS + SEALED_BUILD_SUBMIT_GRACE_MS);
  });

  it('tracks the online sealed build deadline in its own room fields, never in the clock', () => {
    expect(SERVER_SRC.includes('sealedTimer: ReturnType<typeof setTimeout> | null;')).toBe(true);
    expect(SERVER_SRC.includes('sealedDeadline: number | null;')).toBe(true);
    expect(SERVER_SRC.includes('chessClock: ChessClockState;')).toBe(true);
    const mixedLines = SERVER_SRC.split('\n').filter((l) => l.includes('sealedTimer') && l.includes('chessClock'));
    expect(mixedLines).toEqual([]);
  });

  it('clears the sealed build timer without ever touching the chess clock timers', () => {
    const clearClock = SERVER_SRC.slice(SERVER_SRC.indexOf('function clearChessClockTimers'));
    const body = clearClock.slice(0, clearClock.indexOf('\n}\n'));
    expect(body.includes('chessClockTickTimer')).toBe(true);
    expect(body.includes('sealedTimer')).toBe(false);
    expect(body.includes('sealedDeadline')).toBe(false);
  });

  it('shows the sealed build timer through SealedTimer, and only while the build is online', () => {
    expect(SEALED_BUILDER_SRC.includes("import { SealedTimer } from './SealedTimer'")).toBe(true);
    expect(SEALED_BUILDER_SRC.includes('{isOnline && (')).toBe(true);
    const timerUsage = SEALED_BUILDER_SRC.indexOf('<SealedTimer');
    const onlineGate = SEALED_BUILDER_SRC.indexOf('{isOnline && (');
    expect(onlineGate).toBeGreaterThan(-1);
    expect(timerUsage).toBeGreaterThan(onlineGate);
  });

  it('runs the tournament sealed build against its server deadline, not against a local default', () => {
    expect(SEALED_BUILD_PAGE_SRC.includes('const timerSeconds = Math.max(0, Math.floor((deadline - Date.now()) / 1000));')).toBe(true);
    expect(SEALED_BUILD_PAGE_SRC.includes('isOnline')).toBe(true);
  });

  it('gives the online sealed build the documented 15 minute window', () => {
    expect(onlineSealedTimeoutMs()).toBe(15 * 60 * 1000);
  });

  it('falls back on the very same window when the client has no server deadline yet', () => {
    expect(sealedPageFallbackSeconds()).toBe(onlineSealedTimeoutMs() / 1000);
  });
});

function sealedPageFallbackSeconds(): number {
  const match = SEALED_AI_PAGE_SRC.match(/sealedDeadline[\s\S]{0,120}?:\s*(\d+);/);
  if (!match) throw new Error('sealed page countdown fallback not found');
  return Number(match[1]);
}

function sealedBuildWindowMs(): number {
  const match = SEALED_POOL_ROUTE_SRC.match(/SEALED_BUILD_WINDOW_MS\s*=\s*(\d+)\s*\*\s*(\d+)\s*\*\s*(\d+)/);
  if (!match) throw new Error('SEALED_BUILD_WINDOW_MS not found');
  return Number(match[1]) * Number(match[2]) * Number(match[3]);
}

function onlineSealedTimeoutMs(): number {
  const match = SERVER_SRC.match(/SEALED_TIMEOUT_MS\s*=\s*(\d+)\s*\*\s*(\d+)\s*\*\s*(\d+)/);
  if (!match) throw new Error('SEALED_TIMEOUT_MS not found');
  return Number(match[1]) * Number(match[2]) * Number(match[3]);
}

describe('sealed modes: the AI sealed deck builder must produce a legal deck from any generated pool', () => {
  const BOOSTER_COUNTS = [4, 5, 6] as const;
  const POOLS_PER_COUNT = 60;

  it('always reaches the 30 character minimum for every configurable booster count', () => {
    for (const count of BOOSTER_COUNTS) {
      for (let i = 0; i < POOLS_PER_COUNT; i++) {
        const deck = buildAISealedDeck(generateSealedPool(count, 'KS'));
        expect(deck.characters.length).toBeGreaterThanOrEqual(SEALED_MIN_DECK_SIZE);
      }
    }
  });

  it('never uses a character more times than the pool actually opened it', () => {
    for (const count of BOOSTER_COUNTS) {
      for (let i = 0; i < POOLS_PER_COUNT; i++) {
        const pool = generateSealedPool(count, 'KS');
        const deck = buildAISealedDeck(pool);
        const remaining = new Map<string, number>();
        for (const c of separateSealedPool(pool).characters) {
          remaining.set(c.id, (remaining.get(c.id) ?? 0) + 1);
        }
        for (const c of deck.characters) {
          const left = remaining.get(c.id) ?? 0;
          expect(left).toBeGreaterThan(0);
          remaining.set(c.id, left - 1);
        }
      }
    }
  });

  it('never picks the same physical pool card twice', () => {
    for (let i = 0; i < 40; i++) {
      const deck = buildAISealedDeck(generateSealedPool(6, 'KS'));
      const instanceIds = deck.characters.map((c) => (c as unknown as BoosterCard).sealedInstanceId);
      expect(new Set(instanceIds).size).toBe(instanceIds.length);
    }
  });

  it('picks exactly 3 distinct missions whenever the pool opened at least 3 distinct ones', () => {
    let checked = 0;
    for (let i = 0; i < 60; i++) {
      const pool = generateSealedPool(6, 'KS');
      const distinct = new Set(separateSealedPool(pool).missions.map((m) => m.id));
      if (distinct.size < SEALED_REQUIRED_MISSIONS) continue;
      checked++;
      const deck = buildAISealedDeck(pool);
      expect(deck.missions.length).toBe(SEALED_REQUIRED_MISSIONS);
      expect(new Set(deck.missions.map((m) => m.id)).size).toBe(SEALED_REQUIRED_MISSIONS);
      for (const m of deck.missions) expect(distinct.has(m.id)).toBe(true);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('only ever returns real cards of the pool set', () => {
    for (let i = 0; i < 30; i++) {
      const deck = buildAISealedDeck(generateSealedPool(5, 'KS'));
      for (const c of deck.characters) {
        expect(getCardById(c.id)?.set).toBe('KS');
        expect(getCardById(c.id)?.card_type).toBe('character');
      }
      for (const m of deck.missions) {
        expect(getCardById(m.id)?.card_type).toBe('mission');
      }
    }
  });

  it('produces a deck that satisfies the sealed pool legality check itself', () => {
    for (let i = 0; i < 25; i++) {
      const pool = generateSealedPool(6, 'KS');
      const distinct = new Set(separateSealedPool(pool).missions.map((m) => m.id));
      if (distinct.size < SEALED_REQUIRED_MISSIONS) continue;
      const deck = buildAISealedDeck(pool);
      const check = checkSealedDeckAgainstPool(
        pool.allCards.map((c) => c.id),
        deck.characters.map((c) => c.id),
        deck.missions.map((m) => m.id),
      );
      expect(check.valid).toBe(true);
    }
  });

  it('fills the 3 mission slots from duplicate copies when the pool opened a single mission', () => {
    const cards = [
      ...KS_COMMONS.slice(0, 40).map((c) => craftBoosterCard(c)),
      craftBoosterCard(KS_MISSIONS[0]),
      craftBoosterCard(KS_MISSIONS[0]),
      craftBoosterCard(KS_MISSIONS[0]),
      craftBoosterCard(KS_MISSIONS[0]),
    ];
    const pool = craftPool(cards);
    const deck = buildAISealedDeck(pool);
    expect(deck.missions.length).toBe(SEALED_REQUIRED_MISSIONS);
    expect(new Set(deck.missions.map((m) => (m as unknown as BoosterCard).sealedInstanceId)).size).toBe(SEALED_REQUIRED_MISSIONS);
    const check = checkSealedDeckAgainstPool(
      pool.allCards.map((c) => c.id),
      deck.characters.map((c) => c.id),
      deck.missions.map((m) => m.id),
    );
    expect(check.valid).toBe(true);
  });

  it('has no 2 copies per version limit, so it uses the 3rd copy the pool opened', () => {
    const chars: BoosterCard[] = [];
    for (let i = 0; i < 27; i++) chars.push(craftBoosterCard(KS_COMMONS[i]));
    chars.push(craftBoosterCard(KS_COMMONS[27]));
    chars.push(craftBoosterCard(KS_COMMONS[27]));
    chars.push(craftBoosterCard(KS_COMMONS[27]));
    const cards = [...chars, ...KS_MISSIONS.slice(0, 3).map((m) => craftBoosterCard(m))];
    const deck = buildAISealedDeck(craftPool(cards));
    expect(deck.characters.length).toBe(SEALED_MIN_DECK_SIZE);
    expect(deck.characters.filter((c) => c.id === KS_COMMONS[27].id).length).toBe(3);
  });

  it('no sealed path runs the classic 2 copies per version validator', () => {
    const aiSrc = readSource('lib/sealed/aiSealedDeckBuilder.ts');
    for (const src of [aiSrc, SEALED_DECK_ROUTE_SRC, SEALED_BUILDER_SRC]) {
      expect(src.includes('validateDeck')).toBe(false);
      expect(src.includes('MAX_COPIES_PER_VERSION')).toBe(false);
    }
  });
});

describe('sealed modes: a sealed tournament runs as a Swiss over the confirmed decks only', () => {
  const p = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;

  function confirmedParticipant(i: number, overrides: Record<string, unknown> = {}) {
    return {
      id: 'part' + i,
      userId: 'user' + i,
      username: 'Player' + i,
      eliminated: false,
      deckValid: true,
      seed: null,
      sealedPool: { boosters: [], allCards: [{ id: 'KS-001-C' }] },
      sealedDeck: {
        cardIds: Array.from({ length: 30 }, (_, k) => 'KS-00' + (k % 9) + '-C'),
        missionIds: ['KS-MSS-01', 'KS-MSS-02', 'KS-MSS-03'],
      },
      ...overrides,
    };
  }

  function mockSealedTournament(participants: unknown[], format = 'swiss') {
    p.tournament.findUnique.mockResolvedValue({
      id: 'sealed-t',
      status: 'registration',
      gameMode: 'sealed',
      format,
      useBanList: false,
      bannedCardIds: [],
      participants,
      sealedBoosterCount: 5,
      sealedSetChoice: 'KS',
      partner: null,
    });
  }

  function lastTotalRounds(): number {
    const calls = p.tournament.update.mock.calls;
    return calls[calls.length - 1][0].data.totalRounds;
  }

  beforeEach(() => {
    for (const model of Object.values(p)) {
      for (const fn of Object.values(model)) fn.mockReset();
    }
    p.tournamentMatch.findFirst.mockResolvedValue(null);
    p.tournamentMatch.create.mockResolvedValue({});
    p.tournamentMatch.deleteMany.mockResolvedValue({ count: 0 });
    p.tournamentParticipant.update.mockResolvedValue({});
    p.tournamentParticipant.updateMany.mockResolvedValue({ count: 0 });
    p.tournament.updateMany.mockResolvedValue({ count: 1 });
    p.tournament.update.mockResolvedValue({});
    p.bannedCard.findMany.mockResolvedValue([]);
  });

  it('sets the Swiss round count from the confirmed player count', async () => {
    for (const n of [2, 3, 4, 5, 8, 9, 16]) {
      p.tournament.update.mockClear();
      mockSealedTournament(Array.from({ length: n }, (_, i) => confirmedParticipant(i)));
      const res = await executeTournamentStart('sealed-t');
      expect(res.ok).toBe(true);
      expect(lastTotalRounds()).toBe(computeSwissRoundCount(n));
    }
  });

  it('pairs round 1 like a Swiss, with a bye when the confirmed count is odd', async () => {
    for (const n of [4, 5, 9]) {
      p.tournamentMatch.create.mockClear();
      mockSealedTournament(Array.from({ length: n }, (_, i) => confirmedParticipant(i)));
      await executeTournamentStart('sealed-t');
      const created = p.tournamentMatch.create.mock.calls.map((c) => c[0].data);
      expect(created.length).toBe(Math.ceil(n / 2));
      expect(created.every((m) => m.round === 1)).toBe(true);
      expect(created.filter((m) => m.isBye).length).toBe(n % 2);
    }
  });

  it('eliminates every seat that never confirmed a sealed deck, at round 0', async () => {
    const participants = [
      confirmedParticipant(0),
      confirmedParticipant(1),
      confirmedParticipant(2, { deckValid: false }),
      confirmedParticipant(3, { sealedDeck: null }),
    ];
    mockSealedTournament(participants);
    const res = await executeTournamentStart('sealed-t');
    expect(res.ok).toBe(true);
    const eliminated = p.tournamentParticipant.update.mock.calls
      .map((c) => c[0])
      .filter((c) => c.data.eliminated === true);
    expect(eliminated.length).toBe(2);
    expect(eliminated.every((c) => c.data.eliminatedRound === 0)).toBe(true);
    expect(eliminated.every((c) => c.data.deckValid === false)).toBe(true);
    expect(lastTotalRounds()).toBe(computeSwissRoundCount(2));
  });

  it('eliminates a seat whose stored sealed deck is malformed even when deckValid is set', async () => {
    const participants = [
      confirmedParticipant(0),
      confirmedParticipant(1),
      confirmedParticipant(2, { sealedDeck: { cardIds: Array.from({ length: 29 }, () => 'KS-001-C'), missionIds: ['a', 'b', 'c'] } }),
      confirmedParticipant(3, { sealedDeck: { cardIds: Array.from({ length: 30 }, () => 'KS-001-C'), missionIds: ['a', 'b'] } }),
    ];
    mockSealedTournament(participants);
    const res = await executeTournamentStart('sealed-t');
    expect(res.ok).toBe(true);
    expect(lastTotalRounds()).toBe(computeSwissRoundCount(2));
  });

  it('never auto-builds a sealed deck at start', async () => {
    mockSealedTournament([
      confirmedParticipant(0),
      confirmedParticipant(1),
      confirmedParticipant(2, { deckValid: false }),
    ]);
    await executeTournamentStart('sealed-t');
    const wroteADeck = p.tournamentParticipant.update.mock.calls.some((c) => 'sealedDeck' in (c[0].data ?? {}));
    expect(wroteADeck).toBe(false);
    const srcStart = readSource('lib/tournament/startLogic.ts');
    expect(srcStart.includes('buildAISealedDeck')).toBe(false);
  });

  it('never regenerates a pool that the player already opened at join', async () => {
    mockSealedTournament([confirmedParticipant(0), confirmedParticipant(1)]);
    await executeTournamentStart('sealed-t');
    const wroteAPool = p.tournamentParticipant.update.mock.calls.some((c) => 'sealedPool' in (c[0].data ?? {}));
    expect(wroteAPool).toBe(false);
  });

  it('refuses to start when fewer than 2 seats confirmed a sealed deck', async () => {
    mockSealedTournament([
      confirmedParticipant(0),
      confirmedParticipant(1, { deckValid: false }),
      confirmedParticipant(2, { deckValid: false }),
    ]);
    const res = await executeTournamentStart('sealed-t');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(400);
      expect(res.error).toContain('valid decks');
    }
    expect(p.tournamentMatch.create).not.toHaveBeenCalled();
  });

  it('never runs the personal deck check on a sealed field', async () => {
    mockSealedTournament([confirmedParticipant(0), confirmedParticipant(1)]);
    await executeTournamentStart('sealed-t');
    expect(p.deck.findUnique).not.toHaveBeenCalled();
  });
});

describe('sealed modes: pool variants are playable for that game only', () => {
  it('accepts a locked variant of the pool in the sealed deck legality check', () => {
    const variant = KS_RARE_ARTS[0];
    expect(isVariantRarity(variant.rarity)).toBe(true);
    expect(isLockedVariantCard(getCardById(variant.id))).toBe(true);
    const deckIds = [...KS_COMMONS.slice(0, 29).map((c) => c.id), variant.id];
    const missionIds = KS_MISSIONS.slice(0, 3).map((m) => m.id);
    const check = checkSealedDeckAgainstPool([...deckIds, ...missionIds], deckIds, missionIds);
    expect(check.valid).toBe(true);
  });

  it('lets the pure engine start a sealed game whose deck holds a locked variant', () => {
    const variant = KS_RARE_ARTS[0];
    const deck = [...KS_COMMONS.slice(0, 29), variant] as unknown as CharacterCard[];
    const state = GameEngine.createGame({
      player1: { userId: 'u1', isAI: false, deck, missionCards: KS_MISSIONS.slice(0, 3) as MissionCard[] },
      player2: { userId: null, isAI: true, deck: [...deck], missionCards: KS_MISSIONS.slice(3, 6) as MissionCard[] },
      gameMode: 'sealed',
    });
    expect(state.phase).toBe('mulligan');
    expect(state.player1.deck.length + state.player1.hand.length).toBe(30);
  });

  it('skips the permanent unlock gate for sealed rooms while every other online mode enforces it', () => {
    const gateIdx = SERVER_SRC.indexOf('if (!room.isSealed) {');
    expect(gateIdx).toBeGreaterThan(-1);
    const gateBlock = SERVER_SRC.slice(gateIdx, gateIdx + 900);
    expect(gateBlock.includes('validateDeckVariantUnlocks')).toBe(true);
    expect(SEALED_DECK_ROUTE_SRC.includes('validateDeckVariantUnlocks')).toBe(false);
  });

  it('never grants, unlocks or banks a sealed variant anywhere on the sealed submission path', () => {
    for (const src of [SEALED_DECK_ROUTE_SRC, SEALED_POOL_ROUTE_SRC, SEALED_BUILDER_SRC, SEALED_BUILD_PAGE_SRC]) {
      expect(src.includes('incrementVariant')).toBe(false);
      expect(src.includes('variantInventory')).toBe(false);
      expect(src.includes('unlockedVariantCardIds')).toBe(false);
      expect(src.includes('awardXp')).toBe(false);
    }
  });

  it('keeps the temporary variant list scoped to its own pool object', () => {
    const a = generateSealedPool(6, 'KS');
    const b = generateSealedPool(6, 'KS');
    expect(Array.isArray(a.temporaryVariants)).toBe(true);
    expect(a.temporaryVariants).not.toBe(b.temporaryVariants);
    for (const pool of [a, b]) {
      for (const id of pool.temporaryVariants) {
        expect(pool.allCards.some((c) => c.id === id && c.isTemporaryVariant)).toBe(true);
      }
    }
  });

  it('flags a crafted variant as temporary and never as a permanent unlock', () => {
    const card = craftBoosterCard(KS_RARE_ARTS[0], true);
    expect(card.isTemporaryVariant).toBe(true);
    expect(craftBoosterCard(KS_COMMONS[0]).isTemporaryVariant).toBe(false);
  });
});

function legalSealedDeckFromPool(pool: SealedPool): { characters: CharacterCard[]; missions: MissionCard[] } {
  const { characters, missions } = separateSealedPool(pool);
  const seen = new Set<string>();
  const distinctMissions: BoosterCard[] = [];
  for (const m of missions) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    distinctMissions.push(m);
  }
  return {
    characters: characters as unknown as CharacterCard[],
    missions: distinctMissions.slice(0, SEALED_REQUIRED_MISSIONS) as unknown as MissionCard[],
  };
}

function buildSealedGame(): {
  state: GameState;
  p1: { characters: CharacterCard[]; missions: MissionCard[] };
  p2: { characters: CharacterCard[]; missions: MissionCard[] };
} {
  let p1: { characters: CharacterCard[]; missions: MissionCard[] } | null = null;
  let p2: { characters: CharacterCard[]; missions: MissionCard[] } | null = null;
  for (let attempt = 0; attempt < 40 && (!p1 || !p2); attempt++) {
    const candidate = legalSealedDeckFromPool(generateSealedPool(6, 'KS'));
    if (candidate.missions.length !== SEALED_REQUIRED_MISSIONS) continue;
    if (candidate.characters.length < SEALED_MIN_DECK_SIZE) continue;
    if (!p1) p1 = candidate;
    else p2 = candidate;
  }
  if (!p1 || !p2) throw new Error('could not build two legal sealed decks');
  const state = GameEngine.createGame({
    player1: { userId: 'sealed-p1', isAI: false, deck: p1.characters, missionCards: p1.missions },
    player2: { userId: 'sealed-p2', isAI: false, deck: p2.characters, missionCards: p2.missions },
    gameMode: 'sealed',
  });
  return { state, p1, p2 };
}

function continuousChakraBonusOf(mission: MissionCard): number {
  let bonus = 0;
  for (const eff of mission.effects ?? []) {
    if (!eff.description.includes('[⧗]')) continue;
    const match = eff.description.match(/CHAKRA \+(\d+)/);
    if (match) bonus += Number(match[1]);
  }
  return bonus;
}

describe('sealed modes: the engine plays a sealed deck exactly like a normal one', () => {
  it('builds two legal sealed decks straight out of generated pools', () => {
    const { p1, p2 } = buildSealedGame();
    for (const deck of [p1, p2]) {
      expect(deck.characters.length).toBeGreaterThanOrEqual(SEALED_MIN_DECK_SIZE);
      expect(deck.missions.length).toBe(SEALED_REQUIRED_MISSIONS);
      expect(new Set(deck.missions.map((m) => m.id)).size).toBe(SEALED_REQUIRED_MISSIONS);
    }
  });

  it('creates the game, deals 5, and keeps the sealed mode on the state', () => {
    const { state, p1 } = buildSealedGame();
    expect(state.phase).toBe('mulligan');
    expect(state.gameMode).toBe('sealed');
    expect(state.player1.hand.length).toBe(5);
    expect(state.player2.hand.length).toBe(5);
    expect(state.player1.deck.length + state.player1.hand.length).toBe(p1.characters.length);
    expect(state.missionDeck.length).toBe(4);
    expect(state.player1.unusedMission).toBeTruthy();
  });

  it('exposes the sealed mode on the transported visible state', () => {
    const { state } = buildSealedGame();
    const visible = GameEngine.getVisibleState(state, 'player1');
    expect(visible.gameMode).toBe('sealed');
    expect(visible.myPlayer).toBe('player1');
  });

  it('tags a sealed game against the AI with the sealed mode, exactly like an online sealed room', () => {
    const aiConfigStart = SEALED_AI_PAGE_SRC.indexOf('const config: GameConfig = {');
    expect(aiConfigStart).toBeGreaterThan(-1);
    const configBlock = SEALED_AI_PAGE_SRC.slice(aiConfigStart, aiConfigStart + 600);
    expect(configBlock.includes("gameMode: 'sealed'")).toBe(true);

    const { p1, p2 } = buildSealedGame();
    const aiState = GameEngine.createGame({
      gameMode: 'sealed',
      player1: { userId: 'local-player', isAI: false, deck: p1.characters, missionCards: p1.missions },
      player2: { userId: null, isAI: true, deck: p2.characters, missionCards: p2.missions },
    });
    expect(aiState.gameMode).toBe('sealed');
    expect(aiState.player2.isAI).toBe(true);
  });

  it('leaves the AI sealed board without any chess clock, whatever its mode tag', () => {
    const { p1, p2 } = buildSealedGame();
    const aiState = GameEngine.createGame({
      gameMode: 'sealed',
      player1: { userId: 'local-player', isAI: false, deck: p1.characters, missionCards: p1.missions },
      player2: { userId: null, isAI: true, deck: p2.characters, missionCards: p2.missions },
    });
    expect(Object.keys(aiState).some((k) => k.toLowerCase().includes('clock'))).toBe(false);
  });

  it('runs the start phase of a sealed board with the normal 5 chakra and 2 draws', () => {
    let { state } = buildSealedGame();
    state = GameEngine.applyAction(state, 'player1', { type: 'MULLIGAN', doMulligan: false });
    state = GameEngine.applyAction(state, 'player2', { type: 'MULLIGAN', doMulligan: false });
    expect(state.phase).toBe('action');
    expect(state.activeMissions.length).toBe(1);
    const expectedChakra = 5 + continuousChakraBonusOf(state.activeMissions[0].card);
    expect(state.player1.chakra).toBe(expectedChakra);
    expect(state.player2.chakra).toBe(expectedChakra);
    expect(state.player1.hand.length).toBe(7);
    expect(state.player2.hand.length).toBe(7);
  });

  it('accepts a hidden play from a sealed hand for the standard 1 chakra', () => {
    let { state } = buildSealedGame();
    state = GameEngine.applyAction(state, 'player1', { type: 'MULLIGAN', doMulligan: false });
    state = GameEngine.applyAction(state, 'player2', { type: 'MULLIGAN', doMulligan: false });
    const actor: PlayerID = state.activePlayer;
    const chakraBefore = state[actor].chakra;
    state = GameEngine.applyAction(state, actor, { type: 'PLAY_HIDDEN', cardIndex: 0, missionIndex: 0 });
    const slot = actor === 'player1' ? 'player1Characters' : 'player2Characters';
    expect(state.activeMissions[0][slot].length).toBe(1);
    expect(state.activeMissions[0][slot][0].isHidden).toBe(true);
    expect(chakraBefore - state[actor].chakra).toBe(1);
    expect(state[actor].hand.length).toBe(6);
  });

  it('scores the round and rolls a sealed game into turn 2 with a second mission', () => {
    let { state } = buildSealedGame();
    state = GameEngine.applyAction(state, 'player1', { type: 'MULLIGAN', doMulligan: false });
    state = GameEngine.applyAction(state, 'player2', { type: 'MULLIGAN', doMulligan: false });
    state = GameEngine.applyAction(state, state.activePlayer, { type: 'PLAY_HIDDEN', cardIndex: 0, missionIndex: 0 });
    state = GameEngine.applyAction(state, state.activePlayer, { type: 'PASS' });
    state = GameEngine.applyAction(state, state.activePlayer, { type: 'PASS' });
    expect(state.phase).toBe('mission');
    expect(state.firstPasser).not.toBeNull();
    expect(state.missionScoringComplete).toBe(true);
    state = GameEngine.applyAction(state, state.activePlayer, { type: 'ADVANCE_PHASE' });
    expect(state.phase).toBe('action');
    expect(state.turn).toBe(2);
    expect(state.activeMissions.length).toBe(2);
  });

  it('plays a sealed deck the normal deck builder would reject, because sealed has no 2 copy limit', () => {
    const characters = [...KS_COMMONS.slice(0, 27), KS_COMMONS[27], KS_COMMONS[27], KS_COMMONS[27]] as unknown as CharacterCard[];
    const missions = KS_MISSIONS.slice(0, 3) as MissionCard[];
    const normal = validateDeck(characters, missions);
    expect(normal.valid).toBe(false);
    expect(normal.errors.some((e) => e.includes('Too many copies'))).toBe(true);

    const deckIds = characters.map((c) => c.id);
    const missionIds = missions.map((m) => m.id);
    const sealedCheck = checkSealedDeckAgainstPool([...deckIds, ...missionIds], deckIds, missionIds);
    expect(sealedCheck.valid).toBe(true);

    let state = GameEngine.createGame({
      player1: { userId: 'u1', isAI: false, deck: characters, missionCards: missions },
      player2: { userId: 'u2', isAI: false, deck: [...characters], missionCards: KS_MISSIONS.slice(3, 6) as MissionCard[] },
      gameMode: 'sealed',
    });
    state = GameEngine.applyAction(state, 'player1', { type: 'MULLIGAN', doMulligan: false });
    state = GameEngine.applyAction(state, 'player2', { type: 'MULLIGAN', doMulligan: false });
    expect(state.phase).toBe('action');
    expect(state.player1.deck.length + state.player1.hand.length).toBe(30);
  });

  it('refuses a sealed submission that uses a third copy the pool never opened', () => {
    const poolIds = [...KS_COMMONS.slice(0, 28).map((c) => c.id), KS_COMMONS[28].id, KS_COMMONS[28].id];
    const deckIds = [...KS_COMMONS.slice(0, 27).map((c) => c.id), KS_COMMONS[28].id, KS_COMMONS[28].id, KS_COMMONS[28].id];
    const check = checkSealedDeckAgainstPool(poolIds, deckIds, KS_MISSIONS.slice(0, 3).map((m) => m.id));
    expect(check.valid).toBe(false);
    expect(check.errorKey).toBe('tournament.error.sealedCardNotInPool');
    expect(check.offendingCardId).toBe(KS_COMMONS[28].id);
  });
});

type MockFn = ReturnType<typeof vi.fn>;

const db = prisma as unknown as {
  tournament: { findUnique: MockFn; update: MockFn; updateMany: MockFn };
  tournamentParticipant: {
    findUnique: MockFn; findFirst: MockFn; findMany: MockFn; update: MockFn;
    updateMany: MockFn; create: MockFn; delete: MockFn; deleteMany: MockFn; count: MockFn;
  };
  tournamentMatch: { findFirst: MockFn; findMany: MockFn; create: MockFn; update: MockFn; deleteMany: MockFn };
  sealedPoolClaim: { findUnique: MockFn; create: MockFn; update: MockFn; updateMany: MockFn };
  bannedCard: { findMany: MockFn };
  deck: { findUnique: MockFn; create: MockFn; update: MockFn };
  user: { findUnique: MockFn; update: MockFn };
  userBan: { findFirst: MockFn };
};

const authMock = auth as unknown as MockFn;

const SEALED_JOIN_CODE = 'SEAL42';
const SEALED_USER_ID = 'sealed-user';

function resetSealedDb(): void {
  for (const model of Object.values(db)) {
    for (const fn of Object.values(model as Record<string, MockFn>)) fn.mockReset();
  }
  authMock.mockReset();
  authMock.mockResolvedValue({ user: { id: SEALED_USER_ID } });
  db.tournamentMatch.findFirst.mockResolvedValue(null);
  db.tournamentMatch.create.mockResolvedValue({});
  db.tournamentMatch.deleteMany.mockResolvedValue({ count: 0 });
  db.tournamentParticipant.update.mockResolvedValue({});
  db.tournamentParticipant.updateMany.mockResolvedValue({ count: 0 });
  db.tournamentParticipant.deleteMany.mockResolvedValue({ count: 0 });
  db.tournamentParticipant.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({ id: 'created-part', ...args.data }));
  db.tournamentParticipant.count.mockResolvedValue(2);
  db.tournamentParticipant.findUnique.mockResolvedValue(null);
  db.tournament.update.mockResolvedValue({});
  db.tournament.updateMany.mockResolvedValue({ count: 1 });
  db.bannedCard.findMany.mockResolvedValue([]);
  db.user.findUnique.mockResolvedValue({ username: 'Sealed Player', elo: 1000, discordId: 'discord-1', gameBanned: false, gameBanUntil: null });
  db.userBan.findFirst.mockResolvedValue(null);
  db.sealedPoolClaim.findUnique.mockResolvedValue(null);
  db.sealedPoolClaim.create.mockResolvedValue({});
  db.sealedPoolClaim.update.mockResolvedValue({});
  db.sealedPoolClaim.updateMany.mockResolvedValue({ count: 1 });
}

function sealedTournamentRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'sealed-t',
    name: 'Sealed Cup',
    status: 'registration',
    gameMode: 'sealed',
    format: 'swiss',
    type: 'community',
    maxPlayers: 8,
    isPublic: false,
    joinCode: SEALED_JOIN_CODE,
    creatorId: 'another-user',
    allowedLeagues: [],
    requiresDiscord: false,
    partner: null,
    useBanList: false,
    bannedCardIds: [],
    sealedBoosterCount: 5,
    sealedSetChoice: 'KS',
    _count: { participants: 1 },
    ...overrides,
  };
}

function joinByCodeRequest(code: string): Request {
  return new Request('http://localhost/api/tournaments/join-by-code', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

function createdParticipantData(): Record<string, unknown> {
  const call = db.tournamentParticipant.create.mock.calls[0];
  return (call?.[0]?.data ?? {}) as Record<string, unknown>;
}

describe('sealed registration by join code: the second entry point must obey the same pool rules', () => {
  const claimedPool = {
    boosters: [],
    allCards: [{ id: 'KS-001-C' }, { id: 'KS-001-MMS' }],
    temporaryVariants: [],
    claimMarker: 'the pool opened at the first registration',
  };

  beforeEach(() => {
    resetSealedDb();
    db.tournament.findUnique.mockResolvedValue(sealedTournamentRecord());
  });

  it('really is a sealed registration path: it opens a full pool and leaves the seat unconfirmed', async () => {
    const res = await joinByCodePOST(joinByCodeRequest(SEALED_JOIN_CODE) as never);
    expect(res.status).toBe(201);
    const data = createdParticipantData();
    const pool = data.sealedPool as { allCards: Array<{ id: string }> };
    expect(pool.allCards.length).toBe(50);
    expect('deckValid' in data).toBe(false);
    expect('sealedDeck' in data).toBe(false);
  });

  it('restores the pool of the surviving claim instead of rolling fresh boosters', async () => {
    db.sealedPoolClaim.findUnique.mockResolvedValue({ pool: claimedPool, joinCount: 1 });
    const res = await joinByCodePOST(joinByCodeRequest(SEALED_JOIN_CODE) as never);
    expect(res.status).toBe(201);
    expect(createdParticipantData().sealedPool).toEqual(claimedPool);
    expect(db.sealedPoolClaim.create).not.toHaveBeenCalled();
  });

  it('records a sealed pool claim so a later attempt can be counted', async () => {
    await joinByCodePOST(joinByCodeRequest(SEALED_JOIN_CODE) as never);
    expect(db.sealedPoolClaim.create).toHaveBeenCalledTimes(1);
    const claimData = (db.sealedPoolClaim.create.mock.calls[0]?.[0]?.data ?? {}) as Record<string, unknown>;
    expect(claimData.tournamentId).toBe('sealed-t');
    expect(claimData.userId).toBe(SEALED_USER_ID);
    expect(claimData.pool).toEqual(createdParticipantData().sealedPool);
  });

  it('claims the rejoin attempt with the same conditional update as the id path', async () => {
    db.sealedPoolClaim.findUnique.mockResolvedValue({ pool: claimedPool, joinCount: 1 });
    await joinByCodePOST(joinByCodeRequest(SEALED_JOIN_CODE) as never);
    expect(db.sealedPoolClaim.updateMany).toHaveBeenCalledTimes(1);
    const arg = db.sealedPoolClaim.updateMany.mock.calls[0]?.[0] as {
      where: { joinCount: { lt: number } };
      data: { joinCount: { increment: number } };
    };
    expect(arg.where.joinCount).toEqual({ lt: 2 });
    expect(arg.data.joinCount).toEqual({ increment: 1 });
  });

  it('refuses the third sealed registration with the rejoin limit key', async () => {
    db.sealedPoolClaim.findUnique.mockResolvedValue({ pool: claimedPool, joinCount: 2 });
    const res = await joinByCodePOST(joinByCodeRequest(SEALED_JOIN_CODE) as never);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.errorKey).toBe('tournament.error.sealedRejoinLimit');
    expect(db.tournamentParticipant.create).not.toHaveBeenCalled();
  });

  it('refuses the rejoin when a concurrent request already consumed the last attempt', async () => {
    db.sealedPoolClaim.findUnique.mockResolvedValue({ pool: claimedPool, joinCount: 1 });
    db.sealedPoolClaim.updateMany.mockResolvedValue({ count: 0 });
    const res = await joinByCodePOST(joinByCodeRequest(SEALED_JOIN_CODE) as never);
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.errorKey).toBe('tournament.error.sealedRejoinLimit');
    expect(db.tournamentParticipant.create).not.toHaveBeenCalled();
  });

  it('releases the seats whose build reservation expired, like the id path does', async () => {
    db.tournament.findUnique.mockResolvedValue(sealedTournamentRecord({ maxPlayers: 2, _count: { participants: 2 } }));
    db.tournamentParticipant.deleteMany.mockResolvedValue({ count: 1 });
    const res = await joinByCodePOST(joinByCodeRequest(SEALED_JOIN_CODE) as never);
    expect(db.tournamentParticipant.deleteMany).toHaveBeenCalledTimes(1);
    const where = (db.tournamentParticipant.deleteMany.mock.calls[0]?.[0] as {
      where: { tournamentId: string; deckValid: boolean; userId: { not: string }; joinedAt: { lt: Date } };
    }).where;
    expect(where.deckValid).toBe(false);
    expect(where.userId).toEqual({ not: SEALED_USER_ID });
    expect(Date.now() - where.joinedAt.lt.getTime()).toBeGreaterThanOrEqual(SEALED_BUILD_RESERVATION_MS - 50);
    expect(res.status).toBe(201);
  });

  it('never releases a seat in a non-sealed tournament joined by code', async () => {
    db.tournament.findUnique.mockResolvedValue(sealedTournamentRecord({ gameMode: 'classic' }));
    await joinByCodePOST(joinByCodeRequest(SEALED_JOIN_CODE) as never);
    expect(db.tournamentParticipant.deleteMany).not.toHaveBeenCalled();
    expect(db.sealedPoolClaim.create).not.toHaveBeenCalled();
  });

  it('the id path it must mirror does consult the surviving claim', () => {
    const idJoinSrc = readSource('app/api/tournaments/[id]/join/route.ts');
    expect(idJoinSrc.includes('sealedPoolClaim')).toBe(true);
    expect(idJoinSrc.includes('canJoinSealedAgain')).toBe(true);
    expect(idJoinSrc.includes('SEALED_BUILD_RESERVATION_MS')).toBe(true);
  });
});

function sealedStartParticipant(i: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'part' + i,
    userId: 'user' + i,
    username: 'Player' + i,
    eliminated: false,
    deckValid: true,
    seed: null,
    sealedPool: { boosters: [], allCards: [{ id: 'KS-001-C' }] },
    sealedDeck: {
      cardIds: Array.from({ length: 30 }, () => 'KS-001-C'),
      missionIds: ['KS-001-MMS', 'KS-002-MMS', 'KS-003-MMS'],
    },
    ...overrides,
  };
}

describe('sealed tournament start: a seat that never opened a pool must be eliminated, never abort the start', () => {
  beforeEach(() => {
    resetSealedDb();
  });

  it('eliminates the poolless seat and starts the event on the confirmed decks', async () => {
    db.tournament.findUnique.mockResolvedValue(sealedTournamentRecord({
      participants: [
        sealedStartParticipant(0),
        sealedStartParticipant(1),
        sealedStartParticipant(2, { sealedPool: null, sealedDeck: null, deckValid: false }),
      ],
    }));
    const res = await executeTournamentStart('sealed-t');
    expect(res.ok).toBe(true);
    const updates = db.tournament.update.mock.calls;
    expect(updates[updates.length - 1][0].data.totalRounds).toBe(computeSwissRoundCount(2));
  });

  it('still starts when the configured set can no longer produce a pool', async () => {
    db.tournament.findUnique.mockResolvedValue(sealedTournamentRecord({
      sealedSetChoice: 'SS',
      participants: [
        sealedStartParticipant(0),
        sealedStartParticipant(1),
        sealedStartParticipant(2, { sealedPool: null, sealedDeck: null, deckValid: false }),
      ],
    }));
    const res = await executeTournamentStart('sealed-t');
    expect(res.ok).toBe(true);
  });

  it('never opens a pool for a seat it is about to eliminate', async () => {
    db.tournament.findUnique.mockResolvedValue(sealedTournamentRecord({
      participants: [
        sealedStartParticipant(0),
        sealedStartParticipant(1),
        sealedStartParticipant(2, { sealedPool: null, sealedDeck: null, deckValid: false }),
      ],
    }));
    await executeTournamentStart('sealed-t');
    const wrotePool = db.tournamentParticipant.update.mock.calls
      .some((c) => 'sealedPool' in ((c[0]?.data ?? {}) as Record<string, unknown>));
    expect(wrotePool).toBe(false);
  });
});

describe('sealed leave: a confirmed deck must survive a leave that loses the race with the start', () => {
  const confirmedSeat = {
    id: 'part-confirmed',
    tournamentId: 'sealed-t',
    userId: SEALED_USER_ID,
    username: 'Sealed Player',
    seed: 3,
    eliminated: false,
    eliminatedRound: null,
    hasBye: false,
    deckId: null,
    deckValid: true,
    sealedPool: { boosters: [], allCards: [{ id: 'KS-001-C' }] },
    sealedDeck: {
      cardIds: Array.from({ length: 30 }, () => 'KS-001-C'),
      missionIds: ['KS-001-MMS', 'KS-002-MMS', 'KS-003-MMS'],
    },
  };

  function armLeaveRace(): void {
    db.tournament.findUnique.mockResolvedValueOnce(sealedTournamentRecord());
    db.tournament.findUnique.mockResolvedValueOnce({ status: 'in_progress' });
    db.tournamentParticipant.findFirst.mockResolvedValue(confirmedSeat);
    db.tournamentParticipant.deleteMany.mockResolvedValue({ count: 1 });
  }

  function leaveRequest(): Request {
    return new Request('http://localhost/api/tournaments/sealed-t/leave', { method: 'POST' });
  }

  beforeEach(() => {
    resetSealedDb();
  });

  it('puts the seat back and refuses the leave when the start won the race', async () => {
    armLeaveRace();
    const res = await leaveTournamentPOST(leaveRequest() as never, { params: Promise.resolve({ id: 'sealed-t' }) } as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errorKey).toBe('tournament.error.startedDuringLeave');
    expect(db.tournamentParticipant.create).toHaveBeenCalledTimes(1);
    expect(createdParticipantData().sealedPool).toEqual(confirmedSeat.sealedPool);
    expect(createdParticipantData().deckValid).toBe(true);
  });

  it('puts the confirmed sealed deck back with the seat', async () => {
    armLeaveRace();
    await leaveTournamentPOST(leaveRequest() as never, { params: Promise.resolve({ id: 'sealed-t' }) } as never);
    expect(createdParticipantData().sealedDeck).toEqual(confirmedSeat.sealedDeck);
    expect(createdParticipantData().deckValid).toBe(true);
  });
});

function deterministicPool(boosterCount: number): SealedPool {
  const spy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
  try {
    return generateSealedPool(boosterCount, 'KS');
  } finally {
    spy.mockRestore();
  }
}

describe('sealed missions: three mission slots must be fillable from every pool the generator can produce', () => {
  it('carries exactly one mission per booster, so a pool always holds at least the 3 required', () => {
    for (const count of [4, 5, 6] as const) {
      for (let i = 0; i < 20; i++) {
        const missions = separateSealedPool(generateSealedPool(count, 'KS')).missions;
        expect(missions.length).toBe(count);
        expect(missions.length).toBeGreaterThanOrEqual(SEALED_REQUIRED_MISSIONS);
      }
    }
  });

  it('consumes mission ids from the same pool multiset as the characters', () => {
    const deckIds = KS_COMMONS.slice(0, 30).map((c) => c.id);
    const only = KS_MISSIONS[0].id;
    expect(checkSealedDeckAgainstPool([...deckIds, only, only, only], deckIds, [only, only, only]).valid).toBe(true);
    const short = checkSealedDeckAgainstPool([...deckIds, only, only], deckIds, [only, only, only]);
    expect(short.valid).toBe(false);
    expect(short.errorKey).toBe('tournament.error.sealedCardNotInPool');
    expect(short.offendingCardId).toBe(only);
  });

  it('a pool whose boosters all opened the same mission still has a legal deck', () => {
    const pool = deterministicPool(4);
    const { characters, missions } = separateSealedPool(pool);
    expect(missions.length).toBe(4);
    expect(new Set(missions.map((m) => m.id)).size).toBe(1);
    const check = checkSealedDeckAgainstPool(
      pool.allCards.map((c) => c.id),
      characters.slice(0, SEALED_MIN_DECK_SIZE).map((c) => c.id),
      missions.slice(0, SEALED_REQUIRED_MISSIONS).map((m) => m.id),
    );
    expect(check.valid).toBe(true);
  });

  it('pools that open fewer than 3 DISTINCT missions really happen at the 4 booster setting', () => {
    let scarce = 0;
    for (let i = 0; i < 600; i++) {
      const missions = separateSealedPool(generateSealedPool(4, 'KS')).missions;
      if (new Set(missions.map((m) => m.id)).size < SEALED_REQUIRED_MISSIONS) scarce++;
    }
    expect(scarce).toBeGreaterThan(0);
    expect(scarce).toBeLessThan(600);
  });

  it('the deck builder budgets missions against the copies the pool opened, not against distinct ids', () => {
    const canAddStart = SEALED_BUILDER_SRC.indexOf('const canAddMission');
    expect(canAddStart).toBeGreaterThan(-1);
    const block = SEALED_BUILDER_SRC.slice(canAddStart, canAddStart + 400);
    expect(block.includes('missionAvailability.get(card.id)')).toBe(true);
    expect(block.includes('deckMissionCounts.get(card.id)')).toBe(true);
    expect(block.includes('inDeck < inPool')).toBe(true);
    expect(block.includes('!deckMissionInstanceIds.has(card.sealedInstanceId)')).toBe(false);
    expect((SEALED_BUILDER_SRC.match(/missionAvailability/g) ?? []).length).toBeGreaterThan(1);
  });

  it('the builder still caps the mission slots at exactly 3', () => {
    const canAddStart = SEALED_BUILDER_SRC.indexOf('const canAddMission');
    const block = SEALED_BUILDER_SRC.slice(canAddStart, canAddStart + 400);
    expect(block.includes('deckMissions.length >= MISSION_CARDS_PER_PLAYER')).toBe(true);
    expect(SEALED_REQUIRED_MISSIONS).toBe(3);
  });

  it('the select-all shortcut fills the 3 mission slots from physical copies, duplicates included', () => {
    const selectAllStart = SEALED_BUILDER_SRC.indexOf('const selectAll');
    expect(selectAllStart).toBeGreaterThan(-1);
    const block = SEALED_BUILDER_SRC.slice(selectAllStart, selectAllStart + 500);
    expect(block.includes('missions.slice(0, MISSION_CARDS_PER_PLAYER)')).toBe(true);
    expect(block.includes('seenMissionIds')).toBe(false);
  });

  it('a duplicate-heavy mission pool still produces a submission the server accepts', () => {
    const pool = craftPool([
      ...KS_COMMONS.slice(0, 30).map((c) => craftBoosterCard(c)),
      craftBoosterCard(KS_MISSIONS[0]),
      craftBoosterCard(KS_MISSIONS[0]),
      craftBoosterCard(KS_MISSIONS[0]),
      craftBoosterCard(KS_MISSIONS[0]),
    ]);
    const { characters, missions } = separateSealedPool(pool);
    const check = checkSealedDeckAgainstPool(
      pool.allCards.map((c) => c.id),
      characters.map((c) => c.id),
      missions.slice(0, SEALED_REQUIRED_MISSIONS).map((m) => m.id),
    );
    expect(check.valid).toBe(true);
  });
});

describe('sealed printings: a rare art and its base rare stay two different pool entries', () => {
  it('both printings of one card number really land together in a pool', () => {
    let collisions = 0;
    for (let i = 0; i < 200; i++) {
      const byNumber = new Map<string, Set<string>>();
      for (const c of separateSealedPool(generateSealedPool(6, 'KS')).characters) {
        const number = (c.id.match(/^(KS-\d+)/) ?? [c.id])[0];
        const seen = byNumber.get(number) ?? new Set<string>();
        seen.add(c.id);
        byNumber.set(number, seen);
      }
      if ([...byNumber.values()].some((s) => s.size > 1)) collisions++;
    }
    expect(collisions).toBeGreaterThan(0);
  });

  it('the pool check refuses two base copies when the pool held one base and one art', () => {
    const base = KS_RARE_ARTS[0].id.replace(/-RA$/, '-R');
    expect(getCardById(base)).toBeTruthy();
    const filler = KS_COMMONS.slice(0, 28).map((c) => c.id);
    const missionIds = KS_MISSIONS.slice(0, 3).map((m) => m.id);
    const poolIds = [...filler, base, KS_RARE_ARTS[0].id, ...missionIds];
    expect(checkSealedDeckAgainstPool(poolIds, [...filler, base, KS_RARE_ARTS[0].id], missionIds).valid).toBe(true);
    const doubled = checkSealedDeckAgainstPool(poolIds, [...filler, base, base], missionIds);
    expect(doubled.valid).toBe(false);
    expect(doubled.offendingCardId).toBe(base);
  });

  it('the builder counts what the pool holds per exact printing, never per card number', () => {
    expect(SEALED_BUILDER_SRC.includes('getVersionKey')).toBe(false);
    expect(SEALED_BUILDER_SRC.includes('counts.set(c.id, (counts.get(c.id) ?? 0) + 1);')).toBe(true);
    expect(SEALED_BUILDER_SRC.includes('poolAvailability.get(card.id)')).toBe(true);
  });
});
