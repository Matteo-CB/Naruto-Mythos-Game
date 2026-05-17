'use client';

import { io, Socket } from 'socket.io-client';
import { create } from 'zustand';
import type { VisibleGameState, GameAction } from '@/lib/engine/types';
import { useSocialStore } from '@/stores/socialStore';
import { useUIStore } from '@/stores/uiStore';

const CONNECT_TIMEOUT_MS = 10000;

export interface ChessClockBroadcast {
  player1: { remainingMs: number; idleWarningUsed: boolean };
  player2: { remainingMs: number; idleWarningUsed: boolean };
  active: 'player1' | 'player2' | null;
  activeStartedAt: number | null;
  idleStartedAt: number | null;
  serverNow: number;
  idleToastAtMs: number;
  idleLimitMs: number;
}

export function computeChessClockRemainingMs(
  state: ChessClockBroadcast | null,
  player: 'player1' | 'player2',
  now: number = Date.now(),
): number {
  if (!state) return 0;
  const base = Math.max(0, state[player].remainingMs);
  if (state.active !== player || state.activeStartedAt === null) return base;
  const elapsed = Math.max(0, now - state.activeStartedAt);
  return Math.max(0, base - elapsed);
}

export function computeChessClockIdleMs(
  state: ChessClockBroadcast | null,
  player: 'player1' | 'player2',
  now: number = Date.now(),
): number {
  if (!state || state.active !== player || state.idleStartedAt === null) return 0;
  return Math.max(0, now - state.idleStartedAt);
}

export function buildGameCancelledStateReset(reason: 'mulligan-idle', roomCode: string) {
  return {
    gameCancelled: { reason, roomCode },
    gameEnded: false,
    gameResult: null,
    chessClock: null,
    _resyncTimer: null,
    visibleState: null,
    gameStarted: false,
    roomCode: null,
    playerRole: null,
    opponentJoined: false,
    opponentDisconnected: false,
    playerNames: null,
    currentRoomGameMode: null,
    rematchState: 'none' as const,
    rematchRoomCode: null,
    pendingReconnect: null,
  };
}

interface PublicRoom {
  code: string;
  hostName: string;
  gameMode: string;
  createdAt: number;
  isEvolving: boolean;
  holoHue: number | null;
  isRanked: boolean;
  isAnonymous: boolean;
}

interface SocketStore {
  socket: Socket | null;
  connected: boolean;
  userId: string | null;
  userName: string | null;
  roomCode: string | null;
  currentRoomGameMode: 'casual' | 'ranked' | 'sealed' | 'evolving' | null;
  currentRoomIsEvolving: boolean;
  currentRoomHoloHue: number | null;
  playerRole: 'player1' | 'player2' | null;
  visibleState: VisibleGameState | null;
  matchmakingStatus: 'idle' | 'waiting' | 'found';
  error: string | null;
  errorKey: string | null;
  errorParams: Record<string, string | number> | null;
  bannedCardsError: Array<{ cardId: string; reason: string | null }> | null;
  opponentJoined: boolean;
  gameStarted: boolean;
  gameEnded: boolean;
  gameResult: {
    winner: string;
    player1Score: number;
    player2Score: number;
    isRanked?: boolean;
    isEvolving?: boolean;
    eloDelta?: number | null;
    newElo?: number;
    totalGames?: number;
    winReason?: 'score' | 'forfeit' | 'timeout' | 'clock' | 'idle';
    gameId?: string | null;
    replayData?: unknown;
    tournamentId?: string | null;
  } | null;
  gameCancelled: { reason: 'mulligan-idle'; roomCode: string } | null;
  chessClock: ChessClockBroadcast | null;
  playerNames: { player1: string; player2: string } | null;

  
  publicRooms: PublicRoom[];

  
  maintenanceWarning: boolean;

  
  rematchState: 'none' | 'offered' | 'received' | 'accepted' | 'declined';
  rematchRoomCode: string | null;

  
  isSealedRoom: boolean;
  tournamentMatchRoom: boolean;
  sealedBoosters: unknown[] | null;
  sealedAllCards: unknown[] | null;
  sealedDeckSubmitted: boolean;
  sealedOpponentReady: boolean;
  sealedDeadline: number | null;

  
  _lastStateUpdate: number;
  _resyncTimer: ReturnType<typeof setInterval> | null;

