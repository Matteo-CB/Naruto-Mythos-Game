import { create } from 'zustand';
import type { SwissStanding } from '@/lib/tournament/swissEngine';

export interface TournamentMatch {
  id: string;
  tournamentId: string;
  round: number;
  matchIndex: number;
  player1Id: string | null;
  player2Id: string | null;
  player1Username: string | null;
  player2Username: string | null;
  winnerId: string | null;
  winnerUsername: string | null;
  isBye: boolean;
  status: string;
  roomCode: string | null;
  gameId: string | null;
  absenceDeadline: string | null;
  absentPlayerId: string | null;
}

export interface TournamentParticipant {
  id: string;
  userId: string;
  username: string;
  seed: number | null;
  eliminated: boolean;
  eliminatedRound: number | null;
  hasBye: boolean;
}

export interface TournamentData {
  id: string;
  name: string;
  type: string;
  status: string;
  gameMode: string;
  maxPlayers: number;
  currentRound: number;
  totalRounds: number;
  isPublic: boolean;
  joinCode: string | null;
  creatorId: string;
  creatorUsername: string;
  requiresDiscord: boolean;
  useBanList: boolean;
  sealedBoosterCount: number | null;
  discordRoleReward: string | null;
  bannedCardIds: string[];
  allowedLeagues: string[];
  format?: 'swiss' | 'elimination';
  winnerId: string | null;
  winnerUsername: string | null;
  participants: TournamentParticipant[];
  matches: TournamentMatch[];
  standings?: SwissStanding[];
  _count?: { participants: number; matches: number };
  createdAt: string;
}

interface TournamentStore {
  activeTournament: TournamentData | null;
  simulatorTournaments: TournamentData[];
  playerTournaments: TournamentData[];
  loading: boolean;
  error: string | null;
  fetchTournaments: (type: 'simulator' | 'player') => Promise<void>;
  fetchTournament: (id: string) => Promise<void>;
  joinTournament: (id: string, code?: string) => Promise<void>;
  joinByCode: (code: string) => Promise<string>;
  leaveTournament: (id: string) => Promise<void>;
  createTournament: (data: CreateTournamentInput) => Promise<string>;
  startTournament: (id: string) => Promise<void>;
  forfeitMatch: (tournamentId: string, matchId: string, forfeitPlayerId: string) => Promise<void>;
  selectDeck: (tournamentId: string, deckId: string) => Promise<{ valid: boolean; errors: string[] }>;
  handleTournamentUpdate: (data: Partial<TournamentData> & { id?: string }) => void;
  handleMatchUpdate: (data: Partial<TournamentMatch> & { matchId: string }) => void;
  handleTournamentComplete: (data: { winnerId: string; winnerUsername: string }) => void;
  handleRoundComplete: (data: { completedRound: number; nextRound: number }) => void;
  handleStandingsUpdate: (data: { standings: SwissStanding[] }) => void;
  handleSwissRoundGenerated: (data: { round: number }) => void;
  clearActiveTournament: () => void;
  clearError: () => void;
}

export interface CreateTournamentInput {
  name: string;
  type: 'simulator';
  format?: 'swiss' | 'elimination';
  gameMode: 'classic' | 'sealed' | 'restricted';
  maxPlayers: number;
  isPublic: boolean;
  useBanList: boolean;
  sealedBoosterCount?: 4 | 5 | 6;
  bannedCardIds?: string[];
  allowedLeagues?: string[];
  scheduledStartAt?: string;
  // Restricted mode
  allowedGroups?: string[];
  bannedGroups?: string[];
  allowedKeywords?: string[];
  bannedKeywords?: string[];
  allowedRarities?: string[];
  bannedRarities?: string[];
  maxPerRarity?: Record<string, number>;
  maxCopiesPerCard?: number;
  minDeckSize?: number;
  maxDeckSize?: number;
  maxChakraCost?: number;
  restrictionNote?: string;
}

export const useTournamentStore = create<TournamentStore>()((set, get) => ({
  activeTournament: null,
  simulatorTournaments: [],
  playerTournaments: [],
  loading: false,
  error: null,

  fetchTournaments: async (type) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`/api/tournaments?type=${type}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      if (type === 'simulator') set({ simulatorTournaments: data.tournaments });
      else set({ playerTournaments: data.tournaments });
    } catch { set({ error: 'Failed to fetch tournaments' }); }
    finally { set({ loading: false }); }
  },

  fetchTournament: async (id) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`/api/tournaments/${id}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      set({ activeTournament: data.tournament });
    } catch { set({ error: 'Tournament not found' }); }
    finally { set({ loading: false }); }
  },

  joinTournament: async (id, code?) => {
    const res = await fetch(`/api/tournaments/${id}/join`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ joinCode: code }),
    });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to join'); }
    await get().fetchTournament(id);
  },

  joinByCode: async (code) => {
    const res = await fetch('/api/tournaments/join-by-code', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to join'); }
    const data = await res.json();
    return data.tournamentId;
  },

  leaveTournament: async (id) => {
    const res = await fetch(`/api/tournaments/${id}/leave`, { method: 'POST' });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to leave'); }
    await get().fetchTournament(id);
  },

  createTournament: async (input) => {
    const res = await fetch('/api/tournaments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to create'); }
    const data = await res.json();
    return data.tournament.id;
  },

  startTournament: async (id) => {
    const res = await fetch(`/api/tournaments/${id}/start`, { method: 'POST' });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to start'); }
    const data = await res.json();
    set({ activeTournament: data.tournament });
  },

  forfeitMatch: async (tournamentId, matchId, forfeitPlayerId) => {
    const res = await fetch(`/api/tournaments/${tournamentId}/matches/${matchId}/forfeit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ forfeitPlayerId }),
    });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Forfeit failed'); }
    await get().fetchTournament(tournamentId);
  },

  selectDeck: async (tournamentId, deckId) => {
    const res = await fetch(`/api/tournaments/${tournamentId}/select-deck`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deckId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Deck selection failed');
    await get().fetchTournament(tournamentId);
    return { valid: data.deckValid, errors: data.errors ?? [] };
  },

  handleTournamentUpdate: (data) => {
    const current = get().activeTournament;
    if (current) set({ activeTournament: { ...current, ...data } });
  },

  handleMatchUpdate: (data) => {
    const current = get().activeTournament;
    if (!current) return;
    const matches = current.matches.map(m => m.id === data.matchId ? { ...m, ...data } : m);
    set({ activeTournament: { ...current, matches } });
  },

  handleTournamentComplete: (data) => {
    const current = get().activeTournament;
    if (current) set({ activeTournament: { ...current, status: 'completed', winnerId: data.winnerId, winnerUsername: data.winnerUsername } });
  },

  handleRoundComplete: (data) => {
    const current = get().activeTournament;
    if (current) set({ activeTournament: { ...current, currentRound: data.nextRound } });
  },

  handleStandingsUpdate: (data) => {
    const current = get().activeTournament;
    if (current) set({ activeTournament: { ...current, standings: data.standings } });
  },

  handleSwissRoundGenerated: (data) => {
    const current = get().activeTournament;
    if (current) {
      set({ activeTournament: { ...current, currentRound: data.round } });
      // Refetch to get the new round matches
      get().fetchTournament(current.id);
    }
  },

  clearActiveTournament: () => set({ activeTournament: null }),
  clearError: () => set({ error: null }),
}));
