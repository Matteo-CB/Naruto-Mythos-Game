import type { Server as SocketIOServer, Socket } from 'socket.io';
import { GameEngine } from '@/lib/engine/GameEngine';
import type { GameState, GameAction, CharacterCard, MissionCard, PlayerConfig, GameConfig } from '@/lib/engine/types';
import { registerUserSocket, removeSocketFromAll } from '@/lib/socket/io';
import { prisma } from '@/lib/db/prisma';
import { calculateEloChanges } from '@/lib/elo/elo';
import { syncDiscordRole } from '@/lib/discord/roleSync';
import { sendRankUpNotification } from '@/lib/discord/rankUpWebhook';
import { registerTournamentHandlers, handleTournamentMatchEnd } from '@/lib/socket/tournamentHandlers';
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
  // Timer fields
  actionTimer: ReturnType<typeof setTimeout> | null;
  timerDeadline: number | null;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
  // Replay
  replayInitialState: GameState | null;
  // Sealed mode
  isSealed: boolean;
  sealedBoosterCount: 4 | 5 | 6;
  sealedTimer: ReturnType<typeof setTimeout> | null;
  sealedDeadline: number | null;
  // Timer toggle (casual rooms can disable)
  timerEnabled: boolean;
  // Rematch
  rematchOffer?: 'player1' | 'player2';
  // Tournament
  tournamentId?: string;
  tournamentMatchId?: string;
  // Coin flip sync: track which players finished their coin flip animation
  coinFlipDone: { player1: boolean; player2: boolean };
  // Spectators
  spectators: Map<string, { socketId: string; userId: string; username: string }>;
  // Per-player hand visibility for spectators
  hostAllowSpectatorHand: boolean;
  guestAllowSpectatorHand: boolean;
  // Chat
  chatMessages: Array<{ id: string; userId: string; username: string; message: string; isEmote: boolean; isSpectator: boolean; timestamp: number }>;
  chatLastCleanup: number;
}

const ACTION_TIMEOUT_MS = 120_000; // 2 minutes per action
const EFFECT_TIMEOUT_MS = 60_000; // 1 minute per effect resolution
const MAX_CONSECUTIVE_TIMEOUTS = 3; // 3 timeouts = auto-forfeit
const DISCONNECT_GRACE_MS = 120_000; // 2 minutes before disconnect = forfeit
const SEALED_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes for sealed deck building

export const rooms = new Map<string, RoomData>();
const playerRooms = new Map<string, string>(); // socketId -> roomCode
const userNames = new Map<string, string>(); // userId -> username (populated on auth:register)
const MATCHMAKING_ROOM_TTL_MS = 5 * 60 * 1000; // 5 min stale room cleanup
let ioInstance: SocketIOServer | null = null; // Stored for getPublicRoomList socket liveness check

// Banned cards cache (refreshed every 60s)
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

/**
 * Clean up any existing room for this socket before joining matchmaking.
 * Prevents stale rooms from accumulating.
 */
function cleanupPlayerRoom(socket: Socket): void {
  const existingCode = playerRooms.get(socket.id);
  if (!existingCode) return;
  const existingRoom = rooms.get(existingCode);
  if (!existingRoom) {
    playerRooms.delete(socket.id);
    return;
  }
  // If this socket is the host of a room with no game running, remove it
  if (existingRoom.hostSocket === socket.id && !existingRoom.gameState) {
    if (existingRoom.sealedTimer) clearTimeout(existingRoom.sealedTimer);
    rooms.delete(existingCode);
    socket.leave(existingCode);
  }
  // If this socket is the guest, clear guest info
  if (existingRoom.guestSocket === socket.id) {
    existingRoom.guestId = null;
    existingRoom.guestSocket = null;
    existingRoom.guestDeck = null;
    socket.leave(existingCode);
  }
  playerRooms.delete(socket.id);
}

/**
 * Build the list of public waiting rooms and broadcast to all connected sockets.
 */
function getPublicRoomList(): Array<{ code: string; hostName: string; gameMode: string; createdAt: number }> {
  const list: Array<{ code: string; hostName: string; gameMode: string; createdAt: number }> = [];
  const staleRoomCodes: string[] = [];
  for (const [code, room] of rooms) {
    if (room.isPrivate) continue;
    if (room.guestId) continue; // Already has a guest
    if (room.gameState) continue; // Game already started
    // Verify host socket is still connected
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
  // Cleanup stale rooms
  for (const code of staleRoomCodes) {
    const room = rooms.get(code);
    if (room?.hostSocket) playerRooms.delete(room.hostSocket);
    rooms.delete(code);
  }
  return list;
}

function broadcastRoomList(io: SocketIOServer): void {
  io.emit('room:list-update', getPublicRoomList());
}

function broadcastActiveGames(io: SocketIOServer): void {
  const activeGames: Array<{
    roomCode: string; player1Name: string; player2Name: string;
    spectatorCount: number; turn: number; isRanked: boolean; isPrivate: boolean;
  }> = [];
  // Track seen player IDs to prevent duplicates (same player in multiple rooms)
  const seenPlayerIds = new Set<string>();
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (!room.gameState || room.gameState.phase === 'gameOver') continue;
    // Skip stale rooms (older than 2 hours with no activity)
    if (now - room.createdAt > 2 * 60 * 60 * 1000) continue;
    // Skip if either player is already shown in another active game
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
      isPrivate: room.isPrivate,
    });
  }
  io.emit('games:list-update', { games: activeGames });
}

/**
 * Periodically clean stale public matchmaking rooms (no guest, no game, TTL expired).
 */
function cleanupStaleRooms(): void {
  const now = Date.now();
  let cleaned = 0;
  for (const [code, room] of rooms) {
    // Stale matchmaking rooms (no guest, no game, TTL expired)
    if (!room.isPrivate && !room.guestId && !room.gameState) {
      if (!room.createdAt || now - room.createdAt > MATCHMAKING_ROOM_TTL_MS) {
        if (room.hostSocket) playerRooms.delete(room.hostSocket);
        rooms.delete(code);
        cleaned++;
        continue;
      }
    }
    // Completed games lingering >10 minutes (both players likely gone)
    if (room.gameState?.phase === 'gameOver' && now - room.createdAt > 10 * 60 * 1000) {
      if (room.hostSocket) playerRooms.delete(room.hostSocket);
      if (room.guestSocket) playerRooms.delete(room.guestSocket);
      for (const [, spec] of room.spectators) playerRooms.delete(spec.socketId);
      rooms.delete(code);
      cleaned++;
      continue;
    }
    // Very old rooms (>4 hours) — force cleanup regardless of state
    if (now - room.createdAt > 4 * 60 * 60 * 1000) {
      if (room.hostSocket) playerRooms.delete(room.hostSocket);
      if (room.guestSocket) playerRooms.delete(room.guestSocket);
      for (const [, spec] of room.spectators) playerRooms.delete(spec.socketId);
      clearActionTimer(room);
      rooms.delete(code);
      cleaned++;
    }
  }
  // Clean orphaned playerRooms entries (point to rooms that no longer exist)
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
}

