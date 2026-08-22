
import type { Server, Socket } from 'socket.io';
import { prisma } from '@/lib/db/prisma';
import { emitQuestEvent } from '@/lib/quests/hooks';
import { ensureQuestPersistenceListener } from '@/lib/quests/listenerSetup';

ensureQuestPersistenceListener();
import { startAbsenceTimer, clearAbsenceTimer, scheduleAbsenceTimerWithDeadline, ABSENCE_TIMEOUT_MS } from '@/lib/tournament/absenceManager';
import { assignTournamentWinnerRole } from '@/lib/discord/tournamentRoles';
import { sendTournamentResults } from '@/lib/discord/tournamentWebhook';
import { pickDoubleAbsenceLoser } from '@/lib/tournament/matchRulings';
import { rooms, maybeStartTournamentGame, reconcileTournamentRoomSeats, isSeatSocketAlive, clearTournamentInviteTimer, isUserInAnotherLiveGame, type RoomData } from '@/lib/socket/server';
import { emitToUser, isUserConnected } from '@/lib/socket/io';
import { decideAbsenceOutcome, decideJoinCheckOutcome, type JoinCheckSeat } from '@/lib/tournament/absenceDecision';
import { createChessClock } from '@/lib/timing/chessClock';
import { finalizeAndScheduleRoomDeletion, clearAllMatchRoomTimers } from '@/lib/tournament/matchRoomCleanup';
import { logMatchEvent } from '@/lib/tournament/matchEventLog';
import { awardNwlPrizeIfNeeded } from '@/lib/tournament/nwlPrize';
import {
  computeStandings,
  generateSwissPairings,
  type SwissPlayer,
  type SwissMatchResult,
} from '@/lib/tournament/swissEngine';
import {
  loserDropTarget,
  winnerAdvanceTarget,
  type DEBracket,
} from '@/lib/tournament/doubleElimEngine';
import { MAIN_BRACKET, THIRD_PLACE_BRACKET } from '@/lib/tournament/tournamentEngine';
import { getCharacterById, getMissionById } from '@/lib/data/cardIndex';
import type { CharacterCard, MissionCard } from '@/lib/engine/types';
import { computeDeckEvolvingPoints } from '@/lib/evolving/computePoints';
import {
  grantWinnerPrize,
  grantParticipantReward,
  listEligibleParticipantsForReward,
  markParticipantAbsence,
  clearParticipantAbsence,
  readTournamentPrizeCardId,
  acquirePrizeAwardLock,
} from '@/lib/tournament/prizes';

const matchReadyPlayers = new Map<string, Set<string>>();

async function isWinnerDeckMonoVillage(tournamentId: string, winnerUserId: string): Promise<boolean> {
  try {
    const participant = await prisma.tournamentParticipant.findFirst({
      where: { tournamentId, userId: winnerUserId },
      select: { deckId: true, sealedDeck: true },
    });
    if (!participant) return false;
    let cardIds: string[] = [];
    if (participant.deckId) {
      const deck = await prisma.deck.findUnique({ where: { id: participant.deckId }, select: { cardIds: true } });
      if (deck?.cardIds) cardIds = deck.cardIds;
    } else if (participant.sealedDeck && typeof participant.sealedDeck === 'object') {
      const sealed = participant.sealedDeck as { cardIds?: unknown };
      if (Array.isArray(sealed.cardIds)) cardIds = sealed.cardIds.filter((id): id is string => typeof id === 'string');
    }
    if (cardIds.length === 0) return false;
    const groups = new Set<string>();
    for (const id of cardIds) {
      const c = getCharacterById(id);
      if (c?.group) groups.add(c.group);
    }
    return groups.size === 1;
  } catch {
    return false;
  }
}


const swissRoundLocks = new Map<string, Promise<void>>();
const matchReadyLocks = new Map<string, Promise<void>>();

async function withSwissRoundLock<T>(lockKey: string, fn: () => Promise<T>): Promise<T> {
  while (swissRoundLocks.has(lockKey)) {
    try { await swissRoundLocks.get(lockKey); } catch { /* ignore */ }
  }
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  swissRoundLocks.set(lockKey, promise);
  try {
    return await fn();
  } finally {
    swissRoundLocks.delete(lockKey);
    release();
  }
}

async function withMatchReadyLock<T>(matchId: string, fn: () => Promise<T>): Promise<T> {
  while (matchReadyLocks.has(matchId)) {
    try { await matchReadyLocks.get(matchId); } catch { /* ignore */ }
  }
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  matchReadyLocks.set(matchId, promise);
  try {
    return await fn();
  } finally {
    matchReadyLocks.delete(matchId);
    release();
  }
}


export function cleanupTournamentMapsByIds(tournamentId: string, matchIds: readonly string[]): void {
  for (const matchId of matchIds) {
    matchReadyPlayers.delete(matchId);
    matchReadyLocks.delete(matchId);
    matchNoContestCount.delete(matchId);
  }
  for (const [key] of swissRoundLocks) {
    if (key.startsWith(tournamentId)) swissRoundLocks.delete(key);
  }
}

async function cleanupTournamentMaps(tournamentId: string): Promise<void> {
  const matchIds = (await prisma.tournamentMatch.findMany({
    where: { tournamentId },
    select: { id: true },
  })).map(m => m.id);
  cleanupTournamentMapsByIds(tournamentId, matchIds);
}

export const cleanupTournamentMapsExternal = cleanupTournamentMaps;

const ABSENCE_GRACE_RETRY_MS = 30_000;

export function getConnectedUserIdsInTournament(io: Server, tournamentId: string): Set<string> {
  const roomName = `tournament:${tournamentId}`;
  const connected = new Set<string>();
  try {
    const allSockets = (io as unknown as { sockets: { sockets: Map<string, { data?: { userId?: string }; rooms?: Set<string> }> } }).sockets?.sockets;
    if (!allSockets) return connected;
    for (const [, sock] of allSockets) {
      const userId = sock.data?.userId;
      if (!userId) continue;
      const rooms = sock.rooms;
      if (rooms && rooms.has(roomName)) {
        connected.add(userId);
      }
    }
  } catch (err) {
    console.error('[Tournament] getConnectedUserIdsInTournament error:', err);
  }
  return connected;
}

export function getOnlineUserIds(io: Server): Set<string> {
  const online = new Set<string>();
  try {
    const allSockets = (io as unknown as { sockets: { sockets: Map<string, { data?: { userId?: string } }> } }).sockets?.sockets;
    if (!allSockets) return online;
    for (const [, sock] of allSockets) {
      const userId = sock.data?.userId;
      if (userId) online.add(userId);
    }
  } catch (err) {
    console.error('[Tournament] getOnlineUserIds error:', err);
  }
  return online;
}

const matchGraceCycles = new Map<string, number>();
const matchNoContestCount = new Map<string, number>();
export const NO_CONTEST_ESCALATION_THRESHOLD = 3;
export const NO_CONTEST_HARD_CAP = 12;
export const MAX_GRACE_CYCLES = 8;

export const MATCH_ENTRY_INVITE_INTERVAL_MS = 5_000;

export function startMatchEntryInvites(
  io: Server,
  roomCode: string,
  tournamentId: string,
  matchId: string,
): void {
  const room = rooms.get(roomCode);
  if (!room) return;
  if (room.tournamentInviteTimer) return;

  let handle: ReturnType<typeof setInterval> | null = null;
  const stop = () => {
    if (handle) clearInterval(handle);
    handle = null;
    const r = rooms.get(roomCode);
    if (r) r.tournamentInviteTimer = null;
  };

  const sendInvites = () => {
    const r = rooms.get(roomCode);
    if (!r || r.finalized || r.tournamentInviteTimer === null) {
      stop();
      return;
    }
    if (r.gameState) {
      stop();
      return;
    }
    if (r.hostId && !isUserInAnotherLiveGame(r.hostId, matchId)) {
      emitToUser(r.hostId, 'match:enter', { tournamentId, matchId, roomCode, seat: 'player1' });
    }
    if (r.guestId && !isUserInAnotherLiveGame(r.guestId, matchId)) {
      emitToUser(r.guestId, 'match:enter', { tournamentId, matchId, roomCode, seat: 'player2' });
    }
    void reconcileTournamentRoomSeats(r, roomCode, io);
  };

  handle = setInterval(sendInvites, MATCH_ENTRY_INVITE_INTERVAL_MS);
  room.tournamentInviteTimer = handle;
  sendInvites();
}

export const TOURNAMENT_LAUNCH_TICK_MS = 10_000;
export const TOURNAMENT_READY_PING_MS = 30_000;

const lastReadyPingAt = new Map<string, number>();

export async function reconcileTournamentLaunches(io: Server): Promise<void> {
  let pending: Array<{
    id: string;
    tournamentId: string;
    roomCode: string | null;
    player1Id: string | null;
    player2Id: string | null;
  }>;
  try {
    const running = await prisma.tournament.findMany({
      where: { status: 'in_progress' },
      select: { id: true },
    });
    if (running.length === 0) {
      lastReadyPingAt.clear();
      return;
    }
    pending = await prisma.tournamentMatch.findMany({
      where: {
        status: { in: ['ready', 'in_progress'] },
        isBye: false,
        tournamentId: { in: running.map((t) => t.id) },
      },
      select: { id: true, tournamentId: true, roomCode: true, player1Id: true, player2Id: true },
    });
  } catch (err) {
    console.error('[Tournament] reconcileTournamentLaunches lookup failed:', err);
    return;
  }

  const liveMatchIds = new Set(pending.map((m) => m.id));
  for (const key of lastReadyPingAt.keys()) {
    if (!liveMatchIds.has(key)) lastReadyPingAt.delete(key);
  }

  const now = Date.now();
  for (const m of pending) {
    if (!m.player1Id || !m.player2Id) continue;
    const room = m.roomCode ? rooms.get(m.roomCode) : null;

    if (room) {
      if (room.finalized) continue;
      if (room.gameState) continue;
      if (!room.tournamentInviteTimer) {
        startMatchEntryInvites(io, m.roomCode!, m.tournamentId, m.id);
      }
      try {
        await reconcileTournamentRoomSeats(room, m.roomCode!, io);
      } catch (err) {
        console.error(`[Tournament] reconcile failed for match ${m.id}:`, err);
      }
      continue;
    }

    const lastPing = lastReadyPingAt.get(m.id) ?? 0;
    if (now - lastPing < TOURNAMENT_READY_PING_MS) continue;
    let pinged = false;
    for (const userId of [m.player1Id, m.player2Id]) {
      if (isUserInAnotherLiveGame(userId, m.id)) continue;
      if (!isUserConnected(userId)) continue;
      emitToUser(userId, 'tournament:please-confirm-ready', { matchId: m.id, tournamentId: m.tournamentId });
      pinged = true;
    }
    if (pinged) lastReadyPingAt.set(m.id, now);
  }
}

export function startTournamentLaunchReconciler(io: Server): ReturnType<typeof setInterval> {
  return setInterval(() => {
    reconcileTournamentLaunches(io).catch((err) => {
      console.error('[Tournament] launch reconciler tick failed:', err);
    });
  }, TOURNAMENT_LAUNCH_TICK_MS);
}

export function clearTournamentMatchTimers(matchId: string): void {
  clearAbsenceTimer(matchId);
  matchGraceCycles.delete(matchId);
  matchNoContestCount.delete(matchId);
  matchReadyPlayers.delete(matchId);
}

function salonVivant(room: { finalized?: boolean; gameState?: { phase?: string } | null } | undefined): boolean {
  if (!room) return false;
  if (room.finalized) return false;
  if (!room.gameState) return false;
  return room.gameState.phase !== 'gameOver';
}

export function salonDuMatch(matchId: string, roomCode: string | null | undefined) {
  if (roomCode) {
    const parCode = rooms.get(roomCode);
    if (parCode && parCode.tournamentMatchId === matchId) return parCode;
    if (parCode && salonVivant(parCode)) return parCode;
  }
  for (const [, room] of rooms) {
    if (room.tournamentMatchId === matchId) return room;
  }
  return undefined;
}

