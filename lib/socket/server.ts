import type { Server as SocketIOServer, Socket } from 'socket.io';
import { decode } from 'next-auth/jwt';
import { GameEngine } from '@/lib/engine/GameEngine';
import type { GameState, GameAction, CharacterCard, MissionCard, PlayerConfig, GameConfig } from '@/lib/engine/types';
import { registerUserSocket, removeSocketFromAll } from '@/lib/socket/io';
import { prisma } from '@/lib/db/prisma';
import { getCharacterById, getMissionById } from '@/lib/data/cardIndex';
import { calculateEloChanges } from '@/lib/elo/elo';
import { syncDiscordRole } from '@/lib/discord/roleSync';
import { sendRankUpNotification } from '@/lib/discord/rankUpWebhook';
import { registerTournamentHandlers, handleTournamentMatchEnd, rehydrateAbsenceTimers, sweepOrphanTournamentMatches } from '@/lib/socket/tournamentHandlers';
import { validatePlayCharacter, validatePlayHidden, validateRevealCharacter, validateUpgradeCharacter } from '@/lib/engine/rules/PlayValidation';
import { calculateEffectiveCost } from '@/lib/engine/rules/ChakraValidation';
import { deepClone } from '@/lib/engine/utils/deepClone';
import { isMaintenanceActive, activateMaintenance, setDrainTimeout, setCheckInterval } from '@/lib/socket/maintenance';

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
  gameMode: 'casual' | 'ranked' | 'sealed';
  createdAt: number;
  hostName?: string;
  guestName?: string;
  
  actionTimer: ReturnType<typeof setTimeout> | null;
  timerDeadline: number | null;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
  
  
  
  disconnectedPlayer: 'player1' | 'player2' | null;
  disconnectDeadline: number | null;
  
  player1DisconnectCount: number;
  player2DisconnectCount: number;
  player1LastDisconnectAt?: number | null;
  player2LastDisconnectAt?: number | null;
  
  replayInitialState: GameState | null;
  replayStateSnapshots: GameState[] | null;
  replaySnapshotLogLengths: number[] | null;
  finalized: boolean;
  pendingEloHistoryIds?: string[];
  mulliganTimer?: ReturnType<typeof setTimeout> | null;
  mulliganDeadline?: number | null;
  tournamentJoinTimer?: ReturnType<typeof setTimeout> | null;
  tournamentJoinDeadline?: number | null;
  
  isSealed: boolean;
  sealedBoosterCount: 4 | 5 | 6;
  sealedTimer: ReturnType<typeof setTimeout> | null;
  sealedDeadline: number | null;
  hostSealedPoolIds?: string[];
  guestSealedPoolIds?: string[];
  tournamentGameTimer?: ReturnType<typeof setTimeout> | null;
  hostDeckId?: string;
  guestDeckId?: string;
  
  timerEnabled: boolean;
  
  rematchOffer?: 'player1' | 'player2';
  
  tournamentId?: string;
  tournamentMatchId?: string;
  
  coinFlipDone: { player1: boolean; player2: boolean };
  
  spectators: Map<string, { socketId: string; userId: string; username: string }>;
  
  hostAllowSpectatorHand: boolean;
  guestAllowSpectatorHand: boolean;
  
  chatMessages: Array<{ id: string; userId: string; username: string; message: string; isEmote: boolean; isSpectator: boolean; timestamp: number }>;
  chatLastCleanup: number;
}

const ACTION_TIMEOUT_MS = 120_000; // 2 minutes per action
const MULLIGAN_TIMEOUT_MS = 60_000; // 1 minute for the mulligan + edge phase
const EFFECT_TIMEOUT_MS = 60_000; // 1 minute per effect resolution
const MAX_CONSECUTIVE_TIMEOUTS = 3; // 3 timeouts = auto-forfeit
const DISCONNECT_GRACE_MS = 90_000; // 1.5 minutes before disconnect = forfeit
const MAX_DISCONNECTS = 4; // anti-troll cap on disconnects that lasted long enough to count
const DISCONNECT_BLIP_THRESHOLD_MS = 15_000; // disconnects shorter than this don't count toward MAX
const DISCONNECT_DECAY_MS = 5 * 60 * 1000; // 5 minutes of stable connection forgives one prior disconnect
const SEALED_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes for sealed deck building

export const rooms = new Map<string, RoomData>();
const playerRooms = new Map<string, string>(); // socketId -> roomCode
const userNames = new Map<string, string>(); // userId -> username (populated on auth:register)
const chatRateLimit = new Map<string, number[]>(); // userId -> recent message timestamps
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

async function getActiveTournamentMatchForUser(userId: string): Promise<{ id: string; roomCode: string | null } | null> {
  return prisma.tournamentMatch.findFirst({
    where: {
      status: { in: ['ready', 'in_progress'] },
      OR: [{ player1Id: userId }, { player2Id: userId }],
      tournament: { status: 'in_progress' },
    },
    select: { id: true, roomCode: true },
  });
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
  
  if (existingRoom.hostSocket === socket.id && !existingRoom.gameState) {
    if (existingRoom.sealedTimer) clearTimeout(existingRoom.sealedTimer);
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


function getPublicRoomList(): Array<{ code: string; hostName: string; gameMode: string; createdAt: number }> {
  const list: Array<{ code: string; hostName: string; gameMode: string; createdAt: number }> = [];
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
    });
  }
  
  for (const code of staleRoomCodes) {
    const room = rooms.get(code);
    if (room?.hostSocket) playerRooms.delete(room.hostSocket);
    rooms.delete(code);
  }
  return list;
}

function broadcastRoomList(io: SocketIOServer): void {
  io.to('lobby').emit('room:list-update', getPublicRoomList());
}

function broadcastActiveGames(io: SocketIOServer): void {
  const activeGames: Array<{
    roomCode: string; player1Name: string; player2Name: string;
    spectatorCount: number; turn: number; isRanked: boolean; isPrivate: boolean;
  }> = [];

  const seenPlayerIds = new Set<string>();
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (!room.gameState || room.gameState.phase === 'gameOver') continue;
    if (room.isPrivate) continue;
    if (now - room.createdAt > 2 * 60 * 60 * 1000) continue;
    if (seenPlayerIds.has(room.hostId) || (room.guestId && seenPlayerIds.has(room.guestId))) continue;
    seenPlayerIds.add(room.hostId);
    if (room.guestId) seenPlayerIds.add(room.guestId);
    activeGames.push({
      roomCode: code,
      player1Name: room.hostName ?? 'Player 1',
      player2Name: room.guestName ?? 'Player 2',
      spectatorCount: room.spectators.size,
      turn: room.gameState.turn,
      isRanked: room.isRanked,
      isPrivate: false,
    });
  }
  io.to('games-watchers').emit('games:list-update', { games: activeGames });
}