/**
 * Persist game result and apply ELO, then emit game:ended to both players.
 * Shared between normal game end, manual forfeit, and auto-timeout forfeit.
 */
async function finalizeGameEnd(
  room: RoomData,
  code: string,
  io: SocketIOServer,
  winReason: 'score' | 'forfeit' | 'timeout' = 'score',
): Promise<void> {
  if (!room.gameState) return;

  clearActionTimer(room);

  const winner = GameEngine.getWinner(room.gameState);
  if (!winner) {
    console.error(`[Socket] finalizeGameEnd called but no winner! phase=${room.gameState.phase} turn=${room.gameState.turn} pendingEffects=${room.gameState.pendingEffects.length} pendingActions=${room.gameState.pendingActions.length} p1Score=${room.gameState.player1.missionPoints} p2Score=${room.gameState.player2.missionPoints}`);
    return;
  }

  const p1Score = room.gameState.player1.missionPoints;
  const p2Score = room.gameState.player2.missionPoints;

  let eloData: { player1Delta: number; player2Delta: number; player1NewElo: number; player2NewElo: number; player1TotalGames: number; player2TotalGames: number } | null = null;
  let gameRecordId: string | null = null;

  // Apply ELO changes (separate try-catch so game record save still works if ELO fails)
  try {
    if (room.isRanked && room.hostId && room.guestId) {
      const [player1, player2] = await Promise.all([
        prisma.user.findUnique({ where: { id: room.hostId } }),
        prisma.user.findUnique({ where: { id: room.guestId! } }),
      ]);

      if (player1 && player2) {
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

        // Sync Discord roles (fire-and-forget)
        syncDiscordRole(room.hostId).catch(() => {});
        syncDiscordRole(room.guestId!).catch(() => {});

        // Rank-up webhook notifications (fire-and-forget)
        const p1OldTotal = player1.wins + player1.losses + player1.draws;
        const p2OldTotal = player2.wins + player2.losses + player2.draws;
        sendRankUpNotification(player1.username, player1.discordId, player1.elo, changes.player1NewElo, p1OldTotal, p1OldTotal + 1).catch(() => {});
        sendRankUpNotification(player2.username, player2.discordId, player2.elo, changes.player2NewElo, p2OldTotal, p2OldTotal + 1).catch(() => {});
      }
    }
  } catch (eloErr) {
    console.error('[Socket] ELO update error:', eloErr instanceof Error ? eloErr.message : eloErr);
  }

  // Persist game record (separate try-catch so ELO still works if save fails)
  try {
    if (room.hostId && room.guestId) {
      const rawHistory = room.gameState?.actionHistory ?? [];
      const replayForDb = room.gameState ? {
        log: room.gameState.log.length > 500 ? room.gameState.log.slice(-500) : room.gameState.log,
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
        actionHistory: rawHistory.length > 300 ? rawHistory.slice(-300) : rawHistory,
      } : null;

      const gameRecord = await prisma.game.create({
        data: {
          player1Id: room.hostId,
          player2Id: room.guestId,
          isAiGame: false,
          status: 'completed',
          winnerId: winner === 'player1' ? room.hostId : room.guestId,
          player1Score: p1Score,
          player2Score: p2Score,
          eloChange: eloData?.player1Delta ?? 0,
          completedAt: new Date(),
          gameState: replayForDb ? (() => {
            try {
              const serialized = JSON.stringify(replayForDb);
              // MongoDB BSON limit ~16MB, keep under 12MB to be safe
              if (serialized.length > 12_000_000) {
                console.warn(`[Socket] Replay data too large (${(serialized.length / 1_000_000).toFixed(1)}MB), saving without actionHistory`);
                return JSON.parse(JSON.stringify({ ...replayForDb, actionHistory: [] }));
              }
              return JSON.parse(serialized);
            } catch (e) {
              console.error('[Socket] Replay serialization error:', e instanceof Error ? e.message : e);
              return null;
            }
          })() : undefined,
        },
      });
      gameRecordId = gameRecord.id;
      console.log(`[Socket] Game saved: ${gameRecordId} | winner=${winner} (${winner === 'player1' ? room.hostId : room.guestId}) | ranked=${room.isRanked} | elo=${eloData ? `p1:${eloData.player1Delta} p2:${eloData.player2Delta}` : 'none'}`);
      // If this game is part of a tournament, update tournament state
      if (room.tournamentId && room.tournamentMatchId && gameRecordId) {
        const tournamentWinnerId = winner === 'player1' ? room.hostId : room.guestId!;
        handleTournamentMatchEnd(io, room.tournamentId, room.tournamentMatchId, tournamentWinnerId, gameRecordId).catch(err => {
          console.error('[Socket] Tournament match end error:', err);
        });
      }
    }
  } catch (saveErr) {
    console.error('[Socket] Error saving game record:', saveErr instanceof Error ? saveErr.message : saveErr, saveErr instanceof Error ? saveErr.stack : '');
  }

  // Build replay data for client-side save
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
    // Visual replay data
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
      gameId: gameRecordId,
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
      gameId: gameRecordId,
      replayData,
      tournamentId: room.tournamentId ?? null,
    });
  }

  // Update live games list for spectators
  broadcastActiveGames(io);
}

/**
 * Start (or restart) the action timer for the active player.
 * On timeout: auto-pass first, then auto-forfeit after MAX_CONSECUTIVE_TIMEOUTS.
 */
function startActionTimer(
  room: RoomData,
  code: string,
  io: SocketIOServer,
): void {
  clearActionTimer(room);

  if (!room.gameState) return;
  // Only run timer during action phase (also excludes gameOver)
  if (room.gameState.phase !== 'action') return;
  // Skip timer if disabled for this room (casual rooms can opt out)
  if (!room.timerEnabled) return;

  const activePlayer = room.gameState.activePlayer;
  const targetSocket = activePlayer === 'player1' ? room.hostSocket : room.guestSocket;

  const deadline = Date.now() + ACTION_TIMEOUT_MS;
  room.timerDeadline = deadline;

  // Notify the active player of the deadline
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
      // Auto-forfeit after too many timeouts
      console.log(`[Socket] Auto-forfeit for ${player} after ${timeouts} consecutive timeouts`);
      room.gameState = GameEngine.applyAction(room.gameState, player, { type: 'FORFEIT', reason: 'timeout' });

      // Broadcast final state
      broadcastState(room, io);
      await finalizeGameEnd(room, code, io, 'timeout');
    } else {
      // If pending effects/actions block PASS, auto-resolve them first
      if (room.gameState.pendingActions.length > 0) {
        const pendingForPlayer = room.gameState.pendingActions.filter(p => p.player === player);
        if (pendingForPlayer.length > 0) {
          const pa = pendingForPlayer[0];
          // Try to decline optional effects first
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
      // Now try to PASS (may still fail if more pending remain — timer will restart)
      const stateBeforePass = room.gameState;
      console.log(`[Socket] Auto-pass for ${player} in room ${code}`);
      room.gameState = GameEngine.applyAction(room.gameState, player, { type: 'PASS' });

      // Notify the timed-out player
      if (targetSocket) {
        io.to(targetSocket).emit('game:auto-passed');
      }

      // Broadcast updated state
      broadcastState(room, io);

      // Check if game ended (both passed → mission phase → end phase → game over)
      const winner = GameEngine.getWinner(room.gameState);
      if (winner) {
        await finalizeGameEnd(room, code, io, 'score');
      } else if (room.gameState.missionScoringComplete) {
        // Mission scoring done - auto-advance after brief pause
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
        // Restart timer for next active player
        startActionTimer(room, code, io);
      }
    }
  }, ACTION_TIMEOUT_MS);
}

