'use client';

import { io, Socket } from 'socket.io-client';
import { create } from 'zustand';
import type { VisibleGameState, GameAction } from '@/lib/engine/types';
import { useSocialStore } from '@/stores/socialStore';

const CONNECT_TIMEOUT_MS = 8000;

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
  playerNames: { player1: string; player2: string } | null;

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
  playerNames: null,
  gameResult: null,

  connect: (userId?: string) => {
    return new Promise((resolve, reject) => {
      // If already connected with a live socket, resolve immediately
      const existing = get().socket;
      if (existing?.connected) {
        resolve();
        return;
      }

      // If there's a stale socket that isn't connected, clean it up
      if (existing) {
        existing.removeAllListeners();
        existing.disconnect();
        set({ socket: null, connected: false });
      }

      const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || '';
      console.log('[Socket] Connecting to:', socketUrl || '(same origin)');

      const socket = io(socketUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: CONNECT_TIMEOUT_MS,
      });

      // Timeout for initial connection
      const timeoutId = setTimeout(() => {
        if (!socket.connected) {
          console.error('[Socket] Connection timed out after', CONNECT_TIMEOUT_MS, 'ms');
          socket.disconnect();
          set({ error: 'Connection timed out. Server may be unavailable.' });
          reject(new Error('Socket connection timed out'));
        }
      }, CONNECT_TIMEOUT_MS);

      socket.on('connect', () => {
        clearTimeout(timeoutId);
        console.log('[Socket] Connected:', socket.id);
        set({ connected: true, userId: userId || null, error: null });

        // Register the user with the socket server for social features
        if (userId) {
          socket.emit('auth:register', { userId });
        }

        resolve();
      });

      socket.on('disconnect', (reason) => {
        console.log('[Socket] Disconnected, reason:', reason);
        set({ connected: false });

        // If the server disconnected us, show an error
        if (reason === 'io server disconnect' || reason === 'transport close') {
          set({ error: 'Lost connection to server.' });
        }
      });

      socket.on('reconnect', (attemptNumber: number) => {
        console.log('[Socket] Reconnected after', attemptNumber, 'attempts');
        set({ connected: true, error: null });

        // Re-register user on reconnect
        const uid = get().userId;
        if (uid) {
          socket.emit('auth:register', { userId: uid });
        }
      });

      socket.on('reconnect_failed', () => {
        console.error('[Socket] Reconnection failed after all attempts');
        set({ error: 'Unable to reconnect to server.' });
      });

      socket.on('connect_error', (err) => {
        clearTimeout(timeoutId);
        console.error('[Socket] Connection error:', err.message);
        set({ error: `Connection failed: ${err.message}` });
        reject(new Error(`Socket connection failed: ${err.message}`));
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
        console.log('[Socket] Deck accepted, waiting for opponent');
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
          playerNames?: { player1: string; player2: string };
        }) => {
          console.log('[Socket] State update received, phase:', data.visibleState?.phase,
            'hand size:', data.visibleState?.myState?.hand?.length ?? 0);
          const update: Partial<SocketStore> = {
            visibleState: data.visibleState,
            playerRole: data.playerRole,
          };
          if (data.playerNames) {
            update.playerNames = data.playerNames;
          }
          set(update as SocketStore);
        },
      );

      socket.on('game:error', (data: { message: string }) => {
        console.error('[Socket] Game error:', data.message);
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
          console.log('[Socket] Game ended, winner:', data.winner);
          set({ gameEnded: true, gameResult: data });
        },
      );

      // --- Matchmaking events ---

      socket.on('matchmaking:waiting', () => {
        console.log('[Socket] Matchmaking waiting');
        set({ matchmakingStatus: 'waiting' });
      });

      socket.on('matchmaking:found', (data: { code: string; playerRole?: 'player1' | 'player2' }) => {
        console.log('[Socket] Matchmaking found:', data.code, 'role:', data.playerRole);
        set({
          matchmakingStatus: 'found',
          roomCode: data.code,
          playerRole: data.playerRole || null,
          opponentJoined: true,
        });
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
      socket.removeAllListeners();
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
    const { socket, connected } = get();
    if (socket && connected) {
      console.log('[Socket] Emitting room:create');
      socket.emit('room:create', { userId, isPrivate, isRanked });
    } else {
      console.error('[Socket] Cannot create room: not connected');
      set({ error: 'Not connected to server.' });
    }
  },

  joinRoom: (code: string, userId: string) => {
    const { socket, connected } = get();
    if (socket && connected) {
      console.log('[Socket] Emitting room:join', code);
      socket.emit('room:join', { code, userId });
      set({ roomCode: code, playerRole: 'player2' });
    } else {
      console.error('[Socket] Cannot join room: not connected');
      set({ error: 'Not connected to server.' });
    }
  },

  selectDeck: (characters, missions) => {
    const { socket, connected } = get();
    if (socket && connected) {
      console.log('[Socket] Emitting room:select-deck, characters:', (characters as unknown[]).length, 'missions:', (missions as unknown[]).length);
      socket.emit('room:select-deck', { characters, missions });
    } else {
      console.error('[Socket] Cannot select deck: not connected');
      set({ error: 'Not connected to server.' });
    }
  },

  performAction: (action: GameAction) => {
    const { socket, connected } = get();
    if (socket && connected) {
      console.log('[Socket] Emitting action:perform:', action.type);
      socket.emit('action:perform', { action });
    } else {
      console.error('[Socket] Cannot perform action: not connected');
      set({ error: 'Not connected to server.' });
    }
  },

  joinMatchmaking: (userId: string, isRanked = true) => {
    const { socket, connected } = get();
    if (socket && connected) {
      // Reset state before joining matchmaking to avoid stale data from previous sessions
      set({
        roomCode: null,
        playerRole: null,
        visibleState: null,
        matchmakingStatus: 'idle',
        opponentJoined: false,
        gameStarted: false,
        gameEnded: false,
        gameResult: null,
        playerNames: null,
        error: null,
      });
      console.log('[Socket] Emitting matchmaking:join');
      socket.emit('matchmaking:join', { userId, isRanked });
    } else {
      console.error('[Socket] Cannot join matchmaking: not connected');
      set({ error: 'Not connected to server.' });
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
