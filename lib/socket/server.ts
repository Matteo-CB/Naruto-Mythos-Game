import type { Server as SocketIOServer, Socket } from 'socket.io';
import { decode } from 'next-auth/jwt';
import { GameEngine } from '@/lib/engine/GameEngine';
import type { GameState, GameAction, CharacterCard, MissionCard, PlayerConfig, GameConfig, PlayerID, VisibleGameState } from '@/lib/engine/types';
import { registerUserSocket, removeSocketFromAll, emitToUser, isUserConnected, getUserSocketIds } from '@/lib/socket/io';
import {
  resolveSeatBySocket,
  resolveSeatByUserId,
  resolveSeatForIdentity,
  canStartTournamentGame,
  shouldForfeitForDisconnect,
  type Seat,
} from '@/lib/socket/roomSeats';
import { resolveHandshakeIdentity, verifyIdentityClaim } from '@/lib/socket/handshakeIdentity';
import { decideIdleOutcome } from '@/lib/timing/idleDecision';
import { prisma } from '@/lib/db/prisma';
import { getCharacterById, getMissionById } from '@/lib/data/cardIndex';
import { calculateEloChanges, calculatePerformanceBonus, type PerformanceBonus } from '@/lib/elo/elo';
import { syncDiscordRole } from '@/lib/discord/roleSync';
import { sendRankUpNotification } from '@/lib/discord/rankUpWebhook';
import { registerTournamentHandlers, handleTournamentMatchEnd, rehydrateAbsenceTimers, sweepOrphanTournamentMatches, startTournamentLaunchReconciler, clearTournamentMatchTimers } from '@/lib/socket/tournamentHandlers';
import { registerTradeHandlers } from '@/lib/socket/tradeHandlers';
import { validatePlayCharacter, validatePlayHidden, validateRevealCharacter, validateUpgradeCharacter } from '@/lib/engine/rules/PlayValidation';
import { calculateEffectiveCost } from '@/lib/engine/rules/ChakraValidation';
import { deepClone } from '@/lib/engine/utils/deepClone';
import { resetIdCounter } from '@/lib/engine/utils/id';
import { isMaintenanceActive, activateMaintenance, setDrainTimeout, setCheckInterval } from '@/lib/socket/maintenance';
import { createChessClock, arm as armChessClock, disarm as disarmChessClock, resetIdle as resetChessClockIdle, snapshotForBroadcast as snapshotChessClockForBroadcast, bankEmpty as chessClockBankEmpty, idleMs as chessClockIdleMs, consumeIdleWarning as consumeChessClockIdleWarning, CHESS_CLOCK_IDLE_LIMIT_MS, CHESS_CLOCK_IDLE_TOAST_MS, CHESS_CLOCK_MULLIGAN_IDLE_MS, CHESS_CLOCK_DISCONNECT_FORFEIT_MS, type ChessClockState } from '@/lib/timing/chessClock';
import { computeEvolvingMpBonus } from '@/lib/evolving/mpBonus';
import { computeDeckEvolvingPoints, isEvolvingCompatible } from '@/lib/evolving/computePoints';
import { validateDeckVariantUnlocks } from '@/lib/variants/serverValidation';
import { getOwnedVariantIds } from '@/lib/variants/inventory';
import { isAdmin } from '@/lib/auth/admins';
import { isHoloId, holoBaseId, holoIdFor, isHoloEligibleCard } from '@/lib/holo/holoId';
import { packVisibleState } from '@/lib/socket/statePack';
import { sanitizeUnrevealedForViewer, stateHasUnrevealed } from '@/lib/socket/sanitizeUnrevealed';
import { getHiddenCardIds } from '@/lib/cards/reveal';
import { unrankedModeKey } from '@/lib/stats/modeKey';
import { isStaticRankedBanned } from '@/lib/data/rankedBans';
import { cardVersionKey } from '@/lib/cards/versionKey';
import { emitQuestEvent } from '@/lib/quests/hooks';
import { emitDrawDiffEvents, emitTokenDiffEvents } from '@/lib/quests/engineEmit';
import { ensureQuestPersistenceListener } from '@/lib/quests/listenerSetup';
import type { GameMode } from '@/lib/quests/hooks';
import { validateChatMessage, isOnChatCooldown, decideChatDelivery } from '@/lib/chat/chatDelivery';
import { maskProfanity } from '@/lib/chat/wordFilter';
import { getPairChatState } from '@/lib/chat/pairState';
import { getModerationFlags, isSuspended, isRankedBanned, isSpectateBanned } from '@/lib/moderation/sanctions';
import { initChatAutoScan, enqueueChatScan, holdScanMessage, type HoldVerdict } from '@/lib/moderation/autoScan';
import { setChatLockRefresher } from '@/lib/socket/chatLockBridge';
import { sendDm, getUnreadDmCount, markThreadRead } from '@/lib/dm/dmService';

ensureQuestPersistenceListener();

function resolveQuestGameMode(room: Pick<RoomData, 'isRanked' | 'isEvolving' | 'gameMode' | 'tournamentId'>): GameMode {
  if (room.tournamentId) return 'tournament';
  if (room.isEvolving) return 'evolving';
  if (room.isRanked) return 'ranked';
  if (room.gameMode === 'sealed') return 'sealed';
  return 'casual';
}

function emitFinalizeQuests(
  room: RoomData,
  winner: PlayerID,
  winReason: GameEndWinReason,
  finalRound: number,
): void {
  const mode = resolveQuestGameMode(room);
  const p1 = room.hostId;
  const p2 = room.guestId;
  if (!p1 || !p2) return;

  emitQuestEvent('match.played', p1, { gameMode: mode });
  emitQuestEvent('match.played', p2, { gameMode: mode });

  const winnerId = winner === 'player1' ? p1 : p2;
  const loserId = winner === 'player1' ? p2 : p1;
  const winnerSide: 'player1Characters' | 'player2Characters' =
    winner === 'player1' ? 'player1Characters' : 'player2Characters';

  if (mode === 'ranked') {
    emitQuestEvent('ranked.win', winnerId, { gameMode: mode });
    const winnerEffectsUsed = winner === 'player1'
      ? room.gameState?.player1EffectsUsed
      : room.gameState?.player2EffectsUsed;
    if (!winnerEffectsUsed) {
      emitQuestEvent('ranked.win.no_effects_used', winnerId, { gameMode: mode });
    }
  } else if (mode === 'evolving') {
    emitQuestEvent('match.won.evolving', winnerId, { gameMode: mode });
  } else if (mode === 'sealed') {
    emitQuestEvent('match.won.sealed', winnerId, { gameMode: mode });
  }

  if (finalRound <= 3 && winReason === 'score') {
    emitQuestEvent('match.won.short', winnerId, { gameMode: mode, maxRound: 3 });
  }

  const winnerPlayerState = winner === 'player1' ? room.gameState?.player1 : room.gameState?.player2;
  const loserPlayerState = winner === 'player1' ? room.gameState?.player2 : room.gameState?.player1;
  if (winnerPlayerState) {
    const winnerScore = winnerPlayerState.missionPoints ?? 0;
    if (winnerScore >= 12) {
      emitQuestEvent('mission_points.scored.match', winnerId, { gameMode: mode, threshold: winnerScore });
    }
    const winnerDefeats = winnerPlayerState.discardPile?.filter((c) => 'chakra' in c).length ?? 0;
    if (winnerDefeats === 0) {
      emitQuestEvent('match.won.no_defeats_own', winnerId, { gameMode: mode });
    }
  }
  if (loserPlayerState && loserId) {
    const loserScore = loserPlayerState.missionPoints ?? 0;
    if (loserScore >= 12) {
      emitQuestEvent('mission_points.scored.match', loserId, { gameMode: mode, threshold: loserScore });
    }
  }

  const finalState = room.gameState;
  if (finalState) {
    for (const mission of finalState.activeMissions) {
      if (mission.wonBy === winner) {
        emitQuestEvent('mission.won', winnerId, { gameMode: mode, rank: mission.rank });
      } else if (mission.wonBy && mission.wonBy !== winner) {
        emitQuestEvent('mission.won', loserId, { gameMode: mode, rank: mission.rank });
      }
    }

    const winnerChars = finalState.activeMissions.flatMap((m) => m[winnerSide]);
    for (const ch of winnerChars) {
      if (ch.isHidden) continue;
      const top = ch.stack && ch.stack.length > 0 ? ch.stack[ch.stack.length - 1] : ch.card;
      if (!top) continue;
      if (top.group) {
        emitQuestEvent('character.played.group', winnerId, { gameMode: mode, group: top.group });
      }
      for (const kw of top.keywords ?? []) {
        emitQuestEvent('character.played.keyword', winnerId, { gameMode: mode, keyword: kw });
      }
    }
  }
}

export function buildEvolvingGameConfigExtras(room: Pick<RoomData, 'isEvolving' | 'hostEvolvingPoints' | 'guestEvolvingPoints'>): Pick<GameConfig, 'startingMissionPoints'> {
  if (!room.isEvolving) return {};
  const hostPts = Number.isFinite(room.hostEvolvingPoints) ? room.hostEvolvingPoints : 0;
  const guestPts = Number.isFinite(room.guestEvolvingPoints) ? room.guestEvolvingPoints : 0;
  const bonus = computeEvolvingMpBonus(hostPts, guestPts);
  return { startingMissionPoints: bonus };
}

export function getEvolvingEloField(isEvolving: boolean): 'elo' | 'evolvingElo' {
  return isEvolving ? 'evolvingElo' : 'elo';
}

export function getEvolvingEloType(isEvolving: boolean): 'ranked' | 'evolving' {
  return isEvolving ? 'evolving' : 'ranked';
}

export async function userHasEvolvingDeck(userId: string): Promise<boolean> {
  try {
    const count = await prisma.deck.count({ where: { userId, evolvingCompatible: true } });
    return count > 0;
  } catch (err) {
    console.error(`[Socket] userHasEvolvingDeck check failed for ${userId}:`, err instanceof Error ? err.message : err);
    return false;
  }
}

export async function assertCanJoinEvolving(
  userId: string,
  room: Pick<RoomData, 'isEvolving'>,
): Promise<{ ok: true } | { ok: false; errorKey: string }> {
  if (!room.isEvolving) return { ok: true };
  const has = await userHasEvolvingDeck(userId);
  if (!has) return { ok: false, errorKey: 'room.error.evolvingNoDeck' };
  return { ok: true };
}

export interface RoomData {
  code: string;
  hostId: string;
  hostSocket: string;
  guestId: string | null;
  guestSocket: string | null;
  gameState: GameState | null;
  hostDeck: { characters: CharacterCard[]; missions: MissionCard[] } | null;
  guestDeck: { characters: CharacterCard[]; missions: MissionCard[] } | null;
  isPrivate: boolean;
  isRanked: boolean;
  isAnonymous: boolean;
  gameMode: 'casual' | 'ranked' | 'sealed' | 'evolving';
  isEvolving: boolean;
  holoHue: number | null;
  hostEvolvingPoints: number;
  guestEvolvingPoints: number;
  createdAt: number;
  hostName?: string;
  guestName?: string;

  replayInitialState: GameState | null;
  replayStateSnapshots: GameState[] | null;
  replaySnapshotLogLengths: number[] | null;
  replayClockSnapshots: ChessClockState[] | null;
  finalized: boolean;
  pendingEloHistoryIds?: string[];
  mulliganDeadline?: number | null;
  tournamentJoinTimer?: ReturnType<typeof setTimeout> | null;
  tournamentJoinDeadline?: number | null;
  tournamentPendingForfeit?: string | null;
  tournamentInviteTimer?: ReturnType<typeof setInterval> | null;
  tournamentGameStarting?: boolean;
  hostEverJoined?: boolean;
  guestEverJoined?: boolean;
  hostInviteAckedAt?: number | null;
  guestInviteAckedAt?: number | null;
  decklessSeenAt?: number | null;

  isSealed: boolean;
  sealedBoosterCount: 4 | 5 | 6;
  sealedSetChoice?: string;
  sealedTimer: ReturnType<typeof setTimeout> | null;
  sealedDeadline: number | null;
  hostSealedPoolIds?: string[];
  guestSealedPoolIds?: string[];
  tournamentGameTimer?: ReturnType<typeof setTimeout> | null;
  hostDeckId?: string;
  guestDeckId?: string;

  rematchOffer?: 'player1' | 'player2';
  
  tournamentId?: string;
  tournamentMatchId?: string;
  
  coinFlipDone: { player1: boolean; player2: boolean };
  
  spectators: Map<string, { socketId: string; userId: string; username: string }>;
  
  hostAllowSpectatorHand: boolean;
  guestAllowSpectatorHand: boolean;
  
  chatMessages: Array<{ id: string; userId: string; username: string; message: string; isEmote: boolean; isSpectator: boolean; timestamp: number; removedByModeration?: boolean }>;
  chatLastCleanup: number;

  chessClock: ChessClockState;
  chessClockTickTimer: ReturnType<typeof setInterval> | null;
  chessClockMulliganTimer: ReturnType<typeof setTimeout> | null;
  chessClockLastInputKey: string | null;
  missionAdvanceTimer?: ReturnType<typeof setTimeout> | null;
  player1DisconnectedAt?: number | null;
  player2DisconnectedAt?: number | null;
  lastApplyActionAt?: number;
  lastSeatInputAt?: { player1: number; player2: number } | null;
  stalemateNoticeAt?: number | null;

  hostPrivileged?: boolean;
  guestPrivileged?: boolean;
  hiddenIdsSnapshot?: Set<string>;
  revealMetaAt?: number;
  revealMetaLoading?: boolean;
  finalBroadcast?: { event: 'game:ended' | 'game:cancelled'; player1: unknown; player2: unknown } | null;
  finalizedAt?: number;
}

function clearChessClockTimers(room: RoomData): void {
  if (room.chessClockTickTimer) {
    clearInterval(room.chessClockTickTimer);
    room.chessClockTickTimer = null;
  }
  if (room.chessClockMulliganTimer) {
    clearTimeout(room.chessClockMulliganTimer);
    room.chessClockMulliganTimer = null;
  }
  if (room.missionAdvanceTimer) {
    clearTimeout(room.missionAdvanceTimer);
    room.missionAdvanceTimer = null;
  }
}

export const MISSION_ADVANCE_DELAY_MS = 1500;

export function missionAdvanceIsDue(state: GameState | null): boolean {
  if (!state) return false;
  if (state.phase !== 'mission') return false;
  if (state.missionScoringComplete !== true) return false;
  return state.pendingActions.length === 0;
}

function markRoomProgress(room: RoomData): void {
  room.lastApplyActionAt = Date.now();
  room.stalemateNoticeAt = null;
}

export function noteSeatPresence(room: RoomData, seat: Seat, now: number = Date.now()): void {
  if (!room.lastSeatInputAt) room.lastSeatInputAt = { player1: 0, player2: 0 };
  room.lastSeatInputAt[seat] = now;
  if (seat === 'player1') room.player1DisconnectedAt = null;
  else room.player2DisconnectedAt = null;
}

export function noteSeatInput(room: RoomData, seat: Seat, now: number = Date.now()): void {
  noteSeatPresence(room, seat, now);
  if (room.chessClock.active === seat) {
    room.chessClock = resetChessClockIdle(room.chessClock, now);
  }
}

export function stateProgressSignature(state: GameState | null): string {
  if (!state) return 'none';
  const p = state.missionScoringProgress;
  const seat = (side: 'player1' | 'player2') => {
    const s = state[side] as Partial<GameState['player1']> | undefined;
    if (!s) return '-';
    return [
      s.chakra ?? 0,
      s.hand?.length ?? 0,
      s.deck?.length ?? 0,
      s.discardPile?.length ?? 0,
      s.missionPoints ?? 0,
      s.hasPassed ? '1' : '0',
    ].join('/');
  };
  const board = (state.activeMissions ?? [])
    .map((m) => `${m.player1Characters?.length ?? 0}/${m.player2Characters?.length ?? 0}/${m.wonBy ?? '-'}`)
    .join(',');
  return [
    state.phase,
    state.turn,
    state.activePlayer,
    state.edgeHolder,
    state.log?.length ?? 0,
    (state.pendingActions ?? []).map((a) => a.id).join('|'),
    (state.pendingEffects ?? []).map((e) => `${e.id}${e.resolved ? '1' : '0'}`).join('|'),
    state.pendingForcedResolver ?? '-',
    seat('player1'),
    seat('player2'),
    state.missionScoringComplete ? '1' : '0',
    p ? `${p.winner}:${p.currentRankIndex}:${p.missionCardScoreDone ? '1' : '0'}:${p.processedCharacterIds?.length ?? 0}` : '-',
    board,
  ].join(';');
}

export function actionMadeProgress(before: GameState | null, after: GameState | null): boolean {
  return stateProgressSignature(before) !== stateProgressSignature(after);
}

export function seatLiveness(room: RoomData, seat: Seat, io: SocketIOServer | null): {
  seatSocketAlive: boolean;
  userHasLiveSocket: boolean;
} {
  const seatSocket = seat === 'player1' ? room.hostSocket : room.guestSocket;
  let seatSocketAlive = false;
  if (seatSocket) {
    const registry = io?.sockets?.sockets;
    if (!registry || typeof registry.get !== 'function') seatSocketAlive = true;
    else {
      const sock = registry.get(seatSocket);
      seatSocketAlive = !!sock && sock.connected;
    }
  }
  const seatUserId = seat === 'player1' ? room.hostId : room.guestId;
  let userHasLiveSocket = false;
  try {
    userHasLiveSocket = seatUserId ? isUserConnected(seatUserId) : false;
  } catch {
    userHasLiveSocket = false;
  }
  return { seatSocketAlive, userHasLiveSocket };
}

function disconnectForfeitDue(room: RoomData, seat: Seat, io: SocketIOServer, now: number): boolean {
  return shouldForfeitForDisconnect(
    room,
    seat,
    now,
    CHESS_CLOCK_DISCONNECT_FORFEIT_MS,
    seatLiveness(room, seat, io),
  );
}

function clearStaleDisconnectStamp(room: RoomData, seat: Seat, io: SocketIOServer): void {
  const stamp = seat === 'player1' ? room.player1DisconnectedAt : room.player2DisconnectedAt;
  if (!stamp) return;
  const live = seatLiveness(room, seat, io);
  if (!live.seatSocketAlive && !live.userHasLiveSocket) return;
  console.log(`[ChessClock] ${room.code}: clearing stale disconnect stamp for ${seat} (socket alive=${live.seatSocketAlive}, user online=${live.userHasLiveSocket})`);
  if (seat === 'player1') room.player1DisconnectedAt = null;
  else room.player2DisconnectedAt = null;
  const opponentSocket = seat === 'player1' ? room.guestSocket : room.hostSocket;
  if (opponentSocket) io.to(opponentSocket).emit('game:opponent-reconnected');
}

export function hasOutstandingInputFor(state: GameState, player: PlayerID): boolean {
  if (state.pendingActions && state.pendingActions.some((a) => a.player === player)) return true;
  if (state.pendingEffects && state.pendingEffects.some((e) => !e.resolved && (e.selectingPlayer === player || e.sourcePlayer === player))) return true;
  return false;
}

export function hasUnanswerablePendingEffects(state: GameState | null): boolean {
  if (!state) return false;
  if (state.pendingActions && state.pendingActions.length > 0) return false;
  return !!state.pendingEffects && state.pendingEffects.some((e) => !e.resolved);
}

export function whoseInputIsAwaited(state: GameState | null): PlayerID | null {
  if (!state) return null;
  if (state.forfeitedBy) return null;
  if (state.phase === 'gameOver') return null;
  if (state.phase === 'setup' || state.phase === 'mulligan') return null;
  if (state.pendingForcedResolver && hasOutstandingInputFor(state, state.pendingForcedResolver)) {
    return state.pendingForcedResolver;
  }
  if (state.pendingActions && state.pendingActions.length > 0) {
    return state.pendingActions[0].player;
  }
  if (state.pendingEffects) {
    const eff = state.pendingEffects.find((e) => !e.resolved && e.selectingPlayer);
    if (eff?.selectingPlayer) return eff.selectingPlayer;
  }
  if (state.phase === 'end') {
    const orphan = state.pendingEffects?.find((e) => !e.resolved);
    if (orphan) return orphan.sourcePlayer ?? state.activePlayer;
    return null;
  }
  if (state.phase === 'start') return null;
  if (state.phase === 'mission' && state.missionScoringProgress) {
    return state.missionScoringProgress.winner;
  }
  if (state.phase === 'action') return state.activePlayer;
  return null;
}

export function computeAwaitedInputKey(state: GameState | null): string | null {
  if (!state) return null;
  if (state.forfeitedBy || state.phase === 'gameOver') return null;
  if (state.pendingForcedResolver && hasOutstandingInputFor(state, state.pendingForcedResolver)) {
    return 'forced:' + state.pendingForcedResolver;
  }
  if (state.pendingActions && state.pendingActions.length > 0) {
    return 'pa:' + state.pendingActions[0].id;
  }
  if (state.pendingEffects) {
    const eff = state.pendingEffects.find((e) => !e.resolved && e.selectingPlayer);
    if (eff) return 'pe:' + eff.id;
  }
  if (state.phase === 'mission' && state.missionScoringProgress) {
    const p = state.missionScoringProgress;
    return 'mission:' + p.winner + ':' + p.currentRankIndex + ':' + (p.missionCardScoreDone ? '1' : '0') + ':' + p.processedCharacterIds.length;
  }
  if (state.phase === 'action') return 'action:' + state.activePlayer + ':' + state.turn;
  return null;
}

export function syncChessClock(room: RoomData, now: number = Date.now()): void {
  const needed = whoseInputIsAwaited(room.gameState);
  const newKey = computeAwaitedInputKey(room.gameState);
  if (!needed) {
    room.chessClock = disarmChessClock(room.chessClock, now);
    room.chessClockLastInputKey = null;
    return;
  }
  if (room.chessClock.active === needed) {
    if (newKey !== room.chessClockLastInputKey) {
      room.chessClock = resetChessClockIdle(room.chessClock, now);
      room.chessClockLastInputKey = newKey;
    }
    return;
  }
  room.chessClock = armChessClock(room.chessClock, needed, now);
  room.chessClockLastInputKey = newKey;
}

export interface ChessClockBroadcast {
  player1: { remainingMs: number; idleWarningUsed: boolean };
  player2: { remainingMs: number; idleWarningUsed: boolean };
  active: 'player1' | 'player2' | null;
  activeStartedAt: number | null;
  idleStartedAt: number | null;
  serverNow: number;
  idleToastAtMs: number;
  idleLimitMs: number;
}

export function buildChessClockBroadcast(state: ChessClockState, now: number): ChessClockBroadcast {
  const snap = snapshotChessClockForBroadcast(state, now);
  return {
    player1: { remainingMs: snap.player1.remainingMs, idleWarningUsed: snap.player1.idleWarningUsed },
    player2: { remainingMs: snap.player2.remainingMs, idleWarningUsed: snap.player2.idleWarningUsed },
    active: snap.active,
    activeStartedAt: snap.activeStartedAt,
    idleStartedAt: snap.idleStartedAt,
    serverNow: now,
    idleToastAtMs: CHESS_CLOCK_IDLE_TOAST_MS,
    idleLimitMs: CHESS_CLOCK_IDLE_LIMIT_MS,
  };
}

function broadcastChessClockTick(room: RoomData, io: SocketIOServer, now: number): void {
  const payload = { chessClock: buildChessClockBroadcast(room.chessClock, now) };
  if (room.hostSocket) io.to(room.hostSocket).emit('game:clock-update', payload);
  if (room.guestSocket) io.to(room.guestSocket).emit('game:clock-update', payload);
  if (room.spectators.size > 0) {
    io.to(`spec:${room.code}`).emit('game:clock-update', payload);
  }
}

export const IDLE_INBOUND_TOLERANCE_MS = 5_000;

export type ChessClockExpiryReason = 'bank-empty' | 'idle-mandatory' | 'idle-second' | 'idle-unhandled' | 'disconnect';

export function chessClockExpiryReasonToWinReason(reason: ChessClockExpiryReason): 'clock' | 'idle' | 'disconnect' {
  if (reason === 'bank-empty') return 'clock';
  if (reason === 'disconnect') return 'disconnect';
  return 'idle';
}

export function handleChessClockExpiry(room: RoomData, loser: PlayerID, io: SocketIOServer, reason: ChessClockExpiryReason): void {
  if (!room.gameState || room.finalized) return;
  const winReason = chessClockExpiryReasonToWinReason(reason);
  console.log(`[ChessClock] ${room.code}: ${loser} loses by clock (reason=${reason}, winReason=${winReason})`);
  try {
    room.gameState = GameEngine.applyAction(room.gameState, loser, { type: 'FORFEIT', reason: winReason });
  } catch (err) {
    console.error('[ChessClock] applyAction(FORFEIT) failed:', err instanceof Error ? err.message : err);
    return;
  }
  stopChessClockTickLoop(room);
  room.chessClock = disarmChessClock(room.chessClock, Date.now());
  room.chessClockLastInputKey = null;
  broadcastState(room, io);
  finalizeGameEnd(room, room.code, io, winReason).catch((err) => {
    console.error('[ChessClock] finalizeGameEnd error:', err instanceof Error ? err.message : err);
  });
}

export function findImpossibleChoices(state: GameState | null): string[] {
  if (!state || !state.pendingActions) return [];
  return state.pendingActions
    .filter((a) => a.minSelections > 0 && (!a.options || a.options.length === 0))
    .map((a) => a.id);
}

export function dropImpossibleChoices(state: GameState | null): boolean {
  if (!state) return false;
  const doomed = findImpossibleChoices(state);
  if (doomed.length === 0) return false;
  const doomedIds = new Set(doomed);
  const effectIds = new Set(
    state.pendingActions
      .filter((a) => doomedIds.has(a.id) && a.sourceEffectId)
      .map((a) => a.sourceEffectId as string),
  );
  state.pendingActions = state.pendingActions.filter((a) => !doomedIds.has(a.id));
  state.pendingEffects = state.pendingEffects.filter((e) => !effectIds.has(e.id));
  return true;
}

export function dropResolvedOrphanEffects(state: GameState | null): boolean {
  if (!state || !state.pendingEffects || state.pendingEffects.length === 0) return false;
  const referenced = new Set(
    (state.pendingActions ?? []).map((a) => a.sourceEffectId).filter((id): id is string => !!id),
  );
  const kept = state.pendingEffects.filter((e) => !e.resolved || referenced.has(e.id));
  if (kept.length === state.pendingEffects.length) return false;
  state.pendingEffects = kept;
  return true;
}

export function clearStaleForcedResolver(state: GameState | null): boolean {
  if (!state) return false;
  if (!state.pendingForcedResolver) return false;
  if (hasOutstandingInputFor(state, state.pendingForcedResolver)) return false;
  state.pendingForcedResolver = undefined;
  return true;
}

