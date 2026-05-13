import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import {
  handleChessClockExpiry,
  handleChessClockIdleLimit,
  handleMulliganIdleTimeout,
  type RoomData,
} from '@/lib/socket/server';
import {
  createChessClock,
  arm,
  bankEmpty,
  CHESS_CLOCK_INITIAL_MS,
  CHESS_CLOCK_MULLIGAN_IDLE_MS,
} from '@/lib/timing/chessClock';
import type { GameState, PendingAction, PendingEffect, PlayerID, GameAction } from '@/lib/engine/types';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    game: { deleteMany: vi.fn(async () => ({ count: 1 })) },
    tournament: { findUnique: vi.fn(async () => null) },
  },
}));

type EmitRecord = { room: string; event: string; payload: any };

function makeIoMock(): { io: any; emits: EmitRecord[] } {
  const emits: EmitRecord[] = [];
  const io: any = {
    to: (room: string) => ({
      emit: (event: string, payload: any) => emits.push({ room, event, payload }),
    }),
  };
  return { io, emits };
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: 'integ-test',
    turn: 1,
    phase: 'action',
    activePlayer: 'player1',
    edgeHolder: 'player1',
    firstPasser: null,
    player1: { hasMulliganed: false } as never,
    player2: { hasMulliganed: false } as never,
    missionDeck: [],
    activeMissions: [],
    log: [],
    pendingEffects: [],
    pendingActions: [],
    turnMissionRevealed: false,
    consecutiveTimeouts: { player1: 0, player2: 0 },
    ...overrides,
  };
}

function makePendingEffect(selectingPlayer: PlayerID, overrides: Partial<PendingEffect> = {}): PendingEffect {
  return {
    id: 'pe-1',
    sourceCardId: 'KS-001-C',
    sourceInstanceId: 'inst-1',
    sourceMissionIndex: 0,
    effectType: 'MAIN',
    effectDescription: 'integ',
    targetSelectionType: 'character',
    sourcePlayer: 'player1',
    requiresTargetSelection: false,
    validTargets: [],
    isOptional: false,
    isMandatory: true,
    resolved: false,
    isUpgrade: false,
    selectingPlayer,
    ...overrides,
  };
}

function makePendingAction(player: PlayerID, overrides: Partial<PendingAction> = {}): PendingAction {
  return {
    id: 'pa-1',
    type: 'SELECT_TARGET',
    player,
    description: 'integ',
    options: ['opt-1'],
    minSelections: 1,
    maxSelections: 1,
    sourceEffectId: 'pe-1',
    ...overrides,
  };
}

function makeRoom(overrides: Partial<RoomData> = {}): RoomData {
  return {
    code: 'INT01',
    hostSocket: 'host-sock',
    guestSocket: 'guest-sock',
    chessClock: createChessClock(),
    chessClockTickTimer: null,
    chessClockMulliganTimer: null,
    chessClockLastInputKey: null,
    gameState: makeState(),
    finalized: false,
    spectators: new Map(),
    ...overrides,
  } as RoomData;
}