function isMatchGameLive(matchId: string, roomCode: string | null | undefined): boolean {
  return salonVivant(salonDuMatch(matchId, roomCode));
}

function seatBoundInMatchRoom(
  io: Server,
  matchId: string,
  roomCode: string | null | undefined,
  userId: string | null,
): boolean {
  if (!userId) return false;
  const room = salonDuMatch(matchId, roomCode);
  if (!room) return false;
  if (room.hostId === userId) return isSeatSocketAlive(room, 'player1', io);
  if (room.guestId === userId) return isSeatSocketAlive(room, 'player2', io);
  return false;
}

async function partieEncoreVivante(matchId: string, gameId: string, roomCode: string | null | undefined): Promise<boolean> {
  if (isMatchGameLive(matchId, roomCode)) return true;
  try {
    const partie = await prisma.game.findUnique({ where: { id: gameId }, select: { status: true } });
    if (!partie) return false;
    return partie.status !== 'completed' && partie.status !== 'cancelled';
  } catch (err) {
    console.error(`[Tournament] partieEncoreVivante: lookup failed for ${gameId}:`, err instanceof Error ? err.message : err);
    return true;
  }
}

export async function fireAbsenceTimerCallback(
  io: Server,
  tournamentId: string,
  matchId: string,
  p1: string,
  p2: string,
  knownAbsentPlayerId: string | null,
  retried: boolean,
): Promise<void> {
  const ready = matchReadyPlayers.get(matchId);
  const online = getOnlineUserIds(io);
  const cycles = matchGraceCycles.get(matchId) ?? 0;

  let currentRoomCode: string | null = null;
  let tournamentIdForPresence = tournamentId;
  try {
    const m = await prisma.tournamentMatch.findUnique({
      where: { id: matchId },
      select: { roomCode: true, status: true, tournamentId: true, gameId: true },
    });
    if (m && (m.status === 'completed' || m.status === 'forfeit')) {
      console.log(`[Tournament] fireAbsenceTimerCallback: match ${matchId} already resolved (${m.status}), no-op`);
      return;
    }
    if (m?.gameId && (await partieEncoreVivante(matchId, m.gameId, m.roomCode))) {
      console.log(`[Tournament] fireAbsenceTimerCallback: match ${matchId} is being played in game ${m.gameId}, absence forfeit cancelled`);
      clearAbsenceTimer(matchId);
      matchGraceCycles.delete(matchId);
      return;
    }
    currentRoomCode = m?.roomCode ?? null;
    if (m?.tournamentId) tournamentIdForPresence = m.tournamentId;
  } catch (err) {
    console.error(`[Tournament] fireAbsenceTimerCallback: match lookup failed for ${matchId}:`, err);
  }

  if (currentRoomCode) {
    const liveRoom = rooms.get(currentRoomCode);
    if (liveRoom && !liveRoom.finalized && !liveRoom.gameState) {
      await reconcileTournamentRoomSeats(liveRoom, currentRoomCode, io);
      if (liveRoom.gameState) {
        console.log(`[Tournament] fireAbsenceTimerCallback: match ${matchId} launched during reconciliation, no forfeit`);
        matchGraceCycles.delete(matchId);
        return;
      }
    }
  }

  const watching = getConnectedUserIdsInTournament(io, tournamentIdForPresence);
  const reachableP1 = online.has(p1) || isUserConnected(p1) || watching.has(p1);
  const reachableP2 = !!p2 && (online.has(p2) || isUserConnected(p2) || watching.has(p2));

  const outcome = decideAbsenceOutcome({
    p1,
    p2: p2 || null,
    knownAbsentPlayerId,
    readySetPresent: !!ready,
    readyP1: !!ready?.has(p1),
    readyP2: !!p2 && !!ready?.has(p2),
    seatBoundP1: seatBoundInMatchRoom(io, matchId, currentRoomCode, p1),
    seatBoundP2: seatBoundInMatchRoom(io, matchId, currentRoomCode, p2 || null),
    onlineP1: reachableP1,
    onlineP2: reachableP2,
    gameLive: isMatchGameLive(matchId, currentRoomCode),
    cycles,
    maxCycles: MAX_GRACE_CYCLES,
  });

  if (outcome.kind === 'noop') {
    console.log(`[Tournament] fireAbsenceTimerCallback: match ${matchId} no forfeit (${outcome.reason})`);
    return;
  }

  if (outcome.kind === 'no-contest') {
    matchGraceCycles.delete(matchId);
    const stalls = (matchNoContestCount.get(matchId) ?? 0) + 1;
    matchNoContestCount.set(matchId, stalls);

    if (stalls >= NO_CONTEST_HARD_CAP) {
      console.error(
        `[Tournament] CRITICAL: match ${matchId} never launched after ${stalls} attempts while ${outcome.players.join(', ')} stayed online. Nobody is forfeited: a connected player is never disqualified. An organizer must resolve this match from the admin panel.`,
      );
      logMatchEvent({
        type: 'match.launch.unresolvable',
        tournamentId,
        matchId,
        forfeitedPlayerId: null,
        detail: `stalled ${stalls} times, players online, left open`,
      });
      await reopenTournamentMatch(io, tournamentId, matchId, p1, p2 || null);
      return;
    }

    const detail = `match ${matchId} could not be launched while ${outcome.players.join(', ')} stayed online, reopening it instead of forfeiting anyone (stall ${stalls})`;
    if (stalls >= NO_CONTEST_ESCALATION_THRESHOLD) {
      console.error(`[Tournament] CRITICAL: ${detail}. This match needs an organizer to resolve it manually from the admin panel.`);
    } else {
      console.log(`[Tournament] fireAbsenceTimerCallback: ${detail}`);
    }
    logMatchEvent({
      type: stalls >= NO_CONTEST_ESCALATION_THRESHOLD ? 'match.launch.stalled' : 'match.launch.no-contest',
      tournamentId,
      matchId,
      forfeitedPlayerId: null,
    });
    await reopenTournamentMatch(io, tournamentId, matchId, p1, p2 || null);
    return;
  }

  if (outcome.kind === 'grace') {
    matchGraceCycles.set(matchId, cycles + 1);
    console.log(`[Tournament] fireAbsenceTimerCallback: match ${matchId} grace cycle ${cycles + 1}/${MAX_GRACE_CYCLES} (no confirmed absence)`);
    emitToUser(p1, 'tournament:please-confirm-ready', { matchId, tournamentId });
    if (p2) emitToUser(p2, 'tournament:please-confirm-ready', { matchId, tournamentId });
    const newDeadline = new Date(Date.now() + ABSENCE_GRACE_RETRY_MS);
    scheduleAbsenceTimerWithDeadline(matchId, newDeadline, async () => {
      await fireAbsenceTimerCallback(io, tournamentId, matchId, p1, p2, knownAbsentPlayerId, true);
    });
    try {
      await prisma.tournamentMatch.update({
        where: { id: matchId },
        data: { absenceDeadline: newDeadline },
      });
    } catch (err) {
      console.error(`[Tournament] fireAbsenceTimerCallback: failed to persist grace deadline for ${matchId}:`, err);
    }
    io.to(`tournament:${tournamentId}`).emit('tournament:absence-timer', {
      matchId, playerId: knownAbsentPlayerId, deadline: newDeadline.toISOString(),
    });
    return;
  }

  matchGraceCycles.delete(matchId);

  const forfeit1 = outcome.players.includes(p1);
  const forfeit2 = !!p2 && outcome.players.includes(p2);

  let isSwiss = false;
  try {
    const t = await prisma.tournament.findUnique({
      where: { id: tournamentId }, select: { format: true },
    });
    isSwiss = t?.format === 'swiss';
  } catch (err) {
    console.error(`[Tournament] fireAbsenceTimerCallback: format lookup failed for ${tournamentId}:`, err);
  }

  if (forfeit1 && forfeit2) {
    if (isSwiss) {
      await handleSwissDoubleAbsence(io, tournamentId, matchId);
    } else {
      await markParticipantAbsence(tournamentId, p1);
      if (p2) await markParticipantAbsence(tournamentId, p2);
      const loser = p2 ? await pickDoubleAbsenceLoser(tournamentId, p1, p2) : p1;
      console.log(`[Tournament] Match ${matchId} double absence in bracket play: better seed advances, forfeiting ${loser}`);
      await handleMatchForfeit(io, tournamentId, matchId, loser);
    }
  } else {
    const forfeitId = forfeit1 ? p1 : p2;
    if (forfeitId) await markParticipantAbsence(tournamentId, forfeitId);
    await handleMatchForfeit(io, tournamentId, matchId, forfeitId);
  }
  matchReadyPlayers.delete(matchId);
}

export const TOURNAMENT_JOIN_TIMEOUT_MS = 3 * 60_000;
export const TOURNAMENT_JOIN_RECHECK_MS = 30_000;
export const TOURNAMENT_JOIN_MAX_RECHECKS = 2;

function scheduleTournamentJoinCheck(
  io: Server,
  roomCode: string,
  tournamentId: string,
  matchId: string,
  attempt: number,
  delayMs: number,
): void {
  const room = rooms.get(roomCode);
  if (!room) return;
  if (room.tournamentJoinTimer) {
    clearTimeout(room.tournamentJoinTimer);
    room.tournamentJoinTimer = null;
  }
  room.tournamentJoinDeadline = Date.now() + delayMs;
  room.tournamentJoinTimer = setTimeout(() => {
    void runTournamentJoinCheck(io, roomCode, tournamentId, matchId, attempt);
  }, delayMs);
}

async function runTournamentJoinCheck(
  io: Server,
  roomCode: string,
  tournamentId: string,
  matchId: string,
  attempt: number,
): Promise<void> {
  const r = rooms.get(roomCode);
  if (!r) return;
  r.tournamentJoinTimer = null;
  r.tournamentJoinDeadline = null;
  if (r.finalized) return;
  if (r.gameState) return;

  await reconcileTournamentRoomSeats(r, roomCode, io);
  if (r.gameState || r.finalized) return;

  const hostJoined = isSeatSocketAlive(r, 'player1', io);
  const guestJoined = isSeatSocketAlive(r, 'player2', io);
  const seatUserId = (seat: JoinCheckSeat): string | null =>
    seat === 'player1' ? (r.hostId ?? null) : (r.guestId ?? null);

  const outcome = decideJoinCheckOutcome({
    hostJoined: hostJoined || !r.hostId,
    guestJoined: guestJoined || !r.guestId,
    hostOnline: !!r.hostId && isUserConnected(r.hostId),
    guestOnline: !!r.guestId && isUserConnected(r.guestId),
    attempt,
    maxRechecks: TOURNAMENT_JOIN_MAX_RECHECKS,
  });

  if (outcome.kind === 'start') {
    const started = await maybeStartTournamentGame(r, roomCode, io);
    if (!started && !r.gameState && !r.finalized) {
      console.log(`[Tournament] Match ${matchId}: both seats look bound but the game did not start, re-checking in ${TOURNAMENT_JOIN_RECHECK_MS}ms`);
      startMatchEntryInvites(io, roomCode, tournamentId, matchId);
      scheduleTournamentJoinCheck(io, roomCode, tournamentId, matchId, attempt, TOURNAMENT_JOIN_RECHECK_MS);
    }
    return;
  }

  const missingSeats: JoinCheckSeat[] = [];
  if (!hostJoined && r.hostId) missingSeats.push('player1');
  if (!guestJoined && r.guestId) missingSeats.push('player2');
  for (const seat of missingSeats) {
    const id = seatUserId(seat);
    if (!id) continue;
    if (isUserInAnotherLiveGame(id, matchId)) continue;
    emitToUser(id, 'match:enter', { tournamentId, matchId, roomCode, seat });
    emitToUser(id, 'tournament:please-confirm-ready', { matchId, tournamentId });
  }

  if (outcome.kind === 'wait') {
    if (outcome.reason === 'connected') {
      console.log(`[Tournament] Match ${matchId}: player(s) have not bound a seat but are connected, keeping the match open instead of forfeiting`);
      startMatchEntryInvites(io, roomCode, tournamentId, matchId);
      scheduleTournamentJoinCheck(io, roomCode, tournamentId, matchId, attempt, TOURNAMENT_JOIN_RECHECK_MS);
      return;
    }
    console.log(`[Tournament] Match ${matchId}: no seat bound and player(s) offline (sample ${attempt + 1}/${TOURNAMENT_JOIN_MAX_RECHECKS + 1}), re-checking in ${TOURNAMENT_JOIN_RECHECK_MS}ms before deciding`);
    scheduleTournamentJoinCheck(io, roomCode, tournamentId, matchId, attempt + 1, TOURNAMENT_JOIN_RECHECK_MS);
    return;
  }

  const watchingBracket = getConnectedUserIdsInTournament(io, tournamentId);
  const missing = outcome.seats
    .map(seatUserId)
    .filter((id): id is string => !!id)
    .filter((id) => !isUserConnected(id) && !watchingBracket.has(id));
  if (missing.length === 0) {
    console.log(`[Tournament] Match ${matchId}: no seat bound but every player is reachable, keeping the match open instead of forfeiting`);
    startMatchEntryInvites(io, roomCode, tournamentId, matchId);
    scheduleTournamentJoinCheck(io, roomCode, tournamentId, matchId, attempt, TOURNAMENT_JOIN_RECHECK_MS);
    return;
  }

  if (missing.length === 2) {
    const t = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { format: true },
    });
    if (t?.format === 'swiss') {
      console.log(`[Tournament] Match ${matchId} double no-show: both players stayed offline and never joined`);
      await handleSwissDoubleAbsence(io, tournamentId, matchId);
      return;
    }
    const bracketLoser = await pickDoubleAbsenceLoser(tournamentId, missing[0], missing[1]);
    console.log(`[Tournament] Match ${matchId} double no-show in bracket play: better seed advances, forfeiting ${bracketLoser}`);
    await markParticipantAbsence(tournamentId, bracketLoser);
    await handleMatchForfeit(io, tournamentId, matchId, bracketLoser);
    return;
  }

  const absentPlayerId = missing[0];
  console.log(`[Tournament] Match ${matchId} forfeit: player ${absentPlayerId} never joined and stayed offline across ${TOURNAMENT_JOIN_MAX_RECHECKS + 1} checks`);
  await markParticipantAbsence(tournamentId, absentPlayerId);
  await handleMatchForfeit(io, tournamentId, matchId, absentPlayerId);
}