export function repairStuckState(room: RoomData): boolean {
  const state = room.gameState;
  if (!state || room.finalized) return false;
  let repaired = false;
  if (dropImpossibleChoices(state)) {
    console.warn(`[Socket] ${room.code}: dropping a required choice with no selectable option in phase ${state.phase}`);
    repaired = true;
  }
  if (dropResolvedOrphanEffects(state)) {
    console.warn(`[Socket] ${room.code}: sweeping an already resolved effect that was blocking the ${state.phase} phase`);
    repaired = true;
  }
  if (hasUnanswerablePendingEffects(state)) {
    const dropped = state.pendingEffects.length;
    console.warn(`[Socket] ${room.code}: dropping ${dropped} unanswerable pending effect(s) in phase ${state.phase}`);
    state.pendingEffects = [];
    repaired = true;
  }
  if (clearStaleForcedResolver(state)) {
    console.warn(`[Socket] ${room.code}: clearing a stale forced resolver that owes no input in phase ${state.phase}`);
    repaired = true;
  }
  return repaired;
}

export const PHASE_STALL_GRACE_MS = 10_000;

export const FINALIZE_ANNOUNCE_GRACE_MS = 15_000;

export function announceMissedGameEnd(room: RoomData, code: string, io: SocketIOServer, now: number): boolean {
  if (!room.finalized || room.finalBroadcast || !room.gameState) return false;
  const winner = GameEngine.getWinner(room.gameState);
  if (!winner) return false;
  if (typeof room.finalizedAt !== 'number') {
    room.finalizedAt = now;
    return false;
  }
  if (now - room.finalizedAt < FINALIZE_ANNOUNCE_GRACE_MS) return false;

  console.error(`[Socket] ${code}: the game was decided but never announced, sending a fallback result`);
  const payload = {
    winner,
    player1Score: room.gameState.player1.missionPoints,
    player2Score: room.gameState.player2.missionPoints,
    isRanked: room.isRanked,
    isEvolving: room.isEvolving === true,
    eloDelta: null,
    newElo: undefined,
    totalGames: undefined,
    winReason: room.gameState.forfeitedBy ? ('forfeit' as const) : ('score' as const),
    gameId: null,
    replayData: null,
    tournamentId: room.tournamentId ?? null,
    performanceBonus: null,
  };
  room.finalBroadcast = { event: 'game:ended', player1: payload, player2: payload };
  if (room.hostSocket) io.to(room.hostSocket).emit('game:ended', payload);
  if (room.guestSocket) io.to(room.guestSocket).emit('game:ended', payload);
  if (room.spectators.size > 0) io.to(`spec:${code}`).emit('game:ended', payload);
  return true;
}

export function phaseAdvanceStalled(state: GameState | null): boolean {
  if (!state) return false;
  if (state.phase !== 'mission' && state.phase !== 'end') return false;
  if (state.pendingActions.length > 0) return false;
  if (state.pendingEffects.some((e) => !e.resolved)) return false;
  return whoseInputIsAwaited(state) === null;
}

function forceAdvanceStalledPhase(room: RoomData, code: string, io: SocketIOServer, now: number): boolean {
  if (room.finalized || !room.gameState) return false;
  if (!phaseAdvanceStalled(room.gameState)) return false;
  if (typeof room.lastApplyActionAt === 'number' && now - room.lastApplyActionAt < PHASE_STALL_GRACE_MS) return false;
  console.warn(`[Socket] ${code}: ${room.gameState.phase} phase has nothing left to resolve and no awaited input, forcing ADVANCE_PHASE`);
  try {
    if (room.gameState.phase === 'mission') room.gameState.missionScoringComplete = true;
    room.gameState = GameEngine.applyAction(room.gameState, 'player1', { type: 'ADVANCE_PHASE' });
    markRoomProgress(room);
  } catch (err) {
    console.error(`[Socket] ${code}: forced ADVANCE_PHASE failed:`, err instanceof Error ? err.message : err);
    return false;
  }
  broadcastState(room, io);
  if (GameEngine.getWinner(room.gameState)) {
    finalizeGameEnd(room, code, io, 'score').catch((err) => {
      console.error(`[Socket] ${code}: finalizeGameEnd after forced advance failed:`, err instanceof Error ? err.message : err);
    });
  }
  return true;
}

export function handleChessClockIdleLimit(room: RoomData, player: PlayerID, io: SocketIOServer): void {
  if (!room.gameState || room.finalized) return;
  const state = room.gameState;

  clearStaleDisconnectStamp(room, player, io);
  const disconnectVerified = disconnectForfeitDue(room, player, io, Date.now());

  if (!disconnectVerified && !seatIsBound(room, player, io) && seatLiveness(room, player, io).userHasLiveSocket) {
    console.warn(`[ChessClock] ${room.code}: ${player} has a live socket but no bound seat, asking them to rejoin instead of punishing the idle`);
    requestSeatRejoin(room, player);
    room.chessClock = resetChessClockIdle(room.chessClock, Date.now());
    broadcastChessClockTick(room, io, Date.now());
    return;
  }

  if (clearStaleForcedResolver(state)) {
    console.warn(`[ChessClock] ${room.code}: cleared a stale forced resolver before deciding the idle outcome for ${player}`);
  }
  if (dropImpossibleChoices(state)) {
    console.warn(`[ChessClock] ${room.code}: dropped a required choice with no selectable option before deciding the idle outcome for ${player}`);
  }
  if (dropResolvedOrphanEffects(state)) {
    console.warn(`[ChessClock] ${room.code}: swept an already resolved effect before deciding the idle outcome for ${player}`);
  }

  const decision = decideIdleOutcome(
    {
      phase: state.phase,
      activePlayer: state.activePlayer,
      pendingForcedResolver: state.pendingForcedResolver ?? null,
      pendingActions: state.pendingActions,
      pendingEffects: state.pendingEffects,
    },
    player,
    {
      idleWarningUsed: room.chessClock[player].idleWarningUsed,
      disconnectVerified,
    },
  );

  if (decision.kind === 'defeat') {
    handleChessClockExpiry(room, player, io, decision.reason);
    return;
  }

  if (decision.kind === 'auto-decline') {
    applyChessClockIdleAuto(room, player, io, {
      type: 'DECLINE_OPTIONAL_EFFECT',
      pendingEffectId: decision.pendingEffectId,
    });
    return;
  }

  if (decision.kind === 'auto-pass') {
    applyChessClockIdleAuto(room, player, io, { type: 'PASS' });
    return;
  }

  if (decision.kind === 'warn') {
    console.warn(`[ChessClock] ${room.code}: idle warning consumed for ${player} on a non-declinable choice (no defeat on first idle)`);
    room.chessClock = consumeChessClockIdleWarning(room.chessClock);
    room.chessClock = resetChessClockIdle(room.chessClock, Date.now());
    broadcastChessClockTick(room, io, Date.now());
    return;
  }

  console.warn(`[ChessClock] ${room.code}: idle-unhandled for ${player} (phase=${state.phase}), unsticking instead of forfeiting`);
  repairStuckState(room);
  if (room.gameState && room.gameState.pendingActions.length === 0 &&
      (room.gameState.phase === 'mission' || room.gameState.phase === 'end')) {
    if (room.gameState.phase === 'mission') {
      room.gameState.missionScoringProgress = undefined;
      room.gameState.missionScoringComplete = true;
    }
    try {
      room.gameState = GameEngine.applyAction(room.gameState, 'player1', { type: 'ADVANCE_PHASE' });
      markRoomProgress(room);
    } catch (err) {
      console.error(`[ChessClock] ${room.code}: unstick ADVANCE_PHASE failed:`, err instanceof Error ? err.message : err);
    }
  }
  room.chessClock = resetChessClockIdle(room.chessClock, Date.now());
  broadcastState(room, io);
  if (room.gameState && GameEngine.getWinner(room.gameState)) {
    finalizeGameEnd(room, room.code, io, 'score').catch((err) => {
      console.error('[ChessClock] finalizeGameEnd after unstick failed:', err instanceof Error ? err.message : err);
    });
  }
}

function applyChessClockIdleAuto(room: RoomData, player: PlayerID, io: SocketIOServer, action: GameAction): void {
  if (!room.gameState || room.finalized) return;
  let newState: GameState;
  const oldState = room.gameState;
  try {
    newState = GameEngine.applyAction(room.gameState, player, action);
  } catch (err) {
    console.error(`[ChessClock] auto-action ${action.type} failed:`, err instanceof Error ? err.message : err);
    console.warn(`[ChessClock] ${room.code}: not forfeiting ${player} for a failed auto-action, consuming the warning and re-broadcasting`);
    room.chessClock = consumeChessClockIdleWarning(room.chessClock);
    room.chessClock = resetChessClockIdle(room.chessClock, Date.now());
    broadcastState(room, io);
    return;
  }
  if (!actionMadeProgress(oldState, newState)) {
    console.warn(`[ChessClock] ${room.code}: auto-${action.type} for ${player} changed nothing, repairing instead of consuming the warning`);
    repairStuckState(room);
    room.chessClock = resetChessClockIdle(room.chessClock, Date.now());
    broadcastState(room, io);
    return;
  }
  emitDrawDiffEvents(oldState, newState);
  emitTokenDiffEvents(oldState, newState);
  room.gameState = newState;
  markRoomProgress(room);
  room.chessClock = consumeChessClockIdleWarning(room.chessClock);
  console.log(`[ChessClock] ${room.code}: auto-${action.type} for ${player} (idle warning consumed)`);
  const winner = GameEngine.getWinner(room.gameState);
  broadcastState(room, io);
  scheduleMissionAdvance(room, room.code, io);
  if (winner) {
    finalizeGameEnd(room, room.code, io, 'score').catch((err) => {
      console.error('[ChessClock] finalizeGameEnd after auto-action failed:', err instanceof Error ? err.message : err);
    });
  }
}

export function onChessClockTick(room: RoomData, io: SocketIOServer): void {
  if (!room.gameState || room.finalized) {
    stopChessClockTickLoop(room);
    return;
  }
  const now = Date.now();

  if (room.chessClock.player1.remainingMs <= 0) {
    handleChessClockExpiry(room, 'player1', io, 'bank-empty');
    return;
  }
  if (room.chessClock.player2.remainingMs <= 0) {
    handleChessClockExpiry(room, 'player2', io, 'bank-empty');
    return;
  }


  clearStaleDisconnectStamp(room, 'player1', io);
  clearStaleDisconnectStamp(room, 'player2', io);

  if (room.player1DisconnectedAt && room.player2DisconnectedAt) {
    const oldestDisc = Math.min(room.player1DisconnectedAt, room.player2DisconnectedAt);
    if (now - oldestDisc >= CHESS_CLOCK_DISCONNECT_FORFEIT_MS + 30_000) {
      console.warn(`[ChessClock] ${room.code}: both players disconnected ${Math.round((now - oldestDisc) / 1000)}s, cancelling game with NO elo impact (suspected server outage)`);
      cancelGameNoElo(room, room.code, io, 'stalemate').catch((err) => {
        console.error(`[ChessClock] ${room.code}: cancelGameNoElo failed:`, err instanceof Error ? err.message : err);
      });
    }
    return;
  }
  if (disconnectForfeitDue(room, 'player1', io, now)) {
    handleChessClockExpiry(room, 'player1', io, 'disconnect');
    return;
  }
  if (disconnectForfeitDue(room, 'player2', io, now)) {
    handleChessClockExpiry(room, 'player2', io, 'disconnect');
    return;
  }

  if (missionAdvanceIsDue(room.gameState)) {
    scheduleMissionAdvance(room, room.code, io);
  }

  if (forceAdvanceStalledPhase(room, room.code, io, now)) return;

  if (room.chessClock.active === null && whoseInputIsAwaited(room.gameState) !== null) {
    syncChessClock(room, now);
  }
  const active = room.chessClock.active;
  if (!active) return;
  if (chessClockBankEmpty(room.chessClock, now)) {
    handleChessClockExpiry(room, active, io, 'bank-empty');
    return;
  }


  const opponentOfActive: PlayerID = active === 'player1' ? 'player2' : 'player1';
  const opponentDisconnected = opponentOfActive === 'player1'
    ? !!room.player1DisconnectedAt
    : !!room.player2DisconnectedAt;
  if (opponentDisconnected) {
    room.chessClock = resetChessClockIdle(room.chessClock, now);
    broadcastChessClockTick(room, io, now);
    return;
  }
  if (chessClockIdleMs(room.chessClock, now) >= CHESS_CLOCK_IDLE_LIMIT_MS) {
    handleChessClockIdleLimit(room, active, io);
    return;
  }
  broadcastChessClockTick(room, io, now);
}

export function startChessClockTickLoop(room: RoomData, io: SocketIOServer): void {
  if (room.finalized) return;
  if (!room.gameState) return;
  if (room.chessClockTickTimer) return;
  room.chessClockTickTimer = setInterval(() => {
    onChessClockTick(room, io);
  }, 1000);
}

export function stopChessClockTickLoop(room: RoomData): void {
  if (room.chessClockTickTimer) {
    clearInterval(room.chessClockTickTimer);
    room.chessClockTickTimer = null;
  }
}

export function scheduleMissionAdvance(room: RoomData, code: string, io: SocketIOServer): void {
  if (room.finalized) return;
  if (room.missionAdvanceTimer) return;
  if (!missionAdvanceIsDue(room.gameState)) return;
  room.missionAdvanceTimer = setTimeout(() => {
    room.missionAdvanceTimer = null;
    try {
      if (!rooms.has(code)) return;
      if (room.finalized) return;
      if (!missionAdvanceIsDue(room.gameState)) return;
      room.gameState = GameEngine.applyAction(room.gameState!, 'player1', { type: 'ADVANCE_PHASE' });
      markRoomProgress(room);
      broadcastState(room, io);
      const winnerAfterEnd = GameEngine.getWinner(room.gameState);
      if (winnerAfterEnd) {
        finalizeGameEnd(room, code, io, 'score').catch((err) => {
          console.error('[Socket] Auto-advance finalize error:', err instanceof Error ? err.message : err);
        });
      }
    } catch (err) {
      console.error('[Socket] Auto-advance error:', err instanceof Error ? err.message : err);
    }
  }, MISSION_ADVANCE_DELAY_MS);
}




const CHESS_CLOCK_WATCHDOG_INTERVAL_MS = 30_000;

export const STALEMATE_NO_PROGRESS_MS = 5 * 60 * 1000;
export const STALEMATE_CANCEL_MS = 8 * 60 * 1000;


const DISCONNECT_HARD_FORFEIT_MS = CHESS_CLOCK_DISCONNECT_FORFEIT_MS;


export function chessClockWatchdog(io: SocketIOServer): void {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (!room.gameState) continue;
    if (room.finalized) {
      try {
        announceMissedGameEnd(room, code, io, now);
      } catch (err) {
        console.error(`[ChessClockWatchdog] ${code}: fallback result emit failed:`, err instanceof Error ? err.message : err);
      }
      continue;
    }
    if (room.gameState.phase === 'gameOver') continue;
    if (room.gameState.phase === 'mulligan') continue;

    try {
      if (repairStuckState(room)) {
        broadcastState(room, io);
      }

      if (forceAdvanceStalledPhase(room, code, io, now)) continue;

      const needed = whoseInputIsAwaited(room.gameState);
      const active = room.chessClock.active;


      if (needed && active !== needed) {
        console.warn(`[ChessClockWatchdog] ${code}: clock active=${active} but input needed from ${needed}, re-syncing`);
        syncChessClock(room, now);
      }


      if (room.chessClock.active && !room.chessClockTickTimer) {
        console.warn(`[ChessClockWatchdog] ${code}: tick timer missing while clock active=${room.chessClock.active}, restarting`);
        startChessClockTickLoop(room, io);
      }


      onChessClockTick(room, io);
      if (room.finalized) continue;


      const p1Disc = room.player1DisconnectedAt;
      const p2Disc = room.player2DisconnectedAt;
      if (p1Disc && p2Disc) {
        const oldestDiscW = Math.min(p1Disc, p2Disc);
        if ((now - oldestDiscW) >= DISCONNECT_HARD_FORFEIT_MS + 30_000) {
          console.warn(`[ChessClockWatchdog] ${code}: both players disconnected ${Math.round((now - oldestDiscW) / 1000)}s, cancelling with NO elo (suspected server outage)`);
          cancelGameNoElo(room, code, io, 'stalemate').catch((err) => {
            console.error(`[ChessClockWatchdog] ${code}: cancelGameNoElo failed:`, err instanceof Error ? err.message : err);
          });
        }
        continue;
      }
      if (p1Disc && shouldForfeitForDisconnect(room, 'player1', now, DISCONNECT_HARD_FORFEIT_MS, seatLiveness(room, 'player1', io))) {
        console.warn(`[ChessClockWatchdog] ${code}: player1 disconnected ${Math.round((now - p1Disc) / 1000)}s and unreachable, force forfeit`);
        handleChessClockExpiry(room, 'player1', io, 'disconnect');
        continue;
      }
      if (p2Disc && shouldForfeitForDisconnect(room, 'player2', now, DISCONNECT_HARD_FORFEIT_MS, seatLiveness(room, 'player2', io))) {
        console.warn(`[ChessClockWatchdog] ${code}: player2 disconnected ${Math.round((now - p2Disc) / 1000)}s and unreachable, force forfeit`);
        handleChessClockExpiry(room, 'player2', io, 'disconnect');
        continue;
      }

      if (typeof room.lastApplyActionAt !== 'number') {
        room.lastApplyActionAt = now;
        continue;
      }
      const sinceApply = now - room.lastApplyActionAt;
      if (sinceApply >= STALEMATE_CANCEL_MS && !p1Disc && !p2Disc) {
        console.warn(`[ChessClockWatchdog] ${code}: stalemate detected (no action applied for ${Math.round(sinceApply / 1000)}s, no disconnect), cancelling game with NO elo impact`);
        cancelGameNoElo(room, code, io, 'stalemate').catch((err) => {
          console.error(`[ChessClockWatchdog] ${code}: cancelGameNoElo failed:`, err instanceof Error ? err.message : err);
        });
        continue;
      }
      if (sinceApply >= STALEMATE_NO_PROGRESS_MS && !p1Disc && !p2Disc) {
        if (!room.stalemateNoticeAt) {
          room.stalemateNoticeAt = now;
          console.warn(`[ChessClockWatchdog] ${code}: no progress for ${Math.round(sinceApply / 1000)}s, idle handler will be triggered next tick`);
          if (needed) {
            try {
              handleChessClockIdleLimit(room, needed, io);
            } catch (err) {
              console.error(`[ChessClockWatchdog] ${code}: forced idle handler failed:`, err instanceof Error ? err.message : err);
            }
          }
        }
      }
    } catch (err) {
      console.error(`[ChessClockWatchdog] ${code} error:`, err instanceof Error ? err.message : err);
    }
  }
}

const SEALED_TIMEOUT_MS = 15 * 60 * 1000;

export const rooms = new Map<string, RoomData>();
const playerRooms = new Map<string, string>(); // socketId -> roomCode
const userNames = new Map<string, string>(); // userId -> username (populated on auth:register)
const chatRateLimit = new Map<string, number[]>(); // userId -> recent message timestamps
const chatLastSentAt = new Map<string, number>();
const CHAT_RATE_WINDOW_MS = 10_000;
const CHAT_RATE_MAX = 8;
const MATCHMAKING_ROOM_TTL_MS = 5 * 60 * 1000; // 5 min stale room cleanup
let ioInstance: SocketIOServer | null = null; // Stored for getPublicRoomList socket liveness check

export function getSocketIO(): SocketIOServer | null {
  return ioInstance;
}


let bannedCardCache: Map<string, string | null> | null = null; // cardId -> reason
let bannedCardCacheTime = 0;
const BAN_CACHE_TTL = 60_000;

async function getBannedCards(): Promise<Map<string, string | null>> {
  if (bannedCardCache && Date.now() - bannedCardCacheTime < BAN_CACHE_TTL) return bannedCardCache;
  const banned = await prisma.bannedCard.findMany() as Array<{ cardId: string; reason?: string | null }>;
  bannedCardCache = new Map(banned.map(b => [b.cardId, b.reason ?? null]));
  bannedCardCacheTime = Date.now();
  return bannedCardCache;
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function getActiveTournamentMatchForUser(
  userId: string,
  targetRoomCode?: string,
): Promise<{ id: string; roomCode: string | null } | null> {
  const candidates = await prisma.tournamentMatch.findMany({
    where: {
      status: { in: ['ready', 'in_progress'] },
      OR: [{ player1Id: userId }, { player2Id: userId }],
      tournament: { status: 'in_progress' },
    },
    select: { id: true, roomCode: true, round: true, matchIndex: true },
    orderBy: [{ round: 'desc' }, { matchIndex: 'asc' }],
  });
  if (candidates.length === 0) return null;
  if (targetRoomCode) {
    const self = candidates.find((c) => c.roomCode === targetRoomCode);
    if (self) return { id: self.id, roomCode: self.roomCode };
  }
  const first = candidates[0];
  return { id: first.id, roomCode: first.roomCode };
}

async function isUserGameBanned(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { gameBanned: true, gameBanUntil: true },
  });
  if (!u || !u.gameBanned) return false;
  if (u.gameBanUntil && u.gameBanUntil < new Date()) return false;
  return true;
}


function cleanupPlayerRoom(socket: Socket): void {
  const existingCode = playerRooms.get(socket.id);
  if (!existingCode) return;
  const existingRoom = rooms.get(existingCode);
  if (!existingRoom) {
    playerRooms.delete(socket.id);
    return;
  }
  
  if (existingRoom.tournamentId) {
    if (existingRoom.hostSocket === socket.id) existingRoom.hostSocket = '';
    if (existingRoom.guestSocket === socket.id) existingRoom.guestSocket = null;
    playerRooms.delete(socket.id);
    return;
  }

  if (existingRoom.hostSocket === socket.id && !existingRoom.gameState) {
    if (existingRoom.sealedTimer) clearTimeout(existingRoom.sealedTimer);
    clearChessClockTimers(existingRoom);
    rooms.delete(existingCode);
    socket.leave(existingCode);
  }

  if (existingRoom.guestSocket === socket.id) {
    existingRoom.guestId = null;
    existingRoom.guestSocket = null;
    existingRoom.guestDeck = null;
    socket.leave(existingCode);
  }
  playerRooms.delete(socket.id);
}


function getPublicRoomList(): Array<{ code: string; hostName: string; gameMode: string; createdAt: number; isEvolving: boolean; holoHue: number | null; isRanked: boolean; isAnonymous: boolean; sealedSetChoice: string | null }> {
  const list: Array<{ code: string; hostName: string; gameMode: string; createdAt: number; isEvolving: boolean; holoHue: number | null; isRanked: boolean; isAnonymous: boolean; sealedSetChoice: string | null }> = [];
  const staleRoomCodes: string[] = [];
  for (const [code, room] of rooms) {
    if (room.isPrivate) continue;
    if (room.guestId) continue; // Already has a guest
    if (room.gameState) continue; // Game already started

    if (room.hostSocket && ioInstance) {
      const hostSock = ioInstance.sockets.sockets.get(room.hostSocket);
      if (!hostSock || !hostSock.connected) {
        staleRoomCodes.push(code);
        continue;
      }
    }
    list.push({
      code: room.code,
      hostName: room.isAnonymous ? '__anonymous__' : (room.hostName ?? 'Unknown'),
      gameMode: room.gameMode,
      createdAt: room.createdAt,
      isEvolving: room.isEvolving === true,
      holoHue: room.holoHue ?? null,
      isRanked: room.isRanked === true,
      isAnonymous: room.isAnonymous === true,
      sealedSetChoice: room.gameMode === 'sealed' ? (room.sealedSetChoice ?? 'random') : null,
    });
  }
  
  for (const code of staleRoomCodes) {
    const room = rooms.get(code);
    if (room?.hostSocket) playerRooms.delete(room.hostSocket);
    if (room) clearChessClockTimers(room);
    rooms.delete(code);
  }
  return list;
}

function broadcastRoomList(io: SocketIOServer): void {
  io.to('lobby').emit('room:list-update', getPublicRoomList());
}

async function emitChatLockStateToRoom(io: SocketIOServer, room: RoomData): Promise<void> {
  if (!room.guestId) return;
  try {
    const [pairForHost, hostFlags, guestFlags] = await Promise.all([
      getPairChatState(room.hostId, room.guestId),
      getModerationFlags(room.hostId),
      getModerationFlags(room.guestId),
    ]);
    if (room.hostSocket) {
      io.to(room.hostSocket).emit('chat:lock-state', {
        state: pairForHost.publicState,
        opponent: { userId: room.guestId, username: room.guestName ?? 'Player 2' },
        friendStatus: pairForHost.friendStatusForA,
        friendshipId: pairForHost.friendshipId,
        muted: hostFlags.muted,
        mutedUntilTs: hostFlags.mutedUntil ? hostFlags.mutedUntil.getTime() : null,
      });
    }
    if (room.guestSocket) {
      io.to(room.guestSocket).emit('chat:lock-state', {
        state: pairForHost.publicState,
        opponent: { userId: room.hostId, username: room.hostName ?? 'Player 1' },
        friendStatus: pairForHost.friendStatusForB,
        friendshipId: pairForHost.friendshipId,
        muted: guestFlags.muted,
        mutedUntilTs: guestFlags.mutedUntil ? guestFlags.mutedUntil.getTime() : null,
      });
    }
  } catch { /* ignore lock state errors */ }
}

function refreshChatLockForUsers(io: SocketIOServer, userIdA: string, userIdB?: string): void {
  for (const room of rooms.values()) {
    if (!room.guestId) continue;
    const ids = [room.hostId, room.guestId];
    const touchesA = ids.includes(userIdA);
    const touchesB = userIdB ? ids.includes(userIdB) : true;
    if (touchesA && touchesB) {
      void emitChatLockStateToRoom(io, room);
    }
  }
}