  connect: (userId?: string, username?: string) => Promise<void>;
  disconnect: () => void;
  createRoom: (userId: string, isPrivate?: boolean, isRanked?: boolean, isSealed?: boolean, gameMode?: 'casual' | 'ranked' | 'sealed' | 'evolving', hostName?: string, sealedBoosterCount?: 4 | 5 | 6, sealedSetChoice?: string, isAnonymous?: boolean, isEvolving?: boolean) => void;
  joinRoom: (code: string, userId: string) => void;
  selectDeck: (characters: unknown[], missions: unknown[], deckId?: string) => void;
  changeDeck: () => void;
  opponentChangingDeck: boolean;
  performAction: (action: GameAction) => void;
  joinMatchmaking: (userId: string, isRanked?: boolean) => void;
  leaveMatchmaking: () => void;
  requestRoomList: () => void;
  unsubscribeRoomList: () => void;
  unsubscribeActiveGames: () => void;
  offerRematch: () => void;
  acceptRematch: () => void;
  declineRematch: () => void;
  coinFlipDone: () => void;
  clearError: () => void;
  forfeit: (reason: 'abandon' | 'timeout') => void;

  
  isSpectating: boolean;
  spectatingRoomCode: string | null;
  spectatorCount: number;
  spectateGame: (roomCode: string, userId: string, username: string) => void;
  requestSpectateState: () => void;
  leaveSpectating: () => void;

  
  chatMessages: Array<{ id: string; userId: string; username: string; message: string; isEmote: boolean; isSpectator: boolean; timestamp: number }>;
  unreadChatCount: number;
  chatOpen: boolean;
  sendChatMessage: (message: string, isEmote: boolean) => void;
  setChatOpen: (open: boolean) => void;

  
  opponentDisconnected: boolean;

  
  pendingReconnect: { roomCode: string; playerRole: 'player1' | 'player2' } | null;
  dismissReconnect: () => void;
  acceptReconnect: () => void;

  
  activeGames: Array<{ roomCode: string; player1Name: string; player2Name: string; spectatorCount: number; turn: number; isRanked: boolean; isPrivate: boolean; isEvolving: boolean; holoHue: number | null; isAnonymous: boolean; phase: string }>;
  requestActiveGames: () => void;
}