export function registerTournamentHandlers(io: Server, socket: Socket) {
  socket.on('tournament:subscribe', async ({ tournamentId }: { tournamentId: string }) => {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { isPublic: true, creatorId: true },
    });
    if (!tournament) return;
    if (!tournament.isPublic) {
      const authedUserId = (socket.data as { userId?: string }).userId;
      if (!authedUserId) return;
      if (tournament.creatorId !== authedUserId) {
        const p = await prisma.tournamentParticipant.findFirst({
          where: { tournamentId, userId: authedUserId },
          select: { id: true },
        });
        if (!p) return;
      }
    }
    socket.join(`tournament:${tournamentId}`);
  });

  socket.on('tournament:unsubscribe', ({ tournamentId }: { tournamentId: string }) => {
    socket.leave(`tournament:${tournamentId}`);
  });

  socket.on('tournament:ready', async ({ tournamentId, matchId, userId }: {
    tournamentId: string; matchId: string; userId: string;
  }) => {
    const authedUserId = (socket.data as { userId?: string }).userId;
    if (!authedUserId || authedUserId !== userId) {
      console.warn(`[Tournament] tournament:ready rejected: socket auth mismatch (claim=${userId}, auth=${authedUserId ?? 'null'})`);
      return;
    }
    await withMatchReadyLock(matchId, async () => {
    try {
      const match = await prisma.tournamentMatch.findUnique({ where: { id: matchId } });
      if (!match || match.tournamentId !== tournamentId) return;
      if (match.player1Id !== userId && match.player2Id !== userId) {
        console.warn(`[Tournament] tournament:ready rejected: user ${userId} not in match ${matchId}`);
        return;
      }

      if (match.status !== 'ready' && match.status !== 'pending' && match.status !== 'in_progress') return;

      if (!matchReadyPlayers.has(matchId)) matchReadyPlayers.set(matchId, new Set());
      const ready = matchReadyPlayers.get(matchId)!;
      ready.add(userId);

      if (match.roomCode) {
        const existingRoom = rooms.get(match.roomCode);
        if (existingRoom && !existingRoom.finalized) {
          const seat: 'player1' | 'player2' | null = existingRoom.hostId === userId
            ? 'player1'
            : existingRoom.guestId === userId
              ? 'player2'
              : null;
          if (seat && !isUserInAnotherLiveGame(userId, matchId)) {
            emitToUser(userId, 'match:enter', { tournamentId, matchId, roomCode: match.roomCode, seat });
          }
          startMatchEntryInvites(io, match.roomCode, tournamentId, matchId);
          await reconcileTournamentRoomSeats(existingRoom, match.roomCode, io);
          return;
        }
        if (existingRoom && existingRoom.finalized) {
          if (existingRoom.gameState) {
            console.log(`[Tournament] tournament:ready ignored for match ${matchId}: its game already ended, waiting for the result to be written`);
            return;
          }
          clearTournamentInviteTimer(existingRoom);
          clearAllMatchRoomTimers(existingRoom);
          rooms.delete(match.roomCode);
        }
      }

      const otherPlayerId = match.player1Id === userId ? match.player2Id : match.player1Id;
      if (!otherPlayerId || !match.player1Id || !match.player2Id) return;




      const dbSaysOtherWasReady = match.absentPlayerId === userId;
      const memorySaysBothReady = ready.size >= 2;
      const bothReady = memorySaysBothReady || dbSaysOtherWasReady;

      if (!bothReady) {


        const alreadyWaitingForOther = match.absentPlayerId === otherPlayerId;
        if (!alreadyWaitingForOther) {
          const p1 = match.player1Id;
          const p2 = match.player2Id;
          const deadline = startAbsenceTimer(matchId, async () => {
            await fireAbsenceTimerCallback(io, tournamentId, matchId, p1, p2, otherPlayerId, false);
          });
          await prisma.tournamentMatch.update({
            where: { id: matchId },
            data: { absenceDeadline: deadline, absentPlayerId: otherPlayerId },
          });
          io.to(`tournament:${tournamentId}`).emit('tournament:absence-timer', {
            matchId, playerId: otherPlayerId, deadline: deadline.toISOString(),
          });
        }
      }

      if (bothReady) {
        ready.add(otherPlayerId);
        clearAbsenceTimer(matchId);
        matchGraceCycles.delete(matchId);
        const roomCode = match.roomCode || `T-${matchId.slice(-6)}`;

        const tournamentMeta = await prisma.tournament.findUnique({
          where: { id: tournamentId },
          select: { gameMode: true, sealedBoosterCount: true, sealedSetChoice: true },
        });
        const isSealedTournament = tournamentMeta?.gameMode === 'sealed';
        const isEvolvingTournament = tournamentMeta?.gameMode === 'evolving';

        const [p1Participant, p2Participant] = await Promise.all([
          prisma.tournamentParticipant.findFirst({ where: { tournamentId, userId: match.player1Id } }),
          prisma.tournamentParticipant.findFirst({ where: { tournamentId, userId: match.player2Id } }),
        ]);

        let hostDeck: { characters: CharacterCard[]; missions: MissionCard[] } | null = null;
        let guestDeck: { characters: CharacterCard[]; missions: MissionCard[] } | null = null;
        const hostDeckId: string | undefined = !isSealedTournament && p1Participant?.deckId ? p1Participant.deckId : undefined;
        const guestDeckId: string | undefined = !isSealedTournament && p2Participant?.deckId ? p2Participant.deckId : undefined;
        let hostEvolvingPoints = 0;
        let guestEvolvingPoints = 0;

        if (!isSealedTournament) {
          if (p1Participant?.deckId) {
            const deck = await prisma.deck.findUnique({ where: { id: p1Participant.deckId } });
            if (deck) {
              hostDeck = {
                characters: (deck.cardIds ?? []).map((id: string) => getCharacterById(id)).filter(Boolean) as CharacterCard[],
                missions: (deck.missionIds ?? []).map((id: string) => getMissionById(id)).filter(Boolean) as MissionCard[],
              };
              if (isEvolvingTournament) {
                hostEvolvingPoints = computeDeckEvolvingPoints(hostDeck.characters.map((c) => c.id));
              }
            }
          }
          if (p2Participant?.deckId) {
            const deck = await prisma.deck.findUnique({ where: { id: p2Participant.deckId } });
            if (deck) {
              guestDeck = {
                characters: (deck.cardIds ?? []).map((id: string) => getCharacterById(id)).filter(Boolean) as CharacterCard[],
                missions: (deck.missionIds ?? []).map((id: string) => getMissionById(id)).filter(Boolean) as MissionCard[],
              };
              if (isEvolvingTournament) {
                guestEvolvingPoints = computeDeckEvolvingPoints(guestDeck.characters.map((c) => c.id));
              }
            }
          }
        } else {
          const loadSealedDeck = (sealed: unknown): { characters: CharacterCard[]; missions: MissionCard[] } | null => {
            if (!sealed || typeof sealed !== 'object') return null;
            const obj = sealed as { cardIds?: unknown; missionIds?: unknown };
            if (!Array.isArray(obj.cardIds) || !Array.isArray(obj.missionIds)) return null;
            const chars = obj.cardIds
              .filter((id): id is string => typeof id === 'string')
              .map((id) => getCharacterById(id))
              .filter(Boolean) as CharacterCard[];
            const miss = obj.missionIds
              .filter((id): id is string => typeof id === 'string')
              .map((id) => getMissionById(id))
              .filter(Boolean) as MissionCard[];
            if (chars.length < 30 || miss.length !== 3) return null;
            return { characters: chars, missions: miss };
          };
          hostDeck = loadSealedDeck(p1Participant?.sealedDeck);
          guestDeck = loadSealedDeck(p2Participant?.sealedDeck);
        }

        
        const staleAtCode = rooms.get(roomCode);
        if (staleAtCode && staleAtCode.finalized) {
          clearTournamentInviteTimer(staleAtCode);
          clearAllMatchRoomTimers(staleAtCode);
          rooms.delete(roomCode);
        }

        if (!rooms.has(roomCode)) {
          rooms.set(roomCode, {
            code: roomCode,
            hostId: match.player1Id,
            hostSocket: '',
            guestId: match.player2Id,
            guestSocket: null,
            gameState: null,
            hostDeck,
            guestDeck,
            isPrivate: true,
            isRanked: false,
            isAnonymous: false,
            gameMode: isSealedTournament ? 'sealed' : isEvolvingTournament ? 'evolving' : 'casual',
            isEvolving: isEvolvingTournament,
            holoHue: isEvolvingTournament ? Math.floor(Math.random() * 360) : null,
            hostEvolvingPoints,
            guestEvolvingPoints,
            createdAt: Date.now(),
            replayInitialState: null,
            replayStateSnapshots: null,
            replaySnapshotLogLengths: null,
            replayClockSnapshots: null,
            finalized: false,
            isSealed: isSealedTournament,
            sealedBoosterCount: (tournamentMeta?.sealedBoosterCount ?? 5) as 4 | 5 | 6,
            sealedSetChoice: tournamentMeta?.sealedSetChoice ?? 'random',
            sealedTimer: null,
            sealedDeadline: null,
            tournamentId,
            tournamentMatchId: matchId,
            hostDeckId,
            guestDeckId,
            coinFlipDone: { player1: false, player2: false },
            spectators: new Map(),
            hostAllowSpectatorHand: false,
            guestAllowSpectatorHand: false,
            chatMessages: [],
            chatLastCleanup: Date.now(),
            chessClock: createChessClock(),
            chessClockTickTimer: null,
            chessClockMulliganTimer: null,
            chessClockLastInputKey: null,
          } as RoomData);
        }

        await prisma.tournamentMatch.update({
          where: { id: matchId },
          data: { status: 'in_progress', roomCode, startedAt: new Date(), absenceDeadline: null, absentPlayerId: null },
        });
        io.to(`tournament:${tournamentId}`).emit('tournament:match-ready', {
          matchId, roomCode, player1Id: match.player1Id, player2Id: match.player2Id,
        });
        io.to(`tournament:${tournamentId}`).emit('tournament:match-updated', {
          matchId, status: 'in_progress', roomCode,
        });

        if (isSealedTournament) {
          const createdRoomSealed = rooms.get(roomCode);
          const hostPool = (p1Participant?.sealedPool as { allCards?: Array<{ id: string }> } | null) ?? null;
          const guestPool = (p2Participant?.sealedPool as { allCards?: Array<{ id: string }> } | null) ?? null;
          if (createdRoomSealed) {
            if (hostPool?.allCards && Array.isArray(hostPool.allCards)) {
              createdRoomSealed.hostSealedPoolIds = hostPool.allCards.map((c) => c.id);
            }
            if (guestPool?.allCards && Array.isArray(guestPool.allCards)) {
              createdRoomSealed.guestSealedPoolIds = guestPool.allCards.map((c) => c.id);
            }
          }
        }

        startMatchEntryInvites(io, roomCode, tournamentId, matchId);

        const createdRoom = rooms.get(roomCode);
        if (createdRoom && !createdRoom.tournamentJoinTimer) {
          scheduleTournamentJoinCheck(io, roomCode, tournamentId, matchId, 0, TOURNAMENT_JOIN_TIMEOUT_MS);
        }
      }
    } catch (err) {
      console.error('[Tournament] Ready handler error:', err);
    }
    });
  });

}


