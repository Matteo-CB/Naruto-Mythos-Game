import type { Server as SocketIOServer, Socket } from 'socket.io';
import { GameEngine } from '@/lib/engine/GameEngine';
import type { GameState, GameAction, CharacterCard, MissionCard, PlayerConfig, GameConfig } from '@/lib/engine/types';
import { registerUserSocket, removeSocketFromAll } from '@/lib/socket/io';

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
    socket.on('room:create', (data: { userId: string; isPrivate?: boolean }) => {
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
      };

      rooms.set(code, room);
      playerRooms.set(socket.id, code);
      socket.join(code);

      socket.emit('room:created', { code });
    });

    // Join a room
    socket.on('room:join', (data: { code: string; userId: string }) => {
      const room = rooms.get(data.code);
      if (!room) {
        socket.emit('room:error', { message: 'Room not found' });
        return;
      }

      if (room.guestId) {
        socket.emit('room:error', { message: 'Room is full' });
        return;
      }

      room.guestId = data.userId;
      room.guestSocket = socket.id;
      playerRooms.set(socket.id, data.code);
      socket.join(data.code);

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
    socket.on('action:perform', (data: { action: GameAction }) => {
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
          io.to(code).emit('game:ended', {
            winner,
            player1Score: room.gameState.player1.missionPoints,
            player2Score: room.gameState.player2.missionPoints,
          });
        }
      } catch (err) {
        socket.emit('game:error', {
          message: err instanceof Error ? err.message : 'Invalid action',
        });
      }
    });

    // Matchmaking
    socket.on('matchmaking:join', (data: { userId: string }) => {
      // Find an available public room
      let foundRoom: RoomData | null = null;
      for (const [, room] of rooms) {
        if (!room.isPrivate && !room.guestId && room.hostId !== data.userId) {
          foundRoom = room;
          break;
        }
      }

      if (foundRoom) {
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
      const code = playerRooms.get(socket.id);
      if (code) {
        const room = rooms.get(code);
        if (room) {
          io.to(code).emit('room:player-left', { socketId: socket.id });

          // Clean up room if game hasn't started
          if (!room.gameState) {
            rooms.delete(code);
          }
        }
        playerRooms.delete(socket.id);
      }
      // Clean up user-to-socket mapping
      removeSocketFromAll(socket.id);

      console.log(`Player disconnected: ${socket.id}`);
    });
  });
}