describe('Phase 14 — chess clock integration scenarios', () => {
  let applySpy: ReturnType<typeof vi.spyOn>;
  let winnerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    applySpy = vi.spyOn(GameEngine, 'applyAction').mockImplementation((state: any) => state);
    winnerSpy = vi.spyOn(GameEngine, 'getWinner').mockReturnValue(null);
  });

  afterEach(() => {
    applySpy.mockRestore();
    winnerSpy.mockRestore();
  });

  it('Scenario 1: 15-min bank starts correctly for both players', () => {
    const clock = createChessClock();
    expect(clock.player1.remainingMs).toBe(CHESS_CLOCK_INITIAL_MS);
    expect(clock.player2.remainingMs).toBe(CHESS_CLOCK_INITIAL_MS);
    expect(CHESS_CLOCK_INITIAL_MS).toBe(15 * 60 * 1000);
    expect(clock.active).toBe(null);
    expect(clock.player1.idleWarningUsed).toBe(false);
    expect(clock.player2.idleWarningUsed).toBe(false);
  });

  it('Scenario 2: idle 3 min on action phase -> auto-PASS + warning consumed', () => {
    const { io } = makeIoMock();
    const room = makeRoom({
      chessClock: arm(createChessClock(), 'player1', 0),
      gameState: makeState({ phase: 'action', activePlayer: 'player1' }),
    });
    handleChessClockIdleLimit(room, 'player1', io);
    expect(applySpy).toHaveBeenCalled();
    const action = applySpy.mock.calls[0][2] as GameAction;
    expect(action.type).toBe('PASS');
    expect(room.chessClock.player1.idleWarningUsed).toBe(true);
  });

  it('Scenario 3: idle 3 min on optional pending effect -> auto-DECLINE_OPTIONAL_EFFECT + warning consumed', () => {
    const { io } = makeIoMock();
    const pe = makePendingEffect('player1', { isOptional: true, isMandatory: false });
    const room = makeRoom({
      chessClock: arm(createChessClock(), 'player1', 0),
      gameState: makeState({ pendingEffects: [pe] }),
    });
    handleChessClockIdleLimit(room, 'player1', io);
    const action = applySpy.mock.calls[0][2] as GameAction;
    expect(action.type).toBe('DECLINE_OPTIONAL_EFFECT');
    expect((action as Extract<GameAction, { type: 'DECLINE_OPTIONAL_EFFECT' }>).pendingEffectId).toBe(pe.id);
    expect(room.chessClock.player1.idleWarningUsed).toBe(true);
  });

  it('Scenario 4: idle 3 min on mandatory pending action -> instant FORFEIT (warning NOT consumed)', () => {
    const { io } = makeIoMock();
    const pe = makePendingEffect('player1', { isOptional: false, isMandatory: true, rootOptional: false });
    const pa = makePendingAction('player1', { sourceEffectId: pe.id });
    const room = makeRoom({
      chessClock: arm(createChessClock(), 'player1', 0),
      gameState: makeState({ pendingActions: [pa], pendingEffects: [pe] }),
    });
    handleChessClockIdleLimit(room, 'player1', io);
    const action = applySpy.mock.calls[0][2] as GameAction;
    expect(action.type).toBe('FORFEIT');
    expect(room.chessClock.player1.idleWarningUsed).toBe(false);
  });

  it('Scenario 5: 2nd idle (warning already used) anywhere -> instant FORFEIT', () => {
    const { io } = makeIoMock();
    const armedClock = arm(createChessClock(), 'player1', 0);
    armedClock.player1.idleWarningUsed = true;
    const room = makeRoom({
      chessClock: armedClock,
      gameState: makeState({ phase: 'action', activePlayer: 'player1' }),
    });
    handleChessClockIdleLimit(room, 'player1', io);
    const action = applySpy.mock.calls[0][2] as GameAction;
    expect(action.type).toBe('FORFEIT');
    expect((action as Extract<GameAction, { type: 'FORFEIT' }>).reason).toBe('idle');
  });

  it('Scenario 6: bank-empty -> instant FORFEIT (reason=clock)', () => {
    const { io } = makeIoMock();
    const room = makeRoom({
      chessClock: arm(createChessClock(), 'player1', 0),
    });
    expect(bankEmpty(room.chessClock, CHESS_CLOCK_INITIAL_MS + 1)).toBe(true);
    handleChessClockExpiry(room, 'player1', io, 'bank-empty');
    const action = applySpy.mock.calls[0][2] as GameAction;
    expect(action.type).toBe('FORFEIT');
    expect((action as Extract<GameAction, { type: 'FORFEIT' }>).reason).toBe('clock');
    expect(room.chessClock.active).toBeNull();
  });

  it('Scenario 7: mulligan 1-min cancel -> game:cancelled, no winner', async () => {
    const { io, emits } = makeIoMock();
    const room = makeRoom({
      gameState: makeState({
        phase: 'mulligan',
        player1: { hasMulliganed: false } as never,
        player2: { hasMulliganed: false } as never,
      }),
    });
    await handleMulliganIdleTimeout(room, room.code, io);
    const cancelEmit = emits.find((e) => e.event === 'game:cancelled');
    expect(cancelEmit).toBeDefined();
    expect(cancelEmit!.payload.reason).toBe('mulligan-idle');
    expect((cancelEmit!.payload as Record<string, unknown>).winner).toBeUndefined();
    expect(room.finalized).toBe(true);
    expect(CHESS_CLOCK_MULLIGAN_IDLE_MS).toBe(60_000);
  });
});

