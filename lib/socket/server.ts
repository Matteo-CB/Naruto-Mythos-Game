import type { Server as SocketIOServer, Socket } from 'socket.io';
import { GameEngine } from '@/lib/engine/GameEngine';
import type { GameState, GameAction, CharacterCard, MissionCard, PlayerConfig, GameConfig } from '@/lib/engine/types';
import { registerUserSocket, removeSocketFromAll } from '@/lib/socket/io';
import { prisma } from '@/lib/db/prisma';
import { calculateEloChanges } from '@/lib/elo/elo';
import { syncDiscordRole } from '@/lib/discord/roleSync';
import { validatePlayCharacter, validatePlayHidden, validateRevealCharacter, validateUpgradeCharacter } from '@/lib/engine/rules/PlayValidation';
import { calculateEffectiveCost } from '@/lib/engine/rules/ChakraValidation';
import { deepClone } from '@/lib/engine/utils/deepClone';

interface RoomData {
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
  createdAt: number;
  hostName?: string;
  guestName?: string;
  // Timer fields
  actionTimer: ReturnType<typeof setTimeout> | null;
  timerDeadline: number | null;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
  // Replay
  replayInitialState: GameState | null;
  // Draft mode
  isDraft: boolean;
  draftTimer: ReturnType<typeof setTimeout> | null;
  draftDeadline: number | null;
}

const ACTION_TIMEOUT_MS = 120_000; // 2 minutes per action
const MAX_CONSECUTIVE_TIMEOUTS = 3; // 3 timeouts = auto-forfeit
const DISCONNECT_GRACE_MS = 30_000; // 30 seconds before disconnect = forfeit
const DRAFT_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes for draft deck building

const rooms = new Map<string, RoomData>();
const playerRooms = new Map<string, string>(); // socketId -> roomCode
const MATCHMAKING_ROOM_TTL_MS = 5 * 60 * 1000; // 5 min stale room cleanup

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
    if (existingRoom.draftTimer) clearTimeout(existingRoom.draftTimer);
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
 * Periodically clean stale public matchmaking rooms (no guest, no game, TTL expired).
 */
