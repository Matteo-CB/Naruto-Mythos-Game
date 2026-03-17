'use client';

import { io, Socket } from 'socket.io-client';
import { create } from 'zustand';
import type { VisibleGameState, GameAction } from '@/lib/engine/types';
import { useSocialStore } from '@/stores/socialStore';
import { useUIStore } from '@/stores/uiStore';

const CONNECT_TIMEOUT_MS = 8000;

interface PublicRoom {
  code: string;
  hostName: string;
  gameMode: string;
  createdAt: number;
}

interface SocketStore {
  socket: Socket | null;
  connected: boolean;
  userId: string | null;
  roomCode: string | null;
  playerRole: 'player1' | 'player2' | null;
  visibleState: VisibleGameState | null;
  matchmakingStatus: 'idle' | 'waiting' | 'found';
  error: string | null;
  errorKey: string | null;
  errorParams: Record<string, string | number> | null;
  opponentJoined: boolean;
  gameStarted: boolean;
  gameEnded: boolean;
  gameResult: {
    winner: string;
    player1Score: number;
    player2Score: number;
    isRanked?: boolean;
    eloDelta?: number | null;
    newElo?: number;
    totalGames?: number;
    winReason?: 'score' | 'forfeit' | 'timeout';
    gameId?: string;
    replayData?: unknown;
  } | null;
  playerNames: { player1: string; player2: string } | null;
  actionDeadline: number | null;

  // Public room browser
  publicRooms: PublicRoom[];

  // Maintenance
  maintenanceWarning: boolean;

  // Rematch state
  rematchState: 'none' | 'offered' | 'received' | 'accepted' | 'declined';

  // Sealed state
  isSealedRoom: boolean;
  sealedBoosters: unknown[] | null;
  sealedAllCards: unknown[] | null;
  sealedDeckSubmitted: boolean;
  sealedOpponentReady: boolean;
  sealedDeadline: number | null;

  // Internal: online resync watchdog
  _lastStateUpdate: number;
  _resyncTimer: ReturnType<typeof setInterval> | null;

  connect: (userId?: string) => Promise<void>;
  disconnect: () => void;
  createRoom: (userId: string, isPrivate?: boolean, isRanked?: boolean, isSealed?: boolean, gameMode?: 'casual' | 'ranked' | 'sealed', hostName?: string, sealedBoosterCount?: 4 | 5 | 6, timerEnabled?: boolean) => void;
  joinRoom: (code: string, userId: string) => void;
  selectDeck: (characters: unknown[], missions: unknown[]) => void;
  changeDeck: () => void;
  opponentChangingDeck: boolean;
  performAction: (action: GameAction) => void;
  joinMatchmaking: (userId: string, isRanked?: boolean) => void;
  leaveMatchmaking: () => void;
  requestRoomList: () => void;
  offerRematch: () => void;
  acceptRematch: () => void;
  declineRematch: () => void;
  coinFlipDone: () => void;
  clearError: () => void;
  forfeit: (reason: 'abandon' | 'timeout') => void;

  // Spectator
  isSpectating: boolean;
  spectatingRoomCode: string | null;
  spectatorCount: number;
  spectateGame: (roomCode: string, userId: string, username: string) => void;
  leaveSpectating: () => void;

  // Chat
  chatMessages: Array<{ id: string; userId: string; username: string; message: string; isEmote: boolean; isSpectator: boolean; timestamp: number }>;
  unreadChatCount: number;
  chatOpen: boolean;
  sendChatMessage: (message: string, isEmote: boolean) => void;
  setChatOpen: (open: boolean) => void;