export const useSocketStore = create<SocketStore>((set, get) => ({
  socket: null,
  connected: false,
  userId: null,
  userName: null,
  roomCode: null,
  currentRoomGameMode: null,
  currentRoomIsEvolving: false,
  currentRoomHoloHue: null,
  playerRole: null,
  visibleState: null,
  matchmakingStatus: 'idle',
  error: null,
  errorKey: null,
  errorParams: null,
  bannedCardsError: null,
  opponentJoined: false,
  gameStarted: false,
  gameEnded: false,
  playerNames: null,
  gameResult: null,
  gameCancelled: null,
  chessClock: null,
  isSealedRoom: false,
  tournamentMatchRoom: false,
  publicRooms: [],
  maintenanceWarning: false,
  rematchState: 'none',
  rematchRoomCode: null,
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
  opponentDisconnected: false,
  pendingReconnect: null,
  activeGames: (() => {
    try {
      const cached = typeof window !== 'undefined' ? localStorage.getItem('nmtcg-active-games') : null;
      if (cached) {
        const { games, ts } = JSON.parse(cached);

        if (Date.now() - ts < 30000 && Array.isArray(games)) {
          return games.map((g: { roomCode: string; player1Name: string; player2Name: string; spectatorCount: number; turn: number; isRanked: boolean; isPrivate: boolean; isEvolving?: boolean; holoHue?: number | null; isAnonymous?: boolean; phase?: string }) => ({
            ...g,
            isEvolving: g.isEvolving === true,
            holoHue: typeof g.holoHue === 'number' ? g.holoHue : null,
            isAnonymous: g.isAnonymous === true,
            phase: typeof g.phase === 'string' ? g.phase : 'action',
          }));
        }
      }
    } catch { /* ignore */ }
    return [];
  })(),

  connect: (userId?: string, username?: string) => {
    return new Promise((resolve, reject) => {
      
      const existing = get().socket;
      if (existing?.connected) {
        resolve();
        return;
      }

      
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
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: CONNECT_TIMEOUT_MS,
      });

      
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
        set({ connected: true, userId: userId || null, userName: username || null, error: null, errorKey: null });

        
        if (userId) {
          socket.emit('auth:register', { userId, username });
        }

        
        socket.emit('games:list');

        resolve();
      });

      socket.on('disconnect', (reason) => {
        console.log('[Socket] Disconnected, reason:', reason);
        set({ connected: false, opponentDisconnected: false });
        
        if (reason === 'io server disconnect') {
          set({ error: 'Disconnected by server.', errorKey: 'game.error.connectionLost' });
        }
      });

      socket.on('reconnect', (attemptNumber: number) => {
        console.log('[Socket] Reconnected after', attemptNumber, 'attempts');
        set({ connected: true, error: null, errorKey: null });

        
        const uid = get().userId;
        const uname = get().userName;
        if (uid) {
          socket.emit('auth:register', { userId: uid, username: uname ?? undefined });
        }

        
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

      

      socket.on('room:created', (data: { code: string; gameMode?: 'casual' | 'ranked' | 'sealed' | 'evolving'; isEvolving?: boolean; holoHue?: number | null }) => {
        console.log('[Socket] Room created:', data.code, 'evolving:', data.isEvolving === true);
        set({
          roomCode: data.code,
          playerRole: 'player1',
          currentRoomGameMode: data.gameMode ?? null,
          currentRoomIsEvolving: data.isEvolving === true,
          currentRoomHoloHue: typeof data.holoHue === 'number' ? data.holoHue : null,
        });
      });

      socket.on('room:joined', (data: { code: string; playerRole: 'player1' | 'player2'; tournamentId?: string | null; gameMode?: 'casual' | 'ranked' | 'sealed' | 'evolving'; isEvolving?: boolean; holoHue?: number | null }) => {
        console.log('[Socket] Joined room:', data.code, 'tournament:', data.tournamentId ?? 'none', 'mode:', data.gameMode ?? 'unknown', 'evolving:', data.isEvolving === true);
        set({
          roomCode: data.code,
          playerRole: data.playerRole,
          tournamentMatchRoom: !!data.tournamentId,
          currentRoomGameMode: data.gameMode ?? null,
          currentRoomIsEvolving: data.isEvolving === true,
          currentRoomHoloHue: typeof data.holoHue === 'number' ? data.holoHue : null,
        });
      });

      socket.on('room:player-joined', (data?: { gameMode?: 'casual' | 'ranked' | 'sealed' | 'evolving'; isEvolving?: boolean; holoHue?: number | null }) => {
        console.log('[Socket] Player joined, mode:', data?.gameMode ?? 'unchanged');
        set((s) => ({
          opponentJoined: true,
          currentRoomGameMode: data?.gameMode ?? s.currentRoomGameMode,
          currentRoomIsEvolving: typeof data?.isEvolving === 'boolean' ? data.isEvolving : s.currentRoomIsEvolving,
          currentRoomHoloHue: typeof data?.holoHue === 'number' ? data.holoHue : s.currentRoomHoloHue,
        }));
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

      socket.on('room:error', (data: { message: string; errorKey?: string; bannedCards?: Array<{ cardId: string; reason: string | null }> }) => {
        console.error('[Socket] Room error:', data.message);
        if (!get().gameStarted) {
          set({
            error: data.message,
            errorKey: data.errorKey ?? null,
            bannedCardsError: data.bannedCards ?? null,
          });
        }
      });

      socket.on('room:deck-accepted', () => {
        console.log('[Socket] Deck accepted, waiting for opponent');
        if (get().isSealedRoom) {
          set({ sealedDeckSubmitted: true });
        }
      });

      

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

      

      socket.on('game:started', () => {
        console.log('[Socket] Game started');
        set({ gameStarted: true, _lastStateUpdate: Date.now(), opponentDisconnected: false });

        
        
        
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
          chessClock?: ChessClockBroadcast;
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
          if (data.chessClock) {
            update.chessClock = data.chessClock;
          }
          set(update as SocketStore);
        },
      );

      socket.on('game:clock-update', (payload: { chessClock: ChessClockBroadcast }) => {
        if (!payload || !payload.chessClock) return;
        set({ chessClock: payload.chessClock });
      });

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
          isEvolving?: boolean;
          eloDelta?: number | null;
          winReason?: 'score' | 'forfeit' | 'timeout' | 'clock' | 'idle';
          gameId?: string | null;
          replayData?: unknown;
          tournamentId?: string | null;
        }) => {
          console.log('[Socket] Game ended, winner:', data.winner, 'reason:', data.winReason, 'gameId:', data.gameId, 'tournament:', data.tournamentId ?? 'none');
          const resyncT = get()._resyncTimer;
          if (resyncT) { clearInterval(resyncT); }
          set({ gameEnded: true, gameResult: data, chessClock: null, _resyncTimer: null, opponentDisconnected: false });
        },
      );

      socket.on('game:replay-ready', (data: { gameId: string }) => {
        const result = get().gameResult;
        if (result) {
          set({ gameResult: { ...result, gameId: data.gameId } });
        }
      });

      socket.on('tournament:disqualified', (data: { matchId: string; userId: string }) => {
        console.log('[Socket] Player disqualified from tournament match:', data);
        const resyncT = get()._resyncTimer;
        if (resyncT) clearInterval(resyncT);
        const myUid = get().userId;
        const myRole = get().playerRole;
        const iAmDisqualified = myUid === data.userId;
        const oppRole: 'player1' | 'player2' = myRole === 'player1' ? 'player2' : 'player1';
        const winner = myRole ? (iAmDisqualified ? oppRole : myRole) : null;
        set({
          gameEnded: true,
          gameResult: {
            winner,
            player1Score: 0, player2Score: 0,
            winReason: 'forfeit' as const,
            tournamentId: null,
          } as never,
                  _resyncTimer: null,
        });
      });

      socket.on('tournament:match-reset', (data: { matchId: string }) => {
        console.log('[Socket] Tournament match reset by admin:', data);
        const resyncT = get()._resyncTimer;
        if (resyncT) clearInterval(resyncT);
        set({
          gameEnded: true,
          gameResult: {
            winner: null,
            player1Score: 0, player2Score: 0,
            winReason: 'forfeit' as const,
            tournamentId: null,
          } as never,
                  _resyncTimer: null,
        });
      });

      socket.on('game:cancelled', (data: { reason: 'mulligan-idle'; roomCode: string }) => {
        console.log('[Socket] Game cancelled:', data.reason, 'roomCode:', data.roomCode);
        const resyncT = get()._resyncTimer;
        if (resyncT) clearInterval(resyncT);
        set(buildGameCancelledStateReset(data.reason, data.roomCode));
      });

      socket.on('tournament:cancelled', (data: { reason: string; tournamentId?: string }) => {
        console.log('[Socket] Tournament cancelled:', data.reason, 'tournamentId:', data.tournamentId ?? 'unknown');
        if (!get().tournamentMatchRoom) {
          return;
        }
        const resyncT = get()._resyncTimer;
        if (resyncT) clearInterval(resyncT);
        set({
          gameEnded: true,
          gameResult: {
            winner: null,
            player1Score: 0, player2Score: 0,
            winReason: 'forfeit' as const,
            tournamentId: null,
          } as never,
                  _resyncTimer: null,
        });
      });

      


      

      socket.on('room:list-update', (rooms: Array<Partial<PublicRoom> & { code: string; hostName: string; gameMode: string; createdAt: number }>) => {
        const normalized: PublicRoom[] = rooms.map((r) => ({
          code: r.code,
          hostName: r.hostName,
          gameMode: r.gameMode,
          createdAt: r.createdAt,
          isEvolving: r.isEvolving === true,
          holoHue: typeof r.holoHue === 'number' ? r.holoHue : null,
          isRanked: r.isRanked === true,
          isAnonymous: r.isAnonymous === true,
        }));
        set({ publicRooms: normalized });
      });

      

      socket.on('game:rematch-offered', () => {
        console.log('[Socket] Opponent offered rematch');
        set({ rematchState: 'received' });
      });

      socket.on('game:rematch-accepted', () => {
        console.log('[Socket] Rematch accepted, redirecting to deck select');
        set({
          rematchState: 'accepted',
          gameEnded: false,
          gameResult: null,
          gameCancelled: null,
          chessClock: null,
                  gameStarted: false,
          visibleState: null,
          opponentJoined: true, // both players are still in the room
        });
      });

      socket.on('game:rematch-reselect', ({ roomCode, isSealed, isEvolving }: { roomCode: string; isSealed?: boolean; isEvolving?: boolean }) => {
        console.log('[Socket] Rematch reselect, navigating to',
          isSealed ? 'sealed booster opening' : isEvolving ? 'evolving deck selection' : 'deck selection',
          'with code:', roomCode);
        set((s) => ({
          rematchRoomCode: roomCode,
          isSealedRoom: !!isSealed,
          currentRoomGameMode: isEvolving ? 'evolving' : s.currentRoomGameMode,
          sealedDeckSubmitted: false,
          sealedOpponentReady: false,
          sealedBoosters: null,
          sealedAllCards: null,
          sealedDeadline: null,
        }));
      });

      socket.on('game:rematch-declined', () => {
        console.log('[Socket] Rematch declined');
        set({ rematchState: 'declined' });
      });

      socket.on('game:opponent-left', () => {
        console.log('[Socket] Opponent left the game');
        set({ rematchState: 'declined' });
      });

      socket.on('game:opponent-disconnected', () => {
        console.log('[Socket] Opponent disconnected');
        set({ opponentDisconnected: true });
      });

      socket.on('game:opponent-reconnected', () => {
        console.log('[Socket] Opponent reconnected');
        set({ opponentDisconnected: false });
      });

      socket.on('game:active-game', (data: { roomCode: string; playerRole: 'player1' | 'player2' }) => {
        console.log('[Socket] Active game found:', data.roomCode, 'as', data.playerRole);
        
        const current = get();
        if (current.roomCode !== data.roomCode) {
          set({ pendingReconnect: data });
        }
      });

      

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

      

      socket.on('coin-flip-sync', () => {
        console.log('[Socket] Both players completed coin flip, showing mulligan');
        useUIStore.getState().setCoinFlipComplete(true);
      });

      

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

      

      socket.on('server:maintenance', () => {
        console.log('[Socket] Server going down for maintenance');
        set({ error: 'Server maintenance', errorKey: 'game.error.maintenance' });
      });

      socket.on('server:maintenance-warning', () => {
        console.log('[Socket] Maintenance warning received');
        set({ maintenanceWarning: true });
      });

      socket.on('maintenance:ended', () => {
        console.log('[Socket] Maintenance cancelled');
        set({ maintenanceWarning: false });
      });

      

      socket.on('spectate:state-update', (data: {
        visibleState: VisibleGameState;
        playerNames: { player1: string; player2: string };
        spectatorCount: number;
        roomCode?: string;
        chessClock?: ChessClockBroadcast;
        isEvolving?: boolean;
        holoHue?: number | null;
      }) => {
        const current = get();

        if (!current.isSpectating && !current.spectatingRoomCode) return;
        if (data.roomCode && current.spectatingRoomCode && data.roomCode !== current.spectatingRoomCode) return;
        const update: Partial<SocketStore> = {
          visibleState: data.visibleState,
          playerNames: data.playerNames,
          spectatorCount: data.spectatorCount,
          isSpectating: true,
          gameStarted: true,
          currentRoomIsEvolving: data.isEvolving === true,
          currentRoomHoloHue: typeof data.holoHue === 'number' ? data.holoHue : null,
        };
        if (data.chessClock) {
          update.chessClock = data.chessClock;
        }
        set(update as SocketStore);
      });

      socket.on('spectate:count-update', (data: { count: number }) => {
        set({ spectatorCount: data.count });
      });

      socket.on('spectate:error', (data: { message: string; errorKey?: string }) => {
        set({ error: data.message, errorKey: data.errorKey ?? null });
      });

      

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

      

      socket.on('games:list-update', (data: { games: Array<{ roomCode: string; player1Name: string; player2Name: string; spectatorCount: number; turn: number; isRanked: boolean; isPrivate: boolean; isEvolving?: boolean; holoHue?: number | null; isAnonymous?: boolean; phase?: string }> }) => {
        const games = (data.games ?? []).map((g) => ({
          ...g,
          isEvolving: g.isEvolving === true,
          holoHue: typeof g.holoHue === 'number' ? g.holoHue : null,
          isAnonymous: g.isAnonymous === true,
          phase: typeof g.phase === 'string' ? g.phase : 'action',
        }));
        set({ activeGames: games });

        try { localStorage.setItem('nmtcg-active-games', JSON.stringify({ games, ts: Date.now() })); } catch { /* ignore */ }
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
        userName: null,
        roomCode: null,
        currentRoomGameMode: null,
        playerRole: null,
        visibleState: null,
        matchmakingStatus: 'idle',
        error: null,
        errorKey: null,
        errorParams: null,
        bannedCardsError: null,
        opponentJoined: false,
        gameStarted: false,
        gameEnded: false,
        gameResult: null,
        gameCancelled: null,
        chessClock: null,
              publicRooms: [],
        maintenanceWarning: false,
        rematchState: 'none',
        isSealedRoom: false,
        tournamentMatchRoom: false,
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

  createRoom: (userId: string, isPrivate = true, isRanked = false, isSealed = false, gameMode?: 'casual' | 'ranked' | 'sealed' | 'evolving', hostName?: string, sealedBoosterCount?: 4 | 5 | 6, sealedSetChoice?: string, isAnonymous?: boolean, isEvolving?: boolean) => {
    const { socket, connected } = get();
    if (socket && connected) {
      console.log(`[Socket] Emitting room:create${isSealed ? ' (sealed)' : ''} mode: ${gameMode ?? 'auto'}${sealedBoosterCount ? ` boosters: ${sealedBoosterCount}` : ''}${sealedSetChoice ? ` set: ${sealedSetChoice}` : ''}${isAnonymous ? ' (anonymous)' : ''}${isEvolving ? ' (evolving)' : ''}`);
      set({ isSealedRoom: isSealed, rematchState: 'none', chatMessages: [], unreadChatCount: 0 });
      socket.emit('room:create', { userId, isPrivate, isRanked, isSealed, gameMode, hostName, sealedBoosterCount, sealedSetChoice, isAnonymous, isEvolving });
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
      set({ roomCode: code, playerRole: 'player2', chatMessages: [], unreadChatCount: 0 });
    } else {
      console.error('[Socket] Cannot join room: not connected');
      set({ error: 'Not connected to server.', errorKey: 'game.error.notConnected' });
    }
  },

  selectDeck: (characters, missions, deckId) => {
    const { socket, connected } = get();
    if (socket && connected) {
      console.log('[Socket] Emitting room:select-deck, characters:', (characters as unknown[]).length, 'missions:', (missions as unknown[]).length);
      socket.emit('room:select-deck', { characters, missions, deckId });
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
      
      set({
        roomCode: null,
        currentRoomGameMode: null,
        playerRole: null,
        visibleState: null,
        matchmakingStatus: 'idle',
        opponentJoined: false,
        gameStarted: false,
        gameEnded: false,
        gameResult: null,
        gameCancelled: null,
        chessClock: null,
        playerNames: null,
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

  clearError: () => set({ error: null, errorKey: null, errorParams: null, bannedCardsError: null }),

  forfeit: (reason: 'abandon' | 'timeout') => {
    const { socket, connected } = get();
    if (socket && connected) {
      console.log('[Socket] Emitting action:forfeit, reason:', reason);
      socket.emit('action:forfeit', { reason });
    }
  },

  

  spectateGame: (roomCode: string, userId: string, username: string) => {
    const { socket, connected } = get();
    if (!socket || !connected) {
      console.warn('[Socket] Cannot spectate: not connected');
      set({ error: 'Not connected to server' });
      return;
    }
    console.log(`[Socket] Joining spectate for room ${roomCode}`);
    socket.emit('spectate:join', { roomCode, userId, username });
    set({ spectatingRoomCode: roomCode, isSpectating: true, chatMessages: [], unreadChatCount: 0 });
  },

  requestSpectateState: () => {
    const { socket, connected, spectatingRoomCode } = get();
    if (socket && connected && spectatingRoomCode) {
      socket.emit('spectate:request-state', { roomCode: spectatingRoomCode });
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
      chessClock: null,
      currentRoomIsEvolving: false, currentRoomHoloHue: null,
      chatMessages: [], unreadChatCount: 0,
    });
  },

  

  dismissReconnect: () => {
    const { socket, connected, pendingReconnect } = get();
    if (socket && connected && pendingReconnect) {
      const rc = pendingReconnect.roomCode;
      const uid = get().userId;
      
      socket.emit('game:rejoin', { roomCode: rc, userId: uid });
      
      
      setTimeout(() => {
        const s = get();
        if (s.socket && s.connected) {
          s.socket.emit('action:forfeit', { reason: 'abandon', roomCode: rc, userId: uid });
        }
      }, 500);
    }
    set({ pendingReconnect: null });
  },

  acceptReconnect: () => {
    const { socket, connected, pendingReconnect } = get();
    if (socket && connected && pendingReconnect) {
      socket.emit('game:rejoin', { roomCode: pendingReconnect.roomCode, userId: get().userId });
      
      
      set({
        roomCode: pendingReconnect.roomCode,
        playerRole: pendingReconnect.playerRole,
        gameStarted: true,
        pendingReconnect: null,
        opponentDisconnected: false,
      });
    }
  },

  

  sendChatMessage: (message: string, isEmote: boolean) => {
    const { socket, connected } = get();
    if (socket && connected && message.trim()) {
      socket.emit('chat:send', { message: message.trim(), isEmote });
    }
  },

  setChatOpen: (open: boolean) => {
    set({ chatOpen: open, unreadChatCount: open ? 0 : get().unreadChatCount });
  },

  

  requestActiveGames: () => {
    const { socket, connected } = get();
    if (socket && connected) {
      socket.emit('games:list');
    }
  },

  unsubscribeRoomList: () => {
    const { socket, connected } = get();
    if (socket && connected) {
      socket.emit('room:list-unsubscribe');
    }
  },

  unsubscribeActiveGames: () => {
    const { socket, connected } = get();
    if (socket && connected) {
      socket.emit('games:list-unsubscribe');
    }
  },
}));
