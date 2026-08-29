'use client';

import { io, Socket } from 'socket.io-client';
import { create } from 'zustand';
import type { VisibleGameState, GameAction } from '@/lib/engine/types';
import { unpackVisibleState, type PackedVisibleState } from '@/lib/socket/statePack';
import { useSocialStore } from '@/stores/socialStore';
import { useUIStore } from '@/stores/uiStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { playSound, setVolume, setMuted } from '@/lib/sound/SoundManager';
import {
  decideRejoinRetry,
  deriveConnectionPhase,
  rejoinFailureErrorKey,
  shouldAttemptRejoin,
  REJOIN_ACK_TIMEOUT_MS,
  type ConnectionPhase,
  type RejoinFailureReason,
} from '@/lib/socket/rejoinRetry';

const CONNECT_TIMEOUT_MS = 10000;

const MATCH_CONTEXT_STORAGE_KEY = 'nmtcg-match-context';

export interface StoredMatchContext {
  roomCode: string;
  playerRole: 'player1' | 'player2';
  userId: string;
}

export function readStoredMatchContext(): StoredMatchContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(MATCH_CONTEXT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredMatchContext>;
    if (typeof parsed?.roomCode !== 'string' || !parsed.roomCode) return null;
    if (parsed.playerRole !== 'player1' && parsed.playerRole !== 'player2') return null;
    if (typeof parsed.userId !== 'string' || !parsed.userId) return null;
    return { roomCode: parsed.roomCode, playerRole: parsed.playerRole, userId: parsed.userId };
  } catch {
    return null;
  }
}

function writeStoredMatchContext(ctx: StoredMatchContext | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!ctx) window.sessionStorage.removeItem(MATCH_CONTEXT_STORAGE_KEY);
    else window.sessionStorage.setItem(MATCH_CONTEXT_STORAGE_KEY, JSON.stringify(ctx));
  } catch {
    void 0;
  }
}

let rejoinRetryTimer: ReturnType<typeof setTimeout> | null = null;
let rejoinAckTimer: ReturnType<typeof setTimeout> | null = null;
let rejoinAttempt = 0;
let rejoinSuppressed = false;

function clearRejoinTimers(): void {
  if (rejoinRetryTimer) {
    clearTimeout(rejoinRetryTimer);
    rejoinRetryTimer = null;
  }
  if (rejoinAckTimer) {
    clearTimeout(rejoinAckTimer);
    rejoinAckTimer = null;
  }
}

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

export type GameCancelledReason = 'mulligan-idle' | 'stalemate' | 'unavailable';

export function buildGameCancelledStateReset(reason: GameCancelledReason, roomCode: string) {
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
    seatBound: false,
    opponentJoined: false,
    opponentDisconnected: false,
    opponentForfeitAt: null,
    playerNames: null,
    currentRoomGameMode: null,
    rematchState: 'none' as const,
    rematchRoomCode: null,
    pendingReconnect: null,
  };
}

export function buildMatchContextReset() {
  return {
    roomCode: null,
    playerRole: null,
    seatBound: false,
    joinState: 'idle' as const,
    opponentJoined: false,
    opponentDisconnected: false,
    opponentForfeitAt: null,
    gameStarted: false,
    gameEnded: false,
    gameResult: null,
    gameCancelled: null,
    visibleState: null,
    playerNames: null,
    chessClock: null,
    currentRoomGameMode: null,
    currentRoomIsEvolving: false,
    currentRoomIsHighlander: false,
    currentRoomHoloHue: null,
    tournamentMatchRoom: false,
    currentTournamentId: null,
    isSealedRoom: false,
    sealedBoosters: null,
    sealedAllCards: null,
    sealedDeckSubmitted: false,
    sealedOpponentReady: false,
    sealedDeadline: null,
    opponentChangingDeck: false,
    rematchState: 'none' as const,
    rematchRoomCode: null,
    pendingReconnect: null,
    chatMessages: [],
    unreadChatCount: 0,
    chatLockState: null,
    chatOpponent: null,
    chatFriendStatus: null,
    chatFriendshipId: null,
    _lastStateUpdate: 0,
  };
}

export function shouldEnterMatchRoom(
  currentRoomCode: string | null,
  gameStarted: boolean,
  targetRoomCode: string,
): boolean {
  if (!targetRoomCode) return false;
  if (currentRoomCode === targetRoomCode && gameStarted) return false;
  return true;
}

interface PublicRoom {
  code: string;
  hostName: string;
  gameMode: string;
  createdAt: number;
  isEvolving: boolean;
  isHighlander?: boolean;
  holoHue: number | null;
  isRanked: boolean;
  isAnonymous: boolean;
  sealedSetChoice: string | null;
}