function cleanupStaleRooms(): void {
  const now = Date.now();
  let cleaned = 0;
  const PRIVATE_EMPTY_TTL_MS = 30 * 60 * 1000;
  for (const [code, room] of rooms) {
    if (!room.guestId && !room.gameState) {
      const ttl = room.isPrivate ? PRIVATE_EMPTY_TTL_MS : MATCHMAKING_ROOM_TTL_MS;
      if (!room.createdAt || now - room.createdAt > ttl) {
        if (room.hostSocket) playerRooms.delete(room.hostSocket);
        if (room.sealedTimer) clearTimeout(room.sealedTimer);
        rooms.delete(code);
        cleaned++;
        continue;
      }
    }
    
    if (room.gameState?.phase === 'gameOver' && now - room.createdAt > 10 * 60 * 1000) {
      if (room.hostSocket) playerRooms.delete(room.hostSocket);
      if (room.guestSocket) playerRooms.delete(room.guestSocket);
      for (const [, spec] of room.spectators) playerRooms.delete(spec.socketId);
      rooms.delete(code);
      cleaned++;
      continue;
    }
    
    if (now - room.createdAt > 4 * 60 * 60 * 1000) {
      if (room.hostSocket) playerRooms.delete(room.hostSocket);
      if (room.guestSocket) playerRooms.delete(room.guestSocket);
      for (const [, spec] of room.spectators) playerRooms.delete(spec.socketId);
      clearActionTimer(room);
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

function clearActionTimer(room: RoomData): void {
  if (room.actionTimer) {
    clearTimeout(room.actionTimer);
    room.actionTimer = null;
    room.timerDeadline = null;
  }
  if (room.mulliganTimer) {
    clearTimeout(room.mulliganTimer);
    room.mulliganTimer = null;
    room.mulliganDeadline = null;
  }
  if (room.tournamentJoinTimer) {
    clearTimeout(room.tournamentJoinTimer);
    room.tournamentJoinTimer = null;
    room.tournamentJoinDeadline = null;
  }
}


async function finalizeGameEnd(
  room: RoomData,
  code: string,
  io: SocketIOServer,
  winReason: 'score' | 'forfeit' | 'timeout' = 'score',
): Promise<void> {
  if (!room.gameState) return;
  if (room.finalized) {
    console.log(`[Socket] finalizeGameEnd skipped for room ${code}: already finalized`);
    return;
  }
  room.finalized = true;

  clearActionTimer(room);
  if (room.sealedTimer) {
    clearTimeout(room.sealedTimer);
    room.sealedTimer = null;
    room.sealedDeadline = null;
  }
  if (room.tournamentGameTimer) {
    clearTimeout(room.tournamentGameTimer);
    room.tournamentGameTimer = null;
  }
  if (room.disconnectTimer) {
    clearTimeout(room.disconnectTimer);
    room.disconnectTimer = null;
  }
  room.disconnectedPlayer = null;
  room.disconnectDeadline = null;

  const winner = GameEngine.getWinner(room.gameState);
  if (!winner) {
    console.error(`[Socket] finalizeGameEnd called but no winner! phase=${room.gameState.phase} turn=${room.gameState.turn} pendingEffects=${room.gameState.pendingEffects.length} pendingActions=${room.gameState.pendingActions.length} p1Score=${room.gameState.player1.missionPoints} p2Score=${room.gameState.player2.missionPoints}`);
    return;
  }

  const p1Score = room.gameState.player1.missionPoints;
  const p2Score = room.gameState.player2.missionPoints;

  let eloData: { player1Delta: number; player2Delta: number; player1NewElo: number; player2NewElo: number; player1TotalGames: number; player2TotalGames: number } | null = null;

  import('@/lib/db/gameCleanup')
    .then(({ cleanupOldGames }) => cleanupOldGames())
    .catch(() => {});

  
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
        const delta = survivorWon ? 10 : -25;
        const newElo = Math.max(100, survivor.elo + delta);
        const stats = survivorWon ? { wins: { increment: 1 } } : { losses: { increment: 1 } };
        const updated = await prisma.user.update({
          where: { id: survivor.id },
          data: {
            elo: newElo, ...stats,
            consecutiveWins: survivorWon ? (survivor.consecutiveWins ?? 0) + 1 : 0,
            consecutiveLosses: survivorWon ? 0 : (survivor.consecutiveLosses ?? 0) + 1,
          },
        });
        eloData = {
          player1Delta: survivorIsP1 ? (newElo - survivor.elo) : 0,
          player2Delta: survivorIsP1 ? 0 : (newElo - survivor.elo),
          player1NewElo: survivorIsP1 ? updated.elo : 0,
          player2NewElo: survivorIsP1 ? 0 : updated.elo,
          player1TotalGames: survivorIsP1 ? updated.wins + updated.losses + updated.draws : 0,
          player2TotalGames: survivorIsP1 ? 0 : updated.wins + updated.losses + updated.draws,
        };
        prisma.eloHistory.create({
          data: {
            userId: survivor.id,
            opponentId: survivorIsP1 ? room.guestId! : room.hostId,
            opponentUsername: 'deleted_user',
            opponentElo: 0,
            oldElo: survivor.elo,
            newElo: updated.elo,
            delta: newElo - survivor.elo,
            result,
            myScore: survivorIsP1 ? p1Score : p2Score,
            opponentScore: survivorIsP1 ? p2Score : p1Score,
            isRanked: true,
          },
        }).catch((err) => {
          console.warn('[Socket] EloHistory write failed (one-side):', err instanceof Error ? err.message : err);
        });
        syncDiscordRole(survivor.id).catch(() => {});
        const oldTotal = survivor.wins + survivor.losses + survivor.draws;
        sendRankUpNotification(survivor.username, survivor.discordId, survivor.elo, updated.elo, oldTotal, oldTotal + 1).catch(() => {});
      } else if (player1 && player2) {
        const changes = calculateEloChanges({
          player1Elo: player1.elo,
          player2Elo: player2.elo,
          winner: winner === 'player1' ? 'player1' : 'player2',
          player1Score: p1Score,
          player2Score: p2Score,
          player1ConsecWins: player1.consecutiveWins ?? 0,
          player1ConsecLosses: player1.consecutiveLosses ?? 0,
          player2ConsecWins: player2.consecutiveWins ?? 0,
          player2ConsecLosses: player2.consecutiveLosses ?? 0,
        });

        const p1Stats = winner === 'player1' ? { wins: { increment: 1 } } : { losses: { increment: 1 } };
        const p2Stats = winner === 'player2' ? { wins: { increment: 1 } } : { losses: { increment: 1 } };

        const [updatedP1, updatedP2] = await Promise.all([
          prisma.user.update({
            where: { id: room.hostId },
            data: {
              elo: changes.player1NewElo, ...p1Stats,
              consecutiveWins: changes.player1NewConsecWins,
              consecutiveLosses: changes.player1NewConsecLosses,
            },
          }),
          prisma.user.update({
            where: { id: room.guestId! },
            data: {
              elo: changes.player2NewElo, ...p2Stats,
              consecutiveWins: changes.player2NewConsecWins,
              consecutiveLosses: changes.player2NewConsecLosses,
            },
          }),
        ]);

        eloData = {
          player1Delta: changes.player1Delta,
          player2Delta: changes.player2Delta,
          player1NewElo: updatedP1.elo,
          player2NewElo: updatedP2.elo,
          player1TotalGames: updatedP1.wins + updatedP1.losses + updatedP1.draws,
          player2TotalGames: updatedP2.wins + updatedP2.losses + updatedP2.draws,
        };

        
        
        
        const p1Result: 'win' | 'loss' = winner === 'player1' ? 'win' : 'loss';
        const p2Result: 'win' | 'loss' = winner === 'player2' ? 'win' : 'loss';
        const [e1, e2] = await Promise.all([
          prisma.eloHistory.create({
            data: {
              userId: room.hostId!,
              opponentId: room.guestId!,
              opponentUsername: player2.username,
              opponentElo: player2.elo,
              oldElo: player1.elo,
              newElo: changes.player1NewElo,
              delta: changes.player1Delta,
              result: p1Result,
              myScore: p1Score,
              opponentScore: p2Score,
              isRanked: true,
            },
          }).catch((err) => { console.warn('[Socket] EloHistory write 1 failed:', err instanceof Error ? err.message : err); return null; }),
          prisma.eloHistory.create({
            data: {
              userId: room.guestId!,
              opponentId: room.hostId!,
              opponentUsername: player1.username,
              opponentElo: player1.elo,
              oldElo: player2.elo,
              newElo: changes.player2NewElo,
              delta: changes.player2Delta,
              result: p2Result,
              myScore: p2Score,
              opponentScore: p1Score,
              isRanked: true,
            },
          }).catch((err) => { console.warn('[Socket] EloHistory write 2 failed:', err instanceof Error ? err.message : err); return null; }),
        ]);
        room.pendingEloHistoryIds = [e1?.id, e2?.id].filter((x): x is string => !!x);

        
        syncDiscordRole(room.hostId).catch(() => {});
        syncDiscordRole(room.guestId!).catch(() => {});

        
        const p1OldTotal = player1.wins + player1.losses + player1.draws;
        const p2OldTotal = player2.wins + player2.losses + player2.draws;
        sendRankUpNotification(player1.username, player1.discordId, player1.elo, changes.player1NewElo, p1OldTotal, p1OldTotal + 1).catch(() => {});
        sendRankUpNotification(player2.username, player2.discordId, player2.elo, changes.player2NewElo, p2OldTotal, p2OldTotal + 1).catch(() => {});
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
          const retryChanges = calculateEloChanges({
            player1Elo: p1Retry.elo, player2Elo: p2Retry.elo,
            winner: winner === 'player1' ? 'player1' : 'player2',
            player1Score: p1Score, player2Score: p2Score,
            player1ConsecWins: p1Retry.consecutiveWins ?? 0, player1ConsecLosses: p1Retry.consecutiveLosses ?? 0,
            player2ConsecWins: p2Retry.consecutiveWins ?? 0, player2ConsecLosses: p2Retry.consecutiveLosses ?? 0,
          });
          const p1S = winner === 'player1' ? { wins: { increment: 1 } } : { losses: { increment: 1 } };
          const p2S = winner === 'player2' ? { wins: { increment: 1 } } : { losses: { increment: 1 } };
          const [uP1, uP2] = await Promise.all([
            prisma.user.update({ where: { id: room.hostId! }, data: { elo: retryChanges.player1NewElo, ...p1S, consecutiveWins: retryChanges.player1NewConsecWins, consecutiveLosses: retryChanges.player1NewConsecLosses } }),
            prisma.user.update({ where: { id: room.guestId! }, data: { elo: retryChanges.player2NewElo, ...p2S, consecutiveWins: retryChanges.player2NewConsecWins, consecutiveLosses: retryChanges.player2NewConsecLosses } }),
          ]);
          eloData = { player1Delta: retryChanges.player1Delta, player2Delta: retryChanges.player2Delta, player1NewElo: uP1.elo, player2NewElo: uP2.elo, player1TotalGames: uP1.wins + uP1.losses + uP1.draws, player2TotalGames: uP2.wins + uP2.losses + uP2.draws };
          console.log(`[Socket] ELO retry (${label}) succeeded`);
          prisma.eloHistory.create({
            data: {
              userId: room.hostId!, opponentId: room.guestId!, opponentUsername: p2Retry.username, opponentElo: p2Retry.elo,
              oldElo: p1Retry.elo, newElo: retryChanges.player1NewElo, delta: retryChanges.player1Delta,
              result: winner === 'player1' ? 'win' : 'loss', myScore: p1Score, opponentScore: p2Score, isRanked: true,
            },
          }).catch((e) => console.warn(`[Socket] EloHistory write 1 (${label}) failed:`, e instanceof Error ? e.message : e));
          prisma.eloHistory.create({
            data: {
              userId: room.guestId!, opponentId: room.hostId!, opponentUsername: p1Retry.username, opponentElo: p1Retry.elo,
              oldElo: p2Retry.elo, newElo: retryChanges.player2NewElo, delta: retryChanges.player2Delta,
              result: winner === 'player2' ? 'win' : 'loss', myScore: p2Score, opponentScore: p1Score, isRanked: true,
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

  if (room.hostSocket) {
    io.to(room.hostSocket).emit('game:ended', {
      winner,
      player1Score: p1Score,
      player2Score: p2Score,
      isRanked: room.isRanked,
      eloDelta: eloData?.player1Delta ?? null,
      newElo: eloData?.player1NewElo,
      totalGames: eloData?.player1TotalGames,
      winReason,
      gameId: null,
      replayData,
      tournamentId: room.tournamentId ?? null,
    });
  }
  if (room.guestSocket) {
    io.to(room.guestSocket).emit('game:ended', {
      winner,
      player1Score: p1Score,
      player2Score: p2Score,
      isRanked: room.isRanked,
      eloDelta: eloData?.player2Delta ?? null,
      newElo: eloData?.player2NewElo,
      totalGames: eloData?.player2TotalGames,
      winReason,
      gameId: null,
      replayData,
      tournamentId: room.tournamentId ?? null,
    });
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
        const trimmed = { ...replayForDb, stateSnapshots: null, snapshotLogLengths: null };
        const buf = compressReplay(trimmed);
        if (buf.length > 12_000_000) throw new Error(`compressed size ${(buf.length / 1_000_000).toFixed(1)}MB`);
        return buf;
      });
      tryStates.push(() => {
        const trimmed = { ...replayForDb, stateSnapshots: null, snapshotLogLengths: null, actionHistory: [], log: replayForDb.log.slice(-200) };
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
      const tournamentWinnerId = winner === 'player1' ? room.hostId : room.guestId!;
      handleTournamentMatchEnd(io, room.tournamentId, room.tournamentMatchId, tournamentWinnerId, recordId).catch(err => {
        console.error('[Socket] Tournament match end error:', err);
      });
    }
  })();
}


function startMulliganTimer(
  room: RoomData,
  code: string,
  io: SocketIOServer,
): void {
  if (room.mulliganTimer) {
    clearTimeout(room.mulliganTimer);
    room.mulliganTimer = null;
  }
  if (!room.gameState || room.gameState.phase !== 'mulligan') return;
  const deadline = Date.now() + MULLIGAN_TIMEOUT_MS;
  room.mulliganDeadline = deadline;
  if (room.hostSocket) io.to(room.hostSocket).emit('game:mulligan-deadline', { deadline, durationMs: MULLIGAN_TIMEOUT_MS });
  if (room.guestSocket) io.to(room.guestSocket).emit('game:mulligan-deadline', { deadline, durationMs: MULLIGAN_TIMEOUT_MS });
  room.mulliganTimer = setTimeout(async () => {
    if (!rooms.has(code)) return;
    if (!room.gameState || room.gameState.phase !== 'mulligan') return;
    const p1Done = room.gameState.player1.hasMulliganed;
    const p2Done = room.gameState.player2.hasMulliganed;
    console.log(`[Socket] Mulligan timeout in room ${code} | p1Done=${p1Done} p2Done=${p2Done}`);
    if (!p1Done && !p2Done) {
      try { room.gameState = GameEngine.applyAction(room.gameState, 'player1', { type: 'MULLIGAN', doMulligan: false }); } catch { /* ignore */ }
      try { room.gameState = GameEngine.applyAction(room.gameState, 'player2', { type: 'MULLIGAN', doMulligan: false }); } catch { /* ignore */ }
      broadcastState(room, io);
      if (room.gameState.phase === 'action') startActionTimer(room, code, io);
      return;
    }
    const absent: 'player1' | 'player2' | null = !p1Done ? 'player1' : !p2Done ? 'player2' : null;
    if (!absent) return;
    console.log(`[Socket] Auto-forfeit ${absent} in room ${code} (mulligan timeout)`);
    room.gameState = GameEngine.applyAction(room.gameState, absent, { type: 'FORFEIT', reason: 'timeout' });
    broadcastState(room, io);
    await finalizeGameEnd(room, code, io, 'timeout');
  }, MULLIGAN_TIMEOUT_MS);
}

function clearMulliganTimer(room: RoomData): void {
  if (room.mulliganTimer) {
    clearTimeout(room.mulliganTimer);
    room.mulliganTimer = null;
  }
  room.mulliganDeadline = null;
}

function startActionTimer(
  room: RoomData,
  code: string,
  io: SocketIOServer,
): void {
  clearActionTimer(room);
  clearMulliganTimer(room);

  if (!room.gameState) return;

  if (room.gameState.phase !== 'action') return;

  if (!room.timerEnabled) return;

  const activePlayer = room.gameState.activePlayer;
  const targetSocket = activePlayer === 'player1' ? room.hostSocket : room.guestSocket;

  const deadline = Date.now() + ACTION_TIMEOUT_MS;
  room.timerDeadline = deadline;

  
  if (targetSocket) {
    io.to(targetSocket).emit('game:action-deadline', { deadline, durationMs: ACTION_TIMEOUT_MS });
  }

  room.actionTimer = setTimeout(async () => {
    if (!rooms.has(code)) return; // Room was deleted (disconnect/cleanup)
    if (!room.gameState || room.gameState.phase !== 'action') return;

    const player = room.gameState.activePlayer;
    const timeouts = room.gameState.consecutiveTimeouts[player] + 1;
    room.gameState.consecutiveTimeouts[player] = timeouts;

    console.log(`[Socket] Timer expired for ${player} in room ${code} (timeout #${timeouts})`);

    if (timeouts >= MAX_CONSECUTIVE_TIMEOUTS) {
      
      console.log(`[Socket] Auto-forfeit for ${player} after ${timeouts} consecutive timeouts`);
      room.gameState = GameEngine.applyAction(room.gameState, player, { type: 'FORFEIT', reason: 'timeout' });

      
      broadcastState(room, io);
      await finalizeGameEnd(room, code, io, 'timeout');
    } else {
      
      if (room.gameState.pendingActions.length > 0) {
        const pendingForPlayer = room.gameState.pendingActions.filter(p => p.player === player);
        if (pendingForPlayer.length > 0) {
          const pa = pendingForPlayer[0];
          
          const pe = room.gameState.pendingEffects.find(e => e.id === pa.sourceEffectId);
          if (pe && (pe.isOptional || !pe.isMandatory)) {
            console.log(`[Socket] Timer: auto-declining optional effect for ${player}`);
            room.gameState = GameEngine.applyAction(room.gameState, player, { type: 'DECLINE_OPTIONAL_EFFECT', pendingEffectId: pe.id });
          } else if (pa.options.length > 0) {
            console.log(`[Socket] Timer: auto-selecting first target for ${player}`);
            room.gameState = GameEngine.applyAction(room.gameState, player, { type: 'SELECT_TARGET', pendingActionId: pa.id, selectedTargets: [pa.options[0]] });
          }
        }
      }
      
      const stateBeforePass = room.gameState;
      console.log(`[Socket] Auto-pass for ${player} in room ${code}`);
      room.gameState = GameEngine.applyAction(room.gameState, player, { type: 'PASS' });

      
      if (targetSocket) {
        io.to(targetSocket).emit('game:auto-passed');
      }

      
      broadcastState(room, io);

      
      const winner = GameEngine.getWinner(room.gameState);
      if (winner) {
        await finalizeGameEnd(room, code, io, 'score');
      } else if (room.gameState.missionScoringComplete) {
        
        setTimeout(async () => {
          if (!rooms.has(code)) return; // Room was deleted
          if (!room.gameState || !room.gameState.missionScoringComplete) return;
          room.gameState = GameEngine.applyAction(room.gameState, 'player1', { type: 'ADVANCE_PHASE' });
          broadcastState(room, io);
          const winnerAfterEnd = GameEngine.getWinner(room.gameState);
          if (winnerAfterEnd) {
            await finalizeGameEnd(room, code, io, 'score');
          } else if (room.gameState.phase === 'action') {
            startActionTimer(room, code, io);
          } else if (room.gameState.phase === 'end' && room.gameState.pendingActions.length > 0) {
            startEffectTimer(room, code, io);
          }
        }, 1500);
      } else if (room.gameState.phase === 'action') {
        
        startActionTimer(room, code, io);
      }
    }
  }, ACTION_TIMEOUT_MS);
}


function startForcedResolverTimer(
  room: RoomData,
  code: string,
  io: SocketIOServer,
): void {
  clearActionTimer(room);

  if (!room.gameState) return;
  const forcedPlayer = room.gameState.pendingForcedResolver;
  if (!forcedPlayer) return;

  const forcedSocket = forcedPlayer === 'player1' ? room.hostSocket : room.guestSocket;
  const activeSocket = forcedPlayer === 'player1' ? room.guestSocket : room.hostSocket;

  
  if (activeSocket) {
    io.to(activeSocket).emit('game:action-deadline-pause');
  }

  
  const deadline = Date.now() + ACTION_TIMEOUT_MS;
  room.timerDeadline = deadline;
  if (forcedSocket) {
    io.to(forcedSocket).emit('game:action-deadline', { deadline });
  }

  room.actionTimer = setTimeout(async () => {
    if (!rooms.has(code)) return; // Room was deleted
    if (!room.gameState || !room.gameState.pendingForcedResolver) return;

    const resolver = room.gameState.pendingForcedResolver;
    console.log(`[Socket] Forced resolver timer expired for ${resolver} in room ${code}`);

    
    const pendingEffect = room.gameState.pendingEffects.find(
      (e: { selectingPlayer?: string; sourcePlayer: string; isOptional?: boolean }) =>
        (e.selectingPlayer === resolver || e.sourcePlayer === resolver),
    );
    if (pendingEffect) {
      room.gameState = GameEngine.applyAction(room.gameState, resolver, {
        type: 'DECLINE_OPTIONAL_EFFECT',
        pendingEffectId: pendingEffect.id,
      });
    } else {
      
      const pendingAction = room.gameState.pendingActions.find(
        (a: { player: string }) => a.player === resolver,
      );
      if (pendingAction) {
        room.gameState = GameEngine.applyAction(room.gameState, resolver, {
          type: 'SELECT_TARGET',
          pendingActionId: pendingAction.id,
          selectedTargets: [],
        });
      }
    }

    
    if (forcedSocket) {
      io.to(forcedSocket).emit('game:auto-declined');
    }

    
    broadcastState(room, io);

    
    const winner = GameEngine.getWinner(room.gameState);
    if (winner) {
      await finalizeGameEnd(room, code, io, 'score');
    } else if (room.gameState.phase === 'action') {
      
      startActionTimer(room, code, io);
    }
  }, ACTION_TIMEOUT_MS);
}


function startEffectTimer(
  room: RoomData,
  code: string,
  io: SocketIOServer,
): void {
  clearActionTimer(room);

  if (!room.gameState) return;
  if (!room.timerEnabled) return;

  
  const pendingAction = room.gameState.pendingActions[0];
  if (!pendingAction) return;

  const resolverPlayer = pendingAction.player;
  const resolverSocket = resolverPlayer === 'player1' ? room.hostSocket : room.guestSocket;

  const deadline = Date.now() + EFFECT_TIMEOUT_MS;
  room.timerDeadline = deadline;

  if (resolverSocket) {
    io.to(resolverSocket).emit('game:action-deadline', { deadline, durationMs: EFFECT_TIMEOUT_MS });
  }

  
  const otherSocket = resolverPlayer === 'player1' ? room.guestSocket : room.hostSocket;
  if (otherSocket) {
    io.to(otherSocket).emit('game:action-deadline-pause');
  }

  room.actionTimer = setTimeout(async () => {
    if (!rooms.has(code)) return;
    if (!room.gameState) return;

    const pendingEffect = room.gameState.pendingEffects.find(
      (e: { selectingPlayer?: string; sourcePlayer: string }) =>
        e.selectingPlayer === resolverPlayer || e.sourcePlayer === resolverPlayer,
    );
    const currentPendingAction = room.gameState.pendingActions.find(
      (a: { player: string }) => a.player === resolverPlayer,
    );

    if (!pendingEffect && !currentPendingAction) return;

    console.log(`[Socket] Effect timer expired for ${resolverPlayer} in room ${code}`);

    const isOptional = pendingEffect?.isOptional ?? true;

    if (isOptional && pendingEffect) {
      
      console.log(`[Socket] Auto-declining optional effect for ${resolverPlayer}`);
      room.gameState = GameEngine.applyAction(room.gameState, resolverPlayer, {
        type: 'DECLINE_OPTIONAL_EFFECT',
        pendingEffectId: pendingEffect.id,
      });
    } else if (pendingEffect && currentPendingAction) {
      
      const validTargets = pendingEffect.validTargets ?? currentPendingAction.options ?? [];
      if (validTargets.length > 0) {
        const randomTarget = validTargets[Math.floor(Math.random() * validTargets.length)];
        console.log(`[Socket] Auto-selecting random target "${randomTarget}" for mandatory effect (${resolverPlayer})`);
        room.gameState = GameEngine.applyAction(room.gameState, resolverPlayer, {
          type: 'SELECT_TARGET',
          pendingActionId: currentPendingAction.id,
          selectedTargets: [randomTarget],
        });
      }
    }

    if (resolverSocket) {
      io.to(resolverSocket).emit('game:auto-declined');
    }

    broadcastState(room, io);

    const winner = GameEngine.getWinner(room.gameState);
    if (winner) {
      await finalizeGameEnd(room, code, io, 'score');
    } else if (room.gameState.phase === 'action') {
      
      if (room.gameState.pendingEffects.length > 0 || room.gameState.pendingActions.length > 0) {
        startEffectTimer(room, code, io);
      } else {
        startActionTimer(room, code, io);
      }
    }
  }, EFFECT_TIMEOUT_MS);
}

const MISSION_PHASE_TIMEOUT_MS = 60_000; // 1 minute for mission phase choices


function startMissionPhaseTimer(
  room: RoomData,
  code: string,
  io: SocketIOServer,
): void {
  clearActionTimer(room);

  if (!room.gameState) return;
  if (!room.timerEnabled) return;
  if (!room.isRanked && !room.tournamentId) return; // Active in ranked AND tournament rooms

  const pendingAction = room.gameState.pendingActions[0];
  if (!pendingAction) return;

  const resolverPlayer = pendingAction.player;
  const resolverSocket = resolverPlayer === 'player1' ? room.hostSocket : room.guestSocket;

  const deadline = Date.now() + MISSION_PHASE_TIMEOUT_MS;
  room.timerDeadline = deadline;

  if (resolverSocket) {
    io.to(resolverSocket).emit('game:action-deadline', { deadline, durationMs: MISSION_PHASE_TIMEOUT_MS });
  }

  room.actionTimer = setTimeout(async () => {
    if (!rooms.has(code)) return;
    if (!room.gameState) return;

    console.log(`[Socket] Mission phase timer expired for ${resolverPlayer} in room ${code}, auto-forfeit`);
    room.gameState = GameEngine.applyAction(room.gameState, resolverPlayer, { type: 'FORFEIT', reason: 'timeout' });
    broadcastState(room, io);
    await finalizeGameEnd(room, code, io, 'timeout');
  }, MISSION_PHASE_TIMEOUT_MS);
}


function broadcastState(room: RoomData, io: SocketIOServer): void {
  if (!room.gameState) return;

  const playerNames = {
    player1: room.hostName ?? 'Player 1',
    player2: room.guestName ?? 'Player 2',
  };
  try {
    const p1State = GameEngine.getVisibleState(room.gameState, 'player1');
    const p2State = GameEngine.getVisibleState(room.gameState, 'player2');

    if (room.hostSocket) {
      io.to(room.hostSocket).emit('game:state-update', {
        visibleState: p1State,
        playerRole: 'player1',
        playerNames,
      });
    }
    if (room.guestSocket) {
      io.to(room.guestSocket).emit('game:state-update', {
        visibleState: p2State,
        playerRole: 'player2',
        playerNames,
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
        visibleState: spectatorState,
        playerNames,
        spectatorCount: room.spectators.size,
        roomCode: room.code,
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

export function setupSocketHandlers(io: SocketIOServer) {
  ioInstance = io;

  
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


  setInterval(() => cleanupStaleRooms(), 60_000);

  
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
        where: { status: 'registration', scheduledStartAt: { not: null, lte: now } },
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
        } catch (err) {
          console.error(`[Tournament] Auto-start error for ${t.id}:`, err);
        }
      }
    } catch (err) {
      console.error('[Tournament] Scheduled check error:', err);
    }
  }, 30_000);

  io.on('connection', (socket: Socket) => {
    console.log(`Player connected: ${socket.id}`);
    
    registerTournamentHandlers(io, socket);

    
    socket.on('auth:register', async (data: { userId: string; username?: string }) => {
      if (!data.userId) return;

      try {
        const cookieHeader = socket.handshake.headers.cookie ?? '';
        const cookies = Object.fromEntries(
          cookieHeader.split(';').map(c => c.trim().split('=')).filter(p => p.length === 2).map(([k, v]) => [k, decodeURIComponent(v)]),
        );
        const tokenStr = cookies['__Secure-authjs.session-token'] || cookies['authjs.session-token'];
        if (tokenStr) {
          const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
          if (secret) {
            const decoded = await decode({ token: tokenStr, secret, salt: cookies['__Secure-authjs.session-token'] ? '__Secure-authjs.session-token' : 'authjs.session-token' });
            const trustedId = decoded?.id as string | undefined;
            if (trustedId && trustedId !== data.userId) {
              console.warn(`[Socket] auth:register rejected: claim=${data.userId} but session=${trustedId}`);
              socket.emit('game:error', { message: 'Authentication mismatch', errorKey: 'game.error.authMismatch' });
              return;
            }
          }
        }
      } catch (err) {
        console.warn('[Socket] auth:register session decode failed (allowing anyway):', err instanceof Error ? err.message : err);
      }

      registerUserSocket(data.userId, socket.id);
      (socket.data as { userId?: string }).userId = data.userId;
      if (data.username && typeof data.username === 'string' && data.username.length <= 50) {
        userNames.set(data.userId, data.username);
      }

      for (const [code, room] of rooms) {
        if (!room.gameState || room.gameState.phase === 'gameOver') continue;
        const isHost = room.hostId === data.userId;
        const isGuest = room.guestId === data.userId;
        if (isHost || isGuest) {
          socket.emit('game:active-game', {
            roomCode: code,
            playerRole: isHost ? 'player1' : 'player2',
          });
          break;
        }
      }
    });

    
    socket.on('game:rejoin', async (data: { roomCode: string; userId: string }) => {
      const { roomCode, userId } = data;
      if (!roomCode || !userId) return;

      const room = rooms.get(roomCode);
      if (!room) {
        console.log(`[Socket] game:rejoin: room ${roomCode} not found`);
        return;
      }

      const authedUserId = (socket.data as { userId?: string }).userId;
      if (!authedUserId || authedUserId !== userId) {
        console.warn(`[Socket] game:rejoin rejected: socket auth mismatch (claim=${userId}, auth=${authedUserId ?? 'null'})`);
        return;
      }

      const isHost = room.hostId === userId;
      const isGuest = room.guestId === userId;
      if (!isHost && !isGuest) {
        console.log(`[Socket] game:rejoin: user ${userId} is not in room ${roomCode}`);
        return;
      }

      const player = isHost ? 'player1' : 'player2';
      const oldSocketId = isHost ? room.hostSocket : room.guestSocket;

      console.log(`[Socket] game:rejoin: ${player} reconnecting in room ${roomCode}, old socket: ${oldSocketId}, new socket: ${socket.id}`);

      
      if (isHost) {
        room.hostSocket = socket.id;
      } else {
        room.guestSocket = socket.id;
      }


      if (oldSocketId && oldSocketId !== socket.id) {
        playerRooms.delete(oldSocketId);
        const oldSock = io.sockets.sockets.get(oldSocketId);
        if (oldSock) {
          oldSock.leave(roomCode);
          oldSock.leave(`spec:${roomCode}`);
        }
      }
      playerRooms.set(socket.id, roomCode);

      socket.join(roomCode);

      
      
      
      
      
      
      
      
      
      
      
      let rehydrateOpponentDisconnect: { deadline: number; durationMs: number } | null = null;
      if (room.disconnectedPlayer === player && room.disconnectTimer) {
        clearTimeout(room.disconnectTimer);
        room.disconnectTimer = null;
        room.disconnectedPlayer = null;
        room.disconnectDeadline = null;

        const lastDcAt = player === 'player1' ? room.player1LastDisconnectAt : room.player2LastDisconnectAt;
        if (lastDcAt) {
          const downMs = Date.now() - lastDcAt;
          if (downMs > DISCONNECT_BLIP_THRESHOLD_MS) {
            if (player === 'player1') room.player1DisconnectCount++;
            else room.player2DisconnectCount++;
            console.log(`[Socket] ${player} reconnected after ${Math.round(downMs/1000)}s — counted (now ${player === 'player1' ? room.player1DisconnectCount : room.player2DisconnectCount}/${MAX_DISCONNECTS + 1})`);
          } else {
            console.log(`[Socket] ${player} reconnected after ${Math.round(downMs/1000)}s — blip, not counted`);
          }
        }
        if (player === 'player1') room.player1LastDisconnectAt = null;
        else room.player2LastDisconnectAt = null;

        const opponentSock = isHost ? room.guestSocket : room.hostSocket;
        if (opponentSock) {
          io.to(opponentSock).emit('game:opponent-reconnected');
        }
      } else if (room.disconnectedPlayer && room.disconnectDeadline) {
        const remaining = Math.max(0, room.disconnectDeadline - Date.now());
        console.log(`[Socket] ${player} rejoined but opponent ${room.disconnectedPlayer} still down (${Math.round(remaining / 1000)}s left)`);
        rehydrateOpponentDisconnect = { deadline: room.disconnectDeadline, durationMs: remaining };
      } else if (room.disconnectTimer && !room.gameState) {
        clearTimeout(room.disconnectTimer);
        room.disconnectTimer = null;
        console.log(`[Socket] Cancelled sealed pre-game cleanup timer for ${player} in room ${roomCode}`);
      }

      
      registerUserSocket(userId, socket.id);

      
      if (room.gameState) {
        const playerNames = { player1: room.hostName ?? 'Player 1', player2: room.guestName ?? 'Player 2' };
        const visibleState = GameEngine.getVisibleState(room.gameState, player);
        
        socket.emit('game:started');
        socket.emit('game:state-update', { visibleState, playerRole: player, playerNames });

        
        if (room.gameState.phase === 'action' && !room.actionTimer) {
          startActionTimer(room, roomCode, io);
        }

        
        
        if (rehydrateOpponentDisconnect) {
          socket.emit('game:opponent-disconnected', rehydrateOpponentDisconnect);
        }
      } else {
        
        console.log(`[Socket] game:rejoin: ${player} rejoined room ${roomCode} during pre-game phase`);
        socket.emit('room:rejoined', {
          code: roomCode,
          isSealed: room.isSealed,
          playerRole: player === 'player1' ? 'player1' : 'player2',
        });

        
        
        
        if (room.hostDeck && room.guestDeck && !room.gameState) {
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
          };

          room.gameState = GameEngine.createGame(config);
          room.replayInitialState = deepClone(room.gameState);
          room.replayInitialState.actionHistory = [];
          room.replayStateSnapshots = [];
          room.replaySnapshotLogLengths = [];


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

          const p1State = GameEngine.getVisibleState(room.gameState, 'player1');
          const p2State = GameEngine.getVisibleState(room.gameState, 'player2');

          if (room.hostSocket) {
            io.to(room.hostSocket).emit('game:state-update', {
              visibleState: p1State,
              playerRole: 'player1',
              playerNames: { player1: hostName, player2: guestName },
            });
          }
          if (room.guestSocket) {
            io.to(room.guestSocket).emit('game:state-update', {
              visibleState: p2State,
              playerRole: 'player2',
              playerNames: { player1: hostName, player2: guestName },
            });
          }
        }
      }
    });

    
    socket.on('room:create', async (data: { userId: string; isPrivate?: boolean; isRanked?: boolean; isSealed?: boolean; gameMode?: 'casual' | 'ranked' | 'sealed'; hostName?: string; sealedBoosterCount?: 4 | 5 | 6; timerEnabled?: boolean; isAnonymous?: boolean }) => {
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

      const VALID_MODES = ['casual', 'ranked', 'sealed'] as const;
      const requestedMode = data.gameMode ?? (data.isSealed ? 'sealed' : data.isRanked ? 'ranked' : 'casual');
      const gameMode = (VALID_MODES as readonly string[]).includes(requestedMode) ? requestedMode : 'casual';
      const safeBoosterCount = data.sealedBoosterCount === 4 || data.sealedBoosterCount === 5 || data.sealedBoosterCount === 6 ? data.sealedBoosterCount : 6;
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
        isRanked: gameMode === 'ranked',
        isAnonymous: data.isAnonymous ?? false,
        gameMode,
        createdAt: Date.now(),
        hostName: safeHostName,
        actionTimer: null,
        timerDeadline: null,
        disconnectTimer: null,
        disconnectedPlayer: null,
        disconnectDeadline: null,
        player1DisconnectCount: 0,
        player2DisconnectCount: 0,
        replayInitialState: null,
        replayStateSnapshots: null,
        replaySnapshotLogLengths: null,
        finalized: false,
        isSealed: gameMode === 'sealed',
        sealedBoosterCount: safeBoosterCount,
        sealedTimer: null,
        sealedDeadline: null,
        timerEnabled: gameMode === 'ranked' || (data.timerEnabled ?? false),
        coinFlipDone: { player1: false, player2: false },
        spectators: new Map(),
        hostAllowSpectatorHand: false,
        guestAllowSpectatorHand: false,
        chatMessages: [],
        chatLastCleanup: 0,
      };

      
      try {
        const hostUser = await prisma.user.findUnique({ where: { id: data.userId }, select: { allowSpectatorHand: true } });
        room.hostAllowSpectatorHand = hostUser?.allowSpectatorHand ?? false;
      } catch { /* default false */ }

      rooms.set(code, room);
      playerRooms.set(socket.id, code);
      socket.join(code);

      console.log(`[Socket] Room ${code} created by ${data.userId} (mode: ${gameMode})`);
      socket.emit('room:created', { code, isSealed: room.isSealed });

      
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

      if (await isUserGameBanned(data.userId)) {
        socket.emit('room:error', { message: 'You are banned from playing online games', errorKey: 'game.error.gameBanned' });
        return;
      }

      const tournamentBusy = await getActiveTournamentMatchForUser(data.userId);
      if (tournamentBusy && tournamentBusy.roomCode !== data.code) {
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
          room.hostSocket = socket.id;
          playerRooms.set(socket.id, data.code);
          socket.join(data.code);
          socket.emit('room:joined', {
            code: data.code,
            playerRole: 'player1',
            hostId: room.hostId,
            guestId: room.guestId,
            gameMode: room.gameMode,
            isRanked: room.isRanked,
            tournamentId: room.tournamentId,
          });
          
          if (room.gameState) {
            const visible = GameEngine.getVisibleState(room.gameState, 'player1');
            const playerNames = { player1: room.hostName ?? 'Player 1', player2: room.guestName ?? 'Player 2' };
            socket.emit('game:state-update', { visibleState: visible, playerRole: 'player1', playerNames });
            socket.emit('game:started');
          } else if (room.hostDeck && room.guestDeck && room.guestSocket) {
            
            io.to(data.code).emit('room:player-joined', { hostId: room.hostId, guestId: room.guestId });
          }
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
      }

      room.guestId = data.userId;
      room.guestSocket = socket.id;
      room.guestName = room.guestName || userNames.get(data.userId) || undefined;
      playerRooms.set(socket.id, data.code);
      socket.join(data.code);

      try {
        const guestUser = await prisma.user.findUnique({
          where: { id: data.userId },
          select: { username: true, allowSpectatorHand: true },
        });
        if (!room.guestName && guestUser?.username) room.guestName = guestUser.username;
        room.guestAllowSpectatorHand = guestUser?.allowSpectatorHand ?? false;
      } catch { /* default false */ }

      console.log(`[Socket] User ${data.userId} joined room ${data.code}`);
      io.to(data.code).emit('room:player-joined', {
        hostId: room.hostId,
        guestId: room.guestId,
        isSealed: room.isSealed,
      });

      
      if (!room.isPrivate) {
        broadcastRoomList(io);
      }

      
      if (room.tournamentId && room.hostDeck && room.guestDeck && room.hostSocket && room.guestSocket && !room.gameState) {
        
        
        
        const fakeSelectEvent = async () => {
          
          const hostName = room.hostName ?? userNames.get(room.hostId) ?? 'Player 1';
          const guestName = room.guestName ?? (room.guestId ? userNames.get(room.guestId) : null) ?? 'Player 2';
          room.hostName = hostName;
          room.guestName = guestName;
          try {
            const config: GameConfig = {
              player1: { userId: room.hostId, isAI: false, deck: room.hostDeck!.characters, missionCards: room.hostDeck!.missions },
              player2: { userId: room.guestId!, isAI: false, deck: room.guestDeck!.characters, missionCards: room.guestDeck!.missions },
              gameMode: room.gameMode,
            };
            const { resetIdCounter } = require('@/lib/engine/utils/id');
            resetIdCounter();
            room.gameState = GameEngine.createGame(config);
            room.replayInitialState = deepClone(room.gameState);
            room.replayInitialState.actionHistory = [];
            room.replayStateSnapshots = [];
            room.replaySnapshotLogLengths = [];
            const p1State = GameEngine.getVisibleState(room.gameState, 'player1');
            const p2State = GameEngine.getVisibleState(room.gameState, 'player2');
            const playerNames = { player1: hostName, player2: guestName };
            io.to(room.hostSocket!).emit('game:state-update', { visibleState: p1State, playerRole: 'player1', playerNames });
            io.to(room.guestSocket!).emit('game:state-update', { visibleState: p2State, playerRole: 'player2', playerNames });
            io.to(data.code).emit('game:started');
            console.log(`[Socket] Tournament game auto-started in room ${data.code}`);

            if (room.gameState && room.gameState.phase === 'mulligan') {
              startMulliganTimer(room, data.code, io);
            }

            const matchTimeLimit = 1800000;
            room.tournamentGameTimer = setTimeout(async () => {
              if (!rooms.has(data.code) || !room.gameState || room.gameState.phase === 'gameOver') return;
              const p1S = room.gameState.player1.missionPoints;
              const p2S = room.gameState.player2.missionPoints;
              const loser: 'player1' | 'player2' = p1S !== p2S
                ? (p1S > p2S ? 'player2' : 'player1')
                : (room.gameState.edgeHolder === 'player1' ? 'player2' : 'player1');
              room.gameState.phase = 'gameOver' as any;
              await finalizeGameEnd(room, data.code, io, 'timeout');
            }, matchTimeLimit);
          } catch (err) {
            console.error('[Socket] Tournament auto-start error:', err);
          }
        };
        fakeSelectEvent();
      }

      
      if (room.isSealed && room.guestId) {
        try {
          const { generateSealedPool } = await import('@/lib/sealed/boosterGenerator');
          const count = room.sealedBoosterCount ?? 6;
          const hostPool = generateSealedPool(count);
          const guestPool = generateSealedPool(count);

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

      if ((room.isRanked || room.gameMode === 'ranked') && !room.tournamentId) {
        try {
          const banned = await getBannedCards();
          if (banned.size > 0) {
            const foundBanned: Array<{ cardId: string; reason: string | null }> = [];
            for (const c of data.characters) {
              if (c && typeof c.id === 'string' && banned.has(c.id)) foundBanned.push({ cardId: c.id, reason: banned.get(c.id) ?? null });
            }
            for (const m of data.missions) {
              if (m && typeof m.id === 'string' && banned.has(m.id)) foundBanned.push({ cardId: m.id, reason: banned.get(m.id) ?? null });
            }
            if (foundBanned.length > 0) {
              socket.emit('room:error', {
                message: 'Deck contains banned cards',
                errorKey: 'game.error.deckBanned',
                bannedCards: foundBanned,
              });
              return;
            }
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
        const canon = getCharacterById(c.id);
        if (!canon) {
          socket.emit('room:error', { message: `Unknown card ${c.id}`, errorKey: 'game.error.invalidDeck' });
          return;
        }
        resolvedChars.push(canon);
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

      if (socket.id === room.hostSocket) {
        room.hostDeck = safeDeck;
        if (safeDeckId) room.hostDeckId = safeDeckId;
      } else if (socket.id === room.guestSocket) {
        room.guestDeck = safeDeck;
        if (safeDeckId) room.guestDeckId = safeDeckId;
      }

      if (room.isSealed) {
        
        const otherSocket = socket.id === room.hostSocket ? room.guestSocket : room.hostSocket;
        if (otherSocket) {
          io.to(otherSocket).emit('sealed:opponent-ready');
        }
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
        };

        room.gameState = GameEngine.createGame(config);
        room.replayInitialState = deepClone(room.gameState);
        room.replayInitialState.actionHistory = [];
        room.replayStateSnapshots = [];
        room.replaySnapshotLogLengths = [];

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

        
        const p1State = GameEngine.getVisibleState(room.gameState, 'player1');
        const p2State = GameEngine.getVisibleState(room.gameState, 'player2');
        console.log(`[Socket] P1 visible: hand=${p1State.myState.hand.length}, phase=${p1State.phase}`);
        console.log(`[Socket] P2 visible: hand=${p2State.myState.hand.length}, phase=${p2State.phase}`);

        if (room.hostSocket) {
          io.to(room.hostSocket).emit('game:state-update', {
            visibleState: p1State,
            playerRole: 'player1',
            playerNames: { player1: hostName, player2: guestName },
          });
          console.log(`[Socket] Sent state-update to host socket ${room.hostSocket}`);
        } else {
          console.error(`[Socket] Host socket is null! Cannot send state-update`);
        }
        if (room.guestSocket) {
          io.to(room.guestSocket).emit('game:state-update', {
            visibleState: p2State,
            playerRole: 'player2',
            playerNames: { player1: hostName, player2: guestName },
          });
          console.log(`[Socket] Sent state-update to guest socket ${room.guestSocket}`);
        } else {
          console.error(`[Socket] Guest socket is null! Cannot send state-update`);
        }

        io.to(code).emit('game:started');
        console.log(`[Socket] Game started event emitted to room ${code}`);
        broadcastActiveGames(io);

        if (room.gameState.phase === 'action') {
          startActionTimer(room, code, io);
        } else if (room.gameState.phase === 'mulligan') {
          startMulliganTimer(room, code, io);
        }

        
        if (room.tournamentId && room.tournamentMatchId) {
          const matchTimeLimit = 1800000; // 30 min default
          const tournamentGameDeadline = Date.now() + matchTimeLimit;
          io.to(code).emit('game:tournament-deadline', { deadline: tournamentGameDeadline, durationMs: matchTimeLimit });

          
          room.tournamentGameTimer = setTimeout(async () => {
            if (!rooms.has(code)) return;
            if (!room.gameState || room.gameState.phase === 'gameOver') return;

            console.log(`[Socket] Tournament game timer expired in room ${code}`);
            
            const p1Score = room.gameState.player1.missionPoints;
            const p2Score = room.gameState.player2.missionPoints;
            let loser: 'player1' | 'player2';
            if (p1Score !== p2Score) {
              loser = p1Score > p2Score ? 'player2' : 'player1';
            } else {
              
              loser = room.gameState.edgeHolder === 'player1' ? 'player2' : 'player1';
            }
            room.gameState = GameEngine.applyAction(room.gameState, loser, { type: 'FORFEIT', reason: 'timeout' });
            broadcastState(room, io);
            await finalizeGameEnd(room, code, io, 'timeout');
          }, matchTimeLimit);
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

    
    socket.on('game:request-state', () => {
      const code = playerRooms.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room || !room.gameState) return;
      const player = socket.id === room.hostSocket ? 'player1' : 'player2';
      const visibleState = GameEngine.getVisibleState(room.gameState, player);
      const playerNames = {
        player1: room.hostName ?? 'Player 1',
        player2: room.guestName ?? 'Player 2',
      };
      socket.emit('game:state-update', { visibleState, playerRole: player, playerNames });
      console.log(`[Socket] Resync state sent to ${player} in room ${code}`);
    });

    
    socket.on('coin-flip-done', () => {
      const code = playerRooms.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room) return;
      const player = socket.id === room.hostSocket ? 'player1' : 'player2';
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

      const code = playerRooms.get(socket.id);
      if (!code) {
        console.warn(`[Socket] action:perform from ${socket.id}: no room found`);
        return;
      }
      const room = rooms.get(code);
      if (!room || !room.gameState) {
        console.warn(`[Socket] action:perform: room ${code} has no game state`);
        return;
      }

      const player = socket.id === room.hostSocket ? 'player1' : 'player2';
      console.log(`[Socket] action:perform from ${player}: ${data.action.type}, phase: ${room.gameState.phase}`);

      
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

        
        if (room.replayStateSnapshots && room.replaySnapshotLogLengths) {
          room.replaySnapshotLogLengths.push(room.gameState.log.length);
          const snap = deepClone(room.gameState);
          snap.log = [];
          snap.actionHistory = [];
          room.replayStateSnapshots.push(snap);
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
              const result = validateRevealCharacter(prevState, player as 'player1' | 'player2', data.action.missionIndex, data.action.characterInstanceId);
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

        
        if (data.action.type !== 'PASS' || room.gameState.consecutiveTimeouts[player] === 0) {
          room.gameState.consecutiveTimeouts[player] = 0;
        }

        
        broadcastState(room, io);

        
        io.to(code).emit('game:action-performed', {
          player,
          action: data.action,
        });

        
        const winner = GameEngine.getWinner(room.gameState);
        if (winner) {
          await finalizeGameEnd(room, code, io, 'score');
        } else if (room.gameState.missionScoringComplete) {
          
          clearActionTimer(room);
          setTimeout(async () => {
            try {
              if (!rooms.has(code)) return; // Room was deleted
              if (!room.gameState || !room.gameState.missionScoringComplete) return;
              room.gameState = GameEngine.applyAction(room.gameState, 'player1', { type: 'ADVANCE_PHASE' });
              broadcastState(room, io);

              const winnerAfterEnd = GameEngine.getWinner(room.gameState);
              if (winnerAfterEnd) {
                await finalizeGameEnd(room, code, io, 'score');
              } else if (room.gameState.phase === 'action') {
                startActionTimer(room, code, io);
              } else if (room.gameState.phase === 'end' && room.gameState.pendingActions.length > 0) {
                
                startEffectTimer(room, code, io);
              }
            } catch (err) {
              console.error('[Socket] Auto-advance error:', err instanceof Error ? err.message : err);
            }
          }, 1500);
        } else if (room.gameState.phase === 'action' && room.gameState.pendingForcedResolver) {
          
          startForcedResolverTimer(room, code, io);
        } else if (room.gameState.phase === 'action' && (room.gameState.pendingEffects.length > 0 || room.gameState.pendingActions.length > 0)) {
          
          startEffectTimer(room, code, io);
        } else if (room.gameState.phase === 'action') {
          
          startActionTimer(room, code, io);
        } else if (room.gameState.phase === 'mission' && room.gameState.pendingActions.length > 0) {
          
          startMissionPhaseTimer(room, code, io);
        } else if (room.gameState.phase === 'end' && room.gameState.pendingActions.length > 0) {
          startEffectTimer(room, code, io);
        } else {
          clearActionTimer(room);
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
      const code = playerRooms.get(socket.id) || data.roomCode;
      if (!code) return;
      const room = rooms.get(code);
      if (!room || !room.gameState || room.gameState.phase === 'gameOver') return;

      const authedForfeitId = (socket.data as { userId?: string }).userId;

      let player: 'player1' | 'player2';
      if (socket.id === room.hostSocket) player = 'player1';
      else if (socket.id === room.guestSocket) player = 'player2';
      else if (data.userId === room.hostId && authedForfeitId === room.hostId) {
        player = 'player1';
        room.hostSocket = socket.id;
        playerRooms.set(socket.id, code);
      }
      else if (data.userId === room.guestId && authedForfeitId === room.guestId) {
        player = 'player2';
        room.guestSocket = socket.id;
        playerRooms.set(socket.id, code);
      }
      else {
        console.warn(`[Socket] action:forfeit rejected: socket ${socket.id} (auth=${authedForfeitId ?? 'null'}, claim=${data.userId ?? 'null'}) not authorized for room ${code}`);
        return;
      }
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
      room.finalized = false;
      room.coinFlipDone = { player1: false, player2: false };
      clearActionTimer(room);

      
      if (room.hostSocket) {
        io.to(room.hostSocket).emit('game:rematch-accepted');
        io.to(room.hostSocket).emit('game:rematch-reselect', { roomCode: code, isSealed: room.isSealed });
      }
      if (room.guestSocket) {
        io.to(room.guestSocket).emit('game:rematch-accepted');
        io.to(room.guestSocket).emit('game:rematch-reselect', { roomCode: code, isSealed: room.isSealed });
      }

      
      if (room.isSealed) {
        try {
          const { generateSealedPool } = await import('@/lib/sealed/boosterGenerator');
          const count = room.sealedBoosterCount ?? 6;
          const hostPool = generateSealedPool(count);
          const guestPool = generateSealedPool(count);
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

    
    socket.on('matchmaking:join', async (data: { userId: string; isRanked?: boolean; hostName?: string }) => {
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

      if (await isUserGameBanned(data.userId)) {
        socket.emit('game:error', { message: 'You are banned from playing online games', errorKey: 'game.error.gameBanned' });
        return;
      }

      const tournamentBusy = await getActiveTournamentMatchForUser(data.userId);
      if (tournamentBusy) {
        socket.emit('game:error', { message: `You are in a tournament match (${tournamentBusy.roomCode ?? 'pending'}). Finish it first.`, errorKey: 'game.error.tournamentBusy', errorParams: { roomCode: tournamentBusy.roomCode ?? 'pending' } });
        return;
      }

      console.log(`[Socket] User ${data.userId} joining matchmaking (ranked: ${data.isRanked ?? true})`);
      const wantRanked = data.isRanked ?? true;


      cleanupPlayerRoom(socket);


      cleanupStaleRooms();

      for (const [existingCode, existingRoom] of rooms) {
        if (existingRoom.hostId === data.userId && !existingRoom.guestId && !existingRoom.gameState && existingRoom.hostSocket !== socket.id) {
          const existingHostSock = io.sockets.sockets.get(existingRoom.hostSocket);
          if (existingHostSock && existingHostSock.connected) {
            console.log(`[Socket] User ${data.userId} already queued in room ${existingCode}, rejecting duplicate matchmaking from socket ${socket.id}`);
            socket.emit('game:error', { message: 'You are already queued in another tab', errorKey: 'game.error.alreadyQueued' });
            return;
          }
          rooms.delete(existingCode);
          playerRooms.delete(existingRoom.hostSocket);
          if (!existingRoom.isPrivate) broadcastRoomList(io);
        }
      }



      let foundRoom: RoomData | null = null;
      for (const [code, room] of rooms) {
        if (!room.isPrivate && !room.guestId && room.hostId !== data.userId && room.isRanked === wantRanked) {
          
          const hostSocketObj = io.sockets.sockets.get(room.hostSocket);
          if (hostSocketObj && hostSocketObj.connected) {
            foundRoom = room;
            break;
          } else {
            
            console.log(`[Socket] Matchmaking: removing stale room ${code} (host socket disconnected)`);
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
          gameMode: wantRanked ? 'ranked' : 'casual',
          createdAt: Date.now(),
          actionTimer: null,
          timerDeadline: null,
          disconnectTimer: null,
          disconnectedPlayer: null,
          disconnectDeadline: null,
          player1DisconnectCount: 0,
          player2DisconnectCount: 0,
          replayInitialState: null,
          replayStateSnapshots: null,
          replaySnapshotLogLengths: null,
        finalized: false,
          isSealed: false,
          sealedBoosterCount: 6,
          sealedTimer: null,
          sealedDeadline: null,
          timerEnabled: wantRanked,
          coinFlipDone: { player1: false, player2: false },
          spectators: new Map(),
          hostAllowSpectatorHand: false,
          guestAllowSpectatorHand: false,
          chatMessages: [],
          chatLastCleanup: 0,
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
        rooms.delete(code);
        playerRooms.delete(socket.id);
        socket.leave(code);
        console.log(`[Socket] Matchmaking: user left queue, room ${code} removed`);
        if (wasPublic) broadcastRoomList(io);
      }
    });

    
    

    socket.on('spectate:join', (data: { roomCode: string; userId: string; username: string }) => {
      const authedUserId = (socket.data as { userId?: string }).userId;
      if (!authedUserId || authedUserId !== data.userId) {
        console.warn(`[Socket] spectate:join rejected: socket auth mismatch (claim=${data.userId}, auth=${authedUserId ?? 'null'})`);
        socket.emit('spectate:error', { message: 'Authentication mismatch', errorKey: 'spectate.errorAuth' });
        return;
      }

      const room = rooms.get(data.roomCode);
      if (!room || !room.gameState) {
        socket.emit('spectate:error', { message: 'Game not found or not in progress', errorKey: 'spectate.errorNotFound' });
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
      socket.join(data.roomCode);
      socket.join(`spec:${data.roomCode}`);
      playerRooms.set(socket.id, `spec:${data.roomCode}`);

      
      try {
        const p1State = GameEngine.getVisibleState(room.gameState, 'player1');
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
          visibleState: spectatorState,
          playerNames,
          spectatorCount: room.spectators.size,
          roomCode: data.roomCode,
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
      const isPlayer = socket.id === room.hostSocket || socket.id === room.guestSocket;
      const isSpec = room.spectators.has(socket.id);
      if (!isPlayer && !isSpec) {
        socket.emit('spectate:error', { message: 'Not subscribed to this room', errorKey: 'spectate.errorNotSubscribed' });
        return;
      }
      try {
        const p1State = GameEngine.getVisibleState(room.gameState, 'player1');
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
          visibleState: spectatorState,
          playerNames,
          spectatorCount: room.spectators.size,
          roomCode: data.roomCode,
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
      const raw = typeof data.message === 'string' ? data.message : '';
      const sanitized = raw.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '').replace(/\s+/g, ' ').trim();
      if (!sanitized || sanitized.length > 200) return;
      const trimmed = sanitized;

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

      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { chatBanned: true, chatBanUntil: true },
        });
        if (user?.chatBanned) {
          if (!user.chatBanUntil || user.chatBanUntil > new Date()) {
            socket.emit('chat:error', { message: 'You are banned from chat', errorKey: 'chat.chatBanned' });
            return;
          }
          
          await prisma.user.update({ where: { id: userId }, data: { chatBanned: false, chatBanUntil: null } });
        }
      } catch { /* ignore ban check errors */ }

      const chatMsg = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        userId, username,
        message: trimmed,
        isEmote: data.isEmote,
        isSpectator,
        timestamp: Date.now(),
      };

      room.chatMessages.push(chatMsg);
      
      if (room.chatMessages.length > 100) room.chatMessages = room.chatMessages.slice(-100);

      
      prisma.chatMessage.create({
        data: {
          roomCode, userId, username,
          message: chatMsg.message,
          isEmote: chatMsg.isEmote,
          isSpectator,
        },
      }).catch(() => {});

      
      import('@/lib/db/chatCleanup').then(m => m.cleanupOldChatMessages()).catch(() => {});

      
      
      
      if (isSpectator) {
        io.to(`spec:${roomCode}`).emit('chat:message', chatMsg);
      } else {
        if (room.hostSocket) io.to(room.hostSocket).emit('chat:message', chatMsg);
        if (room.guestSocket) io.to(room.guestSocket).emit('chat:message', chatMsg);
        io.to(`spec:${roomCode}`).emit('chat:message', chatMsg);
      }
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
          io.to(code).emit('room:player-left', { socketId: socket.id });
          console.log(`[Socket] Player ${socket.id} left room ${code}`);

          const isHost = room.hostSocket === socket.id;
          const player = isHost ? 'player1' : 'player2';

          
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
            
            rooms.delete(code);
          }


          else if (room.gameState && room.gameState.phase !== 'gameOver') {

            const currentCount = player === 'player1'
              ? room.player1DisconnectCount
              : room.player2DisconnectCount;

            if (currentCount > MAX_DISCONNECTS) {
              console.log(`[Socket] ${player} already past disconnect cap in room ${code}, instant forfeit`);
              if (room.disconnectTimer) {
                clearTimeout(room.disconnectTimer);
                room.disconnectTimer = null;
              }
              room.disconnectedPlayer = null;
              room.disconnectDeadline = null;
              room.gameState = GameEngine.applyAction(room.gameState, player, {
                type: 'FORFEIT',
                reason: 'abandon',
              });
              broadcastState(room, io);
              finalizeGameEnd(room, code, io, 'forfeit').catch((err) => {
                console.error(`[Socket] finalizeGameEnd error for ${code}:`, err);
              });
              return;
            }

            if (room.disconnectTimer) {
              clearTimeout(room.disconnectTimer);
              room.disconnectTimer = null;
            }

            if (player === 'player1') room.player1LastDisconnectAt = Date.now();
            else room.player2LastDisconnectAt = Date.now();

            console.log(`[Socket] ${player} disconnected during game in room ${code} (count ${currentCount}/${MAX_DISCONNECTS + 1}), starting ${DISCONNECT_GRACE_MS / 1000}s grace period`);
            
            

            
            const disconnectDeadline = Date.now() + DISCONNECT_GRACE_MS;
            room.disconnectedPlayer = player;
            room.disconnectDeadline = disconnectDeadline;
            const opponentSock = isHost ? room.guestSocket : room.hostSocket;
            if (opponentSock) {
              io.to(opponentSock).emit('game:opponent-disconnected', {
                deadline: disconnectDeadline,
                durationMs: DISCONNECT_GRACE_MS,
                disconnectCount: currentCount,
                maxDisconnects: MAX_DISCONNECTS,
              });
            }

            room.disconnectTimer = setTimeout(async () => {
              room.disconnectTimer = null;
              room.disconnectedPlayer = null;
              room.disconnectDeadline = null;
              if (!room.gameState || room.gameState.phase === 'gameOver') return;

              if (room.tournamentId && room.tournamentMatchId) {
                const opponentSocketId = isHost ? room.guestSocket : room.hostSocket;
                const opponentConnected = !!opponentSocketId && !!io.sockets.sockets.get(opponentSocketId)?.connected;
                if (!opponentConnected) {
                  const tInfo = await prisma.tournament.findUnique({
                    where: { id: room.tournamentId },
                    select: { format: true },
                  });
                  if (tInfo?.format === 'swiss') {
                    console.log(`[Socket] Both players AFK in tournament Swiss match ${room.tournamentMatchId}, double forfeit`);
                    const { handleSwissDoubleAbsence } = await import('@/lib/socket/tournamentHandlers');
                    await handleSwissDoubleAbsence(io, room.tournamentId, room.tournamentMatchId);
                    return;
                  }
                }
              }

              console.log(`[Socket] Grace period expired for ${player} in room ${code}, auto-forfeiting`);
              room.gameState = GameEngine.applyAction(room.gameState, player, {
                type: 'FORFEIT',
                reason: 'abandon',
              });

              broadcastState(room, io);
              await finalizeGameEnd(room, code, io, 'forfeit');
            }, DISCONNECT_GRACE_MS);
          } else if (room.isSealed && room.guestId && !room.gameState) {
            
            
            console.log(`[Socket] ${player} disconnected during sealed deck-building in room ${code}, starting ${DISCONNECT_GRACE_MS / 1000}s grace period`);
            room.disconnectTimer = setTimeout(() => {
              
              if (isHost) {
                console.log(`[Socket] Grace period expired for host in sealed room ${code}, removing room`);
                if (room.sealedTimer) clearTimeout(room.sealedTimer);
                const wasPublic = !room.isPrivate;
                rooms.delete(code);
                if (wasPublic) broadcastRoomList(io);
              } else {
                console.log(`[Socket] Grace period expired for guest in sealed room ${code}, resetting guest`);
                room.guestId = null;
                room.guestSocket = null;
                room.guestDeck = null;
                if (!room.isPrivate) broadcastRoomList(io);
              }
            }, DISCONNECT_GRACE_MS);
          } else if (isHost) {
            
            if (!room.gameState) {
              console.log(`[Socket] Host left room ${code} before game started, removing room`);
              const wasPublic = !room.isPrivate;
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