function broadcastActiveGames(io: SocketIOServer): void {
  const activeGames: Array<{
    roomCode: string; player1Name: string; player2Name: string;
    spectatorCount: number; turn: number; isRanked: boolean; isPrivate: boolean;
    isEvolving: boolean; holoHue: number | null; isAnonymous: boolean; phase: string;
  }> = [];

  const seenPlayerIds = new Set<string>();
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (!room.gameState || room.gameState.phase === 'gameOver') continue;
    if (room.finalized) continue;
    if (room.isPrivate) continue;
    if (now - room.createdAt > 2 * 60 * 60 * 1000) continue;
    if (room.player1DisconnectedAt && room.player2DisconnectedAt) continue;
    if (room.lastApplyActionAt && now - room.lastApplyActionAt > 10 * 60 * 1000) continue;
    if (seenPlayerIds.has(room.hostId) || (room.guestId && seenPlayerIds.has(room.guestId))) continue;
    seenPlayerIds.add(room.hostId);
    if (room.guestId) seenPlayerIds.add(room.guestId);
    activeGames.push({
      roomCode: code,
      player1Name: room.isAnonymous ? '__anonymous__' : (room.hostName ?? 'Player 1'),
      player2Name: room.isAnonymous ? '__anonymous__' : (room.guestName ?? 'Player 2'),
      spectatorCount: room.spectators.size,
      turn: room.gameState.turn,
      isRanked: room.isRanked,
      isPrivate: false,
      isEvolving: room.isEvolving === true,
      holoHue: room.holoHue ?? null,
      isAnonymous: room.isAnonymous === true,
      phase: room.gameState.phase,
    });
  }
  io.to('games-watchers').emit('games:list-update', { games: activeGames });
}


function cleanupStaleRooms(io: SocketIOServer): void {
  const now = Date.now();
  let cleaned = 0;
  const PRIVATE_EMPTY_TTL_MS = 30 * 60 * 1000;
  for (const [code, room] of rooms) {
    if (!room.guestId && !room.gameState) {
      const ttl = room.isPrivate ? PRIVATE_EMPTY_TTL_MS : MATCHMAKING_ROOM_TTL_MS;
      if (!room.createdAt || now - room.createdAt > ttl) {
        if (room.hostSocket) playerRooms.delete(room.hostSocket);
        if (room.sealedTimer) clearTimeout(room.sealedTimer);
        clearChessClockTimers(room);
        rooms.delete(code);
        cleaned++;
        continue;
      }
    }
    
    if (room.gameState && !room.finalized && room.player1DisconnectedAt && room.player2DisconnectedAt) {
      const oldestDisc = Math.min(room.player1DisconnectedAt, room.player2DisconnectedAt);
      if (now - oldestDisc > 10 * 60 * 1000) {
        console.warn(`[Cleanup] ${code}: zombie game, both players disconnected ${Math.round((now - oldestDisc) / 1000)}s, cancelling with no elo impact`);
        cancelGameNoElo(room, code, io, 'stalemate').catch(() => {
          if (room.hostSocket) playerRooms.delete(room.hostSocket);
          if (room.guestSocket) playerRooms.delete(room.guestSocket);
          for (const [, spec] of room.spectators) playerRooms.delete(spec.socketId);
          clearChessClockTimers(room);
          rooms.delete(code);
        });
        cleaned++;
        continue;
      }
    }

    if (room.finalized && room.gameState && now - (room.lastApplyActionAt ?? room.createdAt) > 10 * 60 * 1000) {
      if (room.hostSocket) playerRooms.delete(room.hostSocket);
      if (room.guestSocket) playerRooms.delete(room.guestSocket);
      for (const [, spec] of room.spectators) playerRooms.delete(spec.socketId);
      clearChessClockTimers(room);
      rooms.delete(code);
      cleaned++;
      continue;
    }

    if (room.gameState?.phase === 'gameOver' && now - room.createdAt > 10 * 60 * 1000) {
      if (room.hostSocket) playerRooms.delete(room.hostSocket);
      if (room.guestSocket) playerRooms.delete(room.guestSocket);
      for (const [, spec] of room.spectators) playerRooms.delete(spec.socketId);
      clearChessClockTimers(room);
      rooms.delete(code);
      cleaned++;
      continue;
    }

    if (now - room.createdAt > 4 * 60 * 60 * 1000) {
      if (room.hostSocket) playerRooms.delete(room.hostSocket);
      if (room.guestSocket) playerRooms.delete(room.guestSocket);
      for (const [, spec] of room.spectators) playerRooms.delete(spec.socketId);
      clearTournamentJoinTimer(room);
      clearChessClockTimers(room);
      rooms.delete(code);
      cleaned++;
    }
  }
  
  for (const [socketId, code] of playerRooms) {
    if (code.startsWith('spec:')) {
      if (!rooms.has(code.slice(5))) { playerRooms.delete(socketId); cleaned++; }
    } else {
      if (!rooms.has(code)) { playerRooms.delete(socketId); cleaned++; }
    }
  }
  if (cleaned > 0 || rooms.size > 10) {
    console.log(`[Cleanup] rooms=${rooms.size} playerRooms=${playerRooms.size} cleaned=${cleaned}`);
  }
}

function clearTournamentJoinTimer(room: RoomData): void {
  if (room.tournamentJoinTimer) {
    clearTimeout(room.tournamentJoinTimer);
    room.tournamentJoinTimer = null;
    room.tournamentJoinDeadline = null;
  }
}

export function isUserInAnotherLiveGame(
  userId: string | null | undefined,
  matchId: string | null | undefined,
): boolean {
  if (!userId) return false;
  for (const room of rooms.values()) {
    if (room.finalized) continue;
    if (!room.gameState) continue;
    if (room.gameState.phase === 'gameOver') continue;
    if (matchId && room.tournamentMatchId === matchId) continue;
    if (room.hostId === userId || room.guestId === userId) return true;
  }
  return false;
}

export function clearTournamentInviteTimer(room: RoomData): void {
  if (room.tournamentInviteTimer) {
    clearInterval(room.tournamentInviteTimer);
    room.tournamentInviteTimer = null;
  }
}

export function markSeatPresent(
  room: RoomData,
  seat: Seat,
  socketId: string,
  io: SocketIOServer,
): void {
  const previousSocket = seat === 'player1' ? room.hostSocket : room.guestSocket;
  if (previousSocket && previousSocket !== socketId) {
    playerRooms.delete(previousSocket);
    const oldSock = io.sockets.sockets.get(previousSocket);
    if (oldSock) {
      oldSock.leave(room.code);
      oldSock.emit('room:superseded', { code: room.code });
    }
  }
  if (seat === 'player1') {
    room.hostSocket = socketId;
    room.hostEverJoined = true;
    room.player1DisconnectedAt = null;
  } else {
    room.guestSocket = socketId;
    room.guestEverJoined = true;
    room.player2DisconnectedAt = null;
  }
  playerRooms.set(socketId, room.code);
  if (!room.lastSeatInputAt) room.lastSeatInputAt = { player1: 0, player2: 0 };

  const opponentSocket = seat === 'player1' ? room.guestSocket : room.hostSocket;
  if (opponentSocket && room.gameState) {
    io.to(opponentSocket).emit('game:opponent-reconnected');
  }
}

export function bindSeatFromLiveSockets(
  room: RoomData,
  seat: Seat,
  io: SocketIOServer,
): boolean {
  const userId = seat === 'player1' ? room.hostId : room.guestId;
  if (!userId) return false;
  const live = seatLiveness(room, seat, io);
  if (live.seatSocketAlive) return true;
  if (isUserInAnotherLiveGame(userId, room.tournamentMatchId ?? null)) return false;
  const registry = io?.sockets?.sockets;
  if (!registry || typeof registry.get !== 'function') return false;
  const candidates = getUserSocketIds(userId)
    .map((socketId) => registry.get(socketId))
    .filter((sock): sock is NonNullable<typeof sock> => !!sock && sock.connected)
    .sort((a, b) => Number(b.rooms?.has(room.code) ?? false) - Number(a.rooms?.has(room.code) ?? false));
  for (const sock of candidates) {
    const socketId = sock.id;
    markSeatPresent(room, seat, socketId, io);
    sock.join(room.code);
    if (room.tournamentId) sock.join(`tournament:${room.tournamentId}`);
    sock.emit('room:rejoined', {
      code: room.code,
      isSealed: room.isSealed,
      playerRole: seat,
      tournamentId: room.tournamentId ?? null,
    });
    console.log(`[Tournament] reconciled ${seat} of room ${room.code} onto live socket ${socketId}`);
    return true;
  }
  if (live.userHasLiveSocket) requestSeatRejoin(room, seat);
  return false;
}

export async function reconcileTournamentRoomSeats(
  room: RoomData,
  code: string,
  io: SocketIOServer,
): Promise<boolean> {
  if (!room.tournamentId) return false;
  if (room.finalized || room.gameState) return false;
  bindSeatFromLiveSockets(room, 'player1', io);
  bindSeatFromLiveSockets(room, 'player2', io);
  if (!room.hostSocket || !room.guestSocket) return false;
  return maybeStartTournamentGame(room, code, io);
}

export function isSeatSocketAlive(
  room: RoomData,
  seat: Seat,
  io: SocketIOServer | null,
): boolean {
  return seatLiveness(room, seat, io).seatSocketAlive;
}

async function reloadTournamentDecks(room: RoomData): Promise<void> {
  if (!room.tournamentId) return;
  if (room.hostDeck && room.guestDeck) return;
  if (room.isSealed) return;
  try {
    const participants = await prisma.tournamentParticipant.findMany({
      where: { tournamentId: room.tournamentId, userId: { in: [room.hostId, room.guestId ?? room.hostId] } },
      select: { userId: true, deckId: true },
    });
    for (const p of participants) {
      if (!p.deckId) continue;
      const isHostSeat = p.userId === room.hostId;
      if (isHostSeat && room.hostDeck) continue;
      if (!isHostSeat && room.guestDeck) continue;
      const deck = await prisma.deck.findUnique({ where: { id: p.deckId } });
      if (!deck) continue;
      const loaded = {
        characters: (deck.cardIds ?? []).map((id: string) => getCharacterById(id)).filter(Boolean) as CharacterCard[],
        missions: (deck.missionIds ?? []).map((id: string) => getMissionById(id)).filter(Boolean) as MissionCard[],
      };
      if (loaded.characters.length === 0 || loaded.missions.length === 0) continue;
      if (isHostSeat) {
        room.hostDeck = loaded;
        room.hostDeckId = p.deckId;
      } else {
        room.guestDeck = loaded;
        room.guestDeckId = p.deckId;
      }
      console.log(`[Socket] Re-hydrated tournament deck for ${isHostSeat ? 'host' : 'guest'} in room ${room.code}`);
    }
  } catch (err) {
    console.error('[Socket] reloadTournamentDecks failed:', err instanceof Error ? err.message : err);
  }
}

export const TOURNAMENT_MATCH_TIME_LIMIT_MS = 30 * 60_000;
export const TOURNAMENT_MATCH_EXTENSION_MS = 5 * 60_000;
export const TOURNAMENT_MATCH_PROGRESS_WINDOW_MS = 3 * 60_000;

export function tournamentMatchTimeLimitStillPlaying(
  room: Pick<RoomData, 'chessClock' | 'lastApplyActionAt' | 'createdAt'>,
  now: number,
): boolean {
  const lastProgress = room.lastApplyActionAt ?? room.createdAt ?? now;
  if (now - lastProgress >= TOURNAMENT_MATCH_PROGRESS_WINDOW_MS) return false;
  const snap = buildChessClockBroadcast(room.chessClock, now);
  return snap.player1.remainingMs > 0 && snap.player2.remainingMs > 0;
}

export function armTournamentGameTimer(
  room: RoomData,
  code: string,
  io: SocketIOServer,
  durationMs: number = TOURNAMENT_MATCH_TIME_LIMIT_MS,
): void {
  if (room.tournamentGameTimer) {
    clearTimeout(room.tournamentGameTimer);
    room.tournamentGameTimer = null;
  }
  const deadline = Date.now() + durationMs;
  const payload = { deadline, durationMs };
  if (room.hostSocket) io.to(room.hostSocket).emit('game:tournament-deadline', payload);
  if (room.guestSocket) io.to(room.guestSocket).emit('game:tournament-deadline', payload);
  room.tournamentGameTimer = setTimeout(() => {
    void onTournamentGameTimeLimit(room, code, io);
  }, durationMs);
}

async function onTournamentGameTimeLimit(
  room: RoomData,
  code: string,
  io: SocketIOServer,
): Promise<void> {
  room.tournamentGameTimer = null;
  if (!rooms.has(code)) return;
  if (!room.gameState || room.finalized) return;
  if (room.gameState.phase === 'gameOver') return;

  if (tournamentMatchTimeLimitStillPlaying(room, Date.now())) {
    console.log(`[Socket] Tournament time limit reached in room ${code} but the match is still being played, extending it instead of ending it`);
    armTournamentGameTimer(room, code, io, TOURNAMENT_MATCH_EXTENSION_MS);
    return;
  }

  console.log(`[Socket] Tournament game timer expired in room ${code}`);
  const p1Score = room.gameState.player1.missionPoints;
  const p2Score = room.gameState.player2.missionPoints;
  let loser: PlayerID;
  if (p1Score !== p2Score) {
    loser = p1Score > p2Score ? 'player2' : 'player1';
  } else {
    loser = room.gameState.edgeHolder === 'player1' ? 'player2' : 'player1';
  }
  try {
    room.gameState = GameEngine.applyAction(room.gameState, loser, { type: 'FORFEIT', reason: 'timeout' });
  } catch (err) {
    console.error('[Socket] Tournament time limit forfeit failed:', err instanceof Error ? err.message : err);
    return;
  }
  broadcastState(room, io);
  await finalizeGameEnd(room, code, io, 'timeout');
}

export const DECKLESS_CONFIRMATION_DELAY_MS = 30_000;