const STUCK_MATCH_HARD_TIMEOUT_MS = 35 * 60_000;
const PREGAME_STUCK_TIMEOUT_MS = 6 * 60_000;

export async function reopenTournamentMatch(
  io: Server,
  tournamentId: string,
  matchId: string,
  p1: string | null,
  p2: string | null,
): Promise<void> {
  const newStatus: 'ready' | 'pending' = p1 && p2 ? 'ready' : 'pending';
  let previousRoomCode: string | null = null;
  try {
    const existing = await prisma.tournamentMatch.findUnique({
      where: { id: matchId },
      select: { roomCode: true, gameId: true, status: true },
    });
    previousRoomCode = existing?.roomCode ?? null;

    if (existing?.status === 'completed' || existing?.status === 'forfeit') {
      console.warn(`[Tournament] reopenTournamentMatch: refusing to reopen ${matchId}, it is already ${existing.status}.`);
      return;
    }
    if (existing?.gameId) {
      const finishedGame = await prisma.game.findUnique({ where: { id: existing.gameId }, select: { status: true } });
      if (finishedGame && finishedGame.status !== 'cancelled') {
        console.warn(`[Tournament] reopenTournamentMatch: refusing to reopen ${matchId}, its game ${existing.gameId} still exists (${finishedGame.status}).`);
        return;
      }
    }
    const liveRoom = previousRoomCode ? rooms.get(previousRoomCode) : null;
    if (liveRoom?.gameState && !liveRoom.finalized) {
      console.warn(`[Tournament] reopenTournamentMatch: refusing to reopen ${matchId}, its game is running in room ${previousRoomCode}.`);
      return;
    }
  } catch {
    previousRoomCode = null;
  }

  for (const code of [previousRoomCode, `T-${matchId.slice(-6)}`]) {
    if (!code) continue;
    const stale = rooms.get(code);
    if (!stale) continue;
    clearTournamentInviteTimer(stale);
    clearAllMatchRoomTimers(stale);
    rooms.delete(code);
  }

  try {
    await prisma.tournamentMatch.update({
      where: { id: matchId },
      data: { status: newStatus, roomCode: null, startedAt: null, gameId: null, absenceDeadline: null, absentPlayerId: null },
    });
  } catch (err) {
    console.error(`[Tournament] reopenTournamentMatch: failed to reset ${matchId}:`, err);
    return;
  }
  matchGraceCycles.delete(matchId);
  matchReadyPlayers.delete(matchId);
  io.to(`tournament:${tournamentId}`).emit('tournament:match-updated', {
    matchId, status: newStatus, roomCode: null,
  });
  if (p1) emitToUser(p1, 'tournament:please-confirm-ready', { matchId, tournamentId });
  if (p2) emitToUser(p2, 'tournament:please-confirm-ready', { matchId, tournamentId });

  if (newStatus === 'ready' && p1 && p2) {
    const deadline = startAbsenceTimer(matchId, async () => {
      await fireAbsenceTimerCallback(io, tournamentId, matchId, p1, p2, null, false);
    });
    try {
      await prisma.tournamentMatch.update({
        where: { id: matchId },
        data: { absenceDeadline: deadline, absentPlayerId: null },
      });
    } catch (err) {
      console.error(`[Tournament] reopenTournamentMatch: failed to persist absence deadline for ${matchId}:`, err);
    }
    io.to(`tournament:${tournamentId}`).emit('tournament:absence-timer', {
      matchId, playerId: null, deadline: deadline.toISOString(),
    });
  }
}

export async function sweepOrphanTournamentMatches(io: Server): Promise<void> {
  try {
    const inProgress = await prisma.tournamentMatch.findMany({
      where: { status: 'in_progress' },
      select: { id: true, tournamentId: true, roomCode: true, startedAt: true, player1Id: true, player2Id: true },
    });
    if (inProgress.length === 0) return;
    for (const m of inProgress) {
      const startedMs = m.startedAt ? m.startedAt.getTime() : 0;
      const ageMs = Date.now() - startedMs;
      const roomGone = !m.roomCode || !rooms.has(m.roomCode);

      if (roomGone) {
        if (ageMs < 60_000) continue;
        console.log(`[Tournament] Orphan match ${m.id} (room ${m.roomCode ?? '<none>'} gone, age ${Math.round(ageMs / 1000)}s), resetting to ready`);
        const newStatus: 'ready' | 'pending' = m.player1Id && m.player2Id ? 'ready' : 'pending';
        await prisma.tournamentMatch.update({
          where: { id: m.id },
          data: { status: newStatus, roomCode: null, startedAt: null, gameId: null, absenceDeadline: null, absentPlayerId: null },
        });
        matchReadyPlayers.delete(m.id);
        io.to(`tournament:${m.tournamentId}`).emit('tournament:match-updated', {
          matchId: m.id, status: newStatus, roomCode: null,
        });

        if (newStatus === 'ready' && m.player1Id && m.player2Id) {
          const tournamentId = m.tournamentId;
          const matchId = m.id;
          const p1 = m.player1Id;
          const p2 = m.player2Id;
          const deadline = startAbsenceTimer(matchId, async () => {
            await fireAbsenceTimerCallback(io, tournamentId, matchId, p1, p2, null, false);
          });
          await prisma.tournamentMatch.update({
            where: { id: matchId },
            data: { absenceDeadline: deadline, absentPlayerId: null },
          });
          io.to(`tournament:${tournamentId}`).emit('tournament:absence-timer', {
            matchId, playerId: null, deadline: deadline.toISOString(),
          });
        }
        continue;
      }

      const liveRoom = m.roomCode ? rooms.get(m.roomCode) : null;
      if (liveRoom && !liveRoom.gameState && !liveRoom.finalized) {
        const started = await reconcileTournamentRoomSeats(liveRoom, m.roomCode!, io);
        if (started || liveRoom.gameState) {
          console.log(`[Tournament] Match ${m.id}: launched by the orphan sweep reconciliation`);
          continue;
        }
        if (ageMs >= PREGAME_STUCK_TIMEOUT_MS) {
          console.log(`[Tournament] Match ${m.id}: room ${m.roomCode} never started a game after ${Math.round(ageMs / 60_000)}min, reopening the match`);
          clearTournamentInviteTimer(liveRoom);
          rooms.delete(m.roomCode!);
          await reopenTournamentMatch(io, m.tournamentId, m.id, m.player1Id, m.player2Id);
        } else if (!liveRoom.tournamentInviteTimer) {
          startMatchEntryInvites(io, m.roomCode!, m.tournamentId, m.id);
        }
        continue;
      }

      if (ageMs >= STUCK_MATCH_HARD_TIMEOUT_MS && m.roomCode && startedMs > 0) {
        const room = rooms.get(m.roomCode);
        if (!room || !room.gameState || room.finalized) continue;
        const p1Connected = !!room.hostSocket;
        const p2Connected = !!room.guestSocket;
        if (p1Connected && p2Connected) {
          console.log(`[Tournament] Stuck match ${m.id} (room ${m.roomCode}, age ${Math.round(ageMs / 60_000)}min) but both players connected; skipping force-finalize`);
          continue;
        }
        const winnerId: string | null = !p1Connected && p2Connected
          ? m.player2Id ?? null
          : p1Connected && !p2Connected
            ? m.player1Id ?? null
            : null;
        console.log(`[Tournament] Stuck match ${m.id} (room ${m.roomCode}, age ${Math.round(ageMs / 60_000)}min, p1Conn=${p1Connected}, p2Conn=${p2Connected}) -> force-finalize, winnerId=${winnerId ?? 'draw'}`);

        room.finalized = true;
        const winnerRole: 'player1' | 'player2' | null = winnerId
          ? (winnerId === m.player1Id ? 'player1' : 'player2')
          : null;
        const endPayload = {
          winner: winnerRole,
          player1Score: room.gameState.player1.missionPoints,
          player2Score: room.gameState.player2.missionPoints,
          isRanked: room.isRanked,
          isEvolving: room.isEvolving === true,
          eloDelta: null,
          newElo: undefined,
          totalGames: undefined,
          winReason: 'forfeit' as const,
          gameId: null,
          replayData: null,
          tournamentId: m.tournamentId,
          performanceBonus: null,
        };
        room.finalBroadcast = { event: 'game:ended', player1: endPayload, player2: endPayload };
        if (room.hostSocket) io.to(room.hostSocket).emit('game:ended', endPayload);
        if (room.guestSocket) io.to(room.guestSocket).emit('game:ended', endPayload);

        if (winnerId) {
          await handleTournamentMatchEnd(io, m.tournamentId, m.id, winnerId, null).catch((err) => {
            console.error(`[Tournament] force-finalize failed for ${m.id}:`, err instanceof Error ? err.message : err);
          });
        } else {
          await prisma.tournamentMatch.update({
            where: { id: m.id },
            data: { status: 'completed', roomCode: null, startedAt: null, absenceDeadline: null, absentPlayerId: null, completedAt: new Date() },
          });
          io.to(`tournament:${m.tournamentId}`).emit('tournament:match-updated', {
            matchId: m.id, status: 'completed', roomCode: null,
          });
        }

        finalizeAndScheduleRoomDeletion(rooms, m.roomCode);
      }
    }
  } catch (err) {
    console.error('[Tournament] sweepOrphanTournamentMatches error:', err);
  }
}


export const STARTUP_REHYDRATE_GRACE_MS = 90_000;

