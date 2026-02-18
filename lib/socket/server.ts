import type { Server as SocketIOServer, Socket } from 'socket.io';
import { GameEngine } from '@/lib/engine/GameEngine';
import type { GameState, GameAction, CharacterCard, MissionCard, PlayerConfig, GameConfig } from '@/lib/engine/types';
import { registerUserSocket, removeSocketFromAll } from '@/lib/socket/io';
import { prisma } from '@/lib/db/prisma';
import { calculateEloChanges } from '@/lib/elo/elo';

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
}

const rooms = new Map<string, RoomData>();
const playerRooms = new Map<string, string>(); // socketId -> roomCode

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function setupSocketHandlers(io: SocketIOServer) {
  io.on('connection', (socket: Socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Register user identity for targeted notifications
    socket.on('auth:register', (data: { userId: string }) => {
      if (data.userId) {
        registerUserSocket(data.userId, socket.id);
      }
    });

    // Create a room
    socket.on('room:create', (data: { userId: string; isPrivate?: boolean; isRanked?: boolean }) => {
      console.log(`[Socket] Creating room for user ${data.userId}, socket ${socket.id}`);

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
      };

      rooms.set(code, room);
      playerRooms.set(socket.id, code);
      socket.join(code);

      console.log(`[Socket] Room ${code} created by ${data.userId}`);
      socket.emit('room:created', { code });
    });

    // Join a room
    socket.on('room:join', (data: { code: string; userId: string }) => {
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
      });
    });

    // Submit deck selection
    socket.on('room:select-deck', (data: {
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

      // Check if both players have selected decks
      if (room.hostDeck && room.guestDeck) {
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

        // Send filtered visible state to each player
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

        io.to(code).emit('game:started');
      } else {
        socket.emit('room:deck-accepted');
      }
    });

    // Game action
    socket.on('action:perform', async (data: { action: GameAction }) => {
      const code = playerRooms.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room || !room.gameState) return;

      // Determine which player this socket is
      const player = socket.id === room.hostSocket ? 'player1' : 'player2';

      // Validate it's this player's turn
      if (room.gameState.activePlayer !== player && room.gameState.phase === 'action') {
        socket.emit('game:error', { message: 'Not your turn' });
        return;
      }

      try {
        // Apply action server-side (authoritative)
        room.gameState = GameEngine.applyAction(
          room.gameState,
          player,
          data.action,
        );

        // Broadcast updated visible state to each player
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

        // Broadcast the action for narration
        io.to(code).emit('game:action-performed', {
          player,
          action: data.action,
        });

        // Check game over
        const winner = GameEngine.getWinner(room.gameState);
        if (winner) {
          const p1Score = room.gameState.player1.missionPoints;
          const p2Score = room.gameState.player2.missionPoints;

          // Persist game result and apply ELO if ranked
          let eloData: { player1Delta: number; player2Delta: number } | null = null;
          try {
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
                  prisma.game.create({
                    data: {
                      player1Id: room.hostId,
                      player2Id: room.guestId!,
                      isAiGame: false,
                      status: 'completed',
                      winnerId: winner === 'player1' ? room.hostId : room.guestId!,
                      player1Score: p1Score,
                      player2Score: p2Score,
                      eloChange: changes.player1Delta,
                      completedAt: new Date(),
                    },
                  }),
                ]);
              }
            }
          } catch (eloErr) {
            console.error('[Socket] Error persisting game result:', eloErr);
          }

          // Emit to each player separately so they get their own ELO delta
          if (room.hostSocket) {
            io.to(room.hostSocket).emit('game:ended', {
              winner,
              player1Score: p1Score,
              player2Score: p2Score,
              isRanked: room.isRanked,
              eloDelta: eloData?.player1Delta ?? null,
            });
          }
          if (room.guestSocket) {
            io.to(room.guestSocket).emit('game:ended', {
              winner,
              player1Score: p1Score,
              player2Score: p2Score,
              isRanked: room.isRanked,
              eloDelta: eloData?.player2Delta ?? null,
            });
          }
        }
      } catch (err) {
        socket.emit('game:error', {
          message: err instanceof Error ? err.message : 'Invalid action',
        });
      }
    });

    // Matchmaking
    socket.on('matchmaking:join', (data: { userId: string; isRanked?: boolean }) => {
      console.log(`[Socket] User ${data.userId} joining matchmaking (ranked: ${data.isRanked ?? true})`);
      const wantRanked = data.isRanked ?? true;

      // Find an available public room with matching ranked preference
      let foundRoom: RoomData | null = null;
      for (const [, room] of rooms) {
        if (!room.isPrivate && !room.guestId && room.hostId !== data.userId && room.isRanked === wantRanked) {
          foundRoom = room;
          break;
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

        io.to(foundRoom.code).emit('matchmaking:found', {
          code: foundRoom.code,
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

      // Only remove if waiting (no guest yet)
      if (!room.guestId) {
        rooms.delete(code);
        playerRooms.delete(socket.id);
        socket.leave(code);
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

          // Handle disconnect based on player role
          if (room.hostSocket === socket.id) {
            // Host disconnected - remove room if game hasn't started
            if (!room.gameState) {
              console.log(`[Socket] Host left room ${code} before game started, removing room`);
              rooms.delete(code);
            } else {
              console.log(`[Socket] Host left room ${code} during game`);
            }
          } else if (room.guestSocket === socket.id) {
            // Guest disconnected - reset guest info but keep room
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
