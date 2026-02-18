'use client';

import { io, Socket } from 'socket.io-client';
import { create } from 'zustand';
import type { VisibleGameState, GameAction } from '@/lib/engine/types';
import { useSocialStore } from '@/stores/socialStore';

interface SocketStore {
  socket: Socket | null;
  connected: boolean;
  userId: string | null;
  roomCode: string | null;
  playerRole: 'player1' | 'player2' | null;
  visibleState: VisibleGameState | null;
  matchmakingStatus: 'idle' | 'waiting' | 'found';
  error: string | null;
  opponentJoined: boolean;
  gameStarted: boolean;
  gameEnded: boolean;
  gameResult: {
    winner: string;
    player1Score: number;
    player2Score: number;
    isRanked?: boolean;
    eloDelta?: number | null;
  } | null;

  connect: (userId?: string) => Promise<void>;
  disconnect: () => void;
  createRoom: (userId: string, isPrivate?: boolean, isRanked?: boolean) => void;
  joinRoom: (code: string, userId: string) => void;
  selectDeck: (characters: unknown[], missions: unknown[]) => void;
  performAction: (action: GameAction) => void;
  joinMatchmaking: (userId: string, isRanked?: boolean) => void;
  leaveMatchmaking: () => void;
  clearError: () => void;
}

export const useSocketStore = create<SocketStore>((set, get) => ({
  socket: null,
  connected: false,
  userId: null,
  roomCode: null,
  playerRole: null,
  visibleState: null,
  matchmakingStatus: 'idle',
  error: null,
  opponentJoined: false,
  gameStarted: false,
  gameEnded: false,
  gameResult: null,

  connect: (userId?: string) => {
    return new Promise((resolve) => {
      if (get().socket) {
        resolve();
        return;
      }

      const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || '';
      const socket = io(socketUrl, {
        transports: ['websocket', 'polling'],
      });

      socket.on('connect', () => {
        console.log('[Socket] Connected:', socket.id);
        set({ connected: true, userId: userId || null });

        // Register the user with the socket server for social features
        if (userId) {
          socket.emit('auth:register', { userId });
        }
        
        resolve();
      });

      socket.on('disconnect', () => {
        console.log('[Socket] Disconnected');
        set({ connected: false });
      });

      socket.on('connect_error', (err) => {
        console.error('[Socket] Connection error:', err.message);
      });

      // --- Room events ---

      socket.on('room:created', (data: { code: string }) => {
        console.log('[Socket] Room created:', data.code);
        set({ roomCode: data.code, playerRole: 'player1' });
      });

      socket.on('room:player-joined', () => {
        console.log('[Socket] Player joined');
        set({ opponentJoined: true });
      });

      socket.on('room:player-left', () => {
        console.log('[Socket] Player left');
        set({ opponentJoined: false });
      });

      socket.on('room:error', (data: { message: string }) => {
        console.error('[Socket] Room error:', data.message);
        set({ error: data.message });
      });

      socket.on('room:deck-accepted', () => {
        console.log('[Socket] Deck accepted');
        // Waiting for opponent to select deck
      });

      // --- Game events ---

      socket.on('game:started', () => {
        console.log('[Socket] Game started');
        set({ gameStarted: true });
      });

      socket.on(
        'game:state-update',
        (data: {
          visibleState: VisibleGameState;
          playerRole: 'player1' | 'player2';
        }) => {
          set({
            visibleState: data.visibleState,
            playerRole: data.playerRole,
          });
        },
      );

      socket.on('game:error', (data: { message: string }) => {
        set({ error: data.message });
      });

      socket.on(
        'game:ended',
        (data: {
          winner: string;
          player1Score: number;
          player2Score: number;
          isRanked?: boolean;
          eloDelta?: number | null;
        }) => {
          set({ gameEnded: true, gameResult: data });
        },
      );

      // --- Matchmaking events ---

      socket.on('matchmaking:waiting', () => {
        console.log('[Socket] Matchmaking waiting');
        set({ matchmakingStatus: 'waiting' });
      });

      socket.on('matchmaking:found', (data: { code: string }) => {
        console.log('[Socket] Matchmaking found:', data.code);
        set({ matchmakingStatus: 'found', roomCode: data.code });
      });

      // --- Social events (delegated to socialStore) ---

      socket.on('friend:request-received', (data) => {
        useSocialStore.getState().handleFriendRequestReceived(data);
      });

      socket.on('friend:request-accepted', (data) => {
        useSocialStore.getState().handleFriendRequestAccepted(data);
      });

      socket.on('friend:removed', (data) => {
        useSocialStore.getState().handleFriendRemoved(data);
      });

      socket.on('match:invite-received', (data) => {
        useSocialStore.getState().handleMatchInviteReceived(data);
      });

      socket.on('match:invite-accepted', (data) => {
        useSocialStore.getState().handleMatchInviteAccepted(data);
      });

      socket.on('match:invite-declined', (data) => {
        useSocialStore.getState().handleMatchInviteDeclined(data.inviteId);
      });

      socket.on('match:invite-cancelled', (data) => {
        useSocialStore.getState().handleMatchInviteCancelled(data.inviteId);
      });

      set({ socket });
    });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({
        socket: null,
        connected: false,
        userId: null,
        roomCode: null,
        playerRole: null,
        visibleState: null,
        matchmakingStatus: 'idle',
        error: null,
        opponentJoined: false,
        gameStarted: false,
        gameEnded: false,
        gameResult: null,
      });
    }
  },

  createRoom: (userId: string, isPrivate = true, isRanked = false) => {
    const { socket } = get();
    if (socket) {
      console.log('[Socket] Emitting room:create');
      socket.emit('room:create', { userId, isPrivate, isRanked });
    } else {
      console.error('[Socket] Cannot create room: not connected');
    }
  },

  joinRoom: (code: string, userId: string) => {
    const { socket } = get();
    if (socket) {
      console.log('[Socket] Emitting room:join', code);
      socket.emit('room:join', { code, userId });
      set({ roomCode: code, playerRole: 'player2' });
    } else {
      console.error('[Socket] Cannot join room: not connected');
    }
  },

  selectDeck: (characters, missions) => {
    const { socket } = get();
    if (socket) {
      socket.emit('room:select-deck', { characters, missions });
    }
  },

  performAction: (action: GameAction) => {
    const { socket } = get();
    if (socket) {
      socket.emit('action:perform', { action });
    }
  },

  joinMatchmaking: (userId: string, isRanked = true) => {
    const { socket } = get();
    if (socket) {
      console.log('[Socket] Emitting matchmaking:join');
      socket.emit('matchmaking:join', { userId, isRanked });
    } else {
      console.error('[Socket] Cannot join matchmaking: not connected');
    }
  },

  leaveMatchmaking: () => {
    const { socket } = get();
    if (socket) {
      socket.emit('matchmaking:leave');
      set({ matchmakingStatus: 'idle' });
    }
  },

  clearError: () => set({ error: null }),
}));