export async function rehydrateAbsenceTimers(io: Server): Promise<void> {
  try {
    const pendingMatches = await prisma.tournamentMatch.findMany({
      where: {
        absenceDeadline: { not: null },
        status: { in: ['ready', 'pending'] },
      },
      select: {
        id: true,
        tournamentId: true,
        absenceDeadline: true,
        absentPlayerId: true,
        player1Id: true,
        player2Id: true,
        round: true,
      },
    });

    for (const m of pendingMatches) {
      if (!m.absenceDeadline) continue;
      const remaining = m.absenceDeadline.getTime() - Date.now();
      const tournamentId = m.tournamentId;
      const matchId = m.id;
      const p1 = m.player1Id;
      const p2 = m.player2Id;

      if (!p1 || !p2) continue;

      const onFire = async () => {
        await fireAbsenceTimerCallback(io, tournamentId, matchId, p1, p2, m.absentPlayerId ?? null, false);
      };

      if (remaining <= 0) {
        const graceDeadline = new Date(Date.now() + STARTUP_REHYDRATE_GRACE_MS);
        console.log(`[Tournament] Rehydrate: deadline already passed for match ${matchId}, granting a ${Math.round(STARTUP_REHYDRATE_GRACE_MS / 1000)}s reconnect grace before deciding`);
        scheduleAbsenceTimerWithDeadline(matchId, graceDeadline, onFire);
        try {
          await prisma.tournamentMatch.update({
            where: { id: matchId },
            data: { absenceDeadline: graceDeadline },
          });
        } catch (err) {
          console.error(`[Tournament] Rehydrate: failed to persist grace deadline for ${matchId}:`, err);
        }
        emitToUser(p1, 'tournament:please-confirm-ready', { matchId, tournamentId });
        if (p2) emitToUser(p2, 'tournament:please-confirm-ready', { matchId, tournamentId });
        continue;
      }

      scheduleAbsenceTimerWithDeadline(matchId, m.absenceDeadline, onFire);
      console.log(`[Tournament] Rehydrated absence timer for match ${matchId}, fires in ${Math.round(remaining / 1000)}s`);
    }
  } catch (err) {
    console.error('[Tournament] Rehydrate absence timers error:', err);
  }
}

async function autoForfeitIfEliminated(
  io: Server,
  tournamentId: string,
  matchId: string,
): Promise<boolean> {
  const m = await prisma.tournamentMatch.findUnique({ where: { id: matchId } });
  if (!m || !m.player1Id || !m.player2Id) return false;
  if (m.status === 'completed' || m.status === 'forfeit') return false;
  if ((m.bracket ?? MAIN_BRACKET) === THIRD_PLACE_BRACKET) return false;
  const elim = await prisma.tournamentParticipant.findMany({
    where: { tournamentId, userId: { in: [m.player1Id, m.player2Id] }, eliminated: true },
    select: { userId: true },
  });
  if (elim.length === 0) return false;

  if (elim.length === 2) {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId }, select: { format: true },
    });
    if (tournament?.format === 'swiss') {
      logMatchEvent({
        type: 'match.auto-forfeit.eliminated.both',
        tournamentId,
        matchId,
        bracket: m.bracket ?? undefined,
        round: m.round,
        matchIndex: m.matchIndex,
        forfeitedPlayerId: m.player1Id,
        forfeitedPlayer2Id: m.player2Id,
      });
      await handleSwissDoubleAbsence(io, tournamentId, matchId);
      return true;
    }
  }

  const elimId = elim[0].userId;
  logMatchEvent({
    type: 'match.auto-forfeit.eliminated',
    tournamentId,
    matchId,
    bracket: m.bracket ?? undefined,
    round: m.round,
    matchIndex: m.matchIndex,
    forfeitedPlayerId: elimId,
  });
  await handleMatchForfeit(io, tournamentId, matchId, elimId);
  return true;
}

export async function handleSwissDoubleAbsence(io: Server, tournamentId: string, matchId: string) {
  const match = await prisma.tournamentMatch.findUnique({ where: { id: matchId } });
  if (!match || match.status === 'completed' || match.status === 'forfeit') return;

  await prisma.tournamentMatch.update({
    where: { id: matchId },
    data: { status: 'forfeit', winnerId: null, winnerUsername: null, completedAt: new Date() },
  });

  const absentIds = [match.player1Id, match.player2Id].filter((id): id is string => !!id);
  if (absentIds.length > 0) {
    await prisma.tournamentParticipant.updateMany({
      where: { tournamentId, userId: { in: absentIds } },
      data: { eliminated: true, eliminatedRound: match.round },
    });
    for (const id of absentIds) {
      await markParticipantAbsence(tournamentId, id);
    }
  }

  logMatchEvent({
    type: 'match.forfeit.double',
    tournamentId,
    matchId,
    bracket: match.bracket ?? undefined,
    round: match.round,
    matchIndex: match.matchIndex,
    forfeitedPlayerId: match.player1Id ?? null,
    forfeitedPlayer2Id: match.player2Id ?? null,
  });

  if (match.roomCode) {
    finalizeAndScheduleRoomDeletion(rooms, match.roomCode);
  }

  io.to(`tournament:${tournamentId}`).emit('tournament:player-forfeited', {
    matchId, forfeitedPlayerId: match.player1Id, winnerId: null, winnerUsername: null, doubleForfeit: true,
  });
  if (match.player2Id) {
    io.to(`tournament:${tournamentId}`).emit('tournament:player-forfeited', {
      matchId, forfeitedPlayerId: match.player2Id, winnerId: null, winnerUsername: null, doubleForfeit: true,
    });
  }

  await handleSwissMatchEnd(io, tournamentId, match);
}

export async function handleMatchForfeit(io: Server, tournamentId: string, matchId: string, forfeitPlayerId: string) {
  const match = await prisma.tournamentMatch.findUnique({ where: { id: matchId } });
  if (!match || match.status === 'completed' || match.status === 'forfeit') return;

  const winnerId = match.player1Id === forfeitPlayerId ? match.player2Id : match.player1Id;
  const winnerUsername = match.player1Id === forfeitPlayerId ? match.player2Username : match.player1Username;

  await prisma.tournamentMatch.update({
    where: { id: matchId },
    data: { status: 'forfeit', winnerId, winnerUsername, completedAt: new Date() },
  });

  logMatchEvent({
    type: 'match.forfeit.absence',
    tournamentId,
    matchId,
    bracket: match.bracket ?? undefined,
    round: match.round,
    matchIndex: match.matchIndex,
    forfeitedPlayerId: forfeitPlayerId,
    winnerId,
  });

  if (match.roomCode) {
    finalizeAndScheduleRoomDeletion(rooms, match.roomCode);
  }


  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { format: true } });
  const isSwiss = tournament?.format === 'swiss';
  const isDoubleElim = tournament?.format === 'double_elimination';

  if (!isDoubleElim) {
    await prisma.tournamentParticipant.updateMany({
      where: { tournamentId, userId: forfeitPlayerId },
      data: { eliminated: true, eliminatedRound: match.round },
    });
  }

  io.to(`tournament:${tournamentId}`).emit('tournament:player-forfeited', {
    matchId, forfeitedPlayerId: forfeitPlayerId, winnerId, winnerUsername,
  });

  if (winnerId) {
    if (isSwiss) {
      await handleSwissMatchEnd(io, tournamentId, match);
    } else if (isDoubleElim) {
      await advanceMatchWinnerDoubleElim(io, tournamentId, match as never, winnerId, winnerUsername, forfeitPlayerId);
    } else {
      await advanceMatchWinner(io, tournamentId, match, winnerId, winnerUsername);
    }
  }
}

export async function startInitialRoundAbsenceTimers(io: Server, tournamentId: string): Promise<void> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { format: true, currentRound: true },
  });
  if (!tournament) return;
  const isDoubleElim = tournament.format === 'double_elimination';
  const round = tournament.currentRound;

  const initialMatches = await prisma.tournamentMatch.findMany({
    where: {
      tournamentId,
      round,
      status: 'ready',
      isBye: false,
      absenceDeadline: null,
      ...(isDoubleElim ? { bracket: 'winners' } : {}),
    },
  });

  for (const nm of initialMatches) {
    if (!nm.player1Id || !nm.player2Id) continue;
    const matchId = nm.id;
    const p1 = nm.player1Id;
    const p2 = nm.player2Id;
    const deadline = startAbsenceTimer(matchId, async () => {
      await fireAbsenceTimerCallback(io, tournamentId, matchId, p1, p2, null, false);
    });
    await prisma.tournamentMatch.update({
      where: { id: matchId },
      data: { absenceDeadline: deadline, absentPlayerId: null },
    });
    io.to(`tournament:${tournamentId}`).emit('tournament:absence-timer', {
      matchId, playerId: null, deadline: deadline.toISOString(),
    });
  }
}

async function advanceSeriesToNextGame(
  io: Server,
  tournamentId: string,
  match: { id: string; roomCode: string | null; player1Id: string | null; player2Id: string | null },
  player1GameWins: number,
  player2GameWins: number,
): Promise<void> {
  const matchId = match.id;
  for (const code of [match.roomCode, `T-${matchId.slice(-6)}`]) {
    if (!code) continue;
    const stale = rooms.get(code);
    if (!stale) continue;
    clearTournamentInviteTimer(stale);
    clearAllMatchRoomTimers(stale);
    rooms.delete(code);
  }

  await prisma.tournamentMatch.update({
    where: { id: matchId },
    data: { status: 'ready', roomCode: null, gameId: null, startedAt: null, absenceDeadline: null, absentPlayerId: null },
  });
  matchGraceCycles.delete(matchId);
  matchReadyPlayers.delete(matchId);
  matchNoContestCount.delete(matchId);

  logMatchEvent({ type: 'match.series.continue', tournamentId, matchId });
  io.to(`tournament:${tournamentId}`).emit('tournament:match-updated', {
    matchId, status: 'ready', roomCode: null, player1GameWins, player2GameWins,
  });
  if (match.player1Id) emitToUser(match.player1Id, 'tournament:please-confirm-ready', { matchId, tournamentId });
  if (match.player2Id) emitToUser(match.player2Id, 'tournament:please-confirm-ready', { matchId, tournamentId });
  if (match.player1Id && match.player2Id) {
    await armReadyMatchAbsence(io, tournamentId, matchId, match.player1Id, match.player2Id);
  }
}

export async function handleTournamentMatchEnd(io: Server, tournamentId: string, matchId: string, winnerId: string, gameId: string | null) {
  try {
    const match = await prisma.tournamentMatch.findUnique({ where: { id: matchId } });
    if (!match) return;
    if (match.status === 'completed') {
      console.log(`[Tournament] handleTournamentMatchEnd skipped for ${matchId}: already ${match.status}`);
      return;
    }
    if (match.status === 'forfeit') {
      console.error(
        `[Tournament] CRITICAL: match ${matchId} was marked forfeit but a played result arrived (winner ${winnerId}); the played result wins and the bracket is corrected`,
      );
      logMatchEvent({ type: 'match.forfeit.overridden', tournamentId, matchId, winnerId });
      await prisma.tournamentParticipant.updateMany({
        where: { tournamentId, userId: winnerId },
        data: { eliminated: false, eliminatedRound: null },
      });
      await clearParticipantAbsence(tournamentId, winnerId);
    }
    clearAbsenceTimer(matchId);
    matchReadyPlayers.delete(matchId);

    const seriesMeta = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { bestOf: true } });
    const bestOf = seriesMeta?.bestOf ?? 1;
    if (bestOf > 1 && match.status !== 'in_progress') {
      console.log(`[Tournament] series game report ignored for ${matchId}: match is ${match.status}, only a running game may score`);
      return;
    }
    if (bestOf > 1 && match.player1Id && match.player2Id && !match.isBye) {
      const target = Math.floor(bestOf / 2) + 1;
      const player1GameWins = (match.player1GameWins ?? 0) + (winnerId === match.player1Id ? 1 : 0);
      const player2GameWins = (match.player2GameWins ?? 0) + (winnerId === match.player2Id ? 1 : 0);
      await prisma.tournamentMatch.update({
        where: { id: matchId },
        data: { player1GameWins, player2GameWins },
      });
      logMatchEvent({ type: 'match.series.game', tournamentId, matchId, winnerId });

      if (player1GameWins < target && player2GameWins < target) {
        console.log(`[Tournament] match ${matchId} series continues at ${player1GameWins}-${player2GameWins} (best of ${bestOf})`);
        await advanceSeriesToNextGame(io, tournamentId, match, player1GameWins, player2GameWins);
        return;
      }
      console.log(`[Tournament] match ${matchId} series decided ${player1GameWins}-${player2GameWins} (best of ${bestOf})`);
    }

    const winnerUsername = match.player1Id === winnerId ? match.player1Username : match.player2Username;
    const loserId = match.player1Id === winnerId ? match.player2Id : match.player1Id;

    await prisma.tournamentMatch.update({
      where: { id: matchId },
      data: { status: 'completed', winnerId, winnerUsername, ...(gameId ? { gameId } : {}), completedAt: new Date() },
    });

    logMatchEvent({
      type: 'match.completed.played',
      tournamentId,
      matchId,
      bracket: match.bracket ?? undefined,
      round: match.round,
      matchIndex: match.matchIndex,
      winnerId,
      loserId: loserId ?? null,
    });


    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { format: true } });
    const isSwiss = tournament?.format === 'swiss';
    const isDoubleElim = tournament?.format === 'double_elimination';

    if (!isSwiss && !isDoubleElim) {

      if (loserId) {
        await prisma.tournamentParticipant.updateMany({
          where: { tournamentId, userId: loserId },
          data: { eliminated: true, eliminatedRound: match.round },
        });
      }
    }

    io.to(`tournament:${tournamentId}`).emit('tournament:match-updated', {
      matchId, status: 'completed', winnerId, winnerUsername, gameId,
    });

    if (isSwiss) {
      await handleSwissMatchEnd(io, tournamentId, match);
    } else if (isDoubleElim) {
      await advanceMatchWinnerDoubleElim(io, tournamentId, match as never, winnerId, winnerUsername, loserId ?? null);
    } else {
      await advanceMatchWinner(io, tournamentId, match, winnerId, winnerUsername);
    }
  } catch (err) {
    console.error('[Tournament] Match end handler error:', err);
  }
}