async function forfeitDecklessSeats(room: RoomData, io: SocketIOServer): Promise<boolean> {
  if (!room.tournamentId || !room.tournamentMatchId || room.isSealed) return false;
  if (room.hostDeck && room.guestDeck) return false;
  try {
    const { confirmedDecklessSeats, pickDoubleAbsenceLoser } = await import('@/lib/tournament/matchRulings');
    const deckless = await confirmedDecklessSeats(room.tournamentId, room.hostId, room.guestId ?? null);
    if (deckless.length === 0) {
      room.decklessSeenAt = null;
      return false;
    }
    const firstSeenAt = room.decklessSeenAt ?? null;
    if (!firstSeenAt) {
      room.decklessSeenAt = Date.now();
      console.log(`[Socket] Tournament match ${room.tournamentMatchId}: deck missing for ${deckless.join(', ')}, waiting for a second confirmation before deciding`);
      for (const userId of deckless) {
        emitToUser(userId, 'game:error', { message: 'Registered deck unavailable', errorKey: 'game.error.tournamentDeckMissing' });
      }
      return false;
    }
    if (Date.now() - firstSeenAt < DECKLESS_CONFIRMATION_DELAY_MS) return false;
    const handlers = await import('@/lib/socket/tournamentHandlers');
    const loser = deckless.length === 2
      ? await pickDoubleAbsenceLoser(room.tournamentId, deckless[0], deckless[1])
      : deckless[0];
    console.log(`[Socket] Tournament match ${room.tournamentMatchId}: ${loser} no longer has the deck they registered with, forfeiting that player`);
    await handlers.handleMatchForfeit(io, room.tournamentId, room.tournamentMatchId, loser);
    return true;
  } catch (err) {
    console.error('[Socket] forfeitDecklessSeats failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

export async function maybeStartTournamentGame(
  room: RoomData,
  code: string,
  io: SocketIOServer,
): Promise<boolean> {
  if (!room.tournamentId) return false;
  if (room.gameState || room.finalized || room.tournamentGameStarting) return false;
  if (!room.hostSocket || !room.guestSocket) return false;

  room.tournamentGameStarting = true;
  await reloadTournamentDecks(room);
  const startable = canStartTournamentGame({
    tournamentId: room.tournamentId,
    hostDeck: room.hostDeck,
    guestDeck: room.guestDeck,
    hostSocket: room.hostSocket,
    guestSocket: room.guestSocket,
    gameState: room.gameState,
    finalized: room.finalized,
    tournamentGameStarting: false,
  });
  if (!startable) {
    room.tournamentGameStarting = false;
    await forfeitDecklessSeats(room, io);
    return false;
  }

  try {
    const hostName = room.hostName ?? userNames.get(room.hostId) ?? 'Player 1';
    const guestName = room.guestName ?? (room.guestId ? userNames.get(room.guestId) : null) ?? 'Player 2';
    room.hostName = hostName;
    room.guestName = guestName;

    const config: GameConfig = {
      player1: { userId: room.hostId, isAI: false, deck: room.hostDeck!.characters, missionCards: room.hostDeck!.missions },
      player2: { userId: room.guestId!, isAI: false, deck: room.guestDeck!.characters, missionCards: room.guestDeck!.missions },
      gameMode: room.gameMode,
      ...buildEvolvingGameConfigExtras(room),
    };
    resetIdCounter();
    room.gameState = GameEngine.createGame(config);
    if (room.hostId) room.gameState.player1UserId = room.hostId;
    if (room.guestId) room.gameState.player2UserId = room.guestId;
    room.replayInitialState = deepClone(room.gameState);
    room.replayInitialState.actionHistory = [];
    room.replayStateSnapshots = [];
    room.replaySnapshotLogLengths = [];
    room.replayClockSnapshots = [];
    room.lastSeatInputAt = { player1: Date.now(), player2: Date.now() };
    room.player1DisconnectedAt = null;
    room.player2DisconnectedAt = null;

    clearTournamentJoinTimer(room);
    clearTournamentInviteTimer(room);

    syncChessClock(room);
    startChessClockTickLoop(room, io);
    const chessClock = buildChessClockBroadcast(room.chessClock, Date.now());
    const p1State = GameEngine.getVisibleStateForTransport(room.gameState, 'player1');
    const p2State = GameEngine.getVisibleStateForTransport(room.gameState, 'player2');
    const playerNames = { player1: hostName, player2: guestName };
    io.to(room.hostSocket).emit('game:state-update', { visibleState: packVisibleState(p1State), playerRole: 'player1', playerNames, chessClock });
    io.to(room.guestSocket).emit('game:state-update', { visibleState: packVisibleState(p2State), playerRole: 'player2', playerNames, chessClock });
    io.to(room.hostSocket).emit('game:started');
    io.to(room.guestSocket).emit('game:started');
    console.log(`[Socket] Tournament game auto-started in room ${code}`);

    if (room.tournamentMatchId) {
      clearTournamentMatchTimers(room.tournamentMatchId);
    }

    if (room.gameState.phase === 'mulligan') {
      armMulliganIdleTimer(room, code, io);
    }

    armTournamentGameTimer(room, code, io);
    return true;
  } catch (err) {
    console.error('[Socket] Tournament auto-start error:', err);
    return false;
  } finally {
    room.tournamentGameStarting = false;
  }
}


export type GameEndWinReason = 'score' | 'forfeit' | 'timeout' | 'clock' | 'idle' | 'disconnect';

async function finalizeGameEnd(
  room: RoomData,
  code: string,
  io: SocketIOServer,
  winReason: GameEndWinReason = 'score',
): Promise<void> {
  if (!room.gameState) return;
  if (room.finalized) {
    console.log(`[Socket] finalizeGameEnd skipped for room ${code}: already finalized`);
    return;
  }
  room.finalized = true;
  room.finalizedAt = Date.now();

  clearTournamentJoinTimer(room);
  if (room.sealedTimer) {
    clearTimeout(room.sealedTimer);
    room.sealedTimer = null;
    room.sealedDeadline = null;
  }
  if (room.tournamentGameTimer) {
    clearTimeout(room.tournamentGameTimer);
    room.tournamentGameTimer = null;
  }
  clearChessClockTimers(room);
  room.chessClock = disarmChessClock(room.chessClock, Date.now());
  room.chessClockLastInputKey = null;

  const winner = GameEngine.getWinner(room.gameState);
  if (!winner) {
    console.error(`[Socket] finalizeGameEnd called but no winner! phase=${room.gameState.phase} turn=${room.gameState.turn} pendingEffects=${room.gameState.pendingEffects.length} pendingActions=${room.gameState.pendingActions.length} p1Score=${room.gameState.player1.missionPoints} p2Score=${room.gameState.player2.missionPoints}`);
    console.warn(`[Socket] ${code}: resuming the room instead of leaving it finalized with no result`);
    room.finalized = false;
    room.finalizedAt = undefined;
    markRoomProgress(room);
    syncChessClock(room);
    startChessClockTickLoop(room, io);
    broadcastState(room, io);
    return;
  }

  const p1Score = room.gameState.player1.missionPoints;
  const p2Score = room.gameState.player2.missionPoints;

  const isForfeitEnd = winReason !== 'score';
  const loserId: PlayerID = winner === 'player1' ? 'player2' : 'player1';
  const loserBoardCount = room.gameState.activeMissions.reduce((acc, mission) => {
    const chars = loserId === 'player1' ? mission.player1Characters : mission.player2Characters;
    return acc + chars.length;
  }, 0);
  const winnerScore = winner === 'player1' ? p1Score : p2Score;
  const loserScore = winner === 'player1' ? p2Score : p1Score;
  const performanceBonus = calculatePerformanceBonus({
    winnerScore,
    loserScore,
    loserBoardCount,
    isForfeit: isForfeitEnd,
    winReason,
  });

  let eloData: { player1Delta: number; player2Delta: number; player1NewElo: number; player2NewElo: number; player1TotalGames: number; player2TotalGames: number; performanceBonus: PerformanceBonus | null } | null = null;

  import('@/lib/db/gameCleanup')
    .then(({ cleanupOldGames }) => cleanupOldGames())
    .catch(() => {});


  const isEvolving = room.isEvolving === true;
  const eloField: 'elo' | 'evolvingElo' = isEvolving ? 'evolvingElo' : 'elo';
  const eloType: 'ranked' | 'evolving' = isEvolving ? 'evolving' : 'ranked';
  const winsField: 'wins' | 'evolvingWins' = isEvolving ? 'evolvingWins' : 'wins';
  const lossesField: 'losses' | 'evolvingLosses' = isEvolving ? 'evolvingLosses' : 'losses';
  const getElo = (u: { elo: number; evolvingElo?: number | null }): number =>
    isEvolving ? (u.evolvingElo ?? 500) : u.elo;
  const buildWinStats = () => ({ [winsField]: { increment: 1 } });
  const buildLossStats = () => ({ [lossesField]: { increment: 1 } });
  const getTotalGames = (u: { wins: number; losses: number; draws: number; evolvingWins?: number | null; evolvingLosses?: number | null; evolvingDraws?: number | null }): number =>
    isEvolving
      ? ((u.evolvingWins ?? 0) + (u.evolvingLosses ?? 0) + (u.evolvingDraws ?? 0))
      : (u.wins + u.losses + u.draws);

  if (!room.isRanked && (winner === 'player1' || winner === 'player2')) {
    const modeKey = unrankedModeKey(room);
    const sides: Array<[string | null | undefined, 'player1' | 'player2']> = [
      [room.hostId, 'player1'],
      [room.guestId, 'player2'],
    ];
    for (const [uid, side] of sides) {
      if (!uid) continue;
      const won = winner === side;
      prisma.userModeStat.upsert({
        where: { userId_mode: { userId: uid, mode: modeKey } },
        create: { userId: uid, mode: modeKey, games: 1, wins: won ? 1 : 0, losses: won ? 0 : 1 },
        update: {
          games: { increment: 1 },
          wins: { increment: won ? 1 : 0 },
          losses: { increment: won ? 0 : 1 },
        },
      }).catch((err) => {
        console.error('[Socket] userModeStat upsert error:', err instanceof Error ? err.message : err);
      });
    }
  }

  try {
    if (room.isRanked && room.hostId && room.guestId) {
      const [player1, player2] = await Promise.all([
        prisma.user.findUnique({ where: { id: room.hostId } }),
        prisma.user.findUnique({ where: { id: room.guestId! } }),
      ]);

      const onlyOneExists = (player1 && !player2) || (!player1 && player2);
      if (onlyOneExists) {
        const survivor = player1 ?? player2!;
        const survivorIsP1 = !!player1;
        const survivorWon = (survivorIsP1 && winner === 'player1') || (!survivorIsP1 && winner === 'player2');
        const result: 'win' | 'loss' = survivorWon ? 'win' : 'loss';
        const delta = survivorWon ? 10 : -24;
        const oldElo = getElo(survivor);
        const newElo = Math.max(100, oldElo + delta);
        const stats = survivorWon ? buildWinStats() : buildLossStats();
        const updated = await prisma.user.update({
          where: { id: survivor.id },
          data: {
            [eloField]: newElo, ...stats,
            consecutiveWins: survivorWon ? (survivor.consecutiveWins ?? 0) + 1 : 0,
            consecutiveLosses: survivorWon ? 0 : (survivor.consecutiveLosses ?? 0) + 1,
            ...(isEvolving ? { evolvingGamesPlayed: { increment: 1 } } : {}),
          } as never,
        });
        const updatedElo = getElo(updated);
        eloData = {
          player1Delta: survivorIsP1 ? (newElo - oldElo) : 0,
          player2Delta: survivorIsP1 ? 0 : (newElo - oldElo),
          player1NewElo: survivorIsP1 ? updatedElo : 0,
          player2NewElo: survivorIsP1 ? 0 : updatedElo,
          player1TotalGames: survivorIsP1 ? getTotalGames(updated) : 0,
          player2TotalGames: survivorIsP1 ? 0 : getTotalGames(updated),
          performanceBonus: null,
        };
        prisma.eloHistory.create({
          data: {
            userId: survivor.id,
            opponentId: survivorIsP1 ? room.guestId! : room.hostId,
            opponentUsername: 'deleted_user',
            opponentElo: 0,
            oldElo,
            newElo: updatedElo,
            delta: newElo - oldElo,
            result,
            myScore: survivorIsP1 ? p1Score : p2Score,
            opponentScore: survivorIsP1 ? p2Score : p1Score,
            isRanked: true,
            eloType,
            isForfeit: isForfeitEnd,
          },
        }).catch((err) => {
          console.warn('[Socket] EloHistory write failed (one-side):', err instanceof Error ? err.message : err);
        });
        if (!isEvolving) {
          syncDiscordRole(survivor.id).catch(() => {});
          const oldTotal = survivor.wins + survivor.losses + survivor.draws;
          sendRankUpNotification(survivor.username, survivor.discordId, oldElo, updatedElo, oldTotal, oldTotal + 1).catch(() => {});
        }
      } else if (player1 && player2) {
        const p1OldElo = getElo(player1);
        const p2OldElo = getElo(player2);
        const rawChanges = calculateEloChanges({
          player1Elo: p1OldElo,
          player2Elo: p2OldElo,
          winner: winner === 'player1' ? 'player1' : 'player2',
          player1Score: p1Score,
          player2Score: p2Score,
          player1ConsecWins: player1.consecutiveWins ?? 0,
          player1ConsecLosses: player1.consecutiveLosses ?? 0,
          player2ConsecWins: player2.consecutiveWins ?? 0,
          player2ConsecLosses: player2.consecutiveLosses ?? 0,
          performanceBonus,
        });

        const changes = rawChanges;

        const p1Stats = winner === 'player1' ? buildWinStats() : buildLossStats();
        const p2Stats = winner === 'player2' ? buildWinStats() : buildLossStats();

        const [updatedP1, updatedP2] = await Promise.all([
          prisma.user.update({
            where: { id: room.hostId },
            data: {
              [eloField]: changes.player1NewElo, ...p1Stats,
              consecutiveWins: changes.player1NewConsecWins,
              consecutiveLosses: changes.player1NewConsecLosses,
              ...(isEvolving ? { evolvingGamesPlayed: { increment: 1 } } : {}),
            } as never,
          }),
          prisma.user.update({
            where: { id: room.guestId! },
            data: {
              [eloField]: changes.player2NewElo, ...p2Stats,
              consecutiveWins: changes.player2NewConsecWins,
              consecutiveLosses: changes.player2NewConsecLosses,
              ...(isEvolving ? { evolvingGamesPlayed: { increment: 1 } } : {}),
            } as never,
          }),
        ]);

        eloData = {
          player1Delta: changes.player1Delta,
          player2Delta: changes.player2Delta,
          player1NewElo: getElo(updatedP1),
          player2NewElo: getElo(updatedP2),
          player1TotalGames: getTotalGames(updatedP1),
          player2TotalGames: getTotalGames(updatedP2),
          performanceBonus: changes.performanceBonus,
        };

        if (!isEvolving && room.hostId && room.guestId) {
          const ELO_TIER_THRESHOLDS: Array<{ tier: string; minElo: number }> = [
            { tier: 'genin', minElo: 450 },
            { tier: 'chunin', minElo: 550 },
            { tier: 'special_jonin', minElo: 700 },
            { tier: 'elite_jonin', minElo: 1000 },
            { tier: 'legendary_sannin', minElo: 1200 },
            { tier: 'kage', minElo: 1700 },
            { tier: 'sage', minElo: 2000 },
            { tier: 'will_of_fire', minElo: 2500 },
          ];
          const checkTier = (userId: string, oldElo: number, newElo: number): void => {
            for (const t of ELO_TIER_THRESHOLDS) {
              if (oldElo < t.minElo && newElo >= t.minElo) {
                emitQuestEvent('elo.tier.reached', userId, { gameMode: 'ranked', tier: t.tier });
              }
            }
          };
          checkTier(room.hostId, getElo(player1!), changes.player1NewElo);
          checkTier(room.guestId, getElo(player2!), changes.player2NewElo);
        }

        if (!isEvolving && room.hostId && room.guestId) {
          const p1Wins = changes.player1NewConsecWins;
          const p2Wins = changes.player2NewConsecWins;
          if (p1Wins >= 2) emitQuestEvent('ranked.win.streak', room.hostId, { gameMode: 'ranked', streak: p1Wins });
          if (p2Wins >= 2) emitQuestEvent('ranked.win.streak', room.guestId, { gameMode: 'ranked', streak: p2Wins });

          const winnerIsP1 = winner === 'player1';
          const winnerUserId = winnerIsP1 ? room.hostId : room.guestId;
          const winnerDeck = winnerIsP1 ? room.hostDeck : room.guestDeck;
          if (winnerDeck && winnerUserId) {
            const charNames = winnerDeck.characters.map((c) => c.name_fr.toUpperCase());
            const groups = new Set(winnerDeck.characters.map((c) => c.group).filter(Boolean));
            const monoGroup = groups.size === 1 ? Array.from(groups)[0] : undefined;
            if (monoGroup) {
              emitQuestEvent('ranked.win.deck', winnerUserId, { gameMode: 'ranked', monoGroup });
            }
            emitQuestEvent('ranked.win.deck.contains', winnerUserId, { gameMode: 'ranked', names: charNames });
            const allHighPower = winnerDeck.characters.every((c) => (c.power ?? 0) >= 4);
            if (allHighPower) {
              emitQuestEvent('match.won.deck.power_minimum', winnerUserId, { gameMode: 'ranked', minPrinted: 4 });
            }
          }
        }

        const p1Result: 'win' | 'loss' = winner === 'player1' ? 'win' : 'loss';
        const p2Result: 'win' | 'loss' = winner === 'player2' ? 'win' : 'loss';
        const [e1, e2] = await Promise.all([
          prisma.eloHistory.create({
            data: {
              userId: room.hostId!,
              opponentId: room.guestId!,
              opponentUsername: player2.username,
              opponentElo: p2OldElo,
              oldElo: p1OldElo,
              newElo: changes.player1NewElo,
              delta: changes.player1Delta,
              result: p1Result,
              myScore: p1Score,
              opponentScore: p2Score,
              isRanked: true,
              eloType,
              isForfeit: isForfeitEnd,
            },
          }).catch((err) => { console.warn('[Socket] EloHistory write 1 failed:', err instanceof Error ? err.message : err); return null; }),
          prisma.eloHistory.create({
            data: {
              userId: room.guestId!,
              opponentId: room.hostId!,
              opponentUsername: player1.username,
              opponentElo: p1OldElo,
              oldElo: p2OldElo,
              newElo: changes.player2NewElo,
              delta: changes.player2Delta,
              result: p2Result,
              myScore: p2Score,
              opponentScore: p1Score,
              isRanked: true,
              eloType,
              isForfeit: isForfeitEnd,
            },
          }).catch((err) => { console.warn('[Socket] EloHistory write 2 failed:', err instanceof Error ? err.message : err); return null; }),
        ]);
        room.pendingEloHistoryIds = [e1?.id, e2?.id].filter((x): x is string => !!x);

        if (!isEvolving) {
          syncDiscordRole(room.hostId).catch(() => {});
          syncDiscordRole(room.guestId!).catch(() => {});

          const p1OldTotal = player1.wins + player1.losses + player1.draws;
          const p2OldTotal = player2.wins + player2.losses + player2.draws;
          sendRankUpNotification(player1.username, player1.discordId, p1OldElo, changes.player1NewElo, p1OldTotal, p1OldTotal + 1).catch(() => {});
          sendRankUpNotification(player2.username, player2.discordId, p2OldElo, changes.player2NewElo, p2OldTotal, p2OldTotal + 1).catch(() => {});
        }
      }
    }
  } catch (eloErr) {
    const errMsg = eloErr instanceof Error ? eloErr.message : String(eloErr);
    console.error('[Socket] ELO update error:', errMsg);

    if (room.isRanked && room.hostId && room.guestId) {
      const isQuotaErr = (m: string) => m.includes('quota') || m.includes('AtlasError') || m.includes('disk');

      const attemptEloUpdate = async (label: string): Promise<boolean> => {
        try {
          const [p1Retry, p2Retry] = await Promise.all([
            prisma.user.findUnique({ where: { id: room.hostId! } }),
            prisma.user.findUnique({ where: { id: room.guestId! } }),
          ]);
          if (!p1Retry || !p2Retry) return false;
          const p1RetryOldElo = getElo(p1Retry);
          const p2RetryOldElo = getElo(p2Retry);
          const retryChanges = calculateEloChanges({
            player1Elo: p1RetryOldElo, player2Elo: p2RetryOldElo,
            winner: winner === 'player1' ? 'player1' : 'player2',
            player1Score: p1Score, player2Score: p2Score,
            player1ConsecWins: p1Retry.consecutiveWins ?? 0, player1ConsecLosses: p1Retry.consecutiveLosses ?? 0,
            player2ConsecWins: p2Retry.consecutiveWins ?? 0, player2ConsecLosses: p2Retry.consecutiveLosses ?? 0,
            performanceBonus,
          });
          const p1S = winner === 'player1' ? buildWinStats() : buildLossStats();
          const p2S = winner === 'player2' ? buildWinStats() : buildLossStats();
          const [uP1, uP2] = await Promise.all([
            prisma.user.update({ where: { id: room.hostId! }, data: { [eloField]: retryChanges.player1NewElo, ...p1S, consecutiveWins: retryChanges.player1NewConsecWins, consecutiveLosses: retryChanges.player1NewConsecLosses, ...(isEvolving ? { evolvingGamesPlayed: { increment: 1 } } : {}) } as never }),
            prisma.user.update({ where: { id: room.guestId! }, data: { [eloField]: retryChanges.player2NewElo, ...p2S, consecutiveWins: retryChanges.player2NewConsecWins, consecutiveLosses: retryChanges.player2NewConsecLosses, ...(isEvolving ? { evolvingGamesPlayed: { increment: 1 } } : {}) } as never }),
          ]);
          eloData = { player1Delta: retryChanges.player1Delta, player2Delta: retryChanges.player2Delta, player1NewElo: getElo(uP1), player2NewElo: getElo(uP2), player1TotalGames: getTotalGames(uP1), player2TotalGames: getTotalGames(uP2), performanceBonus: retryChanges.performanceBonus };
          console.log(`[Socket] ELO retry (${label}) succeeded`);
          prisma.eloHistory.create({
            data: {
              userId: room.hostId!, opponentId: room.guestId!, opponentUsername: p2Retry.username, opponentElo: p2RetryOldElo,
              oldElo: p1RetryOldElo, newElo: retryChanges.player1NewElo, delta: retryChanges.player1Delta,
              result: winner === 'player1' ? 'win' : 'loss', myScore: p1Score, opponentScore: p2Score, isRanked: true,
              eloType, isForfeit: isForfeitEnd,
            },
          }).catch((e) => console.warn(`[Socket] EloHistory write 1 (${label}) failed:`, e instanceof Error ? e.message : e));
          prisma.eloHistory.create({
            data: {
              userId: room.guestId!, opponentId: room.hostId!, opponentUsername: p1Retry.username, opponentElo: p1RetryOldElo,
              oldElo: p2RetryOldElo, newElo: retryChanges.player2NewElo, delta: retryChanges.player2Delta,
              result: winner === 'player2' ? 'win' : 'loss', myScore: p2Score, opponentScore: p1Score, isRanked: true,
              eloType, isForfeit: isForfeitEnd,
            },
          }).catch((e) => console.warn(`[Socket] EloHistory write 2 (${label}) failed:`, e instanceof Error ? e.message : e));
          return true;
        } catch (retryErr) {
          const m = retryErr instanceof Error ? retryErr.message : String(retryErr);
          console.error(`[Socket] ELO retry (${label}) failed:`, m);
          return isQuotaErr(m);
        }
      };

      if (isQuotaErr(errMsg)) {
        try {
          const { GAME_TTL_MS } = await import('@/lib/db/gameCleanup');
          const cutoff = new Date(Date.now() - GAME_TTL_MS);
          const purge = await prisma.game.deleteMany({ where: { completedAt: { lt: cutoff }, status: 'completed' } });
          console.warn(`[Socket] Quota recovery (ELO tier-1): purged ${purge.count} TTL-expired games before retry`);
        } catch (cleanupErr) {
          console.error('[Socket] Quota recovery cleanup failed:', cleanupErr instanceof Error ? cleanupErr.message : cleanupErr);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
      const tier1Ok = await attemptEloUpdate('tier-1');

      if (!tier1Ok && !eloData) {
        try {
          const purge = await prisma.game.deleteMany({ where: { status: 'completed' } });
          console.warn(`[Socket] Last-resort recovery (ELO tier-2): purged ALL ${purge.count} completed games to save ELO`);
        } catch (nukeErr) {
          console.error('[Socket] Last-resort purge failed:', nukeErr instanceof Error ? nukeErr.message : nukeErr);
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
        const tier2Ok = await attemptEloUpdate('tier-2');
        if (!tier2Ok && !eloData) {
          console.error('[Socket] ELO update failed after full purge, DB unrecoverable');
        }
      }
    }
  }

  const replayData = room.gameState ? {
    log: room.gameState.log,
    playerNames: {
      player1: room.hostName ?? 'Player 1',
      player2: room.guestName ?? 'Player 2',
    },
    finalMissions: room.gameState.activeMissions.map(m => ({
      name_fr: m.card.name_fr,
      rank: m.rank,
      basePoints: m.basePoints,
      rankBonus: m.rankBonus,
      wonBy: m.wonBy ?? null,
    })),
    initialState: room.replayInitialState,
    actionHistory: room.gameState.actionHistory ?? [],
  } : null;

  try {
    if (room.gameState) {
      emitFinalizeQuests(room, winner, winReason, room.gameState.turn);
    }
  } catch (err) {
    console.error('[quests] emitFinalizeQuests error:', err instanceof Error ? err.message : err);
  }

  const perfForHost = winner === 'player1' ? eloData?.performanceBonus ?? null : null;
  const perfForGuest = winner === 'player2' ? eloData?.performanceBonus ?? null : null;

  const hostEndPayload = {
    winner,
    player1Score: p1Score,
    player2Score: p2Score,
    isRanked: room.isRanked,
    isEvolving,
    eloDelta: eloData?.player1Delta ?? null,
    newElo: eloData?.player1NewElo,
    totalGames: eloData?.player1TotalGames,
    winReason,
    gameId: null,
    replayData,
    tournamentId: room.tournamentId ?? null,
    performanceBonus: perfForHost,
  };
  const guestEndPayload = {
    winner,
    player1Score: p1Score,
    player2Score: p2Score,
    isRanked: room.isRanked,
    isEvolving,
    eloDelta: eloData?.player2Delta ?? null,
    newElo: eloData?.player2NewElo,
    totalGames: eloData?.player2TotalGames,
    winReason,
    gameId: null,
    replayData,
    tournamentId: room.tournamentId ?? null,
    performanceBonus: perfForGuest,
  };
  room.finalBroadcast = { event: 'game:ended', player1: hostEndPayload, player2: guestEndPayload };

  if (room.hostSocket) {
    io.to(room.hostSocket).emit('game:ended', hostEndPayload);
  }
  if (room.guestSocket) {
    io.to(room.guestSocket).emit('game:ended', guestEndPayload);
  }

  broadcastActiveGames(io);

  if (room.hostId && room.guestId && (room.hostDeckId || room.guestDeckId)) {
    const p1Result: 'win' | 'loss' | 'draw' = winner === 'player1' ? 'win' : winner === 'player2' ? 'loss' : 'draw';
    const p2Result: 'win' | 'loss' | 'draw' = winner === 'player2' ? 'win' : winner === 'player1' ? 'loss' : 'draw';
    const p1Delta = eloData?.player1Delta ?? 0;
    const p2Delta = eloData?.player2Delta ?? 0;
    import('@/lib/db/deckStats').then(({ recordDeckGame }) => {
      if (room.hostDeckId) recordDeckGame(room.hostDeckId, room.hostId, p1Result, p1Delta).catch(() => {});
      if (room.guestDeckId) recordDeckGame(room.guestDeckId, room.guestId!, p2Result, p2Delta).catch(() => {});
    }).catch(() => {});
  }

  if (room.tournamentId && room.tournamentMatchId && room.hostId && room.guestId) {
    const tournamentWinnerIdEarly = winner === 'player1' ? room.hostId : room.guestId;
    handleTournamentMatchEnd(io, room.tournamentId, room.tournamentMatchId, tournamentWinnerIdEarly, null).catch((err) => {
      console.error('[Socket] Tournament match end error:', err);
    });
  }

  (async () => {
    if (!room.hostId || !room.guestId) return;

    const replayForDb = room.gameState ? {
      log: room.gameState.log,
      playerNames: {
        player1: room.hostName ?? 'Player 1',
        player2: room.guestName ?? 'Player 2',
      },
      finalMissions: room.gameState.activeMissions.map(m => ({
        name_fr: m.card.name_fr,
        rank: m.rank,
        basePoints: m.basePoints,
        rankBonus: m.rankBonus,
        wonBy: m.wonBy ?? null,
      })),
      initialState: room.replayInitialState,
      actionHistory: room.gameState.actionHistory ?? [],
      stateSnapshots: room.replayStateSnapshots ?? null,
      snapshotLogLengths: room.replaySnapshotLogLengths ?? null,
      clockSnapshots: room.replayClockSnapshots ?? null,
    } : null;

    const baseData = {
      player1Id: room.hostId,
      player2Id: room.guestId,
      isAiGame: false,
      status: 'completed',
      winnerId: winner === 'player1' ? room.hostId : room.guestId,
      player1Score: p1Score,
      player2Score: p2Score,
      eloChange: eloData?.player1Delta ?? 0,
      isEvolving: room.isEvolving === true,
      completedAt: new Date(),
    };

    const { compressReplay } = await import('@/lib/db/replayCompression');
    type CompressedBuf = Uint8Array<ArrayBuffer>;

    const tryStates: Array<() => CompressedBuf | null> = [];
    if (replayForDb) {
      tryStates.push(() => {
        const buf = compressReplay(replayForDb);
        if (buf.length > 12_000_000) throw new Error(`compressed size ${(buf.length / 1_000_000).toFixed(1)}MB`);
        return buf;
      });
      tryStates.push(() => {
        const trimmed = { ...replayForDb, stateSnapshots: null, snapshotLogLengths: null, clockSnapshots: null };
        const buf = compressReplay(trimmed);
        if (buf.length > 12_000_000) throw new Error(`compressed size ${(buf.length / 1_000_000).toFixed(1)}MB`);
        return buf;
      });
      tryStates.push(() => {
        const trimmed = { ...replayForDb, stateSnapshots: null, snapshotLogLengths: null, clockSnapshots: null, actionHistory: [], log: replayForDb.log.slice(-200) };
        return compressReplay(trimmed);
      });
    }
    tryStates.push(() => null);

    let recordId: string | null = null;
    let lastErr: unknown = null;
    let ttlPurgeDone = false;
    let fullPurgeDone = false;
    for (let i = 0; i < tryStates.length; i++) {
      try {
        const gameStateGz = tryStates[i]();
        const record = await prisma.game.create({ data: { ...baseData, gameStateGz: gameStateGz ?? undefined } });
        recordId = record.id;
        if (i > 0) console.warn(`[Socket] Game saved on attempt ${i + 1} (replay data trimmed)`);
        break;
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        const isQuota = msg.includes('quota') || msg.includes('AtlasError') || msg.includes('disk');
        if (!ttlPurgeDone && isQuota) {
          ttlPurgeDone = true;
          try {
            const { GAME_TTL_MS } = await import('@/lib/db/gameCleanup');
            const cutoff = new Date(Date.now() - GAME_TTL_MS);
            const purge = await prisma.game.deleteMany({
              where: { completedAt: { lt: cutoff }, status: 'completed' },
            });
            console.warn(`[Socket] Quota recovery (save tier-1): purged ${purge.count} TTL-expired games, retrying`);
            i = -1;
            continue;
          } catch (cleanupErr) {
            console.error('[Socket] Quota recovery cleanup failed:', cleanupErr instanceof Error ? cleanupErr.message : cleanupErr);
          }
        } else if (!fullPurgeDone && isQuota) {
          fullPurgeDone = true;
          try {
            const purge = await prisma.game.deleteMany({ where: { status: 'completed' } });
            console.warn(`[Socket] Last-resort recovery (save tier-2): purged ALL ${purge.count} completed games`);
            i = -1;
            continue;
          } catch (nukeErr) {
            console.error('[Socket] Last-resort purge failed:', nukeErr instanceof Error ? nukeErr.message : nukeErr);
          }
        }
      }
    }

    if (!recordId) {
      console.error('[Socket] All Game.create attempts failed:', lastErr instanceof Error ? lastErr.message : lastErr);
      return;
    }

    console.log(`[Socket] Game saved: ${recordId} | winner=${winner} (${winner === 'player1' ? room.hostId : room.guestId}) | ranked=${room.isRanked} | elo=${eloData ? `p1:${eloData.player1Delta} p2:${eloData.player2Delta}` : 'none'}`);

    if (eloData && room.isEvolving !== true) {
      const deckIdsOf = (d: { characters: CharacterCard[]; missions: MissionCard[] } | null) =>
        d ? [...d.characters.map((c) => c.id), ...d.missions.map((m) => m.id)] : null;
      import('@/lib/cards/usageLive')
        .then(({ recordRankedDeckUsage }) => recordRankedDeckUsage([deckIdsOf(room.hostDeck), deckIdsOf(room.guestDeck)]))
        .catch(() => {});
    }

    if (room.pendingEloHistoryIds && room.pendingEloHistoryIds.length > 0) {
      await prisma.eloHistory.updateMany({
        where: { id: { in: room.pendingEloHistoryIds } },
        data: { gameId: recordId },
      }).catch((err) => {
        console.warn('[Socket] EloHistory link to gameId failed:', err instanceof Error ? err.message : err);
      });
    }

    if (room.hostSocket) io.to(room.hostSocket).emit('game:replay-ready', { gameId: recordId });
    if (room.guestSocket) io.to(room.guestSocket).emit('game:replay-ready', { gameId: recordId });

    if (room.tournamentId && room.tournamentMatchId) {
      await prisma.tournamentMatch.update({
        where: { id: room.tournamentMatchId },
        data: { gameId: recordId },
      }).catch((err) => {
        console.warn('[Socket] Tournament match gameId link failed:', err instanceof Error ? err.message : err);
      });
    }
  })();
}


export function armMulliganIdleTimer(
  room: RoomData,
  code: string,
  io: SocketIOServer,
): void {
  if (room.chessClockMulliganTimer) {
    clearTimeout(room.chessClockMulliganTimer);
    room.chessClockMulliganTimer = null;
  }
  if (!room.gameState || room.gameState.phase !== 'mulligan') return;
  if (room.gameState.player1.hasMulliganed && room.gameState.player2.hasMulliganed) return;
  if (room.finalized) return;

  const deadline = Date.now() + CHESS_CLOCK_MULLIGAN_IDLE_MS;
  room.mulliganDeadline = deadline;
  if (room.hostSocket) io.to(room.hostSocket).emit('game:mulligan-deadline', { deadline, durationMs: CHESS_CLOCK_MULLIGAN_IDLE_MS });
  if (room.guestSocket) io.to(room.guestSocket).emit('game:mulligan-deadline', { deadline, durationMs: CHESS_CLOCK_MULLIGAN_IDLE_MS });

  room.chessClockMulliganTimer = setTimeout(() => {
    handleMulliganIdleTimeout(room, code, io).catch((err) => {
      console.error('[ChessClock] handleMulliganIdleTimeout error:', err instanceof Error ? err.message : err);
    });
  }, CHESS_CLOCK_MULLIGAN_IDLE_MS);
}

function clearMulliganTimer(room: RoomData): void {
  if (room.chessClockMulliganTimer) {
    clearTimeout(room.chessClockMulliganTimer);
    room.chessClockMulliganTimer = null;
  }
  room.mulliganDeadline = null;
}

export type CancelGameReason = 'mulligan-idle' | 'stalemate';

export async function cancelGameNoElo(
  room: RoomData,
  code: string,
  io: SocketIOServer,
  reason: CancelGameReason,
): Promise<void> {
  if (!room.gameState || room.finalized) return;
  room.finalized = true;
  clearMulliganTimer(room);
  clearChessClockTimers(room);
  clearTournamentJoinTimer(room);
  if (room.sealedTimer) {
    clearTimeout(room.sealedTimer);
    room.sealedTimer = null;
    room.sealedDeadline = null;
  }
  if (room.tournamentGameTimer) {
    clearTimeout(room.tournamentGameTimer);
    room.tournamentGameTimer = null;
  }
  room.chessClock = disarmChessClock(room.chessClock, Date.now());
  room.chessClockLastInputKey = null;

  const cancelPayload = { reason, roomCode: code };
  room.finalBroadcast = { event: 'game:cancelled', player1: cancelPayload, player2: cancelPayload };
  if (room.hostSocket) io.to(room.hostSocket).emit('game:cancelled', cancelPayload);
  if (room.guestSocket) io.to(room.guestSocket).emit('game:cancelled', cancelPayload);
  if (room.spectators.size > 0) {
    io.to(`spec:${code}`).emit('game:cancelled', cancelPayload);
  }

  const gameId = room.gameState.gameId;
  if (gameId) {
    try {
      await prisma.game.deleteMany({ where: { id: gameId } });
    } catch (err) {
      console.warn(`[CancelGame] ${reason}: failed to delete game record:`, err instanceof Error ? err.message : err);
    }
  }

  broadcastActiveGames(io);

  setTimeout(() => {
    if (rooms.get(code) !== room) return;
    if (room.hostSocket) playerRooms.delete(room.hostSocket);
    if (room.guestSocket) playerRooms.delete(room.guestSocket);
    for (const [, spec] of room.spectators) playerRooms.delete(spec.socketId);
    rooms.delete(code);
  }, 5_000);
}

export async function handleMulliganIdleTimeout(
  room: RoomData,
  code: string,
  io: SocketIOServer,
): Promise<void> {
  if (!room.gameState || room.finalized) return;
  if (room.gameState.phase !== 'mulligan') return;
  if (room.gameState.player1.hasMulliganed && room.gameState.player2.hasMulliganed) return;

  const p1Done = room.gameState.player1.hasMulliganed;
  const p2Done = room.gameState.player2.hasMulliganed;
  console.log(`[ChessClock] ${code}: mulligan idle timeout -> cancelling game (p1Done=${p1Done} p2Done=${p2Done})`);

  room.finalized = true;
  clearMulliganTimer(room);
  clearChessClockTimers(room);
  clearTournamentJoinTimer(room);
  if (room.sealedTimer) {
    clearTimeout(room.sealedTimer);
    room.sealedTimer = null;
    room.sealedDeadline = null;
  }
  if (room.tournamentGameTimer) {
    clearTimeout(room.tournamentGameTimer);
    room.tournamentGameTimer = null;
  }
  room.chessClock = disarmChessClock(room.chessClock, Date.now());
  room.chessClockLastInputKey = null;

  const cancelPayload = { reason: 'mulligan-idle' as const, roomCode: code };
  room.finalBroadcast = { event: 'game:cancelled', player1: cancelPayload, player2: cancelPayload };
  if (room.hostSocket) io.to(room.hostSocket).emit('game:cancelled', cancelPayload);
  if (room.guestSocket) io.to(room.guestSocket).emit('game:cancelled', cancelPayload);
  if (room.spectators.size > 0) {
    io.to(`spec:${code}`).emit('game:cancelled', cancelPayload);
  }

  const gameId = room.gameState.gameId;
  if (gameId) {
    try {
      await prisma.game.deleteMany({ where: { id: gameId } });
    } catch (err) {
      console.warn('[ChessClock] failed to delete cancelled game record:', err instanceof Error ? err.message : err);
    }
  }

  if (room.tournamentId && room.tournamentMatchId) {
    try {
      const tInfo = await prisma.tournament.findUnique({
        where: { id: room.tournamentId },
        select: { format: true },
      });
      const missingSeatIsReachable = (seat: Seat): boolean => {
        const seatUserId = seat === 'player1' ? room.hostId : room.guestId;
        if (!seatUserId) return false;
        const live = seatLiveness(room, seat, io);
        return !live.seatSocketAlive && live.userHasLiveSocket;
      };
      const hostMissingSeat = !p1Done && !!room.hostId;
      const guestMissingSeat = !p2Done && !!room.guestId;
      const missingSeatReachable =
        (hostMissingSeat && missingSeatIsReachable('player1'))
        || (guestMissingSeat && missingSeatIsReachable('player2'));

      if (missingSeatReachable) {
        console.log(`[ChessClock] mulligan-idle in tournament match ${room.tournamentMatchId}: the player who did not answer is still online, reopening the match instead of forfeiting them`);
        try {
          const { reopenTournamentMatch } = await import('@/lib/socket/tournamentHandlers');
          await reopenTournamentMatch(io, room.tournamentId, room.tournamentMatchId, room.hostId, room.guestId);
        } catch (err) {
          console.error('[ChessClock] failed to reopen tournament match on mulligan-idle:', err instanceof Error ? err.message : err);
        }
      } else if (tInfo?.format === 'swiss') {
        const handlers = await import('@/lib/socket/tournamentHandlers');
        const hostMissing = hostMissingSeat;
        const guestMissing = guestMissingSeat;
        if (hostMissing && guestMissing) {
          console.log(`[ChessClock] mulligan-idle in Swiss tournament match ${room.tournamentMatchId}: neither player answered, triggering double absence`);
          await handlers.handleSwissDoubleAbsence(io, room.tournamentId, room.tournamentMatchId);
        } else {
          const missingId = hostMissing ? room.hostId : room.guestId;
          console.log(`[ChessClock] mulligan-idle in Swiss tournament match ${room.tournamentMatchId}: only ${hostMissing ? 'player1' : 'player2'} did not answer, forfeiting that player alone`);
          if (missingId) {
            await handlers.handleMatchForfeit(io, room.tournamentId, room.tournamentMatchId, missingId);
          }
        }
      } else {
        console.log(`[ChessClock] mulligan-idle in elimination tournament match ${room.tournamentMatchId}: reopening the match so it can be replayed`);
        try {
          const { reopenTournamentMatch } = await import('@/lib/socket/tournamentHandlers');
          await reopenTournamentMatch(io, room.tournamentId, room.tournamentMatchId, room.hostId, room.guestId);
        } catch (err) {
          console.error('[ChessClock] failed to reopen elimination tournament match on mulligan-idle:', err instanceof Error ? err.message : err);
        }
      }
    } catch (err) {
      console.error('[ChessClock] tournament mulligan-idle handler failed:', err instanceof Error ? err.message : err);
    }
  }

  broadcastActiveGames(io);

  setTimeout(() => {
    if (rooms.get(code) !== room) return;
    if (room.hostSocket) playerRooms.delete(room.hostSocket);
    if (room.guestSocket) playerRooms.delete(room.guestSocket);
    for (const [, spec] of room.spectators) playerRooms.delete(spec.socketId);
    rooms.delete(code);
  }, 5_000);
}

const EMPTY_HIDDEN_IDS: Set<string> = new Set();
const REVEAL_META_TTL_MS = 30_000;

async function computePlayerPrivilege(userId: string | null, username: string | undefined): Promise<boolean> {
  if (!userId) return false;
  if (isAdmin({ username: username ?? null })) return true;
  try {
    const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, email: true, username: true } });
    if (!dbUser) return false;
    if (isAdmin({ username: dbUser.username, email: dbUser.email })) return true;
    return dbUser.role === 'tester';
  } catch {
    return false;
  }
}

function ensureRevealMeta(room: RoomData): void {
  const now = Date.now();
  if (room.revealMetaLoading) return;
  if (room.revealMetaAt && now - room.revealMetaAt < REVEAL_META_TTL_MS) return;
  room.revealMetaLoading = true;
  Promise.all([
    getHiddenCardIds(),
    computePlayerPrivilege(room.hostId, room.hostName),
    computePlayerPrivilege(room.guestId, room.guestName),
  ])
    .then(([hidden, hostPriv, guestPriv]) => {
      room.hiddenIdsSnapshot = hidden;
      room.hostPrivileged = hostPriv;
      room.guestPrivileged = guestPriv;
      room.revealMetaAt = Date.now();
    })
    .catch(() => {})
    .finally(() => {
      room.revealMetaLoading = false;
    });
}

function stateForViewer(state: VisibleGameState, privileged: boolean, hiddenIds: Set<string>): VisibleGameState {
  if (privileged) return state;
  if (!stateHasUnrevealed(state, hiddenIds)) return state;
  return sanitizeUnrevealedForViewer(state, hiddenIds);
}

function broadcastState(room: RoomData, io: SocketIOServer): void {
  if (!room.gameState) return;
  ensureRevealMeta(room);
  const hiddenIds = room.hiddenIdsSnapshot ?? EMPTY_HIDDEN_IDS;
  const hostPrivileged = room.hostPrivileged ?? false;
  const guestPrivileged = room.guestPrivileged ?? false;

  syncChessClock(room);
  startChessClockTickLoop(room, io);
  const chessClock = buildChessClockBroadcast(room.chessClock, Date.now());

  const playerNames = {
    player1: room.hostName ?? 'Player 1',
    player2: room.guestName ?? 'Player 2',
  };
  try {
    const p1State = GameEngine.getVisibleStateForTransport(room.gameState, 'player1');
    const p2State = GameEngine.getVisibleStateForTransport(room.gameState, 'player2');

    if (room.hostSocket) {
      io.to(room.hostSocket).emit('game:state-update', {
        visibleState: packVisibleState(stateForViewer(p1State, hostPrivileged, hiddenIds)),
        playerRole: 'player1',
        playerNames,
        chessClock,
      });
    }
    if (room.guestSocket) {
      io.to(room.guestSocket).emit('game:state-update', {
        visibleState: packVisibleState(stateForViewer(p2State, guestPrivileged, hiddenIds)),
        playerRole: 'player2',
        playerNames,
        chessClock,
      });
    }

    
    if (room.spectators.size > 0) {
      
      const specMissions = p1State.activeMissions.map((m: any) => ({
        ...m,
        player1Characters: m.player1Characters.map((c: any) => c.isHidden && !c.wasRevealedAtLeastOnce
          ? { ...c, card: undefined, topCard: undefined, isOwn: false }
          : c
        ),
        player2Characters: m.player2Characters.map((c: any) => c.isHidden && !c.wasRevealedAtLeastOnce
          ? { ...c, card: undefined, topCard: undefined, isOwn: false }
          : c
        ),
      }));
      
      const p1HandSize = room.gameState.player1.hand.length;
      const p2HandSize = room.gameState.player2.hand.length;
      const spectatorState = {
        ...p1State,
        activeMissions: specMissions,
        myState: {
          ...p1State.myState,
          hand: [],
          handSize: p1HandSize,
        },
        opponentState: {
          ...p1State.opponentState,
          hand: [],
          handSize: p2HandSize,
        },
      };
      io.to(`spec:${room.code}`).emit('spectate:state-update', {
        visibleState: packVisibleState(stateForViewer(spectatorState, false, hiddenIds)),
        playerNames,
        spectatorCount: room.spectators.size,
        roomCode: room.code,
        chessClock,
        isEvolving: room.isEvolving === true,
        holoHue: room.holoHue ?? null,
      });
    }
  } catch (err) {
    console.error('[Socket] broadcastState error:', err instanceof Error ? err.message : err);
    
    if (room.hostSocket) {
      io.to(room.hostSocket).emit('game:error', { message: 'State sync error', errorKey: 'game.error.syncError' });
    }
    if (room.guestSocket) {
      io.to(room.guestSocket).emit('game:error', { message: 'State sync error', errorKey: 'game.error.syncError' });
    }
  }
}

export function socketUserId(socket: Socket): string | undefined {
  return (socket.data as { userId?: string }).userId;
}

function roomHasLiveGame(room: RoomData): boolean {
  return !room.finalized && !!room.gameState && room.gameState.phase !== 'gameOver';
}

function liveRoomCodeForUser(userId: string | undefined): string | null {
  if (!userId) return null;
  for (const [code, room] of rooms) {
    if (!roomHasLiveGame(room)) continue;
    if (room.hostId === userId || room.guestId === userId) return code;
  }
  return null;
}

function roomCodeForSocket(socket: Socket): string | null {
  const userId = socketUserId(socket);
  const live = liveRoomCodeForUser(userId);
  if (live) return live;
  const mapped = playerRooms.get(socket.id);
  if (mapped && !mapped.startsWith('spec:')) return mapped;
  if (!userId) return null;
  for (const [code, room] of rooms) {
    if (room.finalized) continue;
    if (room.hostId === userId || room.guestId === userId) return code;
  }
  return null;
}

export interface ResolvedRoomSeat {
  code: string;
  room: RoomData;
  seat: Seat;
}

function resolveRoomSeatForSocket(
  socket: Socket,
  io: SocketIOServer,
  explicitRoomCode?: string | null,
): ResolvedRoomSeat | null {
  const code = roomCodeForSocket(socket)
    ?? (explicitRoomCode && rooms.has(explicitRoomCode) ? explicitRoomCode : null);
  if (!code) return null;
  const room = rooms.get(code);
  if (!room) return null;
  const { seat, rebindNeeded } = resolveSeatForIdentity(room, socket.id, socketUserId(socket));
  if (!seat) return null;
  if (rebindNeeded) {
    console.warn(`[Socket] rebinding ${seat} in room ${code} to socket ${socket.id} from the authenticated identity`);
    markSeatPresent(room, seat, socket.id, io);
    socket.join(code);
  }
  return { code, room, seat };
}

function seatIsBound(room: RoomData, seat: Seat, io: SocketIOServer | null): boolean {
  return seatLiveness(room, seat, io).seatSocketAlive;
}

function requestSeatRejoin(room: RoomData, seat: Seat): void {
  const userId = seat === 'player1' ? room.hostId : room.guestId;
  if (!userId) return;
  emitToUser(userId, 'game:rejoin-required', { roomCode: room.code });
}

function autoRebindSeatsForSocket(socket: Socket, io: SocketIOServer): void {
  const userId = socketUserId(socket);
  if (!userId) return;
  const candidates: Array<{ code: string; room: RoomData; seat: Seat }> = [];
  for (const [code, room] of rooms) {
    if (room.finalized) continue;
    const seat = resolveSeatByUserId(room, userId);
    if (!seat) continue;
    const currentSocket = seat === 'player1' ? room.hostSocket : room.guestSocket;
    if (currentSocket === socket.id) continue;
    if (seatIsBound(room, seat, io)) continue;
    candidates.push({ code, room, seat });
  }
  candidates.sort((a, b) => Number(roomHasLiveGame(a.room)) - Number(roomHasLiveGame(b.room)));
  for (const { code, room, seat } of candidates) {
    console.log(`[Socket] handshake auto-rebind: ${seat} of room ${code} bound to socket ${socket.id}`);
    markSeatPresent(room, seat, socket.id, io);
    socket.join(code);
    if (roomHasLiveGame(room)) {
      sendSeatState(room, seat, socket, io);
    }
  }
}

function sendSeatState(room: RoomData, seat: Seat, socket: Socket, io: SocketIOServer): void {
  if (!room.gameState || room.finalized) return;
  syncChessClock(room);
  startChessClockTickLoop(room, io);
  ensureRevealMeta(room);
  const hiddenIds = room.hiddenIdsSnapshot ?? EMPTY_HIDDEN_IDS;
  const privileged = seat === 'player1' ? (room.hostPrivileged ?? false) : (room.guestPrivileged ?? false);
  const chessClock = buildChessClockBroadcast(room.chessClock, Date.now());
  const playerNames = { player1: room.hostName ?? 'Player 1', player2: room.guestName ?? 'Player 2' };
  const visible = GameEngine.getVisibleStateForTransport(room.gameState, seat);
  socket.emit('game:started');
  socket.emit('game:state-update', {
    visibleState: packVisibleState(stateForViewer(visible, privileged, hiddenIds)),
    playerRole: seat,
    playerNames,
    chessClock,
  });
}

export function setupSocketHandlers(io: SocketIOServer) {
  ioInstance = io;

  initChatAutoScan((roomCode, messageId) => {
    const room = rooms.get(roomCode);
    if (room) {
      const msg = room.chatMessages.find((m) => m.id === messageId);
      if (msg) {
        msg.message = '';
        msg.removedByModeration = true;
      }
      if (room.hostSocket) io.to(room.hostSocket).emit('chat:message-removed', { id: messageId });
      if (room.guestSocket) io.to(room.guestSocket).emit('chat:message-removed', { id: messageId });
    }
    io.to(`spec:${roomCode}`).emit('chat:message-removed', { id: messageId });
  });

  if (!process.env.TOURNOI_WINNER_WEBHOOK) {
    console.warn('[Boot] TOURNOI_WINNER_WEBHOOK not set, tournament results will not be announced on Discord');
  }
  if (!process.env.TOURNAMENT_PLANNING_WEBHOOK) {
    console.warn('[Boot] TOURNAMENT_PLANNING_WEBHOOK not set, new tournaments will not be announced on Discord');
  }

  process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught exception:', err.message, err.stack);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[FATAL] Unhandled rejection:', reason instanceof Error ? reason.message : reason);
  });


  rehydrateAbsenceTimers(io).catch((err) => {
    console.error('[Tournament] Initial absence rehydrate error:', err);
  });
  sweepOrphanTournamentMatches(io).catch((err) => {
    console.error('[Tournament] Initial orphan sweep error:', err);
  });
  setInterval(() => sweepOrphanTournamentMatches(io).catch(() => {}), 5 * 60_000);
  startTournamentLaunchReconciler(io);


  setInterval(() => cleanupStaleRooms(io), 60_000);


  setInterval(() => {
    try { chessClockWatchdog(io); } catch (err) {
      console.error('[ChessClockWatchdog] tick error:', err instanceof Error ? err.message : err);
    }
  }, CHESS_CLOCK_WATCHDOG_INTERVAL_MS);

  
  setInterval(async () => {
    try {
      const { cleanupOldGames } = await import('@/lib/db/gameCleanup');
      await cleanupOldGames();
    } catch { /* ignore */ }
  }, 30 * 60 * 1000);

  
  setInterval(async () => {
    try {
      const now = new Date();
      const scheduledTournaments = await prisma.tournament.findMany({
        where: { status: { in: ['registration', 'starting'] }, scheduledStartAt: { not: null, lte: now } },
        include: { _count: { select: { participants: true } } },
      });
      const { logMatchEvent } = await import('@/lib/tournament/matchEventLog');
      for (const t of scheduledTournaments) {
        if (t._count.participants < 2) {
          await prisma.tournament.update({ where: { id: t.id }, data: { status: 'cancelled' } });
          logMatchEvent({ type: 'tournament.cancelled.not-enough-players', tournamentId: t.id });
          io.to(`tournament:${t.id}`).emit('tournament:cancelled', { reason: 'not_enough_players', tournamentId: t.id });
          continue;
        }
        logMatchEvent({ type: 'tournament.start.begin', tournamentId: t.id, format: t.format });
        try {
          const { executeTournamentStart } = await import('@/lib/tournament/startLogic');
          const result = await executeTournamentStart(t.id);
          if (!result.ok) {
            await prisma.tournament.update({ where: { id: t.id }, data: { status: 'cancelled' } });
            logMatchEvent({ type: 'tournament.cancelled.start-failed', tournamentId: t.id, detail: result.error });
            io.to(`tournament:${t.id}`).emit('tournament:cancelled', { reason: 'start_failed', detail: result.error, tournamentId: t.id });
            continue;
          }
          logMatchEvent({ type: 'tournament.start.success', tournamentId: t.id, format: t.format });
          io.to(`tournament:${t.id}`).emit('tournament:started');
          try {
            const { startInitialRoundAbsenceTimers } = await import('@/lib/socket/tournamentHandlers');
            await startInitialRoundAbsenceTimers(io, t.id);
          } catch (err) {
            console.error(`[Tournament] Failed to arm initial absence timers for ${t.id}:`, err);
          }
        } catch (err) {
          console.error(`[Tournament] Auto-start error for ${t.id}:`, err);
        }
      }
    } catch (err) {
      console.error('[Tournament] Scheduled check error:', err);
    }
  }, 30_000);

  setChatLockRefresher((userIdA, userIdB) => refreshChatLockForUsers(io, userIdA, userIdB));

  io.use((socket: Socket, next: (err?: Error) => void) => {
    const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
    resolveHandshakeIdentity(socket.handshake.headers.cookie, secret, decode)
      .then((userId) => {
        if (userId) {
          (socket.data as { userId?: string; identityFromHandshake?: boolean }).userId = userId;
          (socket.data as { identityFromHandshake?: boolean }).identityFromHandshake = true;
        }
      })
      .catch((err) => {
        console.warn('[Socket] handshake identity resolution failed:', err instanceof Error ? err.message : err);
      })
      .finally(() => next());
  });

  io.on('connection', (socket: Socket) => {
    console.log(`Player connected: ${socket.id}`);

    const handshakeUserId = socketUserId(socket);
    if (handshakeUserId) {
      console.log(`[Socket] handshake identity for ${socket.id}: ${handshakeUserId}`);
      registerUserSocket(handshakeUserId, socket.id);
      getUnreadDmCount(handshakeUserId)
        .then((total) => socket.emit('dm:unread-count', { total }))
        .catch(() => {});
      try {
        autoRebindSeatsForSocket(socket, io);
      } catch (err) {
        console.error('[Socket] autoRebindSeatsForSocket failed:', err instanceof Error ? err.message : err);
      }
    }

    registerTournamentHandlers(io, socket);
    registerTradeHandlers(io, socket);

    
    socket.on('auth:register', async (data: { userId: string; username?: string }) => {
      if (!data.userId) return;

      const handshakeIdentity = (socket.data as { identityFromHandshake?: boolean }).identityFromHandshake === true
        ? socketUserId(socket) ?? null
        : null;
      const verdict = verifyIdentityClaim(handshakeIdentity, data.userId);
      if (verdict === 'reject') {
        console.warn(`[Socket] auth:register rejected: claim=${data.userId} but handshake=${handshakeIdentity ?? 'null'}`);
        socket.emit('game:error', { message: 'Authentication mismatch', errorKey: 'game.error.authMismatch' });
        return;
      }

      if (verdict === 'accept') {
        try {
          const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
          const trustedId = await resolveHandshakeIdentity(socket.handshake.headers.cookie, secret, decode);
          if (trustedId && trustedId !== data.userId) {
            console.warn(`[Socket] auth:register rejected: claim=${data.userId} but session=${trustedId}`);
            socket.emit('game:error', { message: 'Authentication mismatch', errorKey: 'game.error.authMismatch' });
            return;
          }
        } catch (err) {
          console.warn('[Socket] auth:register session decode failed (allowing anyway):', err instanceof Error ? err.message : err);
        }

        registerUserSocket(data.userId, socket.id);
        (socket.data as { userId?: string }).userId = data.userId;
        getUnreadDmCount(data.userId)
          .then((total) => socket.emit('dm:unread-count', { total }))
          .catch(() => {});
        try {
          autoRebindSeatsForSocket(socket, io);
        } catch (err) {
          console.error('[Socket] autoRebindSeatsForSocket failed:', err instanceof Error ? err.message : err);
        }
      }

      if (data.username && typeof data.username === 'string' && data.username.length <= 50) {
        userNames.set(data.userId, data.username);
      }

      let liveSeat: { code: string; room: RoomData; isHost: boolean } | null = null;
      let pendingMatchSeat: { code: string; room: RoomData; isHost: boolean } | null = null;
      for (const [code, room] of rooms) {
        if (room.finalized) continue;
        const isHost = room.hostId === data.userId;
        const isGuest = room.guestId === data.userId;
        if (!isHost && !isGuest) continue;

        if (room.gameState && room.gameState.phase !== 'gameOver') {
          if (!liveSeat) liveSeat = { code, room, isHost };
          continue;
        }
        if (!room.gameState && room.tournamentId && room.tournamentMatchId && !pendingMatchSeat) {
          pendingMatchSeat = { code, room, isHost };
        }
      }

      if (liveSeat) {
        const seatSocket = liveSeat.isHost ? liveSeat.room.hostSocket : liveSeat.room.guestSocket;
        if (seatSocket === socket.id) {
          liveSeat = null;
          pendingMatchSeat = null;
        }
      }

      const entry = liveSeat ?? pendingMatchSeat;
      if (entry) {
        if (entry.room.tournamentId) {
          socket.emit('match:enter', {
            tournamentId: entry.room.tournamentId,
            matchId: entry.room.tournamentMatchId ?? null,
            roomCode: entry.code,
            seat: entry.isHost ? 'player1' : 'player2',
          });
        } else {
          socket.emit('game:active-game', {
            roomCode: entry.code,
            playerRole: entry.isHost ? 'player1' : 'player2',
          });
        }
      }
    });

    socket.on('match:enter-ack', (data: { roomCode?: string }) => {
      if (!data || typeof data.roomCode !== 'string') return;
      const room = rooms.get(data.roomCode);
      if (!room) return;
      const authedUserId = (socket.data as { userId?: string }).userId;
      if (!authedUserId) return;
      const seat: Seat | null = room.hostId === authedUserId
        ? 'player1'
        : room.guestId === authedUserId
          ? 'player2'
          : null;
      if (!seat) return;
      if (seat === 'player1') room.hostInviteAckedAt = Date.now();
      else room.guestInviteAckedAt = Date.now();
      if (!room.gameState && !room.finalized && room.tournamentId) {
        void reconcileTournamentRoomSeats(room, data.roomCode, io);
      }
    });

    
    socket.on('game:rejoin', async (data: { roomCode: string; userId?: string }) => {
      const roomCode = data?.roomCode;
      const authedUserId = socketUserId(socket);
      const failRejoin = (reason: 'not-authed' | 'room-gone' | 'not-in-room') => {
        socket.emit('game:rejoin-failed', { roomCode: roomCode ?? null, reason });
      };

      if (!roomCode) {
        failRejoin('not-in-room');
        return;
      }

      if (!authedUserId) {
        console.warn(`[Socket] game:rejoin deferred: socket ${socket.id} has no authenticated identity yet (claim=${data?.userId ?? 'null'})`);
        failRejoin('not-authed');
        return;
      }
      if (data?.userId && data.userId !== authedUserId) {
        console.warn(`[Socket] game:rejoin: ignoring the stale claim ${data.userId}, the authenticated identity ${authedUserId} wins`);
      }
      const userId = authedUserId;

      const room = rooms.get(roomCode);
      if (!room) {
        console.log(`[Socket] game:rejoin: room ${roomCode} not found`);
        failRejoin('room-gone');
        return;
      }

      const isHost = room.hostId === userId;
      const isGuest = room.guestId === userId;
      if (!isHost && !isGuest) {
        console.log(`[Socket] game:rejoin: user ${userId} is not in room ${roomCode}`);
        failRejoin('not-in-room');
        return;
      }

      const player = isHost ? 'player1' : 'player2';
      const oldSocketId = isHost ? room.hostSocket : room.guestSocket;

      console.log(`[Socket] game:rejoin: ${player} reconnecting in room ${roomCode}, old socket: ${oldSocketId}, new socket: ${socket.id}`);


      markSeatPresent(room, isHost ? 'player1' : 'player2', socket.id, io);

      if (oldSocketId && oldSocketId !== socket.id) {
        const oldSock = io.sockets.sockets.get(oldSocketId);
        if (oldSock) {
          oldSock.leave(`spec:${roomCode}`);
        }
      }

      socket.join(roomCode);
      socket.emit('game:rejoin-ok', { roomCode, playerRole: player });

      console.log(`[Socket] ${player} rejoined room ${roomCode}, chess clock continues`);
      const opponentSock = isHost ? room.guestSocket : room.hostSocket;
      if (opponentSock) {
        io.to(opponentSock).emit('game:opponent-reconnected');
        if (room.gameState && !room.finalized) {
          const oppRole: PlayerID = isHost ? 'player2' : 'player1';
          const oppVisible = GameEngine.getVisibleStateForTransport(room.gameState, oppRole);
          const oppClock = buildChessClockBroadcast(room.chessClock, Date.now());
          const playerNames = { player1: room.hostName ?? 'Player 1', player2: room.guestName ?? 'Player 2' };
          io.to(opponentSock).emit('game:state-update', { visibleState: packVisibleState(oppVisible), playerRole: oppRole, playerNames, chessClock: oppClock });
        }
      }


      registerUserSocket(userId, socket.id);
      getUnreadDmCount(userId)
        .then((total) => socket.emit('dm:unread-count', { total }))
        .catch(() => {});


      if (room.finalBroadcast) {
        console.log(`[Socket] game:rejoin: room ${roomCode} is already over, replaying ${room.finalBroadcast.event} to ${player}`);
        socket.emit(
          room.finalBroadcast.event,
          player === 'player1' ? room.finalBroadcast.player1 : room.finalBroadcast.player2,
        );
      } else if (room.gameState && !room.finalized) {
        sendSeatState(room, player, socket, io);
        socket.emit('chat:history', { messages: room.chatMessages.slice(-50) });

        if (room.gameState.phase === 'mulligan' && room.mulliganDeadline && room.chessClockMulliganTimer) {
          socket.emit('game:mulligan-deadline', {
            deadline: room.mulliganDeadline,
            durationMs: Math.max(0, room.mulliganDeadline - Date.now()),
          });
        }

      } else {
        
        console.log(`[Socket] game:rejoin: ${player} rejoined room ${roomCode} during pre-game phase`);
        socket.emit('room:rejoined', {
          code: roomCode,
          isSealed: room.isSealed,
          playerRole: player === 'player1' ? 'player1' : 'player2',
          tournamentId: room.tournamentId ?? null,
        });

        
        
        
        if (room.tournamentId) {
          await maybeStartTournamentGame(room, roomCode, io);
        } else if (room.hostDeck && room.guestDeck && !room.gameState) {
          console.log(`[Socket] game:rejoin: Both decks already submitted in room ${roomCode}, creating game now`);

          if (room.sealedTimer) {
            clearTimeout(room.sealedTimer);
            room.sealedTimer = null;
            room.sealedDeadline = null;
          }

          const config: GameConfig = {
            player1: {
              userId: room.hostId,
              isAI: false,
              deck: room.hostDeck.characters,
              missionCards: room.hostDeck.missions,
            },
            player2: {
              userId: room.guestId!,
              isAI: false,
              deck: room.guestDeck.characters,
              missionCards: room.guestDeck.missions,
            },
            gameMode: room.gameMode,
            ...buildEvolvingGameConfigExtras(room),
          };

          room.gameState = GameEngine.createGame(config);
          if (room.hostId) room.gameState.player1UserId = room.hostId;
          if (room.guestId) room.gameState.player2UserId = room.guestId;
          room.replayInitialState = deepClone(room.gameState);
          room.replayInitialState.actionHistory = [];
          room.replayStateSnapshots = [];
          room.replaySnapshotLogLengths = [];
          room.replayClockSnapshots = [];


          let hostName = 'Player 1';
          let guestName = 'Player 2';
          try {
            const [hostUser, guestUser] = await Promise.all([
              prisma.user.findUnique({ where: { id: room.hostId }, select: { username: true } }),
              room.guestId ? prisma.user.findUnique({ where: { id: room.guestId }, select: { username: true } }) : null,
            ]);
            if (hostUser?.username) hostName = hostUser.username;
            if (guestUser?.username) guestName = guestUser.username;
          } catch { /* fallback to defaults */ }
          room.hostName = hostName;
          room.guestName = guestName;

          syncChessClock(room);
          startChessClockTickLoop(room, io);
          const chessClock = buildChessClockBroadcast(room.chessClock, Date.now());

          const p1State = GameEngine.getVisibleStateForTransport(room.gameState, 'player1');
          const p2State = GameEngine.getVisibleStateForTransport(room.gameState, 'player2');

          if (room.hostSocket) {
            io.to(room.hostSocket).emit('game:state-update', {
              visibleState: packVisibleState(p1State),
              playerRole: 'player1',
              playerNames: { player1: hostName, player2: guestName },
              chessClock,
            });
          }
          if (room.guestSocket) {
            io.to(room.guestSocket).emit('game:state-update', {
              visibleState: packVisibleState(p2State),
              playerRole: 'player2',
              playerNames: { player1: hostName, player2: guestName },
              chessClock,
            });
          }
        }
      }
    });

    
    socket.on('room:create', async (data: { userId: string; isPrivate?: boolean; isRanked?: boolean; isSealed?: boolean; isEvolving?: boolean; gameMode?: 'casual' | 'ranked' | 'sealed' | 'evolving'; hostName?: string; sealedBoosterCount?: 4 | 5 | 6; sealedSetChoice?: string; isAnonymous?: boolean }) => {
      if (isMaintenanceActive()) {
        socket.emit('room:error', { message: 'Maintenance', errorKey: 'game.error.maintenanceNoNewGames' });
        return;
      }

      const authedUserId_create = (socket.data as { userId?: string }).userId;
      if (!authedUserId_create || authedUserId_create !== data.userId) {
        console.warn(`[Socket] room:create rejected: socket auth mismatch (claim=${data.userId}, auth=${authedUserId_create ?? 'null'})`);
        socket.emit('room:error', { message: 'Authentication mismatch', errorKey: 'game.error.authMismatch' });
        return;
      }

      if (await isSuspended(data.userId)) {
        socket.emit('room:error', { message: 'Account suspended', errorKey: 'game.error.suspended' });
        return;
      }
      const createIsRanked = data.isRanked === true || data.gameMode === 'ranked' || data.gameMode === 'evolving' || data.isEvolving === true;
      if (createIsRanked && (await isRankedBanned(data.userId))) {
        socket.emit('room:error', { message: 'Ranked mode is closed to you', errorKey: 'game.error.rankedBanned' });
        return;
      }
      if (await isUserGameBanned(data.userId)) {
        socket.emit('room:error', { message: 'You are banned from playing online games', errorKey: 'game.error.gameBanned' });
        return;
      }

      const tournamentBusy = await getActiveTournamentMatchForUser(data.userId);
      if (tournamentBusy) {
        socket.emit('room:error', { message: `You are in a tournament match (${tournamentBusy.roomCode ?? 'pending'}). Finish it first.`, errorKey: 'game.error.tournamentBusy', errorParams: { roomCode: tournamentBusy.roomCode ?? 'pending' } });
        return;
      }

      console.log(`[Socket] Creating room for user ${data.userId}, socket ${socket.id}`);


      cleanupPlayerRoom(socket);

      let code: string;
      do {
        code = generateRoomCode();
      } while (rooms.has(code));

      const VALID_MODES = ['casual', 'ranked', 'sealed', 'evolving'] as const;
      const requestedMode = data.gameMode ?? (data.isSealed ? 'sealed' : data.isRanked ? 'ranked' : 'casual');
      const baseMode = (VALID_MODES as readonly string[]).includes(requestedMode) ? requestedMode : 'casual';

      const evolvingFlag = data.isEvolving === true || baseMode === 'evolving';
      const isRankedFlag = baseMode === 'ranked' || baseMode === 'evolving' || (data.isRanked === true && baseMode !== 'sealed');

      const gameMode: 'casual' | 'ranked' | 'sealed' | 'evolving' =
        baseMode === 'sealed' ? 'sealed' :
        evolvingFlag && isRankedFlag ? 'evolving' :
        isRankedFlag ? 'ranked' :
        'casual';

      if (evolvingFlag) {
        const evoDeckCount = await prisma.deck.count({ where: { userId: data.userId, evolvingCompatible: true } });
        if (evoDeckCount === 0) {
          socket.emit('room:error', { message: 'You need an evolving deck to create an evolving room', errorKey: 'room.error.evolvingNoDeck' });
          return;
        }
      }

      const safeBoosterCount = data.sealedBoosterCount === 4 || data.sealedBoosterCount === 5 || data.sealedBoosterCount === 6 ? data.sealedBoosterCount : 6;
      const safeSealedSetChoice = (typeof data.sealedSetChoice === 'string' && data.sealedSetChoice.length > 0 && data.sealedSetChoice.length <= 16) ? data.sealedSetChoice : 'random';
      const safeHostName = typeof data.hostName === 'string' && data.hostName.length > 0 && data.hostName.length <= 50 ? data.hostName : (userNames.get(data.userId) || 'Unknown');

      const room: RoomData = {
        code,
        hostId: data.userId,
        hostSocket: socket.id,
        guestId: null,
        guestSocket: null,
        gameState: null,
        hostDeck: null,
        guestDeck: null,
        isPrivate: data.isPrivate ?? false,
        isRanked: isRankedFlag,
        isAnonymous: data.isAnonymous ?? false,
        gameMode,
        isEvolving: evolvingFlag,
        holoHue: evolvingFlag ? Math.floor(Math.random() * 360) : null,
        hostEvolvingPoints: 0,
        guestEvolvingPoints: 0,
        createdAt: Date.now(),
        hostName: safeHostName,
        replayInitialState: null,
        replayStateSnapshots: null,
        replaySnapshotLogLengths: null,
        replayClockSnapshots: null,
        finalized: false,
        isSealed: gameMode === 'sealed',
        sealedBoosterCount: safeBoosterCount,
        sealedSetChoice: safeSealedSetChoice,
        sealedTimer: null,
        sealedDeadline: null,
        coinFlipDone: { player1: false, player2: false },
        spectators: new Map(),
        hostAllowSpectatorHand: false,
        guestAllowSpectatorHand: false,
        chatMessages: [],
        chatLastCleanup: 0,
        chessClock: createChessClock(),
        chessClockTickTimer: null,
        chessClockMulliganTimer: null,
        chessClockLastInputKey: null,
      };


      try {
        const hostUser = await prisma.user.findUnique({ where: { id: data.userId }, select: { allowSpectatorHand: true } });
        room.hostAllowSpectatorHand = hostUser?.allowSpectatorHand ?? false;
      } catch { /* default false */ }

      rooms.set(code, room);
      playerRooms.set(socket.id, code);
      socket.join(code);

      console.log(`[Socket] Room ${code} created by ${data.userId} (mode: ${gameMode}, evolving: ${evolvingFlag}, ranked: ${isRankedFlag})`);
      socket.emit('room:created', {
        code,
        isSealed: room.isSealed,
        gameMode: room.gameMode,
        isEvolving: room.isEvolving,
        holoHue: room.holoHue,
      });

      
      if (!room.isPrivate) {
        broadcastRoomList(io);
      }
    });

    
    socket.on('room:join', async (data: { code: string; userId: string }) => {
      console.log(`[Socket] User ${data.userId} trying to join room ${data.code}`);

      const authedUserId_join = (socket.data as { userId?: string }).userId;
      if (!authedUserId_join || authedUserId_join !== data.userId) {
        console.warn(`[Socket] room:join rejected: socket auth mismatch (claim=${data.userId}, auth=${authedUserId_join ?? 'null'})`);
        socket.emit('room:error', { message: 'Authentication mismatch', errorKey: 'game.error.authMismatch' });
        return;
      }

      if (await isSuspended(data.userId)) {
        socket.emit('room:error', { message: 'Account suspended', errorKey: 'game.error.suspended' });
        return;
      }
      const joinRoomRef = rooms.get(data.code);
      if (joinRoomRef && (joinRoomRef.isRanked === true || joinRoomRef.isEvolving === true) && (await isRankedBanned(data.userId))) {
        socket.emit('room:error', { message: 'Ranked mode is closed to you', errorKey: 'game.error.rankedBanned' });
        return;
      }
      if (await isUserGameBanned(data.userId)) {
        socket.emit('room:error', { message: 'You are banned from playing online games', errorKey: 'game.error.gameBanned' });
        return;
      }

      const tournamentBusy = await getActiveTournamentMatchForUser(data.userId, data.code);
      const targetRoomForBusyCheck = rooms.get(data.code);
      const targetIsOwnMatch = !!tournamentBusy
        && !!targetRoomForBusyCheck
        && targetRoomForBusyCheck.tournamentMatchId === tournamentBusy.id;
      if (tournamentBusy && tournamentBusy.roomCode !== data.code && !targetIsOwnMatch) {
        socket.emit('room:error', { message: `You are in a tournament match (${tournamentBusy.roomCode ?? 'pending'}). Finish it first.`, errorKey: 'game.error.tournamentBusy', errorParams: { roomCode: tournamentBusy.roomCode ?? 'pending' } });
        return;
      }

      const room = rooms.get(data.code);
      if (!room) {
        console.log(`[Socket] Room ${data.code} not found`);
        socket.emit('room:error', { message: 'Room not found', errorKey: 'game.error.roomNotFound' });
        return;
      }

      if (isMaintenanceActive() && !room.gameState) {
        socket.emit('room:error', { message: 'Maintenance', errorKey: 'game.error.maintenanceNoNewGames' });
        return;
      }


      if (room.hostId === data.userId) {
        if (room.tournamentId) {
          console.log(`[Socket] Tournament host ${data.userId} joining room ${data.code}`);
          markSeatPresent(room, 'player1', socket.id, io);
          socket.join(data.code);
          socket.join(`tournament:${room.tournamentId}`);
          socket.emit('room:joined', {
            code: data.code,
            playerRole: 'player1',
            hostId: room.hostId,
            guestId: room.guestId,
            gameMode: room.gameMode,
            isRanked: room.isRanked,
            tournamentId: room.tournamentId,
            isEvolving: room.isEvolving === true,
            holoHue: room.holoHue ?? null,
          });

          if (room.gameState) {
            syncChessClock(room);
            startChessClockTickLoop(room, io);
            const chessClock = buildChessClockBroadcast(room.chessClock, Date.now());
            const visible = GameEngine.getVisibleStateForTransport(room.gameState, 'player1');
            const playerNames = { player1: room.hostName ?? 'Player 1', player2: room.guestName ?? 'Player 2' };
            socket.emit('game:state-update', { visibleState: packVisibleState(visible), playerRole: 'player1', playerNames, chessClock });
            socket.emit('game:started');
            socket.emit('chat:history', { messages: room.chatMessages.slice(-50) });
          } else if (room.hostDeck && room.guestDeck && room.guestSocket) {

            io.to(data.code).emit('room:player-joined', { hostId: room.hostId, guestId: room.guestId, gameMode: room.gameMode });
          } else if (room.isSealed && !room.hostDeck) {
            try {
              const participant = await prisma.tournamentParticipant.findFirst({
                where: { tournamentId: room.tournamentId, userId: data.userId },
                select: { sealedPool: true },
              });
              if (participant?.sealedPool) {
                const pool = participant.sealedPool as { boosters: unknown; allCards: Array<{ id: string }> };
                if (pool.allCards && Array.isArray(pool.allCards)) {
                  room.hostSealedPoolIds = pool.allCards.map((c) => c.id);
                }
                socket.emit('sealed:boosters', pool);
                if (room.sealedDeadline) {
                  const remaining = room.sealedDeadline - Date.now();
                  if (remaining > 0) {
                    socket.emit('sealed:timer-start', { deadline: room.sealedDeadline, durationMs: remaining });
                  }
                }
              }
            } catch (err) {
              console.error('[Socket] Failed to re-emit sealed pool on host rejoin:', err);
            }
          }
          await maybeStartTournamentGame(room, data.code, io);
          return;
        }
        console.log(`[Socket] User ${data.userId} is the host of room ${data.code}`);
        socket.emit('room:error', { message: 'You are the host of this room', errorKey: 'game.error.youAreHost' });
        return;
      }


      if (room.guestId && room.guestId !== data.userId) {
        console.log(`[Socket] Room ${data.code} is full`);
        socket.emit('room:error', { message: 'Room is full', errorKey: 'game.error.roomFull' });
        return;
      }


      if (room.guestId === data.userId) {
        console.log(`[Socket] User ${data.userId} rejoining room ${data.code}`);
      } else {
        const evoCheck = await assertCanJoinEvolving(data.userId, room);
        if (!evoCheck.ok) {
          console.log(`[Socket] User ${data.userId} rejected from room ${data.code}: no evolving deck`);
          socket.emit('room:error', { message: 'You need an evolving deck to join this room', errorKey: evoCheck.errorKey });
          return;
        }
      }

      room.guestId = data.userId;
      room.guestName = room.guestName || userNames.get(data.userId) || undefined;
      markSeatPresent(room, 'player2', socket.id, io);
      socket.join(data.code);
      if (room.tournamentId) socket.join(`tournament:${room.tournamentId}`);

      try {
        const guestUser = await prisma.user.findUnique({
          where: { id: data.userId },
          select: { username: true, allowSpectatorHand: true },
        });
        if (!room.guestName && guestUser?.username) room.guestName = guestUser.username;
        room.guestAllowSpectatorHand = guestUser?.allowSpectatorHand ?? false;
      } catch { /* default false */ }

      if (!room.hostName) {
        try {
          const hostUser = await prisma.user.findUnique({
            where: { id: room.hostId },
            select: { username: true },
          });
          if (hostUser?.username) room.hostName = hostUser.username;
        } catch {
          room.hostName = room.hostName ?? undefined;
        }
      }

      console.log(`[Socket] User ${data.userId} joined room ${data.code}`);
      socket.emit('room:joined', {
        code: data.code,
        playerRole: 'player2',
        hostId: room.hostId,
        guestId: room.guestId,
        gameMode: room.gameMode,
        isRanked: room.isRanked,
        tournamentId: room.tournamentId ?? null,
        isEvolving: room.isEvolving === true,
        holoHue: room.holoHue ?? null,
      });
      io.to(data.code).emit('room:player-joined', {
        hostId: room.hostId,
        guestId: room.guestId,
        isSealed: room.isSealed,
        gameMode: room.gameMode,
        isEvolving: room.isEvolving === true,
        holoHue: room.holoHue ?? null,
      });


      if (!room.isPrivate) {
        broadcastRoomList(io);
      }

      if (room.gameState && !room.finalized) {
        syncChessClock(room);
        startChessClockTickLoop(room, io);
        const chessClockGuest = buildChessClockBroadcast(room.chessClock, Date.now());
        const guestVisible = GameEngine.getVisibleStateForTransport(room.gameState, 'player2');
        const guestPlayerNames = { player1: room.hostName ?? 'Player 1', player2: room.guestName ?? 'Player 2' };
        socket.emit('game:state-update', { visibleState: packVisibleState(guestVisible), playerRole: 'player2', playerNames: guestPlayerNames, chessClock: chessClockGuest });
        socket.emit('game:started');
        socket.emit('chat:history', { messages: room.chatMessages.slice(-50) });
        if (room.gameState.phase === 'mulligan' && room.mulliganDeadline && room.chessClockMulliganTimer) {
          socket.emit('game:mulligan-deadline', {
            deadline: room.mulliganDeadline,
            durationMs: Math.max(0, room.mulliganDeadline - Date.now()),
          });
        }
      }

      await maybeStartTournamentGame(room, data.code, io);


      if (room.isSealed && room.tournamentId) {
        try {
          const participant = await prisma.tournamentParticipant.findFirst({
            where: { tournamentId: room.tournamentId, userId: data.userId },
            select: { sealedPool: true, sealedDeck: true },
          });
          const myBuiltDeck = (room.hostId === data.userId ? room.hostDeck : room.guestDeck);
          if (!myBuiltDeck && participant?.sealedPool) {
            const pool = participant.sealedPool as { boosters: unknown; allCards: Array<{ id: string }> };
            if (pool.allCards && Array.isArray(pool.allCards)) {
              if (room.hostId === data.userId) {
                room.hostSealedPoolIds = pool.allCards.map((c) => c.id);
              } else {
                room.guestSealedPoolIds = pool.allCards.map((c) => c.id);
              }
            }
            socket.emit('sealed:boosters', pool);
            if (room.sealedDeadline) {
              const remaining = room.sealedDeadline - Date.now();
              if (remaining > 0) {
                socket.emit('sealed:timer-start', { deadline: room.sealedDeadline, durationMs: remaining });
              }
            }
          }
        } catch (err) {
          console.error('[Socket] Failed to re-emit sealed pool on rejoin:', err);
        }
      }

      if (room.isSealed && room.guestId && !room.tournamentId) {
        try {
          const { generateSealedPool } = await import('@/lib/sealed/boosterGenerator');
          const count = room.sealedBoosterCount ?? 6;
          const choice = room.sealedSetChoice ?? 'random';
          const hostPool = generateSealedPool(count, choice);
          const guestPool = generateSealedPool(count, choice);

          room.hostSealedPoolIds = hostPool.allCards.map(c => c.id);
          room.guestSealedPoolIds = guestPool.allCards.map(c => c.id);

          if (room.hostSocket) {
            io.to(room.hostSocket).emit('sealed:boosters', {
              boosters: hostPool.boosters,
              allCards: hostPool.allCards,
            });
          }
          io.to(socket.id).emit('sealed:boosters', {
            boosters: guestPool.boosters,
            allCards: guestPool.allCards,
          });

          console.log(`[Socket] Sealed boosters generated for room ${data.code}`);

          
          const deadline = Date.now() + SEALED_TIMEOUT_MS;
          room.sealedDeadline = deadline;
          io.to(data.code).emit('sealed:timer-start', { deadline, durationMs: SEALED_TIMEOUT_MS });

          room.sealedTimer = setTimeout(() => {
            if (!room.hostDeck || !room.guestDeck) {
              console.log(`[Socket] Sealed time expired for room ${data.code}`);
              io.to(data.code).emit('sealed:time-expired');
              io.to(data.code).emit('room:error', { message: 'Sealed time expired', errorKey: 'game.error.sealedTimeout' });
              if (room.sealedTimer) clearTimeout(room.sealedTimer);
              room.sealedTimer = null;
              clearChessClockTimers(room);
              const wasPublic = !room.isPrivate;
              rooms.delete(data.code);
              if (room.hostSocket) playerRooms.delete(room.hostSocket);
              if (room.guestSocket) playerRooms.delete(room.guestSocket);
              if (wasPublic) broadcastRoomList(io);
            }
          }, SEALED_TIMEOUT_MS);
        } catch (err) {
          console.error(`[Socket] Sealed booster generation error:`, err);
          io.to(data.code).emit('room:error', { message: 'Failed to generate sealed boosters', errorKey: 'game.error.sealedGenFailed' });
        }
      }
    });

    
    
    socket.on('room:change-deck', () => {
      const code = playerRooms.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room || room.gameState) return; // Can't change deck after game started

      if (socket.id === room.hostSocket) {
        room.hostDeck = null;
        room.hostDeckId = undefined;
      } else if (socket.id === room.guestSocket) {
        room.guestDeck = null;
        room.guestDeckId = undefined;
      }

      const otherSocket = socket.id === room.hostSocket ? room.guestSocket : room.hostSocket;
      if (otherSocket) {
        io.to(otherSocket).emit('room:opponent-changing-deck');
      }
      console.log(`[Socket] Player ${socket.id} changing deck in room ${code}`);
    });

    socket.on('room:select-deck', async (data: {
      characters: CharacterCard[];
      missions: MissionCard[];
      deckId?: string;
    }) => {
      const code = playerRooms.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room) return;

      if (!data || typeof data !== 'object' || !Array.isArray(data.characters) || !Array.isArray(data.missions)) {
        socket.emit('room:error', { message: 'Invalid deck payload', errorKey: 'game.error.invalidDeck' });
        return;
      }
      const safeDeckId = typeof data.deckId === 'string' && /^[0-9a-f]{24}$/i.test(data.deckId) ? data.deckId : undefined;
      if (data.characters.length < 30 || data.characters.length > 200 || data.missions.length !== 3) {
        socket.emit('room:error', { message: 'Invalid deck size', errorKey: 'game.error.invalidDeck' });
        return;
      }
      const submittedMissionVersions = new Set<string>();
      for (const mission of data.missions) {
        if (!mission || typeof mission.id !== 'string') continue;
        const version = cardVersionKey(mission.id);
        if (submittedMissionVersions.has(version)) {
          socket.emit('room:error', { message: 'Only one artwork of a mission may be in a deck', errorKey: 'deckBuilder.error.duplicateMissionArtwork' });
          return;
        }
        submittedMissionVersions.add(version);
      }

      if ((room.isRanked || room.gameMode === 'ranked') && !room.tournamentId) {
        try {
          const banned = await getBannedCards();
          const isBanned = (id: string): boolean => banned.has(id) || isStaticRankedBanned(id);
          const banReason = (id: string): string | null => banned.get(id) ?? (isStaticRankedBanned(id) ? 'set2Unreleased' : null);
          const foundBanned: Array<{ cardId: string; reason: string | null }> = [];
          for (const c of data.characters) {
            if (!c || typeof c.id !== 'string') continue;
            const checkId = holoBaseId(c.id);
            if (isBanned(checkId)) foundBanned.push({ cardId: checkId, reason: banReason(checkId) });
          }
          for (const m of data.missions) {
            if (m && typeof m.id === 'string' && isBanned(m.id)) foundBanned.push({ cardId: m.id, reason: banReason(m.id) });
          }
          if (foundBanned.length > 0) {
            socket.emit('room:error', {
              message: 'Deck contains banned cards',
              errorKey: 'game.error.deckBanned',
              bannedCards: foundBanned,
            });
            return;
          }
        } catch (err) {
          console.error('[Socket] Ban check error:', err);
        }
      }
      const resolvedChars: CharacterCard[] = [];
      for (const c of data.characters) {
        if (!c || typeof c.id !== 'string') {
          socket.emit('room:error', { message: 'Invalid card in deck', errorKey: 'game.error.invalidDeck' });
          return;
        }
        const wantsHolo = c.isHolo === true || isHoloId(c.id);
        const canon = getCharacterById(holoBaseId(c.id));
        if (!canon) {
          socket.emit('room:error', { message: `Unknown card ${c.id}`, errorKey: 'game.error.invalidDeck' });
          return;
        }
        if (wantsHolo && isHoloEligibleCard(canon)) {
          resolvedChars.push({ ...canon, isHolo: true });
        } else {
          resolvedChars.push(canon);
        }
      }
      if (resolvedChars.some((c) => c.isHolo)) {
        const holoOwnerId = socket.id === room.hostSocket ? room.hostId : (socket.id === room.guestSocket ? room.guestId : null);
        let holoAllowAll = false;
        let ownedHoloIds = new Set<string>();
        if (holoOwnerId) {
          try {
            const holoUser = await prisma.user.findUnique({
              where: { id: holoOwnerId },
              select: { username: true, email: true },
            });
            if (holoUser && isAdmin({ username: holoUser.username, email: holoUser.email })) {
              holoAllowAll = true;
            } else {
              ownedHoloIds = await getOwnedVariantIds(holoOwnerId);
            }
          } catch (err) {
            console.error('[Socket] Holo ownership check error:', err);
          }
        }
        if (!holoAllowAll) {
          for (let i = 0; i < resolvedChars.length; i++) {
            if (resolvedChars[i].isHolo && !ownedHoloIds.has(holoIdFor(resolvedChars[i].id))) {
              resolvedChars[i] = { ...resolvedChars[i], isHolo: false };
            }
          }
        }
      }
      const resolvedMissions: MissionCard[] = [];
      for (const m of data.missions) {
        if (!m || typeof m.id !== 'string') {
          socket.emit('room:error', { message: 'Invalid mission in deck', errorKey: 'game.error.invalidDeck' });
          return;
        }
        const canon = getMissionById(m.id);
        if (!canon) {
          socket.emit('room:error', { message: `Unknown mission ${m.id}`, errorKey: 'game.error.invalidDeck' });
          return;
        }
        resolvedMissions.push(canon);
      }
      const safeDeck = { characters: resolvedChars, missions: resolvedMissions };

      if (room.isSealed) {
        const isHost = socket.id === room.hostSocket;
        const poolIds = isHost ? room.hostSealedPoolIds : room.guestSealedPoolIds;
        if (!poolIds || poolIds.length === 0) {
          socket.emit('room:error', { message: 'Sealed pool not initialized', errorKey: 'game.error.invalidDeck' });
          return;
        }
        const remaining = new Map<string, number>();
        for (const id of poolIds) remaining.set(id, (remaining.get(id) ?? 0) + 1);
        for (const c of resolvedChars) {
          const left = remaining.get(c.id) ?? 0;
          if (left <= 0) {
            socket.emit('room:error', { message: `Card ${c.id} is not in your sealed pool`, errorKey: 'game.error.invalidDeck' });
            return;
          }
          remaining.set(c.id, left - 1);
        }
      }

      if (!room.isSealed) {
        const ownerId = socket.id === room.hostSocket ? room.hostId : (socket.id === room.guestSocket ? room.guestId : null);
        if (ownerId) {
          try {
            const variantCheck = await validateDeckVariantUnlocks(ownerId, resolvedChars.map((c) => c.id));
            if (!variantCheck.ok) {
              socket.emit('room:error', {
                message: 'Deck contains locked variant cards',
                errorKey: 'deckBuilder.error.variantLocked',
                lockedCardIds: variantCheck.lockedCardIds,
              });
              return;
            }
          } catch (err) {
            console.error('[Socket] Variant unlock check error:', err);
          }
        }
      }

      if (room.isEvolving) {
        const cardIds = safeDeck.characters.map((c) => c.id);
        const missionIds = safeDeck.missions.map((m) => m.id);
        if (!isEvolvingCompatible(cardIds, missionIds)) {
          socket.emit('room:error', {
            message: 'Deck is not compatible with Evolving mode',
            errorKey: 'room.error.evolvingNoDeck',
          });
          return;
        }
      }

      const deckPoints = computeDeckEvolvingPoints(safeDeck.characters.map((c) => c.id));
      const submittingUserId = socket.id === room.hostSocket ? room.hostId : (socket.id === room.guestSocket ? room.guestId : null);
      if (socket.id === room.hostSocket) {
        room.hostDeck = safeDeck;
        room.hostEvolvingPoints = deckPoints;
        if (safeDeckId) room.hostDeckId = safeDeckId;
      } else if (socket.id === room.guestSocket) {
        room.guestDeck = safeDeck;
        room.guestEvolvingPoints = deckPoints;
        if (safeDeckId) room.guestDeckId = safeDeckId;
      }

      if (room.isSealed && room.tournamentId && submittingUserId) {
        try {
          await prisma.tournamentParticipant.updateMany({
            where: { tournamentId: room.tournamentId, userId: submittingUserId },
            data: {
              sealedDeck: {
                cardIds: safeDeck.characters.map((c) => c.id),
                missionIds: safeDeck.missions.map((m) => m.id),
              } as never,
            },
          });
        } catch (err) {
          console.error('[Socket] Failed to persist sealed deck for tournament:', err);
        }
      }

      if (room.isSealed) {

        const otherSocket = socket.id === room.hostSocket ? room.guestSocket : room.hostSocket;
        if (otherSocket) {
          io.to(otherSocket).emit('sealed:opponent-ready');
        }
      }

      if (room.isSealed && room.tournamentId && room.tournamentMatchId && room.tournamentPendingForfeit) {
        const tournamentIdForForfeit = room.tournamentId;
        const matchIdForForfeit = room.tournamentMatchId;
        const forfeitedPlayerId = room.tournamentPendingForfeit;
        room.tournamentPendingForfeit = null;
        if (room.sealedTimer) {
          clearTimeout(room.sealedTimer);
          room.sealedTimer = null;
          room.sealedDeadline = null;
        }
        try {
          const { handleMatchForfeit } = await import('@/lib/socket/tournamentHandlers');
          const { markParticipantAbsence } = await import('@/lib/tournament/prizes');
          await markParticipantAbsence(tournamentIdForForfeit, forfeitedPlayerId);
          await handleMatchForfeit(io, tournamentIdForForfeit, matchIdForForfeit, forfeitedPlayerId);
        } catch (err) {
          console.error('[Socket] Failed to finalize deferred sealed forfeit:', err);
        }
        return;
      }

      if (room.hostDeck && room.guestDeck) {
        
        if (room.sealedTimer) {
          clearTimeout(room.sealedTimer);
          room.sealedTimer = null;
          room.sealedDeadline = null;
        }
        console.log(`[Socket] Both decks submitted in room ${code}, creating game...`);
        console.log(`[Socket] Host deck: ${room.hostDeck.characters.length} characters, ${room.hostDeck.missions.length} missions`);
        console.log(`[Socket] Guest deck: ${room.guestDeck.characters.length} characters, ${room.guestDeck.missions.length} missions`);

        const config: GameConfig = {
          player1: {
            userId: room.hostId,
            isAI: false,
            deck: room.hostDeck.characters,
            missionCards: room.hostDeck.missions,
          },
          player2: {
            userId: room.guestId!,
            isAI: false,
            deck: room.guestDeck.characters,
            missionCards: room.guestDeck.missions,
          },
          gameMode: room.gameMode,
          ...buildEvolvingGameConfigExtras(room),
        };

        room.gameState = GameEngine.createGame(config);
        room.replayInitialState = deepClone(room.gameState);
        room.replayInitialState.actionHistory = [];
        room.replayStateSnapshots = [];
        room.replaySnapshotLogLengths = [];
        room.replayClockSnapshots = [];

        console.log(`[Socket] Game created, phase: ${room.gameState.phase}, activePlayer: ${room.gameState.activePlayer}`);
        console.log(`[Socket] P1 hand: ${room.gameState.player1.hand.length}, P2 hand: ${room.gameState.player2.hand.length}`);

        
        let hostName = 'Player 1';
        let guestName = 'Player 2';
        try {
          const [hostUser, guestUser] = await Promise.all([
            prisma.user.findUnique({ where: { id: room.hostId }, select: { username: true } }),
            room.guestId ? prisma.user.findUnique({ where: { id: room.guestId }, select: { username: true } }) : null,
          ]);
          if (hostUser?.username) hostName = hostUser.username;
          if (guestUser?.username) guestName = guestUser.username;
        } catch {
          
        }
        room.hostName = hostName;
        room.guestName = guestName;

        syncChessClock(room);
        startChessClockTickLoop(room, io);
        const chessClock = buildChessClockBroadcast(room.chessClock, Date.now());

        const p1State = GameEngine.getVisibleStateForTransport(room.gameState, 'player1');
        const p2State = GameEngine.getVisibleStateForTransport(room.gameState, 'player2');
        console.log(`[Socket] P1 visible: hand=${p1State.myState.hand.length}, phase=${p1State.phase}`);
        console.log(`[Socket] P2 visible: hand=${p2State.myState.hand.length}, phase=${p2State.phase}`);

        if (room.hostSocket) {
          io.to(room.hostSocket).emit('game:state-update', {
            visibleState: packVisibleState(p1State),
            playerRole: 'player1',
            playerNames: { player1: hostName, player2: guestName },
            chessClock,
          });
          console.log(`[Socket] Sent state-update to host socket ${room.hostSocket}`);
        } else {
          console.error(`[Socket] Host socket is null! Cannot send state-update`);
        }
        if (room.guestSocket) {
          io.to(room.guestSocket).emit('game:state-update', {
            visibleState: packVisibleState(p2State),
            playerRole: 'player2',
            playerNames: { player1: hostName, player2: guestName },
            chessClock,
          });
          console.log(`[Socket] Sent state-update to guest socket ${room.guestSocket}`);
        } else {
          console.error(`[Socket] Guest socket is null! Cannot send state-update`);
        }

        io.to(code).emit('game:started');
        console.log(`[Socket] Game started event emitted to room ${code}`);
        broadcastActiveGames(io);

        if (room.gameState.phase === 'mulligan') {
          armMulliganIdleTimer(room, code, io);
        }

        
        if (room.tournamentId && room.tournamentMatchId) {
          armTournamentGameTimer(room, code, io);
        }
      } else {
        const who = socket.id === room.hostSocket ? 'host' : 'guest';
        console.log(`[Socket] Deck accepted from ${who} in room ${code}, waiting for other player`);
        socket.emit('room:deck-accepted');
        
        const otherSocket = socket.id === room.hostSocket ? room.guestSocket : room.hostSocket;
        if (otherSocket) {
          io.to(otherSocket).emit('room:opponent-deck-ready');
        }
      }
    });

    
    socket.on('game:request-state', (data?: { roomCode?: string }) => {
      const resolved = resolveRoomSeatForSocket(socket, io, data?.roomCode ?? null);
      if (!resolved) {
        console.warn(`[Socket] game:request-state from ${socket.id}: no seat could be resolved`);
        socket.emit('game:rejoin-failed', { roomCode: data?.roomCode ?? null, reason: 'seat-unresolved' });
        return;
      }
      const { code, room, seat } = resolved;
      if (!room.gameState) return;
      if (room.finalized) {
        console.warn(`[Socket] game:request-state: room ${code} is finalized, skipping`);
        return;
      }
      sendSeatState(room, seat, socket, io);
      console.log(`[Socket] Resync state sent to ${seat} in room ${code}`);
    });


    socket.on('coin-flip-done', () => {
      const resolved = resolveRoomSeatForSocket(socket, io);
      if (!resolved) return;
      const { code, room, seat } = resolved;
      const player = seat;
      room.coinFlipDone[player] = true;
      console.log(`[Socket] coin-flip-done from ${player} in room ${code}`, room.coinFlipDone);
      if (room.coinFlipDone.player1 && room.coinFlipDone.player2) {
        console.log(`[Socket] Both players done with coin flip in room ${code}, broadcasting sync`);
        io.to(code).emit('coin-flip-sync');
        
        room.coinFlipDone = { player1: false, player2: false };
      }
    });

    
    socket.on('action:perform', async (data: { action: GameAction }) => {
      if (!data || typeof data !== 'object' || !data.action || typeof data.action !== 'object' || typeof (data.action as { type?: unknown }).type !== 'string') {
        console.warn(`[Socket] action:perform: malformed payload from ${socket.id}`);
        return;
      }

      const resolvedPerform = resolveRoomSeatForSocket(socket, io);
      if (!resolvedPerform) {
        console.warn(`[Socket] action:perform from ${socket.id}: no seat could be resolved`);
        socket.emit('game:rejoin-failed', { roomCode: null, reason: 'seat-unresolved' });
        return;
      }
      const { code, room, seat } = resolvedPerform;
      if (!room.gameState) {
        console.warn(`[Socket] action:perform: room ${code} has no game state`);
        return;
      }
      if (room.finalized) {
        console.warn(`[Socket] action:perform: room ${code} is already finalized, rejecting`);
        return;
      }

      const player = seat;
      console.log(`[Socket] action:perform from ${player}: ${data.action.type}, phase: ${room.gameState.phase}`);
      clearStaleDisconnectStamp(room, player, io);

      {
        const nowChk = Date.now();
        if (room.chessClock.active === player) {
          if (chessClockBankEmpty(room.chessClock, nowChk)) {
            console.warn(`[Socket] action:perform from ${player}: bank empty, forfeiting`);
            handleChessClockExpiry(room, player, io, 'bank-empty');
            return;
          }
          if (chessClockIdleMs(room.chessClock, nowChk) >= CHESS_CLOCK_IDLE_LIMIT_MS + IDLE_INBOUND_TOLERANCE_MS) {
            console.warn(`[Socket] action:perform from ${player}: idle limit exceeded by more than the network tolerance, triggering idle handler`);
            handleChessClockIdleLimit(room, player, io);
            return;
          }
        }
      }


      const hasPendingAction = room.gameState.pendingActions.some((p: { player: string }) => p.player === player);
      if (room.gameState.activePlayer !== player && !hasPendingAction) {
        if (room.gameState.phase === 'action') {
          console.log(`[Socket] Rejected action from ${player}: not their turn`);
          socket.emit('game:error', { message: 'Not your turn', errorKey: 'game.error.notYourTurn' });
          return;
        }
      }

      try {

        const oldLogLength = room.gameState.log.length;
        const prevState = room.gameState;

        room.gameState = GameEngine.applyAction(
          room.gameState,
          player,
          data.action,
        );

        if (actionMadeProgress(prevState, room.gameState)) {
          markRoomProgress(room);
          noteSeatInput(room, player);
        } else {
          console.warn(`[Socket] ${code}: ${data.action.type} from ${player} changed nothing, not counting it as progress`);
          noteSeatPresence(room, player);
        }

        emitDrawDiffEvents(prevState, room.gameState);
        emitTokenDiffEvents(prevState, room.gameState);

        syncChessClock(room);

        if (room.replayStateSnapshots && room.replaySnapshotLogLengths) {
          room.replaySnapshotLogLengths.push(room.gameState.log.length);
          const snap = deepClone(room.gameState);
          snap.log = [];
          snap.actionHistory = [];
          room.replayStateSnapshots.push(snap);
          if (room.replayClockSnapshots) {
            room.replayClockSnapshots.push(deepClone(room.chessClock));
          }
        }

        
        const isPlayAction = ['PLAY_CHARACTER', 'PLAY_HIDDEN', 'UPGRADE_CHARACTER', 'REVEAL_CHARACTER'].includes(data.action.type);
        const isTargetAction = data.action.type === 'SELECT_TARGET';

        
        
        
        if (isTargetAction && room.gameState.log.length === oldLogLength) {
          const prevPendingIds = prevState.pendingEffects.map((p) => p.targetSelectionType + ':' + p.id).join(',');
          const newPendingIds = room.gameState.pendingEffects.map((p) => p.targetSelectionType + ':' + p.id).join(',');
          const prevActionIds = prevState.pendingActions.map((p) => p.type + ':' + p.id).join(',');
          const newActionIds = room.gameState.pendingActions.map((p) => p.type + ':' + p.id).join(',');
          const pendingChanged = prevPendingIds !== newPendingIds || prevActionIds !== newActionIds;
          const phaseChanged = prevState.phase !== room.gameState.phase;
          const activePlayerChanged = prevState.activePlayer !== room.gameState.activePlayer;
          const chakraChanged = prevState.player1.chakra !== room.gameState.player1.chakra || prevState.player2.chakra !== room.gameState.player2.chakra;
          const boardChanged = JSON.stringify(prevState.activeMissions) !== JSON.stringify(room.gameState.activeMissions);
          const handChanged = prevState.player1.hand.length !== room.gameState.player1.hand.length || prevState.player2.hand.length !== room.gameState.player2.hand.length;
          const discardChanged = prevState.player1.discardPile.length !== room.gameState.player1.discardPile.length || prevState.player2.discardPile.length !== room.gameState.player2.discardPile.length;
          if (!pendingChanged && !phaseChanged && !activePlayerChanged && !chakraChanged && !boardChanged && !handChanged && !discardChanged) {
            console.warn(`[Socket] SELECT_TARGET silently failed for ${player}: state truly unchanged`);
            socket.emit('game:error', { message: 'Effect failed to apply. Please try again.', errorKey: 'game.error.effectFailed' });
            broadcastState(room, io);
            return;
          }
        }

        if (isPlayAction && room.gameState.log.length === oldLogLength) {
          
          let errorMessage = 'Action not allowed.';
          let errorKey = 'game.error.actionNotAllowed';
          let errorParams: Record<string, string | number> | undefined;
          try {
            const playerState = prevState[player as 'player1' | 'player2'];
            if (data.action.type === 'PLAY_CHARACTER' && data.action.cardIndex < playerState.hand.length) {
              const card = playerState.hand[data.action.cardIndex];
              const effCost = calculateEffectiveCost(prevState, player as 'player1' | 'player2', card, data.action.missionIndex, false);
              const result = validatePlayCharacter(prevState, player as 'player1' | 'player2', card, data.action.missionIndex, effCost);
              if (result.reason) errorMessage = result.reason;
              if (result.reasonKey) errorKey = result.reasonKey;
              if (result.reasonParams) errorParams = result.reasonParams;
            } else if (data.action.type === 'PLAY_HIDDEN' && data.action.cardIndex < playerState.hand.length) {
              const card = playerState.hand[data.action.cardIndex];
              const result = validatePlayHidden(prevState, player as 'player1' | 'player2', card, data.action.missionIndex);
              if (result.reason) errorMessage = result.reason;
              if (result.reasonKey) errorKey = result.reasonKey;
              if (result.reasonParams) errorParams = result.reasonParams;
            } else if (data.action.type === 'REVEAL_CHARACTER') {
              const result = validateRevealCharacter(prevState, player as 'player1' | 'player2', data.action.missionIndex, data.action.characterInstanceId, data.action.upgradeTargetInstanceId);
              if (result.reason) errorMessage = result.reason;
              if (result.reasonKey) errorKey = result.reasonKey;
              if (result.reasonParams) errorParams = result.reasonParams;
            } else if (data.action.type === 'UPGRADE_CHARACTER' && data.action.cardIndex < playerState.hand.length) {
              const card = playerState.hand[data.action.cardIndex];
              const result = validateUpgradeCharacter(prevState, player as 'player1' | 'player2', card, data.action.missionIndex, data.action.targetInstanceId);
              if (result.reason) errorMessage = result.reason;
              if (result.reasonKey) errorKey = result.reasonKey;
              if (result.reasonParams) errorParams = result.reasonParams;
            }
          } catch { /* use generic message */ }
          console.log(`[Socket] Action rejected for ${player}: ${errorMessage}`);
          socket.emit('game:error', { message: errorMessage, errorKey, errorParams });
          
          broadcastState(room, io);
          return;
        }

        console.log(`[Socket] Action applied, new phase: ${room.gameState.phase}, activePlayer: ${room.gameState.activePlayer}`);

        


        broadcastState(room, io);


        io.to(code).emit('game:action-performed', {
          player,
          action: data.action,
        });

        if (data.action.type === 'MULLIGAN' && room.gameState.phase === 'mulligan') {
          const playerJustMulliganed = !prevState[player].hasMulliganed && room.gameState[player].hasMulliganed;
          if (playerJustMulliganed) {
            armMulliganIdleTimer(room, code, io);
          }
        }


        const winner = GameEngine.getWinner(room.gameState);
        if (winner) {
          await finalizeGameEnd(room, code, io, 'score');
        } else {
          scheduleMissionAdvance(room, code, io);
        }
      } catch (err) {
        
        
        broadcastState(room, io);
        socket.emit('game:error', {
          message: err instanceof Error ? err.message : 'Invalid action',
          errorKey: 'game.error.invalidAction',
        });
      }
    });

    
    socket.on('action:forfeit', async (data: { reason: 'abandon' | 'timeout'; roomCode?: string; userId?: string }) => {
      const resolvedForfeit = resolveRoomSeatForSocket(socket, io, data?.roomCode ?? null);
      if (!resolvedForfeit) {
        console.warn(`[Socket] action:forfeit rejected: socket ${socket.id} (auth=${socketUserId(socket) ?? 'null'}, claim=${data?.userId ?? 'null'}) has no resolvable seat`);
        socket.emit('game:rejoin-failed', { roomCode: data?.roomCode ?? null, reason: 'seat-unresolved' });
        return;
      }
      const { code, room, seat } = resolvedForfeit;
      if (!room.gameState || room.gameState.phase === 'gameOver') return;
      const player = seat;
      console.log(`[Socket] Forfeit from ${player} in room ${code}, reason: ${data.reason}`);

      room.gameState = GameEngine.applyAction(room.gameState, player, {
        type: 'FORFEIT',
        reason: data.reason,
      });

      broadcastState(room, io);
      await finalizeGameEnd(room, code, io, data.reason === 'timeout' ? 'timeout' : 'forfeit');
    });

    
    socket.on('room:list', () => {
      socket.join('lobby');
      socket.emit('room:list-update', getPublicRoomList());
    });

    socket.on('room:list-unsubscribe', () => {
      socket.leave('lobby');
    });

    
    socket.on('game:rematch-offer', () => {
      const code = playerRooms.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room || !room.gameState || room.gameState.phase !== 'gameOver') return;

      const offerer = socket.id === room.hostSocket ? 'player1' : 'player2';
      room.rematchOffer = offerer;

      
      const opponentSocket = offerer === 'player1' ? room.guestSocket : room.hostSocket;
      if (opponentSocket) {
        io.to(opponentSocket).emit('game:rematch-offered');
      }
      console.log(`[Socket] Rematch offered by ${offerer} in room ${code}`);
    });

    socket.on('game:rematch-accept', async () => {
      const code = playerRooms.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room || !room.rematchOffer) return;

      const accepterUserId = room.hostSocket === socket.id ? room.hostId : room.guestId;
      if (accepterUserId) {
        const tournamentBusy = await getActiveTournamentMatchForUser(accepterUserId);
        if (tournamentBusy && tournamentBusy.roomCode !== code) {
          socket.emit('game:error', { message: `You are in a tournament match (${tournamentBusy.roomCode ?? 'pending'}). Finish it first.`, errorKey: 'game.error.tournamentBusy', errorParams: { roomCode: tournamentBusy.roomCode ?? 'pending' } });
          return;
        }
      }

      console.log(`[Socket] Rematch accepted in room ${code}, redirecting to deck select (sealed: ${room.isSealed})`);
      room.rematchOffer = undefined;


      room.gameState = null;
      room.hostDeck = null;
      room.guestDeck = null;
      room.hostDeckId = undefined;
      room.guestDeckId = undefined;
      room.replayInitialState = null;
      room.replayStateSnapshots = null;
      room.replaySnapshotLogLengths = null;
      room.replayClockSnapshots = null;
      room.finalized = false;
      room.finalizedAt = undefined;
      room.finalBroadcast = null;
      room.coinFlipDone = { player1: false, player2: false };
      clearTournamentJoinTimer(room);
      clearChessClockTimers(room);
      room.chessClock = createChessClock();
      room.chessClockLastInputKey = null;

      const rematchReselectPayload = { roomCode: code, isSealed: room.isSealed, isEvolving: room.isEvolving === true };
      if (room.hostSocket) {
        io.to(room.hostSocket).emit('game:rematch-accepted');
        io.to(room.hostSocket).emit('game:rematch-reselect', rematchReselectPayload);
      }
      if (room.guestSocket) {
        io.to(room.guestSocket).emit('game:rematch-accepted');
        io.to(room.guestSocket).emit('game:rematch-reselect', rematchReselectPayload);
      }

      
      if (room.isSealed) {
        try {
          const { generateSealedPool } = await import('@/lib/sealed/boosterGenerator');
          const count = room.sealedBoosterCount ?? 6;
          const choice = room.sealedSetChoice ?? 'random';
          const hostPool = generateSealedPool(count, choice);
          const guestPool = generateSealedPool(count, choice);
          room.hostSealedPoolIds = hostPool.allCards.map(c => c.id);
          room.guestSealedPoolIds = guestPool.allCards.map(c => c.id);

          if (room.hostSocket) {
            io.to(room.hostSocket).emit('sealed:boosters', {
              boosters: hostPool.boosters,
              allCards: hostPool.allCards,
            });
          }
          if (room.guestSocket) {
            io.to(room.guestSocket).emit('sealed:boosters', {
              boosters: guestPool.boosters,
              allCards: guestPool.allCards,
            });
          }

          console.log(`[Socket] Sealed rematch boosters generated for room ${code}`);

          
          const deadline = Date.now() + SEALED_TIMEOUT_MS;
          room.sealedDeadline = deadline;
          const roomCode = code;
          io.to(roomCode).emit('sealed:timer-start', { deadline, durationMs: SEALED_TIMEOUT_MS });

          room.sealedTimer = setTimeout(() => {
            if (!room.hostDeck || !room.guestDeck) {
              console.log(`[Socket] Sealed rematch time expired for room ${roomCode}`);
              io.to(roomCode).emit('sealed:time-expired');
              io.to(roomCode).emit('room:error', { message: 'Sealed time expired', errorKey: 'game.error.sealedTimeout' });
              if (room.sealedTimer) clearTimeout(room.sealedTimer);
              room.sealedTimer = null;
              clearChessClockTimers(room);
              const wasPublic = !room.isPrivate;
              rooms.delete(roomCode);
              if (room.hostSocket) playerRooms.delete(room.hostSocket);
              if (room.guestSocket) playerRooms.delete(room.guestSocket);
              if (wasPublic) broadcastRoomList(io);
            }
          }, SEALED_TIMEOUT_MS);
        } catch (err) {
          console.error('[Socket] Sealed rematch booster generation error:', err);
        }
      }
    });

    socket.on('game:rematch-decline', () => {
      const code = playerRooms.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room) return;

      room.rematchOffer = undefined;
      const opponentSocket = socket.id === room.hostSocket ? room.guestSocket : room.hostSocket;
      if (opponentSocket) {
        io.to(opponentSocket).emit('game:rematch-declined');
      }
      console.log(`[Socket] Rematch declined in room ${code}`);
    });

    
    socket.on('matchmaking:join', async (data: { userId: string; isRanked?: boolean; isEvolving?: boolean; hostName?: string }) => {
      if (isMaintenanceActive()) {
        socket.emit('game:error', { message: 'Maintenance', errorKey: 'game.error.maintenanceNoNewGames' });
        return;
      }

      const authedUserId_mm = (socket.data as { userId?: string }).userId;
      if (!authedUserId_mm || authedUserId_mm !== data.userId) {
        console.warn(`[Socket] matchmaking:join rejected: socket auth mismatch (claim=${data.userId}, auth=${authedUserId_mm ?? 'null'})`);
        socket.emit('game:error', { message: 'Authentication mismatch', errorKey: 'game.error.authMismatch' });
        return;
      }

      if (await isSuspended(data.userId)) {
        socket.emit('game:error', { message: 'Account suspended', errorKey: 'game.error.suspended' });
        return;
      }
      if ((data.isRanked === true || data.isEvolving === true) && (await isRankedBanned(data.userId))) {
        socket.emit('game:error', { message: 'Ranked mode is closed to you', errorKey: 'game.error.rankedBanned' });
        return;
      }
      if (await isUserGameBanned(data.userId)) {
        socket.emit('game:error', { message: 'You are banned from playing online games', errorKey: 'game.error.gameBanned' });
        return;
      }

      const tournamentBusy = await getActiveTournamentMatchForUser(data.userId);
      if (tournamentBusy) {
        socket.emit('game:error', { message: `You are in a tournament match (${tournamentBusy.roomCode ?? 'pending'}). Finish it first.`, errorKey: 'game.error.tournamentBusy', errorParams: { roomCode: tournamentBusy.roomCode ?? 'pending' } });
        return;
      }

      const wantRanked = data.isRanked ?? true;
      const wantEvolving = data.isEvolving === true;
      console.log(`[Socket] User ${data.userId} joining matchmaking (ranked: ${wantRanked}, evolving: ${wantEvolving})`);

      if (wantEvolving) {
        const has = await userHasEvolvingDeck(data.userId);
        if (!has) {
          socket.emit('game:error', { message: 'You need an evolving deck to matchmake in evolving', errorKey: 'room.error.evolvingNoDeck' });
          return;
        }
      }


      cleanupPlayerRoom(socket);


      cleanupStaleRooms(io);

      for (const [existingCode, existingRoom] of rooms) {
        if (existingRoom.hostId === data.userId && !existingRoom.guestId && !existingRoom.gameState && existingRoom.hostSocket !== socket.id) {
          const existingHostSock = io.sockets.sockets.get(existingRoom.hostSocket);
          if (existingHostSock && existingHostSock.connected) {
            console.log(`[Socket] User ${data.userId} already queued in room ${existingCode}, rejecting duplicate matchmaking from socket ${socket.id}`);
            socket.emit('game:error', { message: 'You are already queued in another tab', errorKey: 'game.error.alreadyQueued' });
            return;
          }
          clearChessClockTimers(existingRoom);
          rooms.delete(existingCode);
          playerRooms.delete(existingRoom.hostSocket);
          if (!existingRoom.isPrivate) broadcastRoomList(io);
        }
      }



      let foundRoom: RoomData | null = null;
      for (const [code, room] of rooms) {
        if (!room.isPrivate && !room.guestId && room.hostId !== data.userId && room.isRanked === wantRanked && room.isEvolving === wantEvolving) {
          
          const hostSocketObj = io.sockets.sockets.get(room.hostSocket);
          if (hostSocketObj && hostSocketObj.connected) {
            foundRoom = room;
            break;
          } else {
            
            console.log(`[Socket] Matchmaking: removing stale room ${code} (host socket disconnected)`);
            clearChessClockTimers(room);
            rooms.delete(code);
            playerRooms.delete(room.hostSocket);
          }
        }
      }

      if (foundRoom) {
        console.log(`[Socket] Matchmaking: found room ${foundRoom.code} for user ${data.userId}`);
        
        foundRoom.guestId = data.userId;
        foundRoom.guestSocket = socket.id;
        playerRooms.set(socket.id, foundRoom.code);
        socket.join(foundRoom.code);

        io.to(foundRoom.code).emit('room:player-joined', {
          hostId: foundRoom.hostId,
          guestId: foundRoom.guestId,
          gameMode: foundRoom.gameMode,
          isEvolving: foundRoom.isEvolving === true,
          holoHue: foundRoom.holoHue ?? null,
        });

        
        if (foundRoom.hostSocket) {
          io.to(foundRoom.hostSocket).emit('matchmaking:found', {
            code: foundRoom.code,
            playerRole: 'player1',
          });
        }
        socket.emit('matchmaking:found', {
          code: foundRoom.code,
          playerRole: 'player2',
        });
      } else {
        console.log(`[Socket] Matchmaking: creating new room for user ${data.userId}`);
        
        let code: string;
        do {
          code = generateRoomCode();
        } while (rooms.has(code));

        const room: RoomData = {
          code,
          hostId: data.userId,
          hostSocket: socket.id,
          hostName: data.hostName || userNames.get(data.userId) || 'Unknown',
          guestId: null,
          guestSocket: null,
          gameState: null,
          hostDeck: null,
          guestDeck: null,
          isPrivate: false,
          isRanked: wantRanked,
          isAnonymous: false,
          gameMode: wantEvolving && wantRanked ? 'evolving' : (wantRanked ? 'ranked' : 'casual'),
          isEvolving: wantEvolving,
          holoHue: wantEvolving ? Math.floor(Math.random() * 360) : null,
          hostEvolvingPoints: 0,
          guestEvolvingPoints: 0,
          createdAt: Date.now(),
          replayInitialState: null,
          replayStateSnapshots: null,
          replaySnapshotLogLengths: null,
          replayClockSnapshots: null,
          finalized: false,
          isSealed: false,
          sealedBoosterCount: 6,
          sealedTimer: null,
          sealedDeadline: null,
          coinFlipDone: { player1: false, player2: false },
          spectators: new Map(),
          hostAllowSpectatorHand: false,
          guestAllowSpectatorHand: false,
          chatMessages: [],
          chatLastCleanup: 0,
          chessClock: createChessClock(),
          chessClockTickTimer: null,
          chessClockMulliganTimer: null,
          chessClockLastInputKey: null,
          };

        rooms.set(code, room);
        playerRooms.set(socket.id, code);
        socket.join(code);

        socket.emit('matchmaking:waiting');
        broadcastRoomList(io);
      }
    });

    socket.on('matchmaking:leave', () => {
      const code = playerRooms.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room) return;

      
      if (!room.guestId && !room.gameState) {
        const wasPublic = !room.isPrivate;
        clearChessClockTimers(room);
        rooms.delete(code);
        playerRooms.delete(socket.id);
        socket.leave(code);
        console.log(`[Socket] Matchmaking: user left queue, room ${code} removed`);
        if (wasPublic) broadcastRoomList(io);
      }
    });

    
    

    socket.on('spectate:join', async (data: { roomCode: string; userId: string; username: string }) => {
      const authedUserId = (socket.data as { userId?: string }).userId;
      if (!authedUserId || authedUserId !== data.userId) {
        console.warn(`[Socket] spectate:join rejected: socket auth mismatch (claim=${data.userId}, auth=${authedUserId ?? 'null'})`);
        socket.emit('spectate:error', { message: 'Authentication mismatch', errorKey: 'spectate.errorAuth' });
        return;
      }

      if (await isSpectateBanned(data.userId)) {
        socket.emit('spectate:error', { message: 'Spectating is closed to you', errorKey: 'spectate.errorBanned' });
        return;
      }

      const room = rooms.get(data.roomCode);
      if (!room || !room.gameState) {
        socket.emit('spectate:error', { message: 'Game not found or not in progress', errorKey: 'spectate.errorNotFound' });
        return;
      }
      if (room.finalized) {
        socket.emit('spectate:error', { message: 'Game has ended', errorKey: 'spectate.errorEnded' });
        return;
      }
      if (room.player1DisconnectedAt && room.player2DisconnectedAt) {
        socket.emit('spectate:error', { message: 'Game has ended', errorKey: 'spectate.errorEnded' });
        return;
      }

      if (room.isPrivate && room.hostId !== authedUserId && room.guestId !== authedUserId) {
        socket.emit('spectate:error', { message: 'This is a private game', errorKey: 'spectate.errorPrivate' });
        return;
      }

      const MAX_SPECTATORS_PER_ROOM = 100;
      if (room.spectators.size >= MAX_SPECTATORS_PER_ROOM && !room.spectators.has(socket.id)) {
        socket.emit('spectate:error', { message: 'Spectator limit reached for this room', errorKey: 'spectate.errorLimit' });
        return;
      }

      const safeSpecUsername = typeof data.username === 'string' && data.username.length > 0 && data.username.length <= 50
        ? data.username
        : (userNames.get(data.userId) || 'Spectator');
      room.spectators.set(socket.id, { socketId: socket.id, userId: data.userId, username: safeSpecUsername });
      emitQuestEvent('social.spectator.entered', data.userId);
      socket.join(data.roomCode);
      socket.join(`spec:${data.roomCode}`);
      playerRooms.set(socket.id, `spec:${data.roomCode}`);


      try {
        syncChessClock(room);
        startChessClockTickLoop(room, io);
        const chessClock = buildChessClockBroadcast(room.chessClock, Date.now());
        const p1State = GameEngine.getVisibleStateForTransport(room.gameState, 'player1');
        const specMs = p1State.activeMissions.map((m: any) => ({
          ...m,
          player1Characters: m.player1Characters.map((c: any) => c.isHidden && !c.wasRevealedAtLeastOnce ? { ...c, card: undefined, topCard: undefined, isOwn: false } : c),
          player2Characters: m.player2Characters.map((c: any) => c.isHidden && !c.wasRevealedAtLeastOnce ? { ...c, card: undefined, topCard: undefined, isOwn: false } : c),
        }));
        const p1HandSize = room.gameState!.player1.hand.length;
        const p2HandSize = room.gameState!.player2.hand.length;
        const spectatorState = {
          ...p1State,
          activeMissions: specMs,
          myState: { ...p1State.myState, hand: [], handSize: p1HandSize },
          opponentState: { ...p1State.opponentState, hand: [], handSize: p2HandSize },
        };
        const playerNames = { player1: room.hostName ?? 'Player 1', player2: room.guestName ?? 'Player 2' };
        socket.emit('spectate:state-update', {
          visibleState: packVisibleState(spectatorState),
          playerNames,
          spectatorCount: room.spectators.size,
          roomCode: data.roomCode,
          chessClock,
          isEvolving: room.isEvolving === true,
          holoHue: room.holoHue ?? null,
        });

        socket.emit('chat:history', { messages: room.chatMessages.slice(-50) });
      } catch (err) {
        console.error('[Socket] Spectator state error:', err);
      }

      
      const count = room.spectators.size;
      io.to(data.roomCode).emit('spectate:count-update', { count });

      
      const joinMsg = {
        id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        userId: 'system', username: 'System',
        message: `${safeSpecUsername} joined as spectator`,
        isEmote: false, isSpectator: false, timestamp: Date.now(),
      };
      room.chatMessages.push(joinMsg);
      if (room.chatMessages.length > 100) room.chatMessages = room.chatMessages.slice(-100);
      io.to(data.roomCode).emit('chat:message', joinMsg);
    });


    socket.on('spectate:request-state', (data: { roomCode: string }) => {
      const room = rooms.get(data.roomCode);
      if (!room || !room.gameState) {
        socket.emit('spectate:error', { message: 'Game not found or not in progress', errorKey: 'spectate.errorNotFound' });
        return;
      }
      if (room.finalized) {
        socket.emit('spectate:error', { message: 'Game has ended', errorKey: 'spectate.errorEnded' });
        return;
      }
      const isPlayer = socket.id === room.hostSocket || socket.id === room.guestSocket;
      const isSpec = room.spectators.has(socket.id);
      if (!isPlayer && !isSpec) {
        socket.emit('spectate:error', { message: 'Not subscribed to this room', errorKey: 'spectate.errorNotSubscribed' });
        return;
      }
      try {
        syncChessClock(room);
        startChessClockTickLoop(room, io);
        const chessClock = buildChessClockBroadcast(room.chessClock, Date.now());
        const p1State = GameEngine.getVisibleStateForTransport(room.gameState, 'player1');
        const specMs = p1State.activeMissions.map((m: any) => ({
          ...m,
          player1Characters: m.player1Characters.map((c: any) => c.isHidden && !c.wasRevealedAtLeastOnce ? { ...c, card: undefined, topCard: undefined, isOwn: false } : c),
          player2Characters: m.player2Characters.map((c: any) => c.isHidden && !c.wasRevealedAtLeastOnce ? { ...c, card: undefined, topCard: undefined, isOwn: false } : c),
        }));
        const p1HandSize = room.gameState!.player1.hand.length;
        const p2HandSize = room.gameState!.player2.hand.length;
        const spectatorState = {
          ...p1State,
          activeMissions: specMs,
          myState: { ...p1State.myState, hand: [], handSize: p1HandSize },
          opponentState: { ...p1State.opponentState, hand: [], handSize: p2HandSize },
        };
        const playerNames = { player1: room.hostName ?? 'Player 1', player2: room.guestName ?? 'Player 2' };
        socket.emit('spectate:state-update', {
          visibleState: packVisibleState(spectatorState),
          playerNames,
          spectatorCount: room.spectators.size,
          roomCode: data.roomCode,
          chessClock,
          isEvolving: room.isEvolving === true,
          holoHue: room.holoHue ?? null,
        });
      } catch (err) {
        console.error('[Socket] Spectator request-state error:', err);
      }
    });

    socket.on('spectate:leave', () => {
      const specKey = playerRooms.get(socket.id);
      if (!specKey?.startsWith('spec:')) return;
      const roomCode = specKey.slice(5);
      const room = rooms.get(roomCode);
      if (room) {
        const spec = room.spectators.get(socket.id);
        room.spectators.delete(socket.id);
        socket.leave(roomCode);
        socket.leave(`spec:${roomCode}`);
        io.to(roomCode).emit('spectate:count-update', { count: room.spectators.size });
        if (spec) {
          const leaveMsg = {
            id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            userId: 'system', username: 'System',
            message: `${spec.username} left`,
            isEmote: false, isSpectator: false, timestamp: Date.now(),
          };
          room.chatMessages.push(leaveMsg);
          if (room.chatMessages.length > 100) room.chatMessages = room.chatMessages.slice(-100);
          io.to(roomCode).emit('chat:message', leaveMsg);
        }
      }
      playerRooms.delete(socket.id);
    });

    

    socket.on('chat:send', async (data: { message: string; isEmote: boolean }) => {
      if (!data || typeof data !== 'object') return;
      const isEmote = data.isEmote === true;
      const validation = validateChatMessage(data.message, isEmote);
      if (!validation.ok) {
        socket.emit('chat:error', { message: 'Invalid message', errorKey: validation.errorKey });
        return;
      }
      const trimmed = validation.text;

      let roomCode = playerRooms.get(socket.id);
      let isSpectator = false;
      if (roomCode?.startsWith('spec:')) {
        roomCode = roomCode.slice(5);
        isSpectator = true;
      }
      if (!roomCode) return;
      const room = rooms.get(roomCode);
      if (!room) return;

      let userId = '';
      let username = '';
      if (isSpectator) {
        const spec = room.spectators.get(socket.id);
        if (!spec) return;
        userId = spec.userId;
        username = spec.username;
      } else {
        const isHost = room.hostSocket === socket.id;
        userId = isHost ? room.hostId : (room.guestId ?? '');
        username = isHost ? (room.hostName ?? 'Player 1') : (room.guestName ?? 'Player 2');
      }
      if (!userId) return;

      const now = Date.now();
      if (isOnChatCooldown(chatLastSentAt.get(userId), now)) {
        socket.emit('chat:error', { message: 'Wait a moment', errorKey: 'chat.cooldown' });
        return;
      }
      const recent = chatRateLimit.get(userId) ?? [];
      const windowStart = now - CHAT_RATE_WINDOW_MS;
      const fresh = recent.filter(t => t > windowStart);
      if (fresh.length >= CHAT_RATE_MAX) {
        socket.emit('chat:error', { message: 'Slow down, you are sending messages too fast', errorKey: 'chat.rateLimit' });
        return;
      }
      fresh.push(now);
      chatRateLimit.set(userId, fresh);
      if (chatRateLimit.size > 5000) {
        for (const [uid, ts] of chatRateLimit) {
          if (ts.length === 0 || ts[ts.length - 1] < windowStart) chatRateLimit.delete(uid);
        }
      }

      let muted = false;
      let shadowMuted = false;
      try {
        const flags = await getModerationFlags(userId);
        muted = flags.muted || flags.suspended;
        shadowMuted = flags.shadowMuted;
        if (!muted) {
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { chatBanned: true, chatBanUntil: true },
          });
          if (user?.chatBanned) {
            if (!user.chatBanUntil || user.chatBanUntil > new Date()) {
              muted = true;
            } else {
              await prisma.user.update({ where: { id: userId }, data: { chatBanned: false, chatBanUntil: null } });
            }
          }
        }
      } catch { /* ignore moderation lookup errors */ }

      let playersLockState: import('@/lib/chat/chatRules').ChatLockState = 'open';
      if (!isSpectator && room.guestId) {
        try {
          const pair = await getPairChatState(room.hostId, room.guestId);
          playersLockState = pair.lockState;
        } catch { /* ignore pair lookup errors */ }
      }

      const decision = decideChatDelivery({ isSpectator, muted, shadowMuted, playersLockState });
      if (decision.action === 'reject') {
        socket.emit('chat:error', { message: 'Message not delivered', errorKey: decision.errorKey });
        return;
      }

      const masked = maskProfanity(trimmed);
      const chatMsg = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        userId, username,
        message: masked,
        isEmote,
        isSpectator,
        timestamp: Date.now(),
      };

      chatLastSentAt.set(userId, now);
      if (chatLastSentAt.size > 5000) {
        for (const [uid, ts] of chatLastSentAt) {
          if (now - ts > 60_000) chatLastSentAt.delete(uid);
        }
      }

      if (decision.action === 'echo_only') {
        socket.emit('chat:message', chatMsg);
        return;
      }

      socket.emit('chat:message', chatMsg);

      prisma.chatMessage.create({
        data: {
          roomCode, userId, username,
          message: trimmed,
          isEmote,
          isSpectator,
        },
      }).catch(() => {});

      import('@/lib/db/chatCleanup').then(m => m.cleanupOldChatMessages()).catch(() => {});

      let holdVerdict: HoldVerdict = 'none';
      if (!isEmote) {
        holdVerdict = await holdScanMessage({ messageId: chatMsg.id, roomCode, userId, username, message: trimmed });
      }

      if (holdVerdict === 'blocked') {
        room.chatMessages.push({ ...chatMsg, message: '', removedByModeration: true });
        if (room.chatMessages.length > 100) room.chatMessages = room.chatMessages.slice(-100);
        socket.emit('chat:message-removed', { id: chatMsg.id });
        return;
      }

      room.chatMessages.push(chatMsg);
      if (room.chatMessages.length > 100) room.chatMessages = room.chatMessages.slice(-100);

      if (userId && !isEmote) {
        emitQuestEvent('social.chat.message.sent', userId);
      }

      if (!isEmote && holdVerdict === 'unavailable') {
        enqueueChatScan({ messageId: chatMsg.id, roomCode, userId, username, message: trimmed });
      }

      if (decision.recipients === 'spectators_only') {
        io.to(`spec:${roomCode}`).except(socket.id).emit('chat:message', chatMsg);
      } else {
        if (room.hostSocket && room.hostSocket !== socket.id) io.to(room.hostSocket).emit('chat:message', chatMsg);
        if (room.guestSocket && room.guestSocket !== socket.id) io.to(room.guestSocket).emit('chat:message', chatMsg);
        io.to(`spec:${roomCode}`).except(socket.id).emit('chat:message', chatMsg);
      }
    });

    socket.on('dm:send', async (data: { toUserId: string; body: string }) => {
      const userId = (socket.data as { userId?: string }).userId;
      if (!userId || !data || typeof data.toUserId !== 'string') return;
      const now = Date.now();
      if (isOnChatCooldown(chatLastSentAt.get(userId), now)) {
        socket.emit('chat:error', { message: 'Wait a moment', errorKey: 'chat.cooldown' });
        return;
      }
      try {
        const result = await sendDm(userId, data.toUserId, data.body);
        if (!result.ok) {
          socket.emit('chat:error', { message: 'Message not delivered', errorKey: result.errorKey });
          return;
        }
        chatLastSentAt.set(userId, now);
        const payload = {
          id: result.message.id,
          threadKey: result.message.threadKey,
          senderId: result.message.senderId,
          receiverId: result.message.receiverId,
          body: result.message.body,
          createdAt: result.message.createdAt.getTime(),
        };
        socket.emit('dm:message', payload);
        if (!result.echoOnly) {
          enqueueChatScan({
            messageId: result.message.id,
            roomCode: `dm:${result.message.threadKey}`,
            userId,
            username: '',
            message: result.message.body,
            channel: 'dm',
          });
          emitToUser(data.toUserId, 'dm:message', payload);
          getUnreadDmCount(data.toUserId)
            .then((total) => emitToUser(data.toUserId, 'dm:unread-count', { total }))
            .catch(() => {});
        }
      } catch {
        socket.emit('chat:error', { message: 'Message not delivered', errorKey: 'chat.sendError' });
      }
    });

    socket.on('dm:read', async (data: { threadKey: string }) => {
      const userId = (socket.data as { userId?: string }).userId;
      if (!userId || !data || typeof data.threadKey !== 'string') return;
      try {
        await markThreadRead(userId, data.threadKey);
        const total = await getUnreadDmCount(userId);
        emitToUser(userId, 'dm:unread-count', { total });
      } catch { /* ignore read errors */ }
    });

    socket.on('chat:lock-get', async () => {
      const mapped = playerRooms.get(socket.id);
      if (!mapped || mapped.startsWith('spec:')) return;
      const room = rooms.get(mapped);
      if (!room || !room.guestId) return;
      await emitChatLockStateToRoom(io, room);
    });

    socket.on('games:list', () => {
      socket.join('games-watchers');
      const activeGames: Array<{
        roomCode: string;
        player1Name: string;
        player2Name: string;
        spectatorCount: number;
        turn: number;
        isRanked: boolean;
        isPrivate: boolean;
        isEvolving: boolean;
      }> = [];

      for (const [code, room] of rooms) {
        if (!room.gameState || room.gameState.phase === 'gameOver') continue;
        activeGames.push({
          roomCode: code,
          player1Name: room.hostName ?? 'Player 1',
          player2Name: room.guestName ?? 'Player 2',
          spectatorCount: room.spectators.size,
          turn: room.gameState.turn,
          isRanked: room.isRanked,
          isPrivate: room.isPrivate,
          isEvolving: room.isEvolving === true,
        });
      }

      socket.emit('games:list-update', { games: activeGames });
    });

    socket.on('games:list-unsubscribe', () => {
      socket.leave('games-watchers');
    });

    

    socket.on('disconnect', () => {
      console.log(`[Socket] Player disconnecting: ${socket.id}`);

      
      const specKey = playerRooms.get(socket.id);
      if (specKey?.startsWith('spec:')) {
        const roomCode = specKey.slice(5);
        const room = rooms.get(roomCode);
        if (room) {
          room.spectators.delete(socket.id);
          io.to(roomCode).emit('spectate:count-update', { count: room.spectators.size });
        }
        playerRooms.delete(socket.id);
        const sr = removeSocketFromAll(socket.id);
        if (sr?.isLastSocket) userNames.delete(sr.userId);
        console.log(`[Socket] Spectator disconnected: ${socket.id}`);
        return;
      }

      const code = playerRooms.get(socket.id);
      if (code) {
        const room = rooms.get(code);
        if (room) {
          const seat = resolveSeatBySocket(room, socket.id);
          if (!seat) {
            console.log(`[Socket] Stale socket ${socket.id} disconnected from room ${code} (no longer seated), ignoring`);
            playerRooms.delete(socket.id);
            const staleResult = removeSocketFromAll(socket.id);
            if (staleResult?.isLastSocket) userNames.delete(staleResult.userId);
            return;
          }

          const isHost = seat === 'player1';
          const player = seat;
          const seatUserId = isHost ? room.hostId : room.guestId;
          const inGame = !!room.gameState && room.gameState.phase !== 'gameOver' && !room.finalized;

          if (inGame && seatUserId) {
            const otherLiveSocket = getUserSocketIds(seatUserId).some(
              (sid) => sid !== socket.id && io.sockets.sockets.get(sid)?.connected === true,
            );
            if (otherLiveSocket) {
              console.log(`[Socket] ${player} dropped socket ${socket.id} in room ${code} but still has another live socket, rebinding instead of flagging a disconnect`);
              playerRooms.delete(socket.id);
              const keptResult = removeSocketFromAll(socket.id);
              if (keptResult?.isLastSocket) userNames.delete(keptResult.userId);
              for (const sid of getUserSocketIds(seatUserId)) {
                const liveSock = io.sockets.sockets.get(sid);
                if (!liveSock || !liveSock.connected) continue;
                markSeatPresent(room, seat, sid, io);
                liveSock.join(code);
                sendSeatState(room, seat, liveSock, io);
                break;
              }
              return;
            }
          }

          if (!inGame) {
            io.to(code).emit('room:player-left', { socketId: socket.id });
          }
          console.log(`[Socket] Player ${socket.id} left room ${code}`);

          if (room.tournamentId && !room.gameState) {
            console.log(`[Socket] ${player} left pre-game tournament room ${code}, keeping the room alive`);
            if (isHost) room.hostSocket = '';
            else room.guestSocket = null;
            playerRooms.delete(socket.id);
            const tResult = removeSocketFromAll(socket.id);
            if (tResult?.isLastSocket) userNames.delete(tResult.userId);
            return;
          }


          if (room.gameState && room.gameState.phase === 'gameOver') {
            console.log(`[Socket] ${player} disconnected during gameOver in room ${code}`);
            const opponentSocket = isHost ? room.guestSocket : room.hostSocket;
            if (opponentSocket) {
              
              if (room.rematchOffer) {
                room.rematchOffer = undefined;
                io.to(opponentSocket).emit('game:rematch-declined');
              }
              
              io.to(opponentSocket).emit('game:opponent-left');
            }
            clearChessClockTimers(room);
            rooms.delete(code);
          }


          else if (room.gameState && room.gameState.phase !== 'gameOver' && !room.finalized) {
            console.log(`[Socket] ${player} disconnected during game in room ${code}, chess clock continues`);
            const disconnectedAt = Date.now();
            const opponentSock = isHost ? room.guestSocket : room.hostSocket;
            if (opponentSock) {
              io.to(opponentSock).emit('game:opponent-disconnected', {
                forfeitAt: disconnectedAt + CHESS_CLOCK_DISCONNECT_FORFEIT_MS,
                forfeitMs: CHESS_CLOCK_DISCONNECT_FORFEIT_MS,
              });
            }


            if (isHost) {
              room.hostSocket = '';
              room.player1DisconnectedAt = disconnectedAt;
            } else {
              room.guestSocket = null;
              room.player2DisconnectedAt = disconnectedAt;
            }
          } else if (room.isSealed && room.guestId && !room.gameState) {
            console.log(`[Socket] ${player} disconnected during sealed deck-building in room ${code}`);
            if (isHost) {
              if (room.sealedTimer) clearTimeout(room.sealedTimer);
              clearChessClockTimers(room);
              const wasPublic = !room.isPrivate;
              rooms.delete(code);
              if (wasPublic) broadcastRoomList(io);
            } else {
              room.guestId = null;
              room.guestSocket = null;
              room.guestDeck = null;
              if (!room.isPrivate) broadcastRoomList(io);
            }
          } else if (isHost) {
            
            if (!room.gameState) {
              console.log(`[Socket] Host left room ${code} before game started, removing room`);
              const wasPublic = !room.isPrivate;
              clearChessClockTimers(room);
              rooms.delete(code);
              if (wasPublic) broadcastRoomList(io);
            }
          } else if (room.guestSocket === socket.id) {
            
            console.log(`[Socket] Guest left room ${code}, resetting guest`);
            room.guestId = null;
            room.guestSocket = null;
            room.guestDeck = null;
            if (!room.isPrivate && !room.gameState) broadcastRoomList(io);
          }
        }
        playerRooms.delete(socket.id);
      }

      const result = removeSocketFromAll(socket.id);
      if (result?.isLastSocket) userNames.delete(result.userId);

      console.log(`[Socket] Player disconnected: ${socket.id}`);
    });
  });
}