function cleanupStaleRooms(): void {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (!room.isPrivate && !room.guestId && !room.gameState) {
      // Check if host socket is still connected
      // We can't easily check socket liveness here, but we can check TTL
      // Rooms older than TTL without a guest are stale
      if (!room.createdAt || now - room.createdAt > MATCHMAKING_ROOM_TTL_MS) {
        console.log(`[Socket] Cleaning stale matchmaking room ${code}`);
        rooms.delete(code);
        // Clean up playerRooms for the host socket
        if (room.hostSocket) {
          playerRooms.delete(room.hostSocket);
        }
      }
    }
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
  if (!winner) return;

  const p1Score = room.gameState.player1.missionPoints;
  const p2Score = room.gameState.player2.missionPoints;

  let eloData: { player1Delta: number; player2Delta: number } | null = null;
  let gameRecordId: string | null = null;

  try {
    // Apply ELO changes for ranked games
    if (room.isRanked && room.hostId && room.guestId) {
      const player1 = await prisma.user.findUnique({ where: { id: room.hostId } });
      const player2 = await prisma.user.findUnique({ where: { id: room.guestId } });

      if (player1 && player2) {
        const eloResult = winner === 'player1' ? 'player1' : 'player2';
        const changes = calculateEloChanges(player1.elo, player2.elo, eloResult);
        eloData = { player1Delta: changes.player1Delta, player2Delta: changes.player2Delta };

        const p1Stats = winner === 'player1' ? { wins: { increment: 1 } } : { losses: { increment: 1 } };
        const p2Stats = winner === 'player2' ? { wins: { increment: 1 } } : { losses: { increment: 1 } };

        await Promise.all([
          prisma.user.update({
            where: { id: room.hostId },
            data: { elo: changes.player1NewElo, ...p1Stats },
          }),
          prisma.user.update({
            where: { id: room.guestId! },
            data: { elo: changes.player2NewElo, ...p2Stats },
          }),
        ]);

        // Sync Discord roles (fire-and-forget)
        syncDiscordRole(room.hostId).catch(() => {});
        syncDiscordRole(room.guestId!).catch(() => {});
      }
    }

    // Persist game record with replay data included
    if (room.hostId && room.guestId) {
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
          gameState: replayForDb ? JSON.parse(JSON.stringify(replayForDb)) : undefined,
        },
      });
      gameRecordId = gameRecord.id;
    }
  } catch (eloErr) {
    console.error('[Socket] Error persisting game result:', eloErr);
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
      winReason,
      gameId: gameRecordId,
      replayData,
    });
  }
  if (room.guestSocket) {
    io.to(room.guestSocket).emit('game:ended', {
      winner,
      player1Score: p1Score,
      player2Score: p2Score,
      isRanked: room.isRanked,
      eloDelta: eloData?.player2Delta ?? null,
      winReason,
      gameId: gameRecordId,
      replayData,
    });
  }
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

  const activePlayer = room.gameState.activePlayer;
  const targetSocket = activePlayer === 'player1' ? room.hostSocket : room.guestSocket;

  const deadline = Date.now() + ACTION_TIMEOUT_MS;
  room.timerDeadline = deadline;

  // Notify the active player of the deadline
  if (targetSocket) {
    io.to(targetSocket).emit('game:action-deadline', { deadline });
  }

  room.actionTimer = setTimeout(async () => {
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
      // Auto-pass
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
        // Mission scoring done — auto-advance after brief pause
        setTimeout(async () => {
          if (!room.gameState || !room.gameState.missionScoringComplete) return;
          room.gameState = GameEngine.applyAction(room.gameState, 'player1', { type: 'ADVANCE_PHASE' });
          broadcastState(room, io);
          const winnerAfterEnd = GameEngine.getWinner(room.gameState);
          if (winnerAfterEnd) {
            await finalizeGameEnd(room, code, io, 'score');
          } else if (room.gameState.phase === 'action') {
            startActionTimer(room, code, io);
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
 * Broadcast visible state to both players.
 */
function broadcastState(room: RoomData, io: SocketIOServer): void {
  if (!room.gameState) return;
  const p1State = GameEngine.getVisibleState(room.gameState, 'player1');
  const p2State = GameEngine.getVisibleState(room.gameState, 'player2');

  if (room.hostSocket) {
    io.to(room.hostSocket).emit('game:state-update', {
      visibleState: p1State,
      playerRole: 'player1',
    });
  }
  if (room.guestSocket) {
    io.to(room.guestSocket).emit('game:state-update', {
      visibleState: p2State,
      playerRole: 'player2',
    });
  }
}

export function setupSocketHandlers(io: SocketIOServer) {
  // Periodic cleanup of stale matchmaking rooms (every 60 seconds)
  setInterval(() => cleanupStaleRooms(), 60_000);

  io.on('connection', (socket: Socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Register user identity for targeted notifications
    socket.on('auth:register', (data: { userId: string }) => {
      if (data.userId) {
        registerUserSocket(data.userId, socket.id);
      }
    });

    // Create a room
    socket.on('room:create', (data: { userId: string; isPrivate?: boolean; isRanked?: boolean; isDraft?: boolean }) => {
      console.log(`[Socket] Creating room for user ${data.userId}, socket ${socket.id}`);

      // Clean up any existing room this player might be in
      cleanupPlayerRoom(socket);

      let code: string;
      do {
        code = generateRoomCode();
      } while (rooms.has(code));

      const room: RoomData = {
        code,
        hostId: data.userId,
        hostSocket: socket.id,
        guestId: null,
        guestSocket: null,
        gameState: null,
        hostDeck: null,
        guestDeck: null,
        isPrivate: data.isPrivate ?? true,
        isRanked: data.isRanked ?? false,
        createdAt: Date.now(),
        actionTimer: null,
        timerDeadline: null,
        disconnectTimer: null,
        replayInitialState: null,
        isDraft: data.isDraft ?? false,
        draftTimer: null,
        draftDeadline: null,
      };

      rooms.set(code, room);
      playerRooms.set(socket.id, code);
      socket.join(code);

      console.log(`[Socket] Room ${code} created by ${data.userId}${room.isDraft ? ' (DRAFT)' : ''}`);
      socket.emit('room:created', { code, isDraft: room.isDraft });
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

      // Check if user is already the host
      if (room.hostId === data.userId) {
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

      console.log(`[Socket] User ${data.userId} joined room ${data.code}`);
      io.to(data.code).emit('room:player-joined', {
        hostId: room.hostId,
        guestId: room.guestId,
        isDraft: room.isDraft,
      });

      // If this is a draft room and both players are here, generate boosters
      if (room.isDraft && room.guestId) {
        try {
          const { generateDraftPool } = await import('@/lib/draft/boosterGenerator');
          const hostPool = generateDraftPool(6);
          const guestPool = generateDraftPool(6);

          // Send boosters to each player
          if (room.hostSocket) {
            io.to(room.hostSocket).emit('draft:boosters', {
              boosters: hostPool.boosters,
              allCards: hostPool.allCards,
            });
          }
          io.to(socket.id).emit('draft:boosters', {
            boosters: guestPool.boosters,
            allCards: guestPool.allCards,
          });

          console.log(`[Socket] Draft boosters generated for room ${data.code}`);

          // Start draft timer (15 minutes)
          const deadline = Date.now() + DRAFT_TIMEOUT_MS;
          room.draftDeadline = deadline;
          io.to(data.code).emit('draft:timer-start', { deadline, durationMs: DRAFT_TIMEOUT_MS });

          room.draftTimer = setTimeout(() => {
            // Time's up - check if both decks submitted
            if (!room.hostDeck || !room.guestDeck) {
              console.log(`[Socket] Draft time expired for room ${data.code}`);
              io.to(data.code).emit('draft:time-expired');
              // Clean up room
              if (room.draftTimer) clearTimeout(room.draftTimer);
              room.draftTimer = null;
            }
          }, DRAFT_TIMEOUT_MS);
        } catch (err) {
          console.error(`[Socket] Draft booster generation error:`, err);
          io.to(data.code).emit('room:error', { message: 'Failed to generate draft boosters' });
        }
      }
    });

    // Submit deck selection (works for both normal and draft)
    socket.on('room:select-deck', async (data: {
      characters: CharacterCard[];
      missions: MissionCard[];
    }) => {
      const code = playerRooms.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room) return;

      if (socket.id === room.hostSocket) {
        room.hostDeck = data;
      } else if (socket.id === room.guestSocket) {
        room.guestDeck = data;
      }

      // Clear draft timer when a deck is submitted in draft mode
      if (room.isDraft) {
        // Notify the other player that this player is ready
        const otherSocket = socket.id === room.hostSocket ? room.guestSocket : room.hostSocket;
        if (otherSocket) {
          io.to(otherSocket).emit('draft:opponent-ready');
        }
      }

      // Check if both players have selected decks
      if (room.hostDeck && room.guestDeck) {
        // Clear draft timer since both decks are in
        if (room.draftTimer) {
          clearTimeout(room.draftTimer);
          room.draftTimer = null;
          room.draftDeadline = null;
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

        // Start action timer once game reaches action phase
        // (mulligan phase doesn't use the timer — timer starts on first action phase)
        if (room.gameState.phase === 'action') {
          startActionTimer(room, code, io);
        }
      } else {
        const who = socket.id === room.hostSocket ? 'host' : 'guest';
        console.log(`[Socket] Deck accepted from ${who} in room ${code}, waiting for other player`);
        socket.emit('room:deck-accepted');
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

        // Detect silently rejected play actions (validation failed, state unchanged)
        const isPlayAction = ['PLAY_CHARACTER', 'PLAY_HIDDEN', 'UPGRADE_CHARACTER', 'REVEAL_CHARACTER'].includes(data.action.type);
        if (isPlayAction && room.gameState.log.length === oldLogLength) {
          // Action was rejected — get the specific validation reason
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
          // Mission scoring done — wait briefly so clients see SCORE results, then auto-advance
          clearActionTimer(room);
          setTimeout(async () => {
            if (!room.gameState || !room.gameState.missionScoringComplete) return;
            room.gameState = GameEngine.applyAction(room.gameState, 'player1', { type: 'ADVANCE_PHASE' });
            broadcastState(room, io);

            const winnerAfterEnd = GameEngine.getWinner(room.gameState);
            if (winnerAfterEnd) {
              await finalizeGameEnd(room, code, io, 'score');
            } else if (room.gameState.phase === 'action') {
              startActionTimer(room, code, io);
            }
          }, 1500);
        } else if (room.gameState.phase === 'action') {
          // Restart timer for next active player
          startActionTimer(room, code, io);
        } else {
          // Phase changed (mission, end, etc.) — clear timer
          clearActionTimer(room);
        }
      } catch (err) {
        socket.emit('game:error', {
          message: err instanceof Error ? err.message : 'Invalid action',
        });
      }
    });

    // Forfeit (manual abandon)
    socket.on('action:forfeit', async (data: { reason: 'abandon' | 'timeout' }) => {
      const code = playerRooms.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room || !room.gameState || room.gameState.phase === 'gameOver') return;

      const player = socket.id === room.hostSocket ? 'player1' : 'player2';
      console.log(`[Socket] Forfeit from ${player} in room ${code}, reason: ${data.reason}`);

      room.gameState = GameEngine.applyAction(room.gameState, player, {
        type: 'FORFEIT',
        reason: data.reason,
      });

      broadcastState(room, io);
      await finalizeGameEnd(room, code, io, data.reason === 'timeout' ? 'timeout' : 'forfeit');
    });

    // Matchmaking
    socket.on('matchmaking:join', (data: { userId: string; isRanked?: boolean }) => {
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
            // Stale room — host disconnected without cleanup
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
          guestId: null,
          guestSocket: null,
          gameState: null,
          hostDeck: null,
          guestDeck: null,
          isPrivate: false,
          isRanked: wantRanked,
          createdAt: Date.now(),
          actionTimer: null,
          timerDeadline: null,
          disconnectTimer: null,
          replayInitialState: null,
          isDraft: false,
          draftTimer: null,
          draftDeadline: null,
        };

        rooms.set(code, room);
        playerRooms.set(socket.id, code);
        socket.join(code);

        socket.emit('matchmaking:waiting');
      }
    });

    socket.on('matchmaking:leave', () => {
      const code = playerRooms.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room) return;

      // Only remove if waiting (no guest yet) and not a started game
      if (!room.guestId && !room.gameState) {
        rooms.delete(code);
        playerRooms.delete(socket.id);
        socket.leave(code);
        console.log(`[Socket] Matchmaking: user left queue, room ${code} removed`);
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`[Socket] Player disconnecting: ${socket.id}`);

      const code = playerRooms.get(socket.id);
      if (code) {
        const room = rooms.get(code);
        if (room) {
          io.to(code).emit('room:player-left', { socketId: socket.id });
          console.log(`[Socket] Player ${socket.id} left room ${code}`);

          const isHost = room.hostSocket === socket.id;
          const player = isHost ? 'player1' : 'player2';

          // Handle disconnect during an active game
          if (room.gameState && room.gameState.phase !== 'gameOver') {
            console.log(`[Socket] ${player} disconnected during game in room ${code}, starting ${DISCONNECT_GRACE_MS / 1000}s grace period`);
            clearActionTimer(room);

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
          } else if (isHost) {
            // Host disconnected before game started - remove room
            if (!room.gameState) {
              console.log(`[Socket] Host left room ${code} before game started, removing room`);
              rooms.delete(code);
            }
          } else if (room.guestSocket === socket.id) {
            // Guest disconnected before game started - reset guest info
            console.log(`[Socket] Guest left room ${code}, resetting guest`);
            room.guestId = null;
            room.guestSocket = null;
            room.guestDeck = null;
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