export async function handleSwissMatchEnd(
  io: Server,
  tournamentId: string,
  match: { round: number; matchIndex: number },
) {

  const allRoundMatches = await prisma.tournamentMatch.findMany({
    where: { tournamentId, round: match.round },
  });
  const roundComplete = allRoundMatches.every(
    m => m.status === 'completed' || m.status === 'forfeit',
  );

  if (!roundComplete) {

    const standings = await buildCurrentStandings(tournamentId);
    io.to(`tournament:${tournamentId}`).emit('tournament:standings-updated', { standings });
    return;
  }


  const lockKey = `${tournamentId}:${match.round}`;
  return withSwissRoundLock(lockKey, async () => {

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        participants: true,
        matches: { orderBy: [{ round: 'asc' }, { matchIndex: 'asc' }] },
      },
    });
    if (!tournament) return;
    if (tournament.currentRound > match.round) return;
    if (tournament.status === 'completed') return;

    const { swissPlayers, swissResults } = buildSwissData(tournament.participants, tournament.matches);
    const standings = computeStandings(swissPlayers, swissResults);

    if (match.round < tournament.totalRounds) {
      const nextRound = match.round + 1;
      const eliminatedIds = new Set(tournament.participants.filter(p => p.eliminated).map(p => p.userId));
      const activeCount = tournament.participants.length - eliminatedIds.size;
      if (activeCount === 0) {
        await prisma.tournament.update({
          where: { id: tournamentId },
          data: { status: 'cancelled', completedAt: new Date() },
        });
        io.to(`tournament:${tournamentId}`).emit('tournament:cancelled', { reason: 'all_eliminated', tournamentId });
        await cleanupTournamentMaps(tournamentId);
        return;
      }
      if (activeCount === 1) {
        const winner = standings.find(s => !eliminatedIds.has(s.userId));
        if (winner) {
          await prisma.tournament.update({
            where: { id: tournamentId },
            data: {
              status: 'completed',
              winnerId: winner.userId,
              winnerUsername: winner.username,
              completedAt: new Date(),
            },
          });
          const updatedUser = await prisma.user.update({
            where: { id: winner.userId },
            data: { tournamentWins: { increment: 1 } },
          });
          logMatchEvent({
            type: 'tournament.completed',
            tournamentId,
            winnerId: winner.userId,
            format: 'swiss',
          });
          io.to(`tournament:${tournamentId}`).emit('tournament:completed', {
            winnerId: winner.userId,
            winnerUsername: winner.username,
            standings,
          });
          await cleanupTournamentMaps(tournamentId);
          let assignedRoleName: string | null = null;
          try {
            assignedRoleName = await assignTournamentWinnerRole(winner.userId, updatedUser.tournamentWins);
          } catch (err) {
            console.error('[Tournament] Discord role assign error:', err);
          }
          try {
            const podium = standings.slice(0, 3).map((s, i) => ({
              userId: s.userId,
              username: s.username,
              place: (i + 1) as 1 | 2 | 3,
            }));
            await sendTournamentResults(
              tournament.name,
              podium,
              tournament.participants.length,
              assignedRoleName,
              tournament.isPublic,
            );
          } catch (err) {
            console.error('[Tournament] Discord webhook error:', err);
          }
          return;
        }
      }
      const pairings = generateSwissPairings(swissPlayers, swissResults, nextRound, eliminatedIds);

      const existingNext = await prisma.tournamentMatch.findFirst({
        where: { tournamentId, round: nextRound },
        select: { id: true },
      });
      if (!existingNext) {
        await prisma.tournamentMatch.createMany({
          data: pairings.map((pairing) => {
            const isBye = pairing.player2 === null;
            return {
              tournamentId,
              round: pairing.round,
              matchIndex: pairing.matchIndex,
              player1Id: pairing.player1.userId,
              player1Username: pairing.player1.username,
              player2Id: pairing.player2?.userId ?? null,
              player2Username: pairing.player2?.username ?? null,
              winnerId: isBye ? pairing.player1.userId : null,
              winnerUsername: isBye ? pairing.player1.username : null,
              isBye,
              status: isBye ? 'completed' : 'ready',
            };
          }),
        });
        for (const pairing of pairings) {
          if (pairing.player2 === null) {
            logMatchEvent({
              type: 'match.advance.bye',
              tournamentId,
              round: pairing.round,
              matchIndex: pairing.matchIndex,
              winnerId: pairing.player1.userId,
            });
          }
        }
      } else {
        console.log(`[Tournament] Swiss round ${nextRound} matches already exist for ${tournamentId}, skipping createMany (recovering from prior partial state)`);
      }
      
      const byePlayers = pairings.filter(p => p.player2 === null);
      if (byePlayers.length > 0) {
        await Promise.all(byePlayers.map(p =>
          prisma.tournamentParticipant.updateMany({
            where: { tournamentId, userId: p.player1.userId },
            data: { hasBye: true },
          })
        ));
      }

      await prisma.tournament.update({
        where: { id: tournamentId },
        data: { currentRound: nextRound },
      });

      
      const newMatches = await prisma.tournamentMatch.findMany({
        where: { tournamentId, round: nextRound, status: 'ready', isBye: false },
      });
      for (const nm of newMatches) {
        if (!nm.player1Id || !nm.player2Id) continue;
        const matchId = nm.id;
        const p1 = nm.player1Id;
        const p2 = nm.player2Id;
        const deadline = startAbsenceTimer(matchId, async () => {
          await fireAbsenceTimerCallback(io, tournamentId, matchId, p1, p2, null, false);
        });
        await prisma.tournamentMatch.update({
          where: { id: matchId },
          data: { absenceDeadline: deadline, absentPlayerId: null },
        });
        io.to(`tournament:${tournamentId}`).emit('tournament:absence-timer', {
          matchId, playerId: null, deadline: deadline.toISOString(),
        });
      }

      io.to(`tournament:${tournamentId}`).emit('tournament:round-complete', {
        completedRound: match.round, nextRound,
      });
      io.to(`tournament:${tournamentId}`).emit('tournament:standings-updated', { standings });
    } else {

      const eliminatedIds = new Set(tournament.participants.filter(p => p.eliminated).map(p => p.userId));
      const winner = standings.find(s => !eliminatedIds.has(s.userId));
      if (!winner) {
        await prisma.tournament.update({
          where: { id: tournamentId },
          data: { status: 'cancelled', completedAt: new Date() },
        });
        logMatchEvent({ type: 'tournament.cancelled.all-eliminated', tournamentId, format: 'swiss' });
        io.to(`tournament:${tournamentId}`).emit('tournament:cancelled', { reason: 'all_eliminated', tournamentId });
        await cleanupTournamentMaps(tournamentId);
        return;
      }
      await prisma.tournament.update({
        where: { id: tournamentId },
        data: {
          status: 'completed',
          winnerId: winner.userId,
          winnerUsername: winner.username,
          completedAt: new Date(),
        },
      });

      const updatedUser = await prisma.user.update({
        where: { id: winner.userId },
        data: { tournamentWins: { increment: 1 } },
      });

      logMatchEvent({
        type: 'tournament.completed',
        tournamentId,
        winnerId: winner.userId,
        format: 'swiss',
      });

      try {
        emitQuestEvent('tournament.won.swiss', winner.userId);
        const isMono = await isWinnerDeckMonoVillage(tournamentId, winner.userId);
        if (isMono) emitQuestEvent('tournament.won.mono_village', winner.userId);
      } catch (err) {
        console.error('[quests] swiss tournament emit failed:', err instanceof Error ? err.message : err);
      }

      try {
        const acquired = await acquirePrizeAwardLock(tournamentId);
        if (acquired) {
          const prizeCardId = await readTournamentPrizeCardId(tournamentId);
          await grantWinnerPrize(winner.userId, prizeCardId);
          const eligibles = await listEligibleParticipantsForReward(tournamentId, winner.userId);
          for (const p of eligibles) {
            if (p.stayedUntilEnd) await grantParticipantReward(p.userId);
          }
        }
      } catch (err) {
        console.error('[Tournament] swiss prize grant failed:', err instanceof Error ? err.message : err);
      }

      io.to(`tournament:${tournamentId}`).emit('tournament:completed', {
        winnerId: winner.userId,
        winnerUsername: winner.username,
        standings,
      });

      await cleanupTournamentMaps(tournamentId);

      
      let newRoleName: string | null = null;
      try {
        newRoleName = await assignTournamentWinnerRole(winner.userId, updatedUser.tournamentWins);
      } catch (err) {
        console.error('[Tournament] Discord role assign error:', err);
      }

      
      try {
        const podium = standings.slice(0, 3).map((s, i) => ({
          userId: s.userId,
          username: s.username,
          place: (i + 1) as 1 | 2 | 3,
        }));
        await sendTournamentResults(
          tournament.name,
          podium,
          tournament.participants.length,
          newRoleName,
          tournament.isPublic,
        );
      } catch (err) {
        console.error('[Tournament] Webhook error:', err);
      }
    }
  });
}





function buildSwissData(
  participants: Array<{ userId: string; username: string; seed: number | null }>,
  matches: Array<{
    round: number;
    player1Id: string | null;
    player2Id: string | null;
    winnerId: string | null;
    isBye: boolean;
    status: string;
  }>,
): { swissPlayers: SwissPlayer[]; swissResults: SwissMatchResult[] } {
  const swissPlayers: SwissPlayer[] = participants.map((p, i) => ({
    userId: p.userId,
    username: p.username,
    seed: p.seed ?? (i + 1),
  }));

  const swissResults: SwissMatchResult[] = matches
    .filter(m => m.status === 'completed' || m.status === 'forfeit')
    .filter(m => m.player1Id !== null)
    .map(m => ({
      round: m.round,
      player1Id: m.player1Id!,
      player2Id: m.player2Id ?? m.player1Id!,
      winnerId: m.winnerId,
      isBye: m.isBye,
      isDoubleForfeit: m.status === 'forfeit' && m.winnerId === null && m.player2Id !== null && !m.isBye,
    }));

  return { swissPlayers, swissResults };
}

async function buildCurrentStandings(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      participants: true,
      matches: { orderBy: [{ round: 'asc' }, { matchIndex: 'asc' }] },
    },
  });
  if (!tournament) return [];
  const { swissPlayers, swissResults } = buildSwissData(tournament.participants, tournament.matches);
  return computeStandings(swissPlayers, swissResults);
}