export function getActiveGameCount(): number {
  let count = 0;
  for (const room of rooms.values()) {
    if (room.gameState && room.gameState.phase !== 'gameOver') {
      count++;
    }
  }
  return count;
}

const DRAIN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const DRAIN_CHECK_INTERVAL_MS = 5000; // Check every 5 seconds

export function startMaintenanceDrain(io: SocketIOServer): void {
  if (isMaintenanceActive()) {
    console.log('[Maintenance] Already active, skipping.');
    return;
  }

  activateMaintenance();
  const activeGames = getActiveGameCount();
  console.log(`[Maintenance] Drain started. ${activeGames} active game(s).`);

  
  io.emit('server:maintenance-warning', { activeGames });

  
  if (activeGames === 0) {
    console.log('[Maintenance] No active games. Shutting down now.');
    io.emit('server:maintenance', { timestamp: Date.now() });
    setTimeout(() => process.exit(0), 2000);
    return;
  }

  
  const checkInterval = setInterval(() => {
    const remaining = getActiveGameCount();
    console.log(`[Maintenance] ${remaining} game(s) still active.`);
    if (remaining === 0) {
      clearInterval(checkInterval);
      console.log('[Maintenance] All games finished. Shutting down.');
      io.emit('server:maintenance', { timestamp: Date.now() });
      setTimeout(() => {
        io.disconnectSockets(true);
        process.exit(0);
      }, 2000);
    }
  }, DRAIN_CHECK_INTERVAL_MS);

  setCheckInterval(checkInterval);

  
  const timeout = setTimeout(() => {
    clearInterval(checkInterval);
    console.log('[Maintenance] Drain timeout (5 min). Force shutting down.');
    io.emit('server:maintenance', { timestamp: Date.now() });
    setTimeout(() => {
      io.disconnectSockets(true);
      process.exit(0);
    }, 2000);
  }, DRAIN_TIMEOUT_MS);

  setDrainTimeout(timeout);
}