/**
 * Start a timer for the forced resolver (opponent who must respond to an effect).
 * Pauses the active player's timer and gives the forced resolver 2 minutes.
 * On timeout: auto-decline the pending action (character gets defeated).
 */
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

  // Pause active player's timer
  if (activeSocket) {
    io.to(activeSocket).emit('game:action-deadline-pause');
  }

  // Send deadline to forced resolver
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

    // Auto-decline: find the pending effect for this player and decline it
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
      // Fallback: try declining via SELECT_TARGET with empty targets
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

    // Notify the timed-out player
    if (forcedSocket) {
      io.to(forcedSocket).emit('game:auto-declined');
    }

    // Broadcast updated state
    broadcastState(room, io);

    // Check if game ended
    const winner = GameEngine.getWinner(room.gameState);
    if (winner) {
      await finalizeGameEnd(room, code, io, 'score');
    } else if (room.gameState.phase === 'action') {
      // Restart timer for the original active player
      startActionTimer(room, code, io);
    }
  }, ACTION_TIMEOUT_MS);
}

/**
 * Start a timer for pending effect resolution (60 seconds).
 * On timeout:
 * - Optional effects → auto-decline
 * - Mandatory effects → auto-select a random valid target
 */
function startEffectTimer(
  room: RoomData,
  code: string,
  io: SocketIOServer,
): void {
  clearActionTimer(room);

  if (!room.gameState) return;
  if (!room.timerEnabled) return;

  // Find the pending action that needs resolution
  const pendingAction = room.gameState.pendingActions[0];
  if (!pendingAction) return;

  const resolverPlayer = pendingAction.player;
  const resolverSocket = resolverPlayer === 'player1' ? room.hostSocket : room.guestSocket;

  const deadline = Date.now() + EFFECT_TIMEOUT_MS;
  room.timerDeadline = deadline;

  if (resolverSocket) {
    io.to(resolverSocket).emit('game:action-deadline', { deadline, durationMs: EFFECT_TIMEOUT_MS });
  }

  // Pause the other player's perspective
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
      // Auto-decline optional effect
      console.log(`[Socket] Auto-declining optional effect for ${resolverPlayer}`);
      room.gameState = GameEngine.applyAction(room.gameState, resolverPlayer, {
        type: 'DECLINE_OPTIONAL_EFFECT',
        pendingEffectId: pendingEffect.id,
      });
    } else if (pendingEffect && currentPendingAction) {
      // Mandatory effect — pick a random valid target
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
      // Check if more effects pending
      if (room.gameState.pendingEffects.length > 0 || room.gameState.pendingActions.length > 0) {
        startEffectTimer(room, code, io);
      } else {
        startActionTimer(room, code, io);
      }
    }
  }, EFFECT_TIMEOUT_MS);
}

const MISSION_PHASE_TIMEOUT_MS = 120_000; // 2 minutes for mission phase choices

/**
 * Start a timer for mission phase pending actions (SCORE effects, REORDER_DISCARD).
 * In ranked games, if the player doesn't respond within 2 minutes, they forfeit.
 */
function startMissionPhaseTimer(
  room: RoomData,
  code: string,
  io: SocketIOServer,
): void {
  clearActionTimer(room);

  if (!room.gameState) return;
  if (!room.timerEnabled) return;
  if (!room.isRanked) return; // Only in ranked

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

    console.log(`[Socket] Mission phase timer expired for ${resolverPlayer} in room ${code} — auto-forfeit`);
    room.gameState = GameEngine.applyAction(room.gameState, resolverPlayer, { type: 'FORFEIT', reason: 'timeout' });
    broadcastState(room, io);
    await finalizeGameEnd(room, code, io, 'timeout');
  }, MISSION_PHASE_TIMEOUT_MS);
}