export async function advanceMatchWinner(
  io: Server | null,
  tournamentId: string,
  match: {
    round: number;
    matchIndex: number;
    bracket?: string | null;
    player1Id?: string | null;
    player2Id?: string | null;
    player1Username?: string | null;
    player2Username?: string | null;
  },
  winnerId: string,
  winnerUsername: string | null,
) {
  const sourceBracket = match.bracket ?? MAIN_BRACKET;
  if (sourceBracket !== MAIN_BRACKET) {
    console.log(`[Tournament] advanceMatchWinner: ${sourceBracket} bracket match has no successor, tournament ${tournamentId} completion untouched`);
    if (sourceBracket === THIRD_PLACE_BRACKET) {
      awardNwlPrizeIfNeeded(tournamentId).catch(() => {});
      await sendEliminationResults(tournamentId, null);
    }
    return;
  }

  const nextRound = match.round + 1;
  const nextMatchIndex = Math.floor(match.matchIndex / 2);
  const isTopSlot = match.matchIndex % 2 === 0;

  const nextMatch = await prisma.tournamentMatch.findUnique({
    where: { tournamentId_bracket_round_matchIndex: { tournamentId, bracket: MAIN_BRACKET, round: nextRound, matchIndex: nextMatchIndex } },
  });

  if (!nextMatch) {




    const tournamentMeta = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { totalRounds: true, status: true },
    });
    if (!tournamentMeta) {
      console.error(`[Tournament] advanceMatchWinner: tournament ${tournamentId} not found while finalizing`);
      return;
    }
    if (tournamentMeta.status === 'completed' || tournamentMeta.status === 'cancelled') {
      console.warn(`[Tournament] advanceMatchWinner: tournament ${tournamentId} already ${tournamentMeta.status}, skipping completion`);
      return;
    }
    if (match.round < tournamentMeta.totalRounds) {
      console.error(`[Tournament] advanceMatchWinner: refusing to complete tournament ${tournamentId} on non-final match (round ${match.round}/${tournamentMeta.totalRounds}). Bracket DB integrity issue: nextMatch missing for round ${match.round + 1} matchIndex ${nextMatchIndex}.`);
      return;
    }

    const winnerEliminated = await prisma.tournamentParticipant.findFirst({
      where: { tournamentId, userId: winnerId, eliminated: true },
      select: { id: true },
    });
    if (winnerEliminated) {
      await prisma.tournament.update({
        where: { id: tournamentId },
        data: { status: 'cancelled', completedAt: new Date() },
      });
      logMatchEvent({ type: 'tournament.cancelled.all-eliminated', tournamentId, format: 'elimination' });
      io?.to(`tournament:${tournamentId}`).emit('tournament:cancelled', { reason: 'all_eliminated', tournamentId });
      await cleanupTournamentMaps(tournamentId);
      return;
    }
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: 'completed', winnerId, winnerUsername, completedAt: new Date() },
    });
    const updatedUser = await prisma.user.update({
      where: { id: winnerId },
      data: { tournamentWins: { increment: 1 } },
    });
    logMatchEvent({ type: 'tournament.completed', tournamentId, winnerId, format: 'elimination' });
    io?.to(`tournament:${tournamentId}`).emit('tournament:completed', { winnerId, winnerUsername });

    awardNwlPrizeIfNeeded(tournamentId).catch(() => {});

    try {
      const meta = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        select: { format: true, gameMode: true },
      });
      const format: string = meta?.format ?? 'single';
      if (format === 'swiss') emitQuestEvent('tournament.won.swiss', winnerId);
      else emitQuestEvent('tournament.won.single', winnerId);
      const isMono = await isWinnerDeckMonoVillage(tournamentId, winnerId);
      if (isMono) emitQuestEvent('tournament.won.mono_village', winnerId);

      const acquired = await acquirePrizeAwardLock(tournamentId);
      if (acquired) {
        const prizeCardId = await readTournamentPrizeCardId(tournamentId);
        await grantWinnerPrize(winnerId, prizeCardId);
        const eligibles = await listEligibleParticipantsForReward(tournamentId, winnerId);
        for (const p of eligibles) {
          if (p.stayedUntilEnd) await grantParticipantReward(p.userId);
        }
      }
    } catch (err) {
      console.error('[quests] tournament emit failed:', err instanceof Error ? err.message : err);
    }

    await cleanupTournamentMaps(tournamentId);

    
    let newRoleName: string | null = null;
    try {
      newRoleName = await assignTournamentWinnerRole(winnerId, updatedUser.tournamentWins);
    } catch (err) {
      console.error('[Tournament] Discord role assign error:', err);
    }

    await sendEliminationResults(tournamentId, newRoleName);
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (isTopSlot) { updateData.player1Id = winnerId; updateData.player1Username = winnerUsername; }
  else { updateData.player2Id = winnerId; updateData.player2Username = winnerUsername; }

  const updated = await prisma.tournamentMatch.update({ where: { id: nextMatch.id }, data: updateData });
  clearTournamentMatchTimers(nextMatch.id);
  logMatchEvent({
    type: 'match.advance',
    tournamentId,
    matchId: nextMatch.id,
    bracket: nextMatch.bracket ?? undefined,
    round: nextMatch.round,
    matchIndex: nextMatch.matchIndex,
    winnerId,
  });

  if (nextMatch.isBye) {
    await prisma.tournamentMatch.update({
      where: { id: nextMatch.id },
      data: { status: 'completed', winnerId, winnerUsername, completedAt: new Date() },
    });
    await prisma.tournamentParticipant.updateMany({
      where: { tournamentId, userId: winnerId },
      data: { hasBye: true },
    });
    logMatchEvent({
      type: 'match.advance.bye',
      tournamentId,
      matchId: nextMatch.id,
      bracket: nextMatch.bracket ?? undefined,
      round: nextMatch.round,
      matchIndex: nextMatch.matchIndex,
      winnerId,
    });
    io?.to(`tournament:${tournamentId}`).emit('tournament:match-updated', {
      matchId: nextMatch.id,
      player1Id: winnerId,
      player1Username: winnerUsername,
      status: 'completed',
      winnerId,
      winnerUsername,
    });
    await routeSemifinalLoserToThirdPlace(io, tournamentId, match, winnerId);
    await advanceMatchWinner(io, tournamentId, {
      id: nextMatch.id,
      bracket: nextMatch.bracket,
      round: nextMatch.round,
      matchIndex: nextMatch.matchIndex,
      player1Id: winnerId,
      player2Id: null,
      player1Username: winnerUsername,
      player2Username: null,
    } as never, winnerId, winnerUsername);
    return;
  }

  const p1 = isTopSlot ? winnerId : updated.player1Id;
  const p2 = isTopSlot ? updated.player2Id : winnerId;
  if (p1 && p2) {
    await prisma.tournamentMatch.update({ where: { id: nextMatch.id }, data: { status: 'ready' } });
    if (io) await armReadyMatchAbsence(io, tournamentId, nextMatch.id, p1, p2);
  }

  io?.to(`tournament:${tournamentId}`).emit('tournament:match-updated', {
    matchId: nextMatch.id,
    player1Id: isTopSlot ? winnerId : updated.player1Id,
    player1Username: isTopSlot ? winnerUsername : updated.player1Username,
    player2Id: isTopSlot ? updated.player2Id : winnerId,
    player2Username: isTopSlot ? updated.player2Username : winnerUsername,
    status: (p1 && p2) ? 'ready' : 'pending',
  });

  await routeSemifinalLoserToThirdPlace(io, tournamentId, match, winnerId);

  const allRoundMatches = (await prisma.tournamentMatch.findMany({ where: { tournamentId, round: match.round } }))
    .filter(m => (m.bracket ?? MAIN_BRACKET) === MAIN_BRACKET);
  const roundComplete = allRoundMatches.every(m => m.status === 'completed' || m.status === 'forfeit');
  if (roundComplete) {
    await prisma.tournament.update({ where: { id: tournamentId }, data: { currentRound: nextRound } });
    io?.to(`tournament:${tournamentId}`).emit('tournament:round-complete', { completedRound: match.round, nextRound });
  }
}

const eliminationResultsAnnounced = new Set<string>();

async function sendEliminationResults(tournamentId: string, newRoleName: string | null): Promise<void> {
  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { matches: true, _count: { select: { participants: true } } },
    });
    if (!tournament) return;
    const championId = tournament.winnerId;
    if (tournament.status !== 'completed' || !championId) return;

    const thirdPlaceMatch = tournament.matches.find(m => (m.bracket ?? MAIN_BRACKET) === THIRD_PLACE_BRACKET);
    const thirdPlaceStillOpen = !!thirdPlaceMatch
      && thirdPlaceMatch.status !== 'completed'
      && thirdPlaceMatch.status !== 'forfeit'
      && !!thirdPlaceMatch.player1Id
      && !!thirdPlaceMatch.player2Id;
    if (thirdPlaceStillOpen) {
      console.log(`[Tournament] results announcement for ${tournamentId} deferred until the third place match is resolved`);
      return;
    }
    if (eliminationResultsAnnounced.has(tournamentId)) return;
    eliminationResultsAnnounced.add(tournamentId);

    const mainMatches = tournament.matches.filter(m => (m.bracket ?? MAIN_BRACKET) === MAIN_BRACKET);
    let finalMatch: (typeof mainMatches)[number] | null = null;
    for (const m of mainMatches) {
      if (!finalMatch || m.round > finalMatch.round || (m.round === finalMatch.round && m.matchIndex < finalMatch.matchIndex)) {
        finalMatch = m;
      }
    }
    const finalistId = finalMatch?.player1Id === championId ? finalMatch?.player2Id : finalMatch?.player1Id;
    const finalistUsername = finalMatch?.player1Id === championId ? finalMatch?.player2Username : finalMatch?.player1Username;

    const semiRound = finalMatch ? finalMatch.round - 1 : 0;
    const semiLosers = mainMatches
      .filter(m => m.round === semiRound && m.status === 'completed')
      .map(m => m.winnerId === m.player1Id
        ? { userId: m.player2Id, username: m.player2Username }
        : { userId: m.player1Id, username: m.player1Username })
      .filter(l => l.userId && l.username && l.userId !== finalistId);
    const thirdPlace = thirdPlaceMatch
      ? (thirdPlaceMatch.winnerId && thirdPlaceMatch.winnerUsername
        ? { userId: thirdPlaceMatch.winnerId, username: thirdPlaceMatch.winnerUsername }
        : undefined)
      : semiLosers[0];

    const podium = [
      { userId: championId, username: tournament.winnerUsername ?? 'Unknown', place: 1 as const },
      ...(finalistId && finalistUsername ? [{ userId: finalistId, username: finalistUsername, place: 2 as const }] : []),
      ...(thirdPlace?.userId && thirdPlace.username ? [{ userId: thirdPlace.userId, username: thirdPlace.username, place: 3 as const }] : []),
    ];
    await sendTournamentResults(tournament.name, podium, tournament._count.participants, newRoleName, tournament.isPublic);
  } catch (err) {
    eliminationResultsAnnounced.delete(tournamentId);
    console.error('[Tournament] Webhook error:', err);
  }
}

async function armReadyMatchAbsence(
  io: Server,
  tournamentId: string,
  matchId: string,
  player1Id: string,
  player2Id: string,
): Promise<void> {
  const autoForfeitTriggered = await autoForfeitIfEliminated(io, tournamentId, matchId);
  if (autoForfeitTriggered) return;
  const deadline = startAbsenceTimer(matchId, async () => {
    await fireAbsenceTimerCallback(io, tournamentId, matchId, player1Id, player2Id, null, false);
  });
  await prisma.tournamentMatch.update({
    where: { id: matchId },
    data: { absenceDeadline: deadline },
  });
  io.to(`tournament:${tournamentId}`).emit('tournament:absence-timer', {
    matchId, playerId: null, deadline: deadline.toISOString(),
  });
}