interface SocketStore {
  socket: Socket | null;
  connected: boolean;
  seatBound: boolean;
  connectionPhase: ConnectionPhase;
  userId: string | null;
  userName: string | null;
  roomCode: string | null;
  currentRoomGameMode: 'casual' | 'ranked' | 'sealed' | 'evolving' | 'highlander' | null;
  currentRoomIsEvolving: boolean;
  currentRoomIsHighlander: boolean;
  currentRoomHoloHue: number | null;
  playerRole: 'player1' | 'player2' | null;
  visibleState: VisibleGameState | null;
  matchmakingStatus: 'idle' | 'waiting' | 'found';
  error: string | null;
  errorKey: string | null;
  errorParams: Record<string, string | number> | null;
  spectateErrorKey: string | null;
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
    winReason?: 'score' | 'forfeit' | 'timeout' | 'clock' | 'idle' | 'disconnect';
    gameId?: string | null;
    replayData?: unknown;
    tournamentId?: string | null;
    performanceBonus?: {
      scoreBonus: number;
      boardBonus: number;
      forfeitBonus: number;
      total: number;
      scoreGap: number;
      loserBoardCount: number;
      applied: boolean;
      isForfeit: boolean;
    } | null;
  } | null;
  gameCancelled: { reason: GameCancelledReason; roomCode: string } | null;
  chessClock: ChessClockBroadcast | null;
  playerNames: { player1: string; player2: string } | null;

  
  publicRooms: PublicRoom[];

  
  maintenanceWarning: boolean;

  
  rematchState: 'none' | 'offered' | 'received' | 'accepted' | 'declined';
  rematchRoomCode: string | null;

  
  isSealedRoom: boolean;
  tournamentMatchRoom: boolean;
  currentTournamentId: string | null;
  sealedBoosters: unknown[] | null;
  sealedAllCards: unknown[] | null;
  sealedDeckSubmitted: boolean;
  sealedOpponentReady: boolean;
  sealedDeadline: number | null;

  
  _lastStateUpdate: number;
  _resyncTimer: ReturnType<typeof setInterval> | null;

  connect: (userId?: string, username?: string) => Promise<void>;
  disconnect: () => void;
  rejoinMatch: () => void;
  createRoom: (userId: string, isPrivate?: boolean, isRanked?: boolean, isSealed?: boolean, gameMode?: 'casual' | 'ranked' | 'sealed' | 'evolving' | 'highlander', hostName?: string, sealedBoosterCount?: 4 | 5 | 6, sealedSetChoice?: string, isAnonymous?: boolean, isEvolving?: boolean, isHighlander?: boolean) => void;
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

  
  chatMessages: Array<{ id: string; userId: string; username: string; message: string; isEmote: boolean; isSpectator: boolean; timestamp: number; removedByModeration?: boolean }>;
  unreadChatCount: number;
  chatOpen: boolean;
  chatLockState: 'open' | 'off' | 'friends_only' | null;
  chatOpponent: { userId: string; username: string } | null;
  chatFriendStatus: 'none' | 'pending_out' | 'pending_in' | 'friends' | null;
  chatFriendshipId: string | null;
  chatSelfMuted: boolean;
  chatSelfMutedUntilTs: number | null;
  requestChatLockState: () => void;
  sendDm: (toUserId: string, body: string) => void;
  markDmRead: (threadKey: string) => void;
  sendChatMessage: (message: string, isEmote: boolean) => void;
  setChatOpen: (open: boolean) => void;

  
  opponentDisconnected: boolean;
  opponentForfeitAt: number | null;

  pendingReconnect: { roomCode: string; playerRole: 'player1' | 'player2'; tournamentId?: string | null } | null;
  dismissReconnect: () => void;
  acceptReconnect: () => void;

  joinState: 'idle' | 'joining' | 'joined' | 'failed';
  pendingMatchEntry: { tournamentId: string; matchId: string | null; roomCode: string; seat: 'player1' | 'player2' } | null;
  pendingMatchExit: string | null;
  leaveMatchContext: () => void;
  clearPendingMatchEntry: () => void;
  clearPendingMatchExit: () => void;
  acknowledgeMatchEntry: (roomCode: string) => void;

  
  activeGames: Array<{ roomCode: string; player1Name: string; player2Name: string; spectatorCount: number; turn: number; isRanked: boolean; isPrivate: boolean; isEvolving: boolean; holoHue: number | null; isAnonymous: boolean; phase: string }>;
  requestActiveGames: () => void;
}

const readiedTournamentMatches = new Set<string>();
export function armReadiedMatch(matchId: string): void { readiedTournamentMatches.add(matchId); }
export function isMatchReadied(matchId: string): boolean { return readiedTournamentMatches.has(matchId); }
export function clearReadiedMatch(matchId: string): void { readiedTournamentMatches.delete(matchId); }