/**
 * Broadcast visible state to both players.
 */
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

    // Broadcast to spectators — board + face-down hands, no hidden card data
    if (room.spectators.size > 0) {
      // Strip hidden card data from ALL characters (spectator sees card backs only)
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
      // Send hand sizes (for face-down rendering) but no card data
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
      for (const [, spec] of room.spectators) {
        io.to(spec.socketId).emit('spectate:state-update', {
          visibleState: spectatorState,
          playerNames,
          spectatorCount: room.spectators.size,
          roomCode: room.code,
        });
      }
    }
  } catch (err) {
    console.error('[Socket] broadcastState error:', err instanceof Error ? err.message : err);
    // Notify both players so UI doesn't freeze
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

  // Global error handlers — prevent process crash from unhandled errors
  process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught exception:', err.message, err.stack);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[FATAL] Unhandled rejection:', reason instanceof Error ? reason.message : reason);
  });

  // Periodic cleanup of stale matchmaking rooms (every 60 seconds)
  setInterval(() => cleanupStaleRooms(), 60_000);

  // Check for scheduled tournament auto-starts (every 30 seconds)
  setInterval(async () => {
    try {
      const now = new Date();
      const scheduledTournaments = await prisma.tournament.findMany({
        where: { status: 'registration', scheduledStartAt: { not: null, lte: now } },
        include: { _count: { select: { participants: true } } },
      });
      for (const t of scheduledTournaments) {
        if (t._count.participants < 2) {
          // Not enough players — cancel
          await prisma.tournament.update({ where: { id: t.id }, data: { status: 'cancelled' } });
          io.to(`tournament:${t.id}`).emit('tournament:cancelled', { reason: 'not_enough_players' });
          console.log(`[Tournament] Auto-cancelled ${t.name} (${t.id}) — not enough players`);
          continue;
        }
        console.log(`[Tournament] Auto-starting scheduled tournament ${t.name} (${t.id})`);
        // Trigger start via internal API call
        try {
          const { generateBracket } = await import('@/lib/tournament/tournamentEngine');
          const participants = await prisma.tournamentParticipant.findMany({ where: { tournamentId: t.id } });
          // Shuffle participants randomly
          for (let i = participants.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [participants[i], participants[j]] = [participants[j], participants[i]];
          }
          // Batch assign seeds with $transaction
          await prisma.$transaction(
            participants.map((p, i) => prisma.tournamentParticipant.update({ where: { id: p.id }, data: { seed: i + 1 } }))
          );
          const bracket = generateBracket(participants.map(p => ({ userId: p.userId, username: p.username })));
          // Batch create match records
          await prisma.tournamentMatch.createMany({
            data: bracket.matches.map((m) => ({
              tournamentId: t.id, round: m.round, matchIndex: m.matchIndex,
              player1Id: (m as any).player1?.participantId || null,
              player1Username: (m as any).player1?.username || null,
              player2Id: (m as any).player2?.participantId || null,
              player2Username: (m as any).player2?.username || null,
              winnerId: (m as any).winnerId || null, winnerUsername: (m as any).winnerUsername || null,
              isBye: (m as any).isBye ?? false, status: m.status,
            })),
          });
          await prisma.tournament.update({
            where: { id: t.id },
            data: { status: 'in_progress', currentRound: 1, totalRounds: bracket.totalRounds, startedAt: now },
          });
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
    // Register tournament socket handlers
    registerTournamentHandlers(io, socket);

    // Register user identity for targeted notifications
    socket.on('auth:register', (data: { userId: string; username?: string }) => {
      if (data.userId) {
        registerUserSocket(data.userId, socket.id);
        if (data.username) {
          userNames.set(data.userId, data.username);
        }
        // Check if this user has an active game they need to reconnect to
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
      }
    });

    // Rejoin a room after reconnection (socket ID changed)
    socket.on('game:rejoin', async (data: { roomCode: string; userId: string }) => {
      const { roomCode, userId } = data;
      if (!roomCode || !userId) return;

      const room = rooms.get(roomCode);
      if (!room) {
        console.log(`[Socket] game:rejoin: room ${roomCode} not found`);
        return;
      }

      // Determine if this user is host or guest
      const isHost = room.hostId === userId;
      const isGuest = room.guestId === userId;
      if (!isHost && !isGuest) {
        console.log(`[Socket] game:rejoin: user ${userId} is not in room ${roomCode}`);
        return;
      }

      const player = isHost ? 'player1' : 'player2';
      const oldSocketId = isHost ? room.hostSocket : room.guestSocket;

      console.log(`[Socket] game:rejoin: ${player} reconnecting in room ${roomCode}, old socket: ${oldSocketId}, new socket: ${socket.id}`);

      // Update socket ID in room
      if (isHost) {
        room.hostSocket = socket.id;
      } else {
        room.guestSocket = socket.id;
      }

      // Update playerRooms map
      if (oldSocketId) playerRooms.delete(oldSocketId);
      playerRooms.set(socket.id, roomCode);

      // Join the socket.io room
      socket.join(roomCode);

      // Cancel disconnect grace timer if running
      if (room.disconnectTimer) {
        clearTimeout(room.disconnectTimer);
        room.disconnectTimer = null;
        console.log(`[Socket] Cancelled disconnect timer for ${player} in room ${roomCode}`);

        // Notify the opponent that the player has reconnected
        const opponentSock = isHost ? room.guestSocket : room.hostSocket;
        if (opponentSock) {
          io.to(opponentSock).emit('game:opponent-reconnected');
        }
      }

      // Re-register user socket
      registerUserSocket(userId, socket.id);

      // If game is active, send current game state to the rejoining player
      if (room.gameState) {
        const playerNames = { player1: room.hostName ?? 'Player 1', player2: room.guestName ?? 'Player 2' };
        const visibleState = GameEngine.getVisibleState(room.gameState, player);
        // Send game:started FIRST so the client sets gameStarted=true before state arrives
        socket.emit('game:started');
        socket.emit('game:state-update', { visibleState, playerRole: player, playerNames });

        // Restart action timer if needed
        if (room.gameState.phase === 'action' && !room.actionTimer) {
          startActionTimer(room, roomCode, io);
        }
      } else {
        // Pre-game rejoin (e.g. sealed deck-building phase)
        console.log(`[Socket] game:rejoin: ${player} rejoined room ${roomCode} during pre-game phase`);
        socket.emit('room:rejoined', {
          code: roomCode,
          isSealed: room.isSealed,
          playerRole: player === 'player1' ? 'player1' : 'player2',
        });

        // Re-check if both decks are submitted - if so, create the game
        // This handles the case where both players submitted decks but the
        // game creation event was lost due to a socket disconnection
        if (room.hostDeck && room.guestDeck && !room.gameState) {
          console.log(`[Socket] game:rejoin: Both decks already submitted in room ${roomCode}, creating game now`);
          // Clear sealed timer
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
          };

          room.gameState = GameEngine.createGame(config);
          room.replayInitialState = null;



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

    // Create a room
    socket.on('room:create', async (data: { userId: string; isPrivate?: boolean; isRanked?: boolean; isSealed?: boolean; gameMode?: 'casual' | 'ranked' | 'sealed'; hostName?: string; sealedBoosterCount?: 4 | 5 | 6; timerEnabled?: boolean; isAnonymous?: boolean }) => {
      if (isMaintenanceActive()) {
        socket.emit('room:error', { message: 'Maintenance', errorKey: 'game.error.maintenanceNoNewGames' });
        return;
      }

      console.log(`[Socket] Creating room for user ${data.userId}, socket ${socket.id}`);

      // Clean up any existing room this player might be in
      cleanupPlayerRoom(socket);

      let code: string;
      do {
        code = generateRoomCode();
      } while (rooms.has(code));

      const gameMode = data.gameMode ?? (data.isSealed ? 'sealed' : data.isRanked ? 'ranked' : 'casual');

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
        hostName: data.hostName || userNames.get(data.userId) || 'Unknown',
        actionTimer: null,
        timerDeadline: null,
        disconnectTimer: null,
        replayInitialState: null,
        isSealed: gameMode === 'sealed',
        sealedBoosterCount: data.sealedBoosterCount ?? 6,
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

      // Fetch host's spectator hand preference
      try {
        const hostUser = await prisma.user.findUnique({ where: { id: data.userId }, select: { allowSpectatorHand: true } });
        room.hostAllowSpectatorHand = hostUser?.allowSpectatorHand ?? false;
      } catch { /* default false */ }

      rooms.set(code, room);
      playerRooms.set(socket.id, code);
      socket.join(code);

      console.log(`[Socket] Room ${code} created by ${data.userId} (mode: ${gameMode})`);
      socket.emit('room:created', { code, isSealed: room.isSealed });

      // Broadcast updated room list to all connected sockets
      if (!room.isPrivate) {
        broadcastRoomList(io);
      }
    });

    // Join a room
    socket.on('room:join', async (data: { code: string; userId: string }) => {
      console.log(`[Socket] User ${data.userId} trying to join room ${data.code}`);
      
      const room = rooms.get(data.code);
      if (!room) {
        console.log(`[Socket] Room ${data.code} not found`);
        socket.emit('room:error', { message: 'Room not found' });
        return;
      }

      // Check if user is the host — for tournament rooms, let them join (connect their socket)
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
          // If game already started, send state
          if (room.gameState) {
            const visible = GameEngine.getVisibleState(room.gameState, 'player1');
            const playerNames = { player1: room.hostName ?? 'Player 1', player2: room.guestName ?? 'Player 2' };
            socket.emit('game:state-update', { visibleState: visible, playerRole: 'player1', playerNames });
            socket.emit('game:started');
          } else if (room.hostDeck && room.guestDeck && room.guestSocket) {
            // Both decks pre-loaded and guest already connected — trigger auto-start
            io.to(data.code).emit('room:player-joined', { hostId: room.hostId, guestId: room.guestId });
          }
          return;
        }
        console.log(`[Socket] User ${data.userId} is the host of room ${data.code}`);
        socket.emit('room:error', { message: 'You are the host of this room' });
        return;
      }

      // Check if room has a guest (but allow same user to rejoin)
      if (room.guestId && room.guestId !== data.userId) {
        console.log(`[Socket] Room ${data.code} is full`);
        socket.emit('room:error', { message: 'Room is full' });
        return;
      }

      // If same user is rejoining, update socket
      if (room.guestId === data.userId) {
        console.log(`[Socket] User ${data.userId} rejoining room ${data.code}`);
      }

      room.guestId = data.userId;
      room.guestSocket = socket.id;
      playerRooms.set(socket.id, data.code);
      socket.join(data.code);

      // Fetch guest's spectator hand preference
      try {
        const guestUser = await prisma.user.findUnique({ where: { id: data.userId }, select: { allowSpectatorHand: true } });
        room.guestAllowSpectatorHand = guestUser?.allowSpectatorHand ?? false;
      } catch { /* default false */ }

      console.log(`[Socket] User ${data.userId} joined room ${data.code}`);
      io.to(data.code).emit('room:player-joined', {
        hostId: room.hostId,
        guestId: room.guestId,
        isSealed: room.isSealed,
      });

      // Room is now full - broadcast updated list (room removed from available)
      if (!room.isPrivate) {
        broadcastRoomList(io);
      }

      // Tournament rooms: if both decks are pre-loaded, auto-start the game
      if (room.tournamentId && room.hostDeck && room.guestDeck && room.hostSocket && room.guestSocket && !room.gameState) {
        // Trigger deck acceptance for both players so the game starts
        // The room:select-deck handler's "both decks ready" logic will create the game
        // We just need to emit the events so the clients know
        const fakeSelectEvent = async () => {
          // Both decks already set — just trigger the game creation
          const hostName = room.hostName ?? userNames.get(room.hostId) ?? 'Player 1';
          const guestName = room.guestName ?? (room.guestId ? userNames.get(room.guestId) : null) ?? 'Player 2';
          room.hostName = hostName;
          room.guestName = guestName;
          try {
            const config: GameConfig = {
              player1: { userId: room.hostId, isAI: false, deck: room.hostDeck!.characters, missionCards: room.hostDeck!.missions },
              player2: { userId: room.guestId!, isAI: false, deck: room.guestDeck!.characters, missionCards: room.guestDeck!.missions },
            };
            const { resetIdCounter } = require('@/lib/engine/utils/id');
            resetIdCounter();
            room.gameState = GameEngine.createGame(config);
            room.replayInitialState = deepClone(room.gameState);
            const p1State = GameEngine.getVisibleState(room.gameState, 'player1');
            const p2State = GameEngine.getVisibleState(room.gameState, 'player2');
            const playerNames = { player1: hostName, player2: guestName };
            io.to(room.hostSocket!).emit('game:state-update', { visibleState: p1State, playerRole: 'player1', playerNames });
            io.to(room.guestSocket!).emit('game:state-update', { visibleState: p2State, playerRole: 'player2', playerNames });
            io.to(data.code).emit('game:started');
            console.log(`[Socket] Tournament game auto-started in room ${data.code}`);
            // Start tournament timer (30 min)
            const matchTimeLimit = 1800000;
            (room as any).tournamentGameTimer = setTimeout(async () => {
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

      // If this is a sealed room and both players are here, generate boosters
      if (room.isSealed && room.guestId) {
        try {
          const { generateSealedPool } = await import('@/lib/sealed/boosterGenerator');
          const count = room.sealedBoosterCount ?? 6;
          const hostPool = generateSealedPool(count);
          const guestPool = generateSealedPool(count);

          // Send boosters to each player
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

          // Start sealed timer (15 minutes)
          const deadline = Date.now() + SEALED_TIMEOUT_MS;
          room.sealedDeadline = deadline;
          io.to(data.code).emit('sealed:timer-start', { deadline, durationMs: SEALED_TIMEOUT_MS });

          room.sealedTimer = setTimeout(() => {
            // Time's up - check if both decks submitted
            if (!room.hostDeck || !room.guestDeck) {
              console.log(`[Socket] Sealed time expired for room ${data.code}`);
              io.to(data.code).emit('sealed:time-expired');
              // Clean up room
              if (room.sealedTimer) clearTimeout(room.sealedTimer);
              room.sealedTimer = null;
            }
          }, SEALED_TIMEOUT_MS);
        } catch (err) {
          console.error(`[Socket] Sealed booster generation error:`, err);
          io.to(data.code).emit('room:error', { message: 'Failed to generate sealed boosters' });
        }
      }
    });

    // Submit deck selection (works for both normal and sealed)
    // Player wants to change their deck (before game starts)
    socket.on('room:change-deck', () => {
      const code = playerRooms.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room || room.gameState) return; // Can't change deck after game started

      if (socket.id === room.hostSocket) {
        room.hostDeck = null;
      } else if (socket.id === room.guestSocket) {
        room.guestDeck = null;
      }

      // Notify the other player that this player is changing deck
      const otherSocket = socket.id === room.hostSocket ? room.guestSocket : room.hostSocket;
      if (otherSocket) {
        io.to(otherSocket).emit('room:opponent-changing-deck');
      }
      console.log(`[Socket] Player ${socket.id} changing deck in room ${code}`);
    });

    socket.on('room:select-deck', async (data: {
      characters: CharacterCard[];
      missions: MissionCard[];
    }) => {
      const code = playerRooms.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room) return;

      // Enforce ban list for ranked games (skip tournament rooms — they have their own validation)
      if ((room.isRanked || room.gameMode === 'ranked') && !room.tournamentId) {
        try {
          const banned = await getBannedCards();
          if (banned.size > 0) {
            const foundBanned: Array<{ cardId: string; reason: string | null }> = [];
            for (const c of data.characters) {
              if (banned.has(c.id)) foundBanned.push({ cardId: c.id, reason: banned.get(c.id) ?? null });
            }
            for (const m of data.missions) {
              if (banned.has(m.id)) foundBanned.push({ cardId: m.id, reason: banned.get(m.id) ?? null });
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
          // Don't block the game if ban check fails
        }
      }

      if (socket.id === room.hostSocket) {
        room.hostDeck = data;
      } else if (socket.id === room.guestSocket) {
        room.guestDeck = data;
      }

      // Clear sealed timer when a deck is submitted in sealed mode
      if (room.isSealed) {
        // Notify the other player that this player is ready
        const otherSocket = socket.id === room.hostSocket ? room.guestSocket : room.hostSocket;
        if (otherSocket) {
          io.to(otherSocket).emit('sealed:opponent-ready');
        }
      }

      // Check if both players have selected decks
      if (room.hostDeck && room.guestDeck) {
        // Clear sealed timer since both decks are in
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
        };

        room.gameState = GameEngine.createGame(config);
        // replayInitialState will be captured AFTER mulligans complete (deterministic point)
        room.replayInitialState = null;


        console.log(`[Socket] Game created, phase: ${room.gameState.phase}, activePlayer: ${room.gameState.activePlayer}`);
        console.log(`[Socket] P1 hand: ${room.gameState.player1.hand.length}, P2 hand: ${room.gameState.player2.hand.length}`);

        // Fetch player usernames for display
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
          // If DB lookup fails, fall back to default names
        }
        room.hostName = hostName;
        room.guestName = guestName;

        // Send filtered visible state to each player
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

        // Start action timer once game reaches action phase
        // (mulligan phase doesn't use the timer - timer starts on first action phase)
        if (room.gameState.phase === 'action') {
          startActionTimer(room, code, io);
        }

        // Tournament game timer: 30 min total game time
        if (room.tournamentId && room.tournamentMatchId) {
          const matchTimeLimit = 1800000; // 30 min default
          const tournamentGameDeadline = Date.now() + matchTimeLimit;
          io.to(code).emit('game:tournament-deadline', { deadline: tournamentGameDeadline, durationMs: matchTimeLimit });

          // Store timer reference on room for cleanup
          (room as any).tournamentGameTimer = setTimeout(async () => {
            if (!rooms.has(code)) return;
            if (!room.gameState || room.gameState.phase === 'gameOver') return;

            console.log(`[Socket] Tournament game timer expired in room ${code}`);
            // Determine winner by score, then edge token
            const p1Score = room.gameState.player1.missionPoints;
            const p2Score = room.gameState.player2.missionPoints;
            let loser: 'player1' | 'player2';
            if (p1Score !== p2Score) {
              loser = p1Score > p2Score ? 'player2' : 'player1';
            } else {
              // Equal scores → edge token holder wins
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
        // Notify opponent that this player has (re-)selected their deck
        const otherSocket = socket.id === room.hostSocket ? room.guestSocket : room.hostSocket;
        if (otherSocket) {
          io.to(otherSocket).emit('room:opponent-deck-ready');
        }
      }
    });

    // State resync request - client can request current state if they think they're stuck
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

    // Coin flip synchronization — both players must finish the animation before mulligan appears
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
        // Reset for potential rematch
        room.coinFlipDone = { player1: false, player2: false };
      }
    });

    // Game action
    socket.on('action:perform', async (data: { action: GameAction }) => {
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

      // Determine which player this socket is
      const player = socket.id === room.hostSocket ? 'player1' : 'player2';
      console.log(`[Socket] action:perform from ${player}: ${data.action.type}, phase: ${room.gameState.phase}`);

      // Validate it's this player's turn (or they have pending actions to resolve)
      const hasPendingAction = room.gameState.pendingActions.some((p: { player: string }) => p.player === player);
      if (room.gameState.activePlayer !== player && !hasPendingAction) {
        if (room.gameState.phase === 'action') {
          console.log(`[Socket] Rejected action from ${player}: not their turn`);
          socket.emit('game:error', { message: 'Not your turn' });
          return;
        }
      }

      try {
        // Save old log length to detect silently rejected actions
        const oldLogLength = room.gameState.log.length;
        const prevState = room.gameState;

        // Apply action server-side (authoritative)
        const prevPhase = room.gameState.phase;
        room.gameState = GameEngine.applyAction(
          room.gameState,
          player,
          data.action,
        );

        // Capture replay initial state when mulligans complete (deterministic snapshot)
        if (prevPhase === 'mulligan' && room.gameState.phase !== 'mulligan' && !room.replayInitialState) {
          room.replayInitialState = deepClone(room.gameState);
          room.replayInitialState.actionHistory = [];
          room.gameState.actionHistory = [];
        }

        // Detect silently rejected actions (validation failed, state unchanged)
        const isPlayAction = ['PLAY_CHARACTER', 'PLAY_HIDDEN', 'UPGRADE_CHARACTER', 'REVEAL_CHARACTER'].includes(data.action.type);
        const isTargetAction = data.action.type === 'SELECT_TARGET';

        // SELECT_TARGET silent failure: only flag if truly nothing changed at all.
        // Compare pending effect types/IDs (not just count) to avoid false positives when
        // CONFIRM popups resolve to child selections (count stays same but content changes).
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
          // Action was rejected - get the specific validation reason
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
          // Broadcast unchanged state so client resets isProcessing
          broadcastState(room, io);
          return;
        }

        console.log(`[Socket] Action applied, new phase: ${room.gameState.phase}, activePlayer: ${room.gameState.activePlayer}`);

        // Reset consecutive timeouts for this player (they acted voluntarily)
        if (data.action.type !== 'PASS' || room.gameState.consecutiveTimeouts[player] === 0) {
          room.gameState.consecutiveTimeouts[player] = 0;
        }

        // Broadcast updated visible state to each player
        broadcastState(room, io);

        // Broadcast the action for narration
        io.to(code).emit('game:action-performed', {
          player,
          action: data.action,
        });

        // Check game over
        const winner = GameEngine.getWinner(room.gameState);
        if (winner) {
          await finalizeGameEnd(room, code, io, 'score');
        } else if (room.gameState.missionScoringComplete) {
          // Mission scoring done - wait briefly so clients see SCORE results, then auto-advance
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
                // End-phase effects need resolution (e.g., Giant Spider 103, Rock Lee 117)
                startEffectTimer(room, code, io);
              }
            } catch (err) {
              console.error('[Socket] Auto-advance error:', err instanceof Error ? err.message : err);
            }
          }, 1500);
        } else if (room.gameState.phase === 'action' && room.gameState.pendingForcedResolver) {
          // Opponent must respond to a forced choice - start their timer, pause active player's
          startForcedResolverTimer(room, code, io);
        } else if (room.gameState.phase === 'action' && (room.gameState.pendingEffects.length > 0 || room.gameState.pendingActions.length > 0)) {
          // Pending effect resolution — 60 second timer
          startEffectTimer(room, code, io);
        } else if (room.gameState.phase === 'action') {
          // Restart timer for next active player
          startActionTimer(room, code, io);
        } else if (room.gameState.phase === 'mission' && room.gameState.pendingActions.length > 0) {
          // Mission phase pending (SCORE effects, REORDER_DISCARD) — 2 min timer, forfeit on expiry
          startMissionPhaseTimer(room, code, io);
        } else if (room.gameState.phase === 'end' && room.gameState.pendingActions.length > 0) {
          startEffectTimer(room, code, io);
        } else {
          clearActionTimer(room);
        }
      } catch (err) {
        // applyAction uses deepClone internally, so original state is NOT mutated on failure.
        // Broadcast unchanged state to both players so they stay in sync and isProcessing clears.
        broadcastState(room, io);
        socket.emit('game:error', {
          message: err instanceof Error ? err.message : 'Invalid action',
        });
      }
    });

    // Forfeit (manual abandon)
    socket.on('action:forfeit', async (data: { reason: 'abandon' | 'timeout'; roomCode?: string; userId?: string }) => {
      // Try playerRooms first, fall back to roomCode from client
      const code = playerRooms.get(socket.id) || data.roomCode;
      if (!code) return;
      const room = rooms.get(code);
      if (!room || !room.gameState || room.gameState.phase === 'gameOver') return;

      // Determine player — check socket.id first, then userId
      let player: 'player1' | 'player2';
      if (socket.id === room.hostSocket) player = 'player1';
      else if (socket.id === room.guestSocket) player = 'player2';
      else if (data.userId === room.hostId) { player = 'player1'; room.hostSocket = socket.id; playerRooms.set(socket.id, code); }
      else if (data.userId === room.guestId) { player = 'player2'; room.guestSocket = socket.id; playerRooms.set(socket.id, code); }
      else return;
      console.log(`[Socket] Forfeit from ${player} in room ${code}, reason: ${data.reason}`);

      room.gameState = GameEngine.applyAction(room.gameState, player, {
        type: 'FORFEIT',
        reason: data.reason,
      });

      broadcastState(room, io);
      await finalizeGameEnd(room, code, io, data.reason === 'timeout' ? 'timeout' : 'forfeit');
    });

    // Room list request (for public room browser)
    socket.on('room:list', () => {
      socket.emit('room:list-update', getPublicRoomList());
    });

    // --- Rematch ---
    socket.on('game:rematch-offer', () => {
      const code = playerRooms.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room || !room.gameState || room.gameState.phase !== 'gameOver') return;

      const offerer = socket.id === room.hostSocket ? 'player1' : 'player2';
      room.rematchOffer = offerer;

      // Forward to opponent
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

      console.log(`[Socket] Rematch accepted in room ${code}, redirecting to deck select (sealed: ${room.isSealed})`);
      room.rematchOffer = undefined;

      // Reset room state — players must re-select decks
      room.gameState = null;
      room.hostDeck = null;
      room.guestDeck = null;
      room.replayInitialState = null;
      room.coinFlipDone = { player1: false, player2: false };
      clearActionTimer(room);

      // Tell both clients to go back to deck selection (or booster opening for sealed)
      if (room.hostSocket) {
        io.to(room.hostSocket).emit('game:rematch-accepted');
        io.to(room.hostSocket).emit('game:rematch-reselect', { roomCode: code, isSealed: room.isSealed });
      }
      if (room.guestSocket) {
        io.to(room.guestSocket).emit('game:rematch-accepted');
        io.to(room.guestSocket).emit('game:rematch-reselect', { roomCode: code, isSealed: room.isSealed });
      }

      // For sealed rooms, regenerate boosters for both players
      if (room.isSealed) {
        try {
          const { generateSealedPool } = await import('@/lib/sealed/boosterGenerator');
          const count = room.sealedBoosterCount ?? 6;
          const hostPool = generateSealedPool(count);
          const guestPool = generateSealedPool(count);

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

          // Start sealed timer
          const deadline = Date.now() + SEALED_TIMEOUT_MS;
          room.sealedDeadline = deadline;
          const roomCode = code;
          io.to(roomCode).emit('sealed:timer-start', { deadline, durationMs: SEALED_TIMEOUT_MS });

          room.sealedTimer = setTimeout(() => {
            if (!room.hostDeck || !room.guestDeck) {
              console.log(`[Socket] Sealed rematch time expired for room ${roomCode}`);
              io.to(roomCode).emit('sealed:time-expired');
              if (room.sealedTimer) clearTimeout(room.sealedTimer);
              room.sealedTimer = null;
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

    // Matchmaking
    socket.on('matchmaking:join', (data: { userId: string; isRanked?: boolean; hostName?: string }) => {
      if (isMaintenanceActive()) {
        socket.emit('game:error', { message: 'Maintenance', errorKey: 'game.error.maintenanceNoNewGames' });
        return;
      }

      console.log(`[Socket] User ${data.userId} joining matchmaking (ranked: ${data.isRanked ?? true})`);
      const wantRanked = data.isRanked ?? true;

      // Clean up any existing room/matchmaking state for this player
      cleanupPlayerRoom(socket);

      // Also clean stale rooms before searching
      cleanupStaleRooms();

      // Find an available public room with matching ranked preference
      // Verify the host socket is still connected before matching
      let foundRoom: RoomData | null = null;
      for (const [code, room] of rooms) {
        if (!room.isPrivate && !room.guestId && room.hostId !== data.userId && room.isRanked === wantRanked) {
          // Verify host socket is still live
          const hostSocketObj = io.sockets.sockets.get(room.hostSocket);
          if (hostSocketObj && hostSocketObj.connected) {
            foundRoom = room;
            break;
          } else {
            // Stale room - host disconnected without cleanup
            console.log(`[Socket] Matchmaking: removing stale room ${code} (host socket disconnected)`);
            rooms.delete(code);
            playerRooms.delete(room.hostSocket);
          }
        }
      }

      if (foundRoom) {
        console.log(`[Socket] Matchmaking: found room ${foundRoom.code} for user ${data.userId}`);
        // Join existing room
        foundRoom.guestId = data.userId;
        foundRoom.guestSocket = socket.id;
        playerRooms.set(socket.id, foundRoom.code);
        socket.join(foundRoom.code);

        io.to(foundRoom.code).emit('room:player-joined', {
          hostId: foundRoom.hostId,
          guestId: foundRoom.guestId,
        });

        // Send matchmaking:found with role info so both players know who they are
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
        // Create a new public room
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
          replayInitialState: null,
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

      // Only remove if waiting (no guest yet) and not a started game
      if (!room.guestId && !room.gameState) {
        const wasPublic = !room.isPrivate;
        rooms.delete(code);
        playerRooms.delete(socket.id);
        socket.leave(code);
        console.log(`[Socket] Matchmaking: user left queue, room ${code} removed`);
        if (wasPublic) broadcastRoomList(io);
      }
    });

    // Disconnect
    // ═══════ SPECTATOR EVENTS ═══════

    socket.on('spectate:join', (data: { roomCode: string; userId: string; username: string }) => {
      const room = rooms.get(data.roomCode);
      if (!room || !room.gameState) {
        socket.emit('spectate:error', { message: 'Game not found or not in progress' });
        return;
      }
      // Add spectator
      room.spectators.set(socket.id, { socketId: socket.id, userId: data.userId, username: data.username });
      socket.join(data.roomCode);
      // Track spectator socket for cleanup
      playerRooms.set(socket.id, `spec:${data.roomCode}`);

      // Send current state (spectators see face-down hands + board, no card data)
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
        // Send chat history
        socket.emit('chat:history', { messages: room.chatMessages.slice(-50) });
      } catch (err) {
        console.error('[Socket] Spectator state error:', err);
      }

      // Notify room
      const count = room.spectators.size;
      io.to(data.roomCode).emit('spectate:count-update', { count });

      // Broadcast system chat message
      const joinMsg = {
        id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        userId: 'system', username: 'System',
        message: `${data.username} joined as spectator`,
        isEmote: false, isSpectator: false, timestamp: Date.now(),
      };
      room.chatMessages.push(joinMsg);
      io.to(data.roomCode).emit('chat:message', joinMsg);
    });

    // Spectator can re-request state (e.g. after page navigation)
    socket.on('spectate:request-state', (data: { roomCode: string }) => {
      const room = rooms.get(data.roomCode);
      if (!room || !room.gameState) {
        socket.emit('spectate:error', { message: 'Game not found or not in progress' });
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
        io.to(roomCode).emit('spectate:count-update', { count: room.spectators.size });
        if (spec) {
          const leaveMsg = {
            id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            userId: 'system', username: 'System',
            message: `${spec.username} left`,
            isEmote: false, isSpectator: false, timestamp: Date.now(),
          };
          room.chatMessages.push(leaveMsg);
          io.to(roomCode).emit('chat:message', leaveMsg);
        }
      }
      playerRooms.delete(socket.id);
    });

    // ═══════ CHAT EVENTS ═══════

    socket.on('chat:send', async (data: { message: string; isEmote: boolean }) => {
      if (!data.message || data.message.length > 200) return;

      // Find room — player or spectator
      let roomCode = playerRooms.get(socket.id);
      let isSpectator = false;
      if (roomCode?.startsWith('spec:')) {
        roomCode = roomCode.slice(5);
        isSpectator = true;
      }
      if (!roomCode) return;
      const room = rooms.get(roomCode);
      if (!room) return;

      // Determine user info
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

      // Check chat ban
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
          // Ban expired — clear it
          await prisma.user.update({ where: { id: userId }, data: { chatBanned: false, chatBanUntil: null } });
        }
      } catch { /* ignore ban check errors */ }

      const chatMsg = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        userId, username,
        message: data.message.trim(),
        isEmote: data.isEmote,
        isSpectator,
        timestamp: Date.now(),
      };

      room.chatMessages.push(chatMsg);
      // Keep only last 100 messages in memory
      if (room.chatMessages.length > 100) room.chatMessages = room.chatMessages.slice(-100);

      // Persist to DB (fire-and-forget)
      prisma.chatMessage.create({
        data: {
          roomCode, userId, username,
          message: chatMsg.message,
          isEmote: chatMsg.isEmote,
          isSpectator,
        },
      }).catch(() => {});

      // Trigger cleanup (rate-limited to 1x/hour)
      import('@/lib/db/chatCleanup').then(m => m.cleanupOldChatMessages()).catch(() => {});

      // Broadcast rules:
      // - Player messages → everyone (players + spectators)
      // - Spectator messages → spectators only (players don't see)
      if (isSpectator) {
        for (const [, spec] of room.spectators) {
          io.to(spec.socketId).emit('chat:message', chatMsg);
        }
      } else {
        // Send to players
        if (room.hostSocket) io.to(room.hostSocket).emit('chat:message', chatMsg);
        if (room.guestSocket) io.to(room.guestSocket).emit('chat:message', chatMsg);
        // Send to spectators too
        for (const [, spec] of room.spectators) {
          io.to(spec.socketId).emit('chat:message', chatMsg);
        }
      }
    });

    // ═══════ ACTIVE GAMES LIST ═══════

    socket.on('games:list', () => {
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

    // ═══════ DISCONNECT ═══════

    socket.on('disconnect', () => {
      console.log(`[Socket] Player disconnecting: ${socket.id}`);

      // Handle spectator disconnect
      const specKey = playerRooms.get(socket.id);
      if (specKey?.startsWith('spec:')) {
        const roomCode = specKey.slice(5);
        const room = rooms.get(roomCode);
        if (room) {
          room.spectators.delete(socket.id);
          io.to(roomCode).emit('spectate:count-update', { count: room.spectators.size });
        }
        playerRooms.delete(socket.id);
        removeSocketFromAll(socket.id);
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

          // Handle disconnect during game-over (rematch pending or post-game)
          if (room.gameState && room.gameState.phase === 'gameOver') {
            console.log(`[Socket] ${player} disconnected during gameOver in room ${code}`);
            const opponentSocket = isHost ? room.guestSocket : room.hostSocket;
            if (opponentSocket) {
              // If a rematch was offered, notify the opponent it's declined
              if (room.rematchOffer) {
                room.rematchOffer = undefined;
                io.to(opponentSocket).emit('game:rematch-declined');
              }
              // Notify opponent that the other player left
              io.to(opponentSocket).emit('game:opponent-left');
            }
            // Clean up room since the game is over and a player left
            rooms.delete(code);
          }

          // Handle disconnect during an active game
          else if (room.gameState && room.gameState.phase !== 'gameOver') {
            console.log(`[Socket] ${player} disconnected during game in room ${code}, starting ${DISCONNECT_GRACE_MS / 1000}s grace period`);
            clearActionTimer(room);

            // Notify the opponent that the player disconnected + send countdown deadline
            const disconnectDeadline = Date.now() + DISCONNECT_GRACE_MS;
            const opponentSock = isHost ? room.guestSocket : room.hostSocket;
            if (opponentSock) {
              io.to(opponentSock).emit('game:opponent-disconnected', {
                deadline: disconnectDeadline,
                durationMs: DISCONNECT_GRACE_MS,
              });
            }

            room.disconnectTimer = setTimeout(async () => {
              if (!room.gameState || room.gameState.phase === 'gameOver') return;

              console.log(`[Socket] Grace period expired for ${player} in room ${code}, auto-forfeiting`);
              room.gameState = GameEngine.applyAction(room.gameState, player, {
                type: 'FORFEIT',
                reason: 'abandon',
              });

              broadcastState(room, io);
              await finalizeGameEnd(room, code, io, 'forfeit');
            }, DISCONNECT_GRACE_MS);
          } else if (room.isSealed && room.guestId && !room.gameState) {
            // Sealed pre-game disconnect: use grace period instead of immediate cleanup
            // This allows reconnection during the long deck-building phase
            console.log(`[Socket] ${player} disconnected during sealed deck-building in room ${code}, starting ${DISCONNECT_GRACE_MS / 1000}s grace period`);
            room.disconnectTimer = setTimeout(() => {
              // If the player hasn't reconnected, clean up
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
            // Host disconnected before game started - remove room
            if (!room.gameState) {
              console.log(`[Socket] Host left room ${code} before game started, removing room`);
              const wasPublic = !room.isPrivate;
              rooms.delete(code);
              if (wasPublic) broadcastRoomList(io);
            }
          } else if (room.guestSocket === socket.id) {
            // Guest disconnected before game started - reset guest info
            console.log(`[Socket] Guest left room ${code}, resetting guest`);
            room.guestId = null;
            room.guestSocket = null;
            room.guestDeck = null;
            if (!room.isPrivate && !room.gameState) broadcastRoomList(io);
          }
        }
        playerRooms.delete(socket.id);
      }
      // Clean up user-to-socket mapping
      removeSocketFromAll(socket.id);

      console.log(`[Socket] Player disconnected: ${socket.id}`);
    });
  });
}

// --- Maintenance drain utilities ---

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

  // Broadcast warning to all connected clients
  io.emit('server:maintenance-warning', { activeGames });

  // If no active games, shut down immediately
  if (activeGames === 0) {
    console.log('[Maintenance] No active games. Shutting down now.');
    io.emit('server:maintenance', { timestamp: Date.now() });
    setTimeout(() => process.exit(0), 2000);
    return;
  }

  // Poll every 5s to check when all games finish
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

  // Hard timeout after 5 minutes
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
