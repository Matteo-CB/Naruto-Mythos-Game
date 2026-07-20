
import type { Server, Socket } from 'socket.io';
import { prisma } from '@/lib/db/prisma';
import { emitQuestEvent } from '@/lib/quests/hooks';
import { ensureQuestPersistenceListener } from '@/lib/quests/listenerSetup';

ensureQuestPersistenceListener();
import { startAbsenceTimer, clearAbsenceTimer, scheduleAbsenceTimerWithDeadline, ABSENCE_TIMEOUT_MS } from '@/lib/tournament/absenceManager';
import { assignTournamentWinnerRole } from '@/lib/discord/tournamentRoles';
import { sendTournamentResults } from '@/lib/discord/tournamentWebhook';
import { rooms, type RoomData } from '@/lib/socket/server';
import { createChessClock } from '@/lib/timing/chessClock';
import { finalizeAndScheduleRoomDeletion } from '@/lib/tournament/matchRoomCleanup';
import { logMatchEvent } from '@/lib/tournament/matchEventLog';
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
import { getCharacterById, getMissionById } from '@/lib/data/cardIndex';
import type { CharacterCard, MissionCard } from '@/lib/engine/types';
import { computeDeckEvolvingPoints } from '@/lib/evolving/computePoints';
import {
  grantWinnerPrize,
  grantParticipantReward,
  listEligibleParticipantsForReward,
  markParticipantAbsence,
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
export const MAX_GRACE_CYCLES = 4;

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

  let absent1: boolean;
  let absent2: boolean;
  if (knownAbsentPlayerId !== null) {
    absent1 = knownAbsentPlayerId === p1;
    absent2 = knownAbsentPlayerId === p2;
  } else {
    absent1 = !ready?.has(p1);
    absent2 = !ready?.has(p2);
  }

  const online = getOnlineUserIds(io);
  const offlineAbsent1 = absent1 && !online.has(p1);
  const offlineAbsent2 = absent2 && !!p2 && !online.has(p2);
  const onlineAbsent1 = absent1 && online.has(p1);
  const onlineAbsent2 = absent2 && !!p2 && online.has(p2);
  const cycles = matchGraceCycles.get(matchId) ?? 0;

  if (!offlineAbsent1 && !offlineAbsent2 && (onlineAbsent1 || onlineAbsent2) && cycles < MAX_GRACE_CYCLES) {
    matchGraceCycles.set(matchId, cycles + 1);
    console.log(`[Tournament] fireAbsenceTimerCallback: match ${matchId} has an online but unconfirmed player, grace cycle ${cycles + 1}/${MAX_GRACE_CYCLES}`);
    io.to(`tournament:${tournamentId}`).emit('tournament:please-confirm-ready', { matchId, tournamentId });
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

  const capReached = cycles >= MAX_GRACE_CYCLES;
  const forfeit1 = offlineAbsent1 || (capReached && onlineAbsent1);
  const forfeit2 = offlineAbsent2 || (capReached && onlineAbsent2);

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
      await handleMatchForfeit(io, tournamentId, matchId, p1);
    }
  } else if (forfeit1 || forfeit2) {
    const forfeitId = forfeit1 ? p1 : p2;
    if (forfeitId) await markParticipantAbsence(tournamentId, forfeitId);
    await handleMatchForfeit(io, tournamentId, matchId, forfeitId);
  } else {
    console.log(`[Tournament] fireAbsenceTimerCallback: match ${matchId} no forfeitable absent player at fire time, no-op`);
  }
  matchReadyPlayers.delete(matchId);
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
      if (match.roomCode && rooms.has(match.roomCode)) return;

      const otherPlayerId = match.player1Id === userId ? match.player2Id : match.player1Id;
      if (!otherPlayerId || !match.player1Id || !match.player2Id) return;

      if (!matchReadyPlayers.has(matchId)) matchReadyPlayers.set(matchId, new Set());
      const ready = matchReadyPlayers.get(matchId)!;
      ready.add(userId);




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
        matchReadyPlayers.delete(matchId);
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

        const createdRoom = rooms.get(roomCode);
        if (createdRoom && !createdRoom.tournamentJoinTimer) {
          const TOURNAMENT_JOIN_TIMEOUT_MS = 2 * 60_000;
          createdRoom.tournamentJoinDeadline = Date.now() + TOURNAMENT_JOIN_TIMEOUT_MS;
          createdRoom.tournamentJoinTimer = setTimeout(async () => {
            const r = rooms.get(roomCode);
            if (!r) return;
            if (r.gameState && r.gameState.phase !== 'mulligan') return;
            const hostJoined = !!r.hostSocket;
            const guestJoined = !!r.guestSocket;
            if (hostJoined && guestJoined) return;
            if (!hostJoined && !guestJoined) {
              const t = await prisma.tournament.findUnique({
                where: { id: tournamentId },
                select: { format: true },
              });
              if (t?.format === 'swiss') {
                console.log(`[Tournament] Match ${matchId} double no-show: both players did not join within ${TOURNAMENT_JOIN_TIMEOUT_MS}ms`);
                await handleSwissDoubleAbsence(io, tournamentId, matchId);
                return;
              }
            }
            const absentPlayerId = !hostJoined ? r.hostId : r.guestId;
            if (!absentPlayerId) return;
            console.log(`[Tournament] Match ${matchId} forfeit: player ${absentPlayerId} did not join within ${TOURNAMENT_JOIN_TIMEOUT_MS}ms`);
            await markParticipantAbsence(tournamentId, absentPlayerId);
            await handleMatchForfeit(io, tournamentId, matchId, absentPlayerId);
          }, TOURNAMENT_JOIN_TIMEOUT_MS);
        }
      }
    } catch (err) {
      console.error('[Tournament] Ready handler error:', err);
    }
    });
  });

}