  // Active games
  activeGames: Array<{ roomCode: string; player1Name: string; player2Name: string; spectatorCount: number; turn: number; isRanked: boolean; isPrivate: boolean }>;
  requestActiveGames: () => void;
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
  errorKey: null,
  errorParams: null,
  opponentJoined: false,
  gameStarted: false,
  gameEnded: false,
  playerNames: null,
  gameResult: null,
  actionDeadline: null,
  isSealedRoom: false,
  publicRooms: [],
  maintenanceWarning: false,
  rematchState: 'none',
  sealedBoosters: null,
  sealedAllCards: null,
  sealedDeckSubmitted: false,
  sealedOpponentReady: false,
  sealedDeadline: null,
  opponentChangingDeck: false,
  _lastStateUpdate: 0,
  _resyncTimer: null as ReturnType<typeof setInterval> | null,
  isSpectating: false,
  spectatingRoomCode: null,
  spectatorCount: 0,
  chatMessages: [],
  unreadChatCount: 0,
  chatOpen: false,
  activeGames: [],

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
          set({ error: 'Connection timed out. Server may be unavailable.', errorKey: 'game.error.connectionTimeout' });
          reject(new Error('Socket connection timed out'));
        }
      }, CONNECT_TIMEOUT_MS);

      socket.on('connect', () => {
        clearTimeout(timeoutId);
        console.log('[Socket] Connected:', socket.id);
        set({ connected: true, userId: userId || null, error: null, errorKey: null });

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
          set({ error: 'Lost connection to server.', errorKey: 'game.error.connectionLost' });
        }
      });

      socket.on('reconnect', (attemptNumber: number) => {
        console.log('[Socket] Reconnected after', attemptNumber, 'attempts');
        set({ connected: true, error: null, errorKey: null });

        // Re-register user on reconnect
        const uid = get().userId;
        if (uid) {
          socket.emit('auth:register', { userId: uid });
        }

        // Rejoin active room so server updates our socket ID
        // This handles both active games AND sealed pre-game (deck-building) phase
        const rc = get().roomCode;
        if (rc && uid) {
          console.log('[Socket] Rejoining room', rc, 'after reconnect');
          socket.emit('game:rejoin', { roomCode: rc, userId: uid });
        }
      });

      socket.on('reconnect_failed', () => {
        console.error('[Socket] Reconnection failed after all attempts');
        set({ error: 'Unable to reconnect to server.', errorKey: 'game.error.reconnectFailed' });
      });

      socket.on('connect_error', (err) => {
        clearTimeout(timeoutId);
        console.error('[Socket] Connection error:', err.message);
        set({ error: `Connection failed: ${err.message}`, errorKey: 'game.error.connectionLost' });
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

      socket.on('room:opponent-changing-deck', () => {
        console.log('[Socket] Opponent is changing their deck');
        set({ opponentChangingDeck: true });
      });

      socket.on('room:opponent-deck-ready', () => {
        console.log('[Socket] Opponent deck is ready');
        set({ opponentChangingDeck: false });
      });

      socket.on('room:rejoined', (data: { code: string; isSealed: boolean; playerRole: 'player1' | 'player2' }) => {
        console.log('[Socket] Rejoined room:', data.code, 'sealed:', data.isSealed, 'role:', data.playerRole);
        set({ roomCode: data.code, playerRole: data.playerRole, isSealedRoom: data.isSealed });
      });

      socket.on('room:error', (data: { message: string }) => {
        console.error('[Socket] Room error:', data.message);
        // Only set error if game hasn't started yet (lobby phase).
        // During an active game, room errors (e.g. stale rejoin "Room not found")
        // should not show as in-game action errors.
        if (!get().gameStarted) {
          set({ error: data.message });
        }
      });

      socket.on('room:deck-accepted', () => {
        console.log('[Socket] Deck accepted, waiting for opponent');
        if (get().isSealedRoom) {
          set({ sealedDeckSubmitted: true });
        }
      });

      // ---/* Sealed events ---

      socket.on('sealed:boosters', (data: { boosters: unknown[]; allCards: unknown[] }) => {
        console.log('[Socket] Sealed boosters received:', data.boosters?.length, 'boosters');
        set({ sealedBoosters: data.boosters, sealedAllCards: data.allCards });
      });

      socket.on('sealed:timer-start', (data: { deadline: number; durationMs: number }) => {
        console.log('[Socket] Sealed timer started, deadline:', data.deadline);
        set({ sealedDeadline: data.deadline });
      });

      socket.on('sealed:opponent-ready', () => {
        console.log('[Socket] Sealed opponent ready');
        set({ sealedOpponentReady: true });
      });

      socket.on('sealed:time-expired', () => {
        console.log('[Socket] Sealed time expired');
        set({ sealedDeadline: 0 });
      });

      // --- Game events ---

      socket.on('game:started', () => {
        console.log('[Socket] Game started');
        set({ gameStarted: true, _lastStateUpdate: Date.now() });

        // Start a periodic resync check - if no state update for 15s during
        // an active game, request current state from the server.
        // This prevents the game from appearing stuck if a state-update was lost.
        const existingTimer = get()._resyncTimer;
        if (existingTimer) clearInterval(existingTimer);
        const resyncTimer = setInterval(() => {
          const s = get();
          if (!s.socket || !s.connected || s.gameEnded || !s.gameStarted) {
            clearInterval(resyncTimer);
            set({ _resyncTimer: null });
            return;
          }
          const elapsed = Date.now() - (s._lastStateUpdate || 0);
          if (elapsed > 15000 && s._lastStateUpdate > 0) {
            console.warn('[Socket] No state update for 15s - requesting resync');
            s.socket.emit('game:request-state');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            set({ _lastStateUpdate: Date.now() } as any); // Reset to avoid spamming
          }
        }, 5000);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        set({ _resyncTimer: resyncTimer } as any);
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
            _lastStateUpdate: Date.now(),
          };
          if (data.playerNames) {
            update.playerNames = data.playerNames;
          }
          set(update as SocketStore);
        },
      );

      socket.on('game:error', (data: { message: string; errorKey?: string; errorParams?: Record<string, string | number> }) => {
        console.error('[Socket] Game error:', data.message);
        set({ error: data.message, errorKey: data.errorKey ?? null, errorParams: data.errorParams ?? null });
      });

      socket.on(
        'game:ended',
        (data: {
          winner: string;
          player1Score: number;
          player2Score: number;
          isRanked?: boolean;
          eloDelta?: number | null;
          winReason?: 'score' | 'forfeit' | 'timeout';
          gameId?: string;
          replayData?: unknown;
        }) => {
          console.log('[Socket] Game ended, winner:', data.winner, 'reason:', data.winReason, 'gameId:', data.gameId);
          // Clean up resync timer
          const resyncT = get()._resyncTimer;
          if (resyncT) { clearInterval(resyncT); }
          set({ gameEnded: true, gameResult: data, actionDeadline: null, _resyncTimer: null });
        },
      );

      // --- Timer events ---

      socket.on('game:action-deadline', (data: { deadline: number; durationMs?: number }) => {
        // Use durationMs to compute local deadline (avoids server/client clock skew)
        const localDeadline = data.durationMs ? Date.now() + data.durationMs : data.deadline;
        set({ actionDeadline: localDeadline });
      });

      socket.on('game:action-deadline-pause', () => {
        console.log('[Socket] Timer paused (opponent making forced choice)');
        set({ actionDeadline: null });
      });

      socket.on('game:auto-passed', () => {
        console.log('[Socket] You were auto-passed due to timeout');
        set({ actionDeadline: null });
      });

      socket.on('game:auto-declined', () => {
        console.log('[Socket] Your forced choice was auto-declined due to timeout');
        set({ actionDeadline: null });
      });

      // --- Public room list ---

      socket.on('room:list-update', (rooms: PublicRoom[]) => {
        set({ publicRooms: rooms });
      });

      // --- Rematch events ---

      socket.on('game:rematch-offered', () => {
        console.log('[Socket] Opponent offered rematch');
        set({ rematchState: 'received' });
      });

      socket.on('game:rematch-accepted', () => {
        console.log('[Socket] Rematch accepted, restarting game');
        set({ rematchState: 'accepted', gameEnded: false, gameResult: null, actionDeadline: null });
      });

      socket.on('game:rematch-declined', () => {
        console.log('[Socket] Rematch declined');
        set({ rematchState: 'declined' });
      });

      socket.on('game:opponent-left', () => {
        console.log('[Socket] Opponent left the game');
        set({ rematchState: 'declined' });
      });

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

      // --- Coin flip sync ---

      socket.on('coin-flip-sync', () => {
        console.log('[Socket] Both players completed coin flip — showing mulligan');
        useUIStore.getState().setCoinFlipComplete(true);
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

      // --- Maintenance events ---

      socket.on('server:maintenance', () => {
        console.log('[Socket] Server going down for maintenance');
        set({ error: 'Server maintenance', errorKey: 'game.error.maintenance' });
      });

      socket.on('server:maintenance-warning', () => {
        console.log('[Socket] Maintenance warning received');
        set({ maintenanceWarning: true });
      });

      // ═══════ SPECTATOR LISTENERS ═══════

      socket.on('spectate:state-update', (data: {
        visibleState: VisibleGameState;
        playerNames: { player1: string; player2: string };
        spectatorCount: number;
      }) => {
        set({
          visibleState: data.visibleState,
          playerNames: data.playerNames,
          spectatorCount: data.spectatorCount,
          isSpectating: true,
          gameStarted: true,
        });
      });

      socket.on('spectate:count-update', (data: { count: number }) => {
        set({ spectatorCount: data.count });
      });

      socket.on('spectate:error', (data: { message: string }) => {
        set({ error: data.message });
      });

      // ═══════ CHAT LISTENERS ═══════

      socket.on('chat:message', (msg: { id: string; userId: string; username: string; message: string; isEmote: boolean; isSpectator: boolean; timestamp: number }) => {
        set((state) => {
          const newMessages = [...state.chatMessages, msg].slice(-100);
          return {
            chatMessages: newMessages,
            unreadChatCount: state.chatOpen ? 0 : state.unreadChatCount + 1,
          };
        });
      });

      socket.on('chat:history', (data: { messages: Array<{ id: string; userId: string; username: string; message: string; isEmote: boolean; isSpectator: boolean; timestamp: number }> }) => {
        set({ chatMessages: data.messages ?? [] });
      });

      socket.on('chat:error', (data: { message: string; errorKey?: string }) => {
        set({ error: data.message, errorKey: data.errorKey ?? null });
      });

      // ═══════ ACTIVE GAMES ═══════

      socket.on('games:list-update', (data: { games: Array<{ roomCode: string; player1Name: string; player2Name: string; spectatorCount: number; turn: number; isRanked: boolean; isPrivate: boolean }> }) => {
        set({ activeGames: data.games ?? [] });
      });

      set({ socket });
    });
  },

  disconnect: () => {
    const { socket, _resyncTimer } = get();
    if (_resyncTimer) clearInterval(_resyncTimer);
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
        actionDeadline: null,
        publicRooms: [],
        maintenanceWarning: false,
        rematchState: 'none',
        isSealedRoom: false,
        sealedBoosters: null,
        sealedAllCards: null,
        sealedDeckSubmitted: false,
        sealedOpponentReady: false,
        sealedDeadline: null,
        opponentChangingDeck: false,
        _resyncTimer: null,
      });
    }
  },

  createRoom: (userId: string, isPrivate = true, isRanked = false, isSealed = false, gameMode?: 'casual' | 'ranked' | 'sealed', hostName?: string, sealedBoosterCount?: 4 | 5 | 6, timerEnabled?: boolean) => {
    const { socket, connected } = get();
    if (socket && connected) {
      console.log(`[Socket] Emitting room:create${isSealed ? ' (sealed)' : ''} mode: ${gameMode ?? 'auto'}${sealedBoosterCount ? ` boosters: ${sealedBoosterCount}` : ''}${timerEnabled === false ? ' (no timer)' : ''}`);
      set({ isSealedRoom: isSealed, rematchState: 'none' });
      socket.emit('room:create', { userId, isPrivate, isRanked, isSealed, gameMode, hostName, sealedBoosterCount, timerEnabled });
    } else {
      console.error('[Socket] Cannot create room: not connected');
      set({ error: 'Not connected to server.', errorKey: 'game.error.notConnected' });
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
      set({ error: 'Not connected to server.', errorKey: 'game.error.notConnected' });
    }
  },

  selectDeck: (characters, missions) => {
    const { socket, connected } = get();
    if (socket && connected) {
      console.log('[Socket] Emitting room:select-deck, characters:', (characters as unknown[]).length, 'missions:', (missions as unknown[]).length);
      socket.emit('room:select-deck', { characters, missions });
    } else {
      console.error('[Socket] Cannot select deck: not connected');
      set({ error: 'Not connected to server.', errorKey: 'game.error.notConnected' });
    }
  },

  changeDeck: () => {
    const { socket, connected } = get();
    if (socket && connected) {
      console.log('[Socket] Emitting room:change-deck');
      socket.emit('room:change-deck');
      set({ opponentChangingDeck: false });
    }
  },

  performAction: (action: GameAction) => {
    const { socket, connected } = get();
    if (socket && connected) {
      console.log('[Socket] Emitting action:perform:', action.type);
      socket.emit('action:perform', { action });
    } else {
      console.error('[Socket] Cannot perform action: not connected');
      set({ error: 'Not connected to server.', errorKey: 'game.error.notConnected' });
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
        actionDeadline: null,
        error: null,
      });
      console.log('[Socket] Emitting matchmaking:join');
      socket.emit('matchmaking:join', { userId, isRanked });
    } else {
      console.error('[Socket] Cannot join matchmaking: not connected');
      set({ error: 'Not connected to server.', errorKey: 'game.error.notConnected' });
    }
  },

  leaveMatchmaking: () => {
    const { socket } = get();
    if (socket) {
      socket.emit('matchmaking:leave');
      set({ matchmakingStatus: 'idle' });
    }
  },

  requestRoomList: () => {
    const { socket, connected } = get();
    if (socket && connected) {
      socket.emit('room:list');
    }
  },

  offerRematch: () => {
    const { socket, connected } = get();
    if (socket && connected) {
      set({ rematchState: 'offered' });
      socket.emit('game:rematch-offer');
    }
  },

  acceptRematch: () => {
    const { socket, connected } = get();
    if (socket && connected) {
      socket.emit('game:rematch-accept');
    }
  },

  declineRematch: () => {
    const { socket, connected } = get();
    if (socket && connected) {
      set({ rematchState: 'none' });
      socket.emit('game:rematch-decline');
    }
  },

  coinFlipDone: () => {
    const { socket, connected } = get();
    if (socket && connected) {
      console.log('[Socket] Emitting coin-flip-done');
      socket.emit('coin-flip-done');
    }
  },

  clearError: () => set({ error: null, errorKey: null, errorParams: null }),

  forfeit: (reason: 'abandon' | 'timeout') => {
    const { socket, connected } = get();
    if (socket && connected) {
      console.log('[Socket] Emitting action:forfeit, reason:', reason);
      socket.emit('action:forfeit', { reason });
    }
  },

  // ═══════ SPECTATOR METHODS ═══════

  spectateGame: (roomCode: string, userId: string, username: string) => {
    const { socket, connected } = get();
    if (socket && connected) {
      socket.emit('spectate:join', { roomCode, userId, username });
      set({ spectatingRoomCode: roomCode, isSpectating: true, chatMessages: [], unreadChatCount: 0 });
    }
  },

  leaveSpectating: () => {
    const { socket, connected } = get();
    if (socket && connected) {
      socket.emit('spectate:leave');
    }
    set({
      isSpectating: false, spectatingRoomCode: null, spectatorCount: 0,
      visibleState: null, playerNames: null, gameStarted: false,
      chatMessages: [], unreadChatCount: 0,
    });
  },

  // ═══════ CHAT METHODS ═══════

  sendChatMessage: (message: string, isEmote: boolean) => {
    const { socket, connected } = get();
    if (socket && connected && message.trim()) {
      socket.emit('chat:send', { message: message.trim(), isEmote });
    }
  },

  setChatOpen: (open: boolean) => {
    set({ chatOpen: open, unreadChatCount: open ? 0 : get().unreadChatCount });
  },

  // ═══════ ACTIVE GAMES ═══════

  requestActiveGames: () => {
    const { socket, connected } = get();
    if (socket && connected) {
      socket.emit('games:list');
    }
  },
}));