export const useSocketStore = create<SocketStore>((set, get) => ({
  socket: null,
  connected: false,
  seatBound: false,
  connectionPhase: 'online',
  userId: null,
  userName: null,
  roomCode: null,
  currentRoomGameMode: null,
  currentRoomIsEvolving: false,
  currentRoomIsHighlander: false,
  currentRoomHoloHue: null,
  playerRole: null,
  visibleState: null,
  matchmakingStatus: 'idle',
  error: null,
  errorKey: null,
  errorParams: null,
  spectateErrorKey: null,
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
  currentTournamentId: null,
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
  chatLockState: null,
  chatOpponent: null,
  chatFriendStatus: null,
  chatFriendshipId: null,
  chatSelfMuted: false,
  chatSelfMutedUntilTs: null,
  opponentDisconnected: false,
  opponentForfeitAt: null,
  pendingReconnect: null,
  joinState: 'idle',
  pendingMatchEntry: null,
  pendingMatchExit: null,
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

      const sameUser = !userId || get().userId === null || get().userId === userId;
      if (existing && existing.active && sameUser) {
        console.log('[Socket] Existing socket is still reconnecting, letting it finish instead of rebuilding');
        resolve();
        return;
      }

      if (existing) {
        existing.removeAllListeners();
        existing.disconnect();
        set({ socket: null, connected: false, seatBound: false });
      }

      const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || '';
      console.log('[Socket] Connecting to:', socketUrl || '(same origin)');

      const socket = io(socketUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 20,
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

      let firstConnect = true;

      socket.on('connect', () => {
        clearTimeout(timeoutId);
        const wasFirstConnect = firstConnect;
        firstConnect = false;
        console.log('[Socket] Connected:', socket.id, wasFirstConnect ? '(initial)' : '(reconnect)');
        rejoinSuppressed = false;
        rejoinAttempt = 0;
        clearRejoinTimers();
        set({ connected: true, seatBound: false, userId: userId || null, userName: username || null, error: null, errorKey: null });

        const stored = readStoredMatchContext();
        if (stored && !get().roomCode && stored.userId === (userId || get().userId)) {
          console.log('[Socket] Restoring match context from this session:', stored.roomCode);
          set({ roomCode: stored.roomCode, playerRole: stored.playerRole });
        }

        if (userId) {
          socket.emit('auth:register', { userId, username });
        }

        socket.emit('games:list');

        requestRejoinIfNeeded();
        syncConnectionPhase();

        if (wasFirstConnect) resolve();
      });

      socket.on('disconnect', (reason) => {
        console.log('[Socket] Disconnected, reason:', reason);
        clearRejoinTimers();
        set({ connected: false, seatBound: false, opponentDisconnected: false, opponentForfeitAt: null });
        syncConnectionPhase();

        if (reason === 'io server disconnect') {
          set({ error: 'Disconnected by server.', errorKey: 'game.error.connectionLost' });
        }
      });

      socket.on('game:rejoin-ok', (data: { roomCode: string; playerRole: 'player1' | 'player2' }) => {
        console.log('[Socket] Rejoin accepted for room', data?.roomCode, 'as', data?.playerRole);
        if (data?.roomCode) {
          set({ roomCode: data.roomCode, playerRole: data.playerRole });
          persistMatchContext();
        }
        markSeatBound();
      });

      socket.on('game:rejoin-failed', (data: { roomCode: string | null; reason: RejoinFailureReason }) => {
        console.warn('[Socket] Rejoin refused for room', data?.roomCode, 'reason:', data?.reason);
        handleRejoinFailure(data?.reason ?? 'no-response');
      });

      socket.on('game:rejoin-required', (data: { roomCode: string }) => {
        console.warn('[Socket] Server asked this client to rejoin room', data?.roomCode);
        if (data?.roomCode && get().roomCode !== data.roomCode && !get().gameStarted) {
          set({ roomCode: data.roomCode });
        } else if (data?.roomCode && !get().roomCode) {
          set({ roomCode: data.roomCode });
        }
        set({ seatBound: false });
        requestRejoinIfNeeded(true);
      });

      socket.io.on('reconnect_failed', () => {
        console.error('[Socket] Reconnection failed after all attempts');
        set({ error: 'Unable to reconnect to server.', errorKey: 'game.error.reconnectFailed' });
      });

      socket.on('connect_error', (err) => {
        clearTimeout(timeoutId);
        console.error('[Socket] Connection error:', err.message);
        set({ error: `Connection failed: ${err.message}`, errorKey: 'game.error.connectionLost' });
        reject(new Error(`Socket connection failed: ${err.message}`));
      });

      

      socket.on('room:created', (data: { code: string; gameMode?: 'casual' | 'ranked' | 'sealed' | 'evolving' | 'highlander'; isEvolving?: boolean; isHighlander?: boolean; holoHue?: number | null }) => {
        console.log('[Socket] Room created:', data.code, 'evolving:', data.isEvolving === true);
        set({
          roomCode: data.code,
          playerRole: 'player1',
          currentRoomGameMode: data.gameMode ?? null,
          currentRoomIsEvolving: data.isEvolving === true,
          currentRoomIsHighlander: data.isHighlander === true,
          currentRoomHoloHue: typeof data.holoHue === 'number' ? data.holoHue : null,
        });
      });

      socket.on('room:joined', (data: { code: string; playerRole: 'player1' | 'player2'; tournamentId?: string | null; gameMode?: 'casual' | 'ranked' | 'sealed' | 'evolving' | 'highlander'; isEvolving?: boolean; isHighlander?: boolean; holoHue?: number | null }) => {
        console.log('[Socket] Joined room:', data.code, 'tournament:', data.tournamentId ?? 'none', 'mode:', data.gameMode ?? 'unknown', 'evolving:', data.isEvolving === true);
        set({
          roomCode: data.code,
          playerRole: data.playerRole,
          joinState: 'joined',
          tournamentMatchRoom: !!data.tournamentId,
          currentTournamentId: data.tournamentId ?? null,
          currentRoomGameMode: data.gameMode ?? null,
          currentRoomIsEvolving: data.isEvolving === true,
          currentRoomIsHighlander: data.isHighlander === true,
          currentRoomHoloHue: typeof data.holoHue === 'number' ? data.holoHue : null,
        });
        markSeatBound();
        persistMatchContext();
        if (data.tournamentId) {
          set({ pendingMatchEntry: null });
          get().socket?.emit('match:enter-ack', { roomCode: data.code });
        }
      });

      socket.on('match:enter', (data: { tournamentId: string; matchId: string | null; roomCode: string; seat: 'player1' | 'player2' }) => {
        if (!data || typeof data.roomCode !== 'string') return;
        if (!shouldEnterMatchRoom(get().roomCode, get().gameStarted, data.roomCode)) {
          if (get().roomCode === data.roomCode && !get().seatBound) {
            console.log('[Socket] Already in match room', data.roomCode, 'but the seat is not bound, rejoining');
            requestRejoinIfNeeded(true);
          }
          return;
        }
        console.log('[Socket] Match entry requested for room', data.roomCode);
        set({ pendingMatchEntry: data });
      });

      socket.on('tournament:player-forfeited', () => {
        const st = get();
        if (!st.tournamentMatchRoom) return;
        if (st.gameStarted) return;
        const tid = st.currentTournamentId;
        console.log('[Socket] Tournament match closed before the game started, returning to the bracket');
        const resyncPre = st._resyncTimer;
        if (resyncPre) clearInterval(resyncPre);
        set({ ...buildMatchContextReset(), _resyncTimer: null, pendingMatchExit: tid } as Partial<SocketStore> as SocketStore);
      });

      socket.on('room:superseded', (data: { code: string }) => {
        console.warn('[Socket] This socket was superseded in room', data?.code, 'automatic rejoin is paused until the player asks for it');
        clearRejoinTimers();
        rejoinSuppressed = true;
        set({ seatBound: false });
        syncConnectionPhase();
      });

      socket.on('room:player-joined', (data?: { gameMode?: 'casual' | 'ranked' | 'sealed' | 'evolving' | 'highlander'; isEvolving?: boolean; isHighlander?: boolean; holoHue?: number | null }) => {
        console.log('[Socket] Player joined, mode:', data?.gameMode ?? 'unchanged');
        const wasAlone = !get().opponentJoined;
        set((s) => ({
          opponentJoined: true,
          currentRoomGameMode: data?.gameMode ?? s.currentRoomGameMode,
          currentRoomIsEvolving: typeof data?.isEvolving === 'boolean' ? data.isEvolving : s.currentRoomIsEvolving,
          currentRoomIsHighlander: typeof data?.isHighlander === 'boolean' ? data.isHighlander : s.currentRoomIsHighlander,
          currentRoomHoloHue: typeof data?.holoHue === 'number' ? data.holoHue : s.currentRoomHoloHue,
        }));

        if (wasAlone && get().playerRole === 'player1') {
          try {
            const { soundEnabled, soundVolume } = useSettingsStore.getState();
            if (soundEnabled) {
              setMuted(false);
              setVolume(soundVolume);
              playSound('roomJoin');
            }
          } catch { /* sound is best-effort */ }
        }
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

      socket.on('room:rejoined', (data: { code: string; isSealed: boolean; playerRole: 'player1' | 'player2'; tournamentId?: string | null }) => {
        console.log('[Socket] Rejoined room:', data.code, 'sealed:', data.isSealed, 'role:', data.playerRole, 'tournament:', data.tournamentId ?? 'none');
        set({
          roomCode: data.code,
          playerRole: data.playerRole,
          isSealedRoom: data.isSealed,
          ...(data.tournamentId ? { tournamentMatchRoom: true, currentTournamentId: data.tournamentId } : {}),
        });
        markSeatBound();
        persistMatchContext();
      });

      socket.on('room:error', (data: { message: string; errorKey?: string; bannedCards?: Array<{ cardId: string; reason: string | null }> }) => {
        console.error('[Socket] Room error:', data.message);
        if (data.errorKey && IDENTITY_ERROR_KEYS.has(data.errorKey)) {
          set({ error: data.message, errorKey: data.errorKey });
          return;
        }
        if (!get().gameStarted) {
          set({
            error: data.message,
            errorKey: data.errorKey ?? null,
            bannedCardsError: data.bannedCards ?? null,
          });
          if (get().joinState === 'joining') {
            set({ joinState: 'failed', roomCode: null, playerRole: null });
          }
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

      

      const demarrerLaPartie = () => {
        const dejaCommencee = get().gameStarted;
        set(dejaCommencee
          ? { gameStarted: true, _lastStateUpdate: Date.now() }
          : { gameStarted: true, _lastStateUpdate: Date.now(), opponentDisconnected: false, opponentForfeitAt: null });
        markSeatBound();
        persistMatchContext();

        const existingTimer = get()._resyncTimer;
        if (existingTimer) clearInterval(existingTimer);
        const resyncTimer = setInterval(() => {
          const s = get();
          if (!s.socket || s.gameEnded || !s.gameStarted) {
            clearInterval(resyncTimer);
            set({ _resyncTimer: null });
            return;
          }
          if (!s.connected) return;
          if (!s.seatBound) {
            requestRejoinIfNeeded();
            return;
          }
          const elapsed = Date.now() - (s._lastStateUpdate || 0);
          if (elapsed > 15000 && s._lastStateUpdate > 0) {
            console.warn('[Socket] No state update for 15s - requesting resync');
            s.socket.emit('game:request-state', { roomCode: s.roomCode ?? undefined });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            set({ _lastStateUpdate: Date.now() } as any); // Reset to avoid spamming
          }
        }, 5000);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        set({ _resyncTimer: resyncTimer } as any);
      };

      socket.on('game:started', () => {
        console.log('[Socket] Game started');
        demarrerLaPartie();
      });

      socket.on(
        'game:state-update',
        (data: {
          visibleState: VisibleGameState | PackedVisibleState;
          playerRole: 'player1' | 'player2';
          playerNames?: { player1: string; player2: string };
          chessClock?: ChessClockBroadcast;
        }) => {
          const unpacked = unpackVisibleState(data.visibleState);
          console.log('[Socket] State update received, phase:', unpacked?.phase,
            'hand size:', unpacked?.myState?.hand?.length ?? 0);
          const update: Partial<SocketStore> = {
            visibleState: unpacked,
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
          if (!get().isSpectating) {
            if (!get().gameStarted && unpacked) {
              console.log('[Socket] State received without a start event, entering the game anyway');
              demarrerLaPartie();
            } else {
              markSeatBound();
              persistMatchContext();
            }
          }
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
          winReason?: 'score' | 'forfeit' | 'timeout' | 'clock' | 'idle' | 'disconnect';
          gameId?: string | null;
          replayData?: unknown;
          tournamentId?: string | null;
          performanceBonus?: {
            scoreBonus: number;
            boardBonus: number;
            forfeitBonus: number;
            total: number;
            scoreGap: number;
            loserBoardCount: number;
            applied: boolean;
            isForfeit: boolean;
          } | null;
        }) => {
          console.log('[Socket] Game ended, winner:', data.winner, 'reason:', data.winReason, 'gameId:', data.gameId, 'tournament:', data.tournamentId ?? 'none');
          const resyncT = get()._resyncTimer;
          if (resyncT) { clearInterval(resyncT); }
          clearRejoinTimers();
          writeStoredMatchContext(null);
          set({ gameEnded: true, gameResult: data, chessClock: null, _resyncTimer: null, opponentDisconnected: false, opponentForfeitAt: null });
          syncConnectionPhase();
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
            tournamentId: get().currentTournamentId,
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
            tournamentId: get().currentTournamentId,
          } as never,
                  _resyncTimer: null,
        });
      });

      socket.on('game:cancelled', (data: { reason: 'mulligan-idle' | 'stalemate'; roomCode: string }) => {
        console.log('[Socket] Game cancelled:', data.reason, 'roomCode:', data.roomCode);
        const resyncT = get()._resyncTimer;
        if (resyncT) clearInterval(resyncT);
        clearRejoinTimers();
        writeStoredMatchContext(null);
        set(buildGameCancelledStateReset(data.reason, data.roomCode));
        syncConnectionPhase();
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
            tournamentId: get().currentTournamentId,
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
          sealedSetChoice: typeof r.sealedSetChoice === 'string' ? r.sealedSetChoice : null,
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

      socket.on('game:opponent-disconnected', (data?: { forfeitAt?: number; forfeitMs?: number }) => {
        console.log('[Socket] Opponent disconnected');
        set({ opponentDisconnected: true, opponentForfeitAt: typeof data?.forfeitAt === 'number' ? data.forfeitAt : null });
      });

      socket.on('game:opponent-reconnected', () => {
        console.log('[Socket] Opponent reconnected');
        set({ opponentDisconnected: false, opponentForfeitAt: null });
      });

      socket.on('game:active-game', (data: { roomCode: string; playerRole: 'player1' | 'player2'; tournamentId?: string | null }) => {
        console.log('[Socket] Active game found:', data.roomCode, 'as', data.playerRole);

        const current = get();
        if (current.roomCode === data.roomCode) {
          if (!current.seatBound) {
            console.log('[Socket] Seat is not bound in the room we already hold, rejoining');
            requestRejoinIfNeeded(true);
          }
          return;
        }
        const stored = readStoredMatchContext();
        if (!current.roomCode && stored && stored.roomCode === data.roomCode) {
          console.log('[Socket] Reclaiming the seat of this session automatically');
          set({ roomCode: data.roomCode, playerRole: data.playerRole, seatBound: false });
          requestRejoinIfNeeded(true);
          return;
        }
        set({ pendingReconnect: data });
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
        import('@/stores/dmStore').then(({ useDmStore }) => useDmStore.getState().refreshBadge()).catch(() => {});
      });

      socket.on('friend:request-accepted', (data) => {
        useSocialStore.getState().handleFriendRequestAccepted(data);
        import('@/stores/dmStore').then(({ useDmStore }) => useDmStore.getState().refreshBadge()).catch(() => {});
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
        visibleState: VisibleGameState | PackedVisibleState;
        playerNames: { player1: string; player2: string };
        spectatorCount: number;
        roomCode?: string;
        chessClock?: ChessClockBroadcast;
        isEvolving?: boolean;
        isHighlander?: boolean;
        holoHue?: number | null;
      }) => {
        const current = get();

        if (!current.isSpectating && !current.spectatingRoomCode) return;
        if (data.roomCode && current.spectatingRoomCode && data.roomCode !== current.spectatingRoomCode) return;
        const update: Partial<SocketStore> = {
          visibleState: unpackVisibleState(data.visibleState),
          playerNames: data.playerNames,
          spectatorCount: data.spectatorCount,
          spectateErrorKey: null,
          isSpectating: true,
          gameStarted: true,
          currentRoomIsEvolving: data.isEvolving === true,
          currentRoomIsHighlander: data.isHighlander === true,
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
        set({ error: data.message, errorKey: data.errorKey ?? null, spectateErrorKey: data.errorKey ?? 'spectate.errorNotFound' });
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

      socket.on('chat:message-removed', (data: { id: string }) => {
        set((state) => ({
          chatMessages: state.chatMessages.map((m) =>
            m.id === data.id ? { ...m, message: '', removedByModeration: true } : m,
          ),
        }));
      });

      socket.on('notify:popup', (data: { id: string; kind: string; payload: unknown; createdAt: number }) => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('notify:popup', { detail: data }));
        }
      });

      socket.on('daily-quest:rotated', () => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('daily-quest:rotated'));
        }
      });

      socket.on('chat:error', (data: { message: string; errorKey?: string }) => {
        set({ error: data.message, errorKey: data.errorKey ?? null });
        if (data.errorKey && (data.errorKey.startsWith('dm.') || data.errorKey === 'chat.muted')) {
          import('@/stores/dmStore').then(({ useDmStore }) => {
            const dm = useDmStore.getState();
            if (dm.isOpen && dm.view === 'thread') dm.loadMessages();
          }).catch(() => {});
        }
      });

      socket.on('dm:message', (msg: { id: string; threadKey: string; senderId: string; receiverId: string; body: string; createdAt: number }) => {
        import('@/stores/dmStore').then(({ useDmStore }) => {
          useDmStore.getState().receiveMessage(msg);
        }).catch(() => {});
      });

      socket.on('dm:unread-count', (data: { total: number }) => {
        import('@/stores/dmStore').then(({ useDmStore }) => {
          useDmStore.getState().setUnreadDms(data.total ?? 0);
        }).catch(() => {});
      });

      socket.on('chat:lock-state', (data: { state: 'open' | 'off' | 'friends_only'; opponent: { userId: string; username: string }; friendStatus: 'none' | 'pending_out' | 'pending_in' | 'friends'; friendshipId: string | null; muted?: boolean; mutedUntilTs?: number | null }) => {
        set({
          chatLockState: data.state,
          chatOpponent: data.opponent ?? null,
          chatFriendStatus: data.friendStatus ?? 'none',
          chatFriendshipId: data.friendshipId ?? null,
          chatSelfMuted: data.muted === true,
          chatSelfMutedUntilTs: data.mutedUntilTs ?? null,
        });
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

  rejoinMatch: () => {
    requestRejoinIfNeeded(true);
  },

  disconnect: () => {
    const { socket, _resyncTimer } = get();
    if (_resyncTimer) clearInterval(_resyncTimer);
    clearRejoinTimers();
    writeStoredMatchContext(null);
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
      set({
        socket: null,
        connected: false,
        seatBound: false,
        connectionPhase: 'online',
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
        currentTournamentId: null,
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

  createRoom: (userId: string, isPrivate = true, isRanked = false, isSealed = false, gameMode?: 'casual' | 'ranked' | 'sealed' | 'evolving' | 'highlander', hostName?: string, sealedBoosterCount?: 4 | 5 | 6, sealedSetChoice?: string, isAnonymous?: boolean, isEvolving?: boolean, isHighlander?: boolean) => {
    const { socket, connected } = get();
    if (socket && connected) {
      console.log(`[Socket] Emitting room:create${isSealed ? ' (sealed)' : ''} mode: ${gameMode ?? 'auto'}${sealedBoosterCount ? ` boosters: ${sealedBoosterCount}` : ''}${sealedSetChoice ? ` set: ${sealedSetChoice}` : ''}${isAnonymous ? ' (anonymous)' : ''}${isEvolving ? ' (evolving)' : ''}${isHighlander ? ' (highlander)' : ''}`);
      set({ isSealedRoom: isSealed, rematchState: 'none', chatMessages: [], unreadChatCount: 0, chatLockState: null, chatOpponent: null, chatFriendStatus: null, chatFriendshipId: null });
      socket.emit('room:create', { userId, isPrivate, isRanked, isSealed, gameMode, hostName, sealedBoosterCount, sealedSetChoice, isAnonymous, isEvolving, isHighlander });
    } else {
      console.error('[Socket] Cannot create room: not connected');
      set({ error: 'Not connected to server.', errorKey: 'game.error.notConnected' });
    }
  },

  joinRoom: (code: string, userId: string) => {
    const { socket, connected } = get();
    if (socket && connected) {
      console.log('[Socket] Emitting room:join', code);
      if (get().roomCode !== code) {
        const staleTimer = get()._resyncTimer;
        if (staleTimer) clearInterval(staleTimer);
        set({ ...buildMatchContextReset(), _resyncTimer: null } as Partial<SocketStore> as SocketStore);
      }
      socket.emit('room:join', { code, userId });
      set({ roomCode: code, joinState: 'joining', chatMessages: [], unreadChatCount: 0, chatLockState: null, chatOpponent: null, chatFriendStatus: null, chatFriendshipId: null });
    } else {
      console.error('[Socket] Cannot join room: not connected');
      set({ joinState: 'failed', error: 'Not connected to server.', errorKey: 'game.error.notConnected' });
    }
  },

  leaveMatchContext: () => {
    const { _resyncTimer } = get();
    if (_resyncTimer) clearInterval(_resyncTimer);
    clearRejoinTimers();
    writeStoredMatchContext(null);
    set({ ...buildMatchContextReset(), _resyncTimer: null } as Partial<SocketStore> as SocketStore);
    syncConnectionPhase();
  },

  clearPendingMatchEntry: () => set({ pendingMatchEntry: null }),

  clearPendingMatchExit: () => set({ pendingMatchExit: null }),

  acknowledgeMatchEntry: (roomCode: string) => {
    const { socket, connected } = get();
    if (socket && connected) socket.emit('match:enter-ack', { roomCode });
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

  clearError: () => set({ error: null, errorKey: null, errorParams: null, bannedCardsError: null, spectateErrorKey: null }),

  forfeit: (reason: 'abandon' | 'timeout') => {
    const { socket, connected, roomCode, userId } = get();
    if (socket && connected) {
      console.log('[Socket] Emitting action:forfeit, reason:', reason);
      socket.emit('action:forfeit', { reason, roomCode: roomCode ?? undefined, userId: userId ?? undefined });
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
    set({ spectateErrorKey: null, spectatingRoomCode: roomCode, isSpectating: true, chatMessages: [], unreadChatCount: 0, chatLockState: null, chatOpponent: null, chatFriendStatus: null, chatFriendshipId: null });
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
      spectateErrorKey: null,
      isSpectating: false, spectatingRoomCode: null, spectatorCount: 0,
      visibleState: null, playerNames: null, gameStarted: false,
      chessClock: null,
      currentRoomIsEvolving: false, currentRoomIsHighlander: false, currentRoomHoloHue: null,
      chatMessages: [], unreadChatCount: 0, chatLockState: null, chatOpponent: null, chatFriendStatus: null, chatFriendshipId: null,
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
      set({
        roomCode: pendingReconnect.roomCode,
        playerRole: pendingReconnect.playerRole,
        seatBound: false,
        pendingReconnect: null,
        opponentDisconnected: false,
        opponentForfeitAt: null,
      });
      requestRejoinIfNeeded(true);
    }
  },

  

  requestChatLockState: () => {
    get().socket?.emit('chat:lock-get');
  },

  sendDm: (toUserId: string, body: string) => {
    get().socket?.emit('dm:send', { toUserId, body });
  },

  markDmRead: (threadKey: string) => {
    get().socket?.emit('dm:read', { threadKey });
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

const IDENTITY_ERROR_KEYS = new Set([
  'game.error.authMismatch',
  'game.error.connectionLost',
  'game.error.rejoinFailed',
  'game.error.rejoinRoomGone',
]);

function syncConnectionPhase(): void {
  const s = useSocketStore.getState();
  const phase = deriveConnectionPhase({
    transportConnected: s.connected,
    hasMatchContext: !!s.roomCode && s.gameStarted && !s.gameEnded,
    seatBound: s.seatBound,
  });
  if (phase !== s.connectionPhase) useSocketStore.setState({ connectionPhase: phase });
}

function markSeatBound(): void {
  clearRejoinTimers();
  rejoinAttempt = 0;
  if (!useSocketStore.getState().seatBound) {
    useSocketStore.setState({ seatBound: true });
  }
  syncConnectionPhase();
}

function persistMatchContext(): void {
  const s = useSocketStore.getState();
  if (!s.roomCode || !s.playerRole || !s.userId) return;
  writeStoredMatchContext({ roomCode: s.roomCode, playerRole: s.playerRole, userId: s.userId });
}

export function requestRejoinIfNeeded(force = false): void {
  const s = useSocketStore.getState();
  if (!s.socket) return;
  if (rejoinSuppressed && !force) return;
  if (force) rejoinSuppressed = false;
  if (!force && !shouldAttemptRejoin({
    transportConnected: s.connected,
    roomCode: s.roomCode,
    userId: s.userId,
    seatBound: s.seatBound,
    gameEnded: s.gameEnded,
  })) {
    return;
  }
  if (!s.connected || !s.roomCode || !s.userId) return;
  if (rejoinAckTimer) return;

  console.log('[Socket] Requesting seat rejoin for room', s.roomCode, 'attempt', rejoinAttempt + 1);
  syncConnectionPhase();
  s.socket.emit('game:rejoin', { roomCode: s.roomCode, userId: s.userId });
  rejoinAckTimer = setTimeout(() => {
    rejoinAckTimer = null;
    if (useSocketStore.getState().seatBound) return;
    handleRejoinFailure('no-response');
  }, REJOIN_ACK_TIMEOUT_MS);
}

function releaseUnrecoverableMatch(): void {
  const s = useSocketStore.getState();
  if (!s.gameStarted || s.gameEnded || s.gameCancelled) return;
  const lostRoomCode = s.roomCode;
  if (!lostRoomCode) return;
  console.warn('[Socket] The seat cannot be recovered, releasing the match so the player is not stuck on a dead board');
  if (s._resyncTimer) clearInterval(s._resyncTimer);
  useSocketStore.setState(buildGameCancelledStateReset('unavailable', lostRoomCode));
  syncConnectionPhase();
}

function handleRejoinFailure(reason: RejoinFailureReason): void {
  if (rejoinAckTimer) {
    clearTimeout(rejoinAckTimer);
    rejoinAckTimer = null;
  }
  const plan = decideRejoinRetry(rejoinAttempt, reason);
  useSocketStore.setState({
    seatBound: false,
    errorKey: rejoinFailureErrorKey(reason),
  });
  syncConnectionPhase();

  if (plan.kind === 'stop') {
    console.warn('[Socket] Giving up on the rejoin, reason:', reason);
    clearRejoinTimers();
    writeStoredMatchContext(null);
    rejoinAttempt = 0;
    releaseUnrecoverableMatch();
    return;
  }

  rejoinAttempt += 1;
  if (rejoinRetryTimer) clearTimeout(rejoinRetryTimer);
  rejoinRetryTimer = setTimeout(() => {
    rejoinRetryTimer = null;
    requestRejoinIfNeeded(true);
  }, plan.delayMs);
}