const STUCK_MATCH_HARD_TIMEOUT_MS = 35 * 60_000;

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
          data: { status: newStatus, roomCode: null, startedAt: null, absenceDeadline: null, absentPlayerId: null },
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
        console.log(`[Tournament] Rehydrate: deadline already passed for match ${matchId}, firing now`);
        onFire().catch((err) => console.error(`[Tournament] Rehydrate forfeit error for ${matchId}:`, err));
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

export async function handleTournamentMatchEnd(io: Server, tournamentId: string, matchId: string, winnerId: string, gameId: string | null) {
  try {
    const match = await prisma.tournamentMatch.findUnique({ where: { id: matchId } });
    if (!match) return;
    if (match.status === 'completed' || match.status === 'forfeit') {
      console.log(`[Tournament] handleTournamentMatchEnd skipped for ${matchId}: already ${match.status}`);
      return;
    }
    clearAbsenceTimer(matchId);
    matchReadyPlayers.delete(matchId);

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





export async function advanceMatchWinner(io: Server | null, tournamentId: string, match: { round: number; matchIndex: number }, winnerId: string, winnerUsername: string | null) {
  const nextRound = match.round + 1;
  const nextMatchIndex = Math.floor(match.matchIndex / 2);
  const isTopSlot = match.matchIndex % 2 === 0;

  const nextMatch = await prisma.tournamentMatch.findUnique({
    where: { tournamentId_bracket_round_matchIndex: { tournamentId, bracket: 'main', round: nextRound, matchIndex: nextMatchIndex } },
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

    
    try {
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        include: { matches: true, _count: { select: { participants: true } } },
      });
      if (tournament) {
        
        const finalMatch = tournament.matches.find(m => m.round === match.round && m.matchIndex === match.matchIndex);
        const finalistId = finalMatch?.player1Id === winnerId ? finalMatch?.player2Id : finalMatch?.player1Id;
        const finalistUsername = finalMatch?.player1Id === winnerId ? finalMatch?.player2Username : finalMatch?.player1Username;

        
        const semiRound = match.round - 1;
        const semiMatches = tournament.matches.filter(m => m.round === semiRound && m.status === 'completed');
        const semiLosers = semiMatches
          .map(m => m.winnerId === m.player1Id
            ? { userId: m.player2Id!, username: m.player2Username! }
            : { userId: m.player1Id!, username: m.player1Username! })
          .filter(l => l.userId && l.userId !== finalistId);
        const thirdPlace = semiLosers[0];

        const podium = [
          { userId: winnerId, username: winnerUsername ?? 'Unknown', place: 1 as const },
          ...(finalistId && finalistUsername ? [{ userId: finalistId, username: finalistUsername, place: 2 as const }] : []),
          ...(thirdPlace ? [{ userId: thirdPlace.userId, username: thirdPlace.username, place: 3 as const }] : []),
        ];
        await sendTournamentResults(tournament.name, podium, tournament._count.participants, newRoleName);
      }
    } catch (err) {
      console.error('[Tournament] Webhook error:', err);
    }
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (isTopSlot) { updateData.player1Id = winnerId; updateData.player1Username = winnerUsername; }
  else { updateData.player2Id = winnerId; updateData.player2Username = winnerUsername; }

  const updated = await prisma.tournamentMatch.update({ where: { id: nextMatch.id }, data: updateData });
  logMatchEvent({
    type: 'match.advance',
    tournamentId,
    matchId: nextMatch.id,
    bracket: nextMatch.bracket ?? undefined,
    round: nextMatch.round,
    matchIndex: nextMatch.matchIndex,
    winnerId,
  });
  const p1 = isTopSlot ? winnerId : updated.player1Id;
  const p2 = isTopSlot ? updated.player2Id : winnerId;
  if (p1 && p2) {
    await prisma.tournamentMatch.update({ where: { id: nextMatch.id }, data: { status: 'ready' } });

    const autoForfeitTriggered = io ? await autoForfeitIfEliminated(io, tournamentId, nextMatch.id) : false;

    if (!autoForfeitTriggered && io) {
      const ioRef = io;
      const matchIdRef = nextMatch.id;
      const p1Ref = p1!;
      const p2Ref = p2!;
      const deadline = startAbsenceTimer(matchIdRef, async () => {
        await fireAbsenceTimerCallback(ioRef, tournamentId, matchIdRef, p1Ref, p2Ref, null, false);
      });
      await prisma.tournamentMatch.update({
        where: { id: matchIdRef },
        data: { absenceDeadline: deadline },
      });
      io.to(`tournament:${tournamentId}`).emit('tournament:absence-timer', {
        matchId: matchIdRef, playerId: null, deadline: deadline.toISOString(),
      });
    }
  }

  io?.to(`tournament:${tournamentId}`).emit('tournament:match-updated', {
    matchId: nextMatch.id,
    player1Id: isTopSlot ? winnerId : updated.player1Id,
    player1Username: isTopSlot ? winnerUsername : updated.player1Username,
    player2Id: isTopSlot ? updated.player2Id : winnerId,
    player2Username: isTopSlot ? updated.player2Username : winnerUsername,
    status: (p1 && p2) ? 'ready' : 'pending',
  });

  const allRoundMatches = await prisma.tournamentMatch.findMany({ where: { tournamentId, round: match.round } });
  const roundComplete = allRoundMatches.every(m => m.status === 'completed' || m.status === 'forfeit');
  if (roundComplete) {
    await prisma.tournament.update({ where: { id: tournamentId }, data: { currentRound: nextRound } });
    io?.to(`tournament:${tournamentId}`).emit('tournament:round-complete', { completedRound: match.round, nextRound });
  }
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
      await sendTournamentResults(t.name, podium, t._count.participants, newRoleName);
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