export async function routeSemifinalLoserToThirdPlace(
  io: Server | null,
  tournamentId: string,
  semifinal: {
    round: number;
    matchIndex: number;
    player1Id?: string | null;
    player2Id?: string | null;
    player1Username?: string | null;
    player2Username?: string | null;
  },
  winnerId: string,
): Promise<void> {
  const loserId = semifinal.player1Id === winnerId ? semifinal.player2Id ?? null : semifinal.player1Id ?? null;
  const loserUsername = semifinal.player1Id === winnerId ? semifinal.player2Username ?? null : semifinal.player1Username ?? null;
  if (!loserId) return;

  const thirdPlaceMatch = await prisma.tournamentMatch.findUnique({
    where: {
      tournamentId_bracket_round_matchIndex: {
        tournamentId, bracket: THIRD_PLACE_BRACKET, round: semifinal.round + 1, matchIndex: 0,
      },
    },
  });
  if (!thirdPlaceMatch) return;
  if (thirdPlaceMatch.status !== 'pending') return;
  if (thirdPlaceMatch.player1Id === loserId || thirdPlaceMatch.player2Id === loserId) return;

  const toFirstSlot = semifinal.matchIndex % 2 === 0;
  const updated = await prisma.tournamentMatch.update({
    where: { id: thirdPlaceMatch.id },
    data: toFirstSlot
      ? { player1Id: loserId, player1Username: loserUsername }
      : { player2Id: loserId, player2Username: loserUsername },
  });

  logMatchEvent({
    type: 'match.advance',
    tournamentId,
    matchId: updated.id,
    bracket: THIRD_PLACE_BRACKET,
    round: updated.round,
    matchIndex: updated.matchIndex,
    winnerId,
    loserId,
  });

  if (updated.player1Id && updated.player2Id) {
    await prisma.tournamentMatch.update({ where: { id: updated.id }, data: { status: 'ready' } });
    if (io) await armReadyMatchAbsence(io, tournamentId, updated.id, updated.player1Id, updated.player2Id);
    io?.to(`tournament:${tournamentId}`).emit('tournament:match-updated', {
      matchId: updated.id,
      player1Id: updated.player1Id,
      player1Username: updated.player1Username,
      player2Id: updated.player2Id,
      player2Username: updated.player2Username,
      status: 'ready',
    });
    return;
  }

  const siblingIndex = toFirstSlot ? semifinal.matchIndex + 1 : semifinal.matchIndex - 1;
  const sibling = await prisma.tournamentMatch.findUnique({
    where: {
      tournamentId_bracket_round_matchIndex: {
        tournamentId, bracket: MAIN_BRACKET, round: semifinal.round, matchIndex: siblingIndex,
      },
    },
  });
  const siblingCanProduceLoser = !!sibling && !sibling.isBye && !!sibling.player1Id && !!sibling.player2Id;

  if (!siblingCanProduceLoser) {
    await prisma.tournamentMatch.update({
      where: { id: updated.id },
      data: { status: 'completed', winnerId: loserId, winnerUsername: loserUsername, isBye: true, completedAt: new Date() },
    });
    logMatchEvent({
      type: 'match.advance.bye',
      tournamentId,
      matchId: updated.id,
      bracket: THIRD_PLACE_BRACKET,
      round: updated.round,
      matchIndex: updated.matchIndex,
      winnerId: loserId,
    });
    io?.to(`tournament:${tournamentId}`).emit('tournament:match-updated', {
      matchId: updated.id,
      status: 'completed',
      winnerId: loserId,
      winnerUsername: loserUsername,
    });
    awardNwlPrizeIfNeeded(tournamentId).catch(() => {});
    return;
  }

  io?.to(`tournament:${tournamentId}`).emit('tournament:match-updated', {
    matchId: updated.id,
    player1Id: updated.player1Id,
    player1Username: updated.player1Username,
    player2Id: updated.player2Id,
    player2Username: updated.player2Username,
    status: 'pending',
  });
}

export async function advanceMatchWinnerDoubleElim(
  io: Server | null,
  tournamentId: string,
  match: { id: string; bracket: string; round: number; matchIndex: number; player1Id: string | null; player2Id: string | null },
  winnerId: string,
  winnerUsername: string | null,
  loserId: string | null,
): Promise<void> {
  const tournamentMeta = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { participants: { select: { userId: true } } },
  });
  if (!tournamentMeta) return;
  const playerCount = tournamentMeta.participants.length;
  const size = nextPowerOf2OrTwo(playerCount);
  const wbRounds = Math.max(1, Math.log2(size));
  const lbRounds = Math.max(0, 2 * wbRounds - 2);

  const bracket = match.bracket as DEBracket;

  if (bracket === 'grand_final' && match.round === 1) {
    const player1WasWB = match.player1Id === winnerId;
    if (!player1WasWB) {
      const existingReset = await prisma.tournamentMatch.findFirst({
        where: { tournamentId, bracket: 'grand_final', round: 2 },
      });
      if (!existingReset) {
        await prisma.tournamentMatch.create({
          data: {
            tournamentId, bracket: 'grand_final', round: 2, matchIndex: 0,
            player1Id: match.player1Id, player1Username: (await prisma.user.findUnique({ where: { id: match.player1Id! }, select: { username: true } }))?.username ?? null,
            player2Id: winnerId, player2Username: winnerUsername,
            status: 'ready',
            isBye: false,
          },
        });
        io?.to(`tournament:${tournamentId}`).emit('tournament:match-updated', {
          bracket: 'grand_final', round: 2,
        });
        return;
      }
    } else {
      await finalizeDoubleElim(io, tournamentId, winnerId, winnerUsername, match);
      return;
    }
  }

  if (bracket === 'grand_final' && match.round === 2) {
    await finalizeDoubleElim(io, tournamentId, winnerId, winnerUsername, match);
    return;
  }

  if (bracket === 'losers' && loserId) {
    await prisma.tournamentParticipant.updateMany({
      where: { tournamentId, userId: loserId },
      data: { eliminated: true, eliminatedRound: match.round },
    });
  }

  const winTarget = winnerAdvanceTarget(
    { bracket, round: match.round, matchIndex: match.matchIndex },
    wbRounds, lbRounds,
  );
  if (winTarget) {
    await applySlot(io, tournamentId, winTarget, winnerId, winnerUsername);
  }

  if (bracket === 'winners' && loserId) {
    const loseTarget = loserDropTarget(
      { bracket, round: match.round, matchIndex: match.matchIndex },
      wbRounds,
    );
    if (loseTarget) {
      const loserUser = await prisma.user.findUnique({ where: { id: loserId }, select: { username: true } });
      await applySlot(io, tournamentId, loseTarget, loserId, loserUser?.username ?? null);
    }
  }

  const ongoing = await prisma.tournamentMatch.findMany({
    where: { tournamentId, status: { in: ['ready', 'in_progress', 'pending'] } },
    select: { round: true },
  });
  if (ongoing.length > 0) {
    const maxOngoing = ongoing.reduce((acc, m) => m.round > acc ? m.round : acc, 0);
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { currentRound: maxOngoing },
    }).catch(() => {});
  }
}

async function applySlot(
  io: Server | null,
  tournamentId: string,
  plan: { bracket: DEBracket; round: number; matchIndex: number; slot: 'player1' | 'player2' },
  userId: string,
  username: string | null,
): Promise<void> {
  const refreshed = await prisma.$transaction(async (tx) => {
    const target = await tx.tournamentMatch.findUnique({
      where: {
        tournamentId_bracket_round_matchIndex: {
          tournamentId, bracket: plan.bracket, round: plan.round, matchIndex: plan.matchIndex,
        },
      },
    });
    if (!target) return null;
    const update: Record<string, unknown> = {};
    if (plan.slot === 'player1') {
      update.player1Id = userId;
      update.player1Username = username;
    } else {
      update.player2Id = userId;
      update.player2Username = username;
    }
    const updated = await tx.tournamentMatch.update({ where: { id: target.id }, data: update });
    if (updated.player1Id && updated.player2Id && updated.status === 'pending') {
      const ready = await tx.tournamentMatch.update({
        where: { id: updated.id },
        data: { status: 'ready' },
      });
      return ready;
    }
    return updated;
  });

  if (!refreshed) {
    console.error(`[Tournament] applySlot: target not found ${plan.bracket} R${plan.round} M${plan.matchIndex} (tournament ${tournamentId})`);
    return;
  }

  logMatchEvent({
    type: 'match.advance',
    tournamentId,
    matchId: refreshed.id,
    bracket: plan.bracket,
    round: plan.round,
    matchIndex: plan.matchIndex,
    winnerId: userId,
  });

  if (io && refreshed.player1Id && refreshed.player2Id && refreshed.status === 'ready') {
    if (await autoForfeitIfEliminated(io, tournamentId, refreshed.id)) {
      io.to(`tournament:${tournamentId}`).emit('tournament:match-updated', {
        matchId: refreshed.id,
        bracket: plan.bracket,
        round: plan.round,
        matchIndex: plan.matchIndex,
      });
      return;
    }
    const deadline = new Date(Date.now() + ABSENCE_TIMEOUT_MS);
    await prisma.tournamentMatch.update({
      where: { id: refreshed.id },
      data: { absenceDeadline: deadline },
    });
    const matchIdRef = refreshed.id;
    const p1Ref = refreshed.player1Id!;
    const p2Ref = refreshed.player2Id!;
    scheduleAbsenceTimerWithDeadline(matchIdRef, deadline, async () => {
      await fireAbsenceTimerCallback(io, tournamentId, matchIdRef, p1Ref, p2Ref, null, false);
    });
  }
  io?.to(`tournament:${tournamentId}`).emit('tournament:match-updated', {
    matchId: refreshed.id,
    bracket: plan.bracket,
    round: plan.round,
    matchIndex: plan.matchIndex,
  });
}

async function finalizeDoubleElim(
  io: Server | null,
  tournamentId: string,
  winnerId: string,
  winnerUsername: string | null,
  finalMatch: { round: number; matchIndex: number; bracket: string },
): Promise<void> {
  const winnerEliminated = await prisma.tournamentParticipant.findFirst({
    where: { tournamentId, userId: winnerId, eliminated: true },
    select: { id: true },
  });
  if (winnerEliminated) {
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: 'cancelled', completedAt: new Date() },
    });
    logMatchEvent({ type: 'tournament.cancelled.all-eliminated', tournamentId, format: 'double_elimination' });
    io?.to(`tournament:${tournamentId}`).emit('tournament:cancelled', { reason: 'all_eliminated', tournamentId });
    await cleanupTournamentMaps(tournamentId);
    void finalMatch;
    return;
  }
  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: 'completed', winnerId, winnerUsername, completedAt: new Date() },
  });
  const updatedUser = await prisma.user.update({
    where: { id: winnerId },
    data: { tournamentWins: { increment: 1 } },
  });
  logMatchEvent({ type: 'tournament.completed', tournamentId, winnerId, format: 'double_elimination' });
  io?.to(`tournament:${tournamentId}`).emit('tournament:completed', { winnerId, winnerUsername });

  try {
    emitQuestEvent('tournament.won.single', winnerId);
    const isMono = await isWinnerDeckMonoVillage(tournamentId, winnerId);
    if (isMono) emitQuestEvent('tournament.won.mono_village', winnerId);

    const acquired = await acquirePrizeAwardLock(tournamentId);
    if (acquired) {
      const prizeCardId = await readTournamentPrizeCardId(tournamentId);
      await grantWinnerPrize(winnerId, prizeCardId);
      const eligibles = await listEligibleParticipantsForReward(tournamentId, winnerId);
      for (const p of eligibles) {
        if (p.stayedUntilEnd) await grantParticipantReward(p.userId);
      }
    }
  } catch (err) {
    console.error('[quests] tournament emit failed:', err instanceof Error ? err.message : err);
  }
  await cleanupTournamentMaps(tournamentId);

  let newRoleName: string | null = null;
  try {
    newRoleName = await assignTournamentWinnerRole(winnerId, updatedUser.tournamentWins);
  } catch (err) {
    console.error('[Tournament] Discord role assign error:', err);
  }
  try {
    const t = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { _count: { select: { participants: true } } },
    });
    if (t) {
      const podium = [{ userId: winnerId, username: winnerUsername ?? 'Unknown', place: 1 as const }];
      await sendTournamentResults(t.name, podium, t._count.participants, newRoleName, t.isPublic);
    }
  } catch (err) {
    console.error('[Tournament] Webhook error:', err);
  }
  void finalMatch;
}

function nextPowerOf2OrTwo(n: number): number {
  let p = 2;
  while (p < n) p *= 2;
  return p;
}
