'use client';

import { create } from 'zustand';

// --- Interfaces ---

interface Friend {
  id: string;
  username: string;
  elo: number;
  friendshipId: string;
  since: string;
}

interface FriendRequest {
  friendshipId: string;
  user: { id: string; username: string; elo: number };
  createdAt: string;
}

interface MatchInvitation {
  inviteId: string;
  user: { id: string; username: string; elo: number };
  expiresAt: string;
  roomCode?: string;
}

interface SearchResult {
  id: string;
  username: string;
  elo: number;
}

interface SocialStore {
  // State
  friends: Friend[];
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  incomingMatchInvites: MatchInvitation[];
  outgoingMatchInvites: MatchInvitation[];
  searchResults: SearchResult[];
  searchLoading: boolean;
  loading: boolean;

  // API Actions
  fetchFriends: () => Promise<void>;
  fetchRequests: () => Promise<void>;
  fetchPendingInvites: () => Promise<void>;
  searchUsers: (query: string) => Promise<void>;
  sendFriendRequest: (receiverId: string) => Promise<void>;
  acceptFriendRequest: (friendshipId: string) => Promise<void>;
  declineFriendRequest: (friendshipId: string) => Promise<void>;
  removeFriend: (friendshipId: string) => Promise<void>;
  sendMatchInvite: (receiverId: string) => Promise<void>;
  acceptMatchInvite: (inviteId: string) => Promise<string | null>;
  declineMatchInvite: (inviteId: string) => Promise<void>;
  cancelMatchInvite: (inviteId: string) => Promise<void>;
  clearSearch: () => void;

  // Socket event handlers
  handleFriendRequestReceived: (data: FriendRequest) => void;
  handleFriendRequestAccepted: (data: { friendshipId: string; friend: Friend }) => void;
  handleFriendRemoved: (data: { friendshipId: string }) => void;
  handleMatchInviteReceived: (data: MatchInvitation) => void;
  handleMatchInviteAccepted: (data: { inviteId: string; roomCode: string }) => void;
  handleMatchInviteDeclined: (inviteId: string) => void;
  handleMatchInviteCancelled: (inviteId: string) => void;
}

// --- Store ---

export const useSocialStore = create<SocialStore>((set, get) => ({
  // Initial state
  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
  incomingMatchInvites: [],
  outgoingMatchInvites: [],
  searchResults: [],
  searchLoading: false,
  loading: false,

  // --- API Actions ---

  fetchFriends: async () => {
    set({ loading: true });
    try {
      const res = await fetch('/api/friends');
      const data = await res.json();
      if (res.ok) {
        set({ friends: data.friends ?? data });
      }
    } catch {
      // Silently handle network errors
    } finally {
      set({ loading: false });
    }
  },

  fetchRequests: async () => {
    set({ loading: true });
    try {
      const res = await fetch('/api/friends/requests');
      const data = await res.json();
      if (res.ok) {
        set({
          incomingRequests: data.incoming ?? [],
          outgoingRequests: data.outgoing ?? [],
        });
      }
    } catch {
      // Silently handle network errors
    } finally {
      set({ loading: false });
    }
  },

  fetchPendingInvites: async () => {
    set({ loading: true });
    try {
      const res = await fetch('/api/match-invite/pending');
      const data = await res.json();
      if (res.ok) {
        set({
          incomingMatchInvites: data.incoming ?? [],
          outgoingMatchInvites: data.outgoing ?? [],
        });
      }
    } catch {
      // Silently handle network errors
    } finally {
      set({ loading: false });
    }
  },

  searchUsers: async (query: string) => {
    if (!query.trim()) {
      set({ searchResults: [], searchLoading: false });
      return;
    }
    set({ searchLoading: true });
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (res.ok) {
        set({ searchResults: data.users ?? data });
      }
    } catch {
      // Silently handle network errors
    } finally {
      set({ searchLoading: false });
    }
  },

  sendFriendRequest: async (receiverId: string) => {
    try {
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiverId }),
      });
      const data = await res.json();
      if (res.ok) {
        // Re-fetch requests to stay in sync
        await get().fetchRequests();
      }
    } catch {
      // Silently handle network errors
    }
  },

  acceptFriendRequest: async (friendshipId: string) => {
    try {
      const res = await fetch('/api/friends/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendshipId }),
      });
      const data = await res.json();
      if (res.ok) {
        // Optimistically remove from incoming requests
        set((state) => ({
          incomingRequests: state.incomingRequests.filter(
            (r) => r.friendshipId !== friendshipId
          ),
        }));
        // Re-fetch friends to get the updated list
        await get().fetchFriends();
      }
    } catch {
      // Silently handle network errors
    }
  },

  declineFriendRequest: async (friendshipId: string) => {
    try {
      const res = await fetch('/api/friends/decline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendshipId }),
      });
      const data = await res.json();
      if (res.ok) {
        // Optimistically remove from incoming requests
        set((state) => ({
          incomingRequests: state.incomingRequests.filter(
            (r) => r.friendshipId !== friendshipId
          ),
        }));
      }
    } catch {
      // Silently handle network errors
    }
  },

  removeFriend: async (friendshipId: string) => {
    try {
      const res = await fetch(`/api/friends/${friendshipId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok) {
        // Optimistically remove from friends list
        set((state) => ({
          friends: state.friends.filter((f) => f.friendshipId !== friendshipId),
        }));
      }
    } catch {
      // Silently handle network errors
    }
  },

  sendMatchInvite: async (receiverId: string) => {
    try {
      const res = await fetch('/api/match-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiverId }),
      });
      const data = await res.json();
      if (res.ok) {
        // Re-fetch pending invites to stay in sync
        await get().fetchPendingInvites();
      }
    } catch {
      // Silently handle network errors
    }
  },

  acceptMatchInvite: async (inviteId: string) => {
    try {
      const res = await fetch('/api/match-invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId }),
      });
      const data = await res.json();
      if (res.ok) {
        // Remove from incoming invites
        set((state) => ({
          incomingMatchInvites: state.incomingMatchInvites.filter(
            (inv) => inv.inviteId !== inviteId
          ),
        }));
        return data.roomCode ?? null;
      }
      return null;
    } catch {
      return null;
    }
  },

  declineMatchInvite: async (inviteId: string) => {
    try {
      const res = await fetch('/api/match-invite/decline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId }),
      });
      const data = await res.json();
      if (res.ok) {
        // Optimistically remove from incoming invites
        set((state) => ({
          incomingMatchInvites: state.incomingMatchInvites.filter(
            (inv) => inv.inviteId !== inviteId
          ),
        }));
      }
    } catch {
      // Silently handle network errors
    }
  },

  cancelMatchInvite: async (inviteId: string) => {
    try {
      const res = await fetch('/api/match-invite/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId }),
      });
      const data = await res.json();
      if (res.ok) {
        // Optimistically remove from outgoing invites
        set((state) => ({
          outgoingMatchInvites: state.outgoingMatchInvites.filter(
            (inv) => inv.inviteId !== inviteId
          ),
        }));
      }
    } catch {
      // Silently handle network errors
    }
  },

  clearSearch: () => {
    set({ searchResults: [], searchLoading: false });
  },

  // --- Socket Event Handlers ---

  handleFriendRequestReceived: (data: FriendRequest) => {
    set((state) => {
      // Avoid duplicate entries
      const exists = state.incomingRequests.some(
        (r) => r.friendshipId === data.friendshipId
      );
      if (exists) return {};
      return {
        incomingRequests: [...state.incomingRequests, data],
      };
    });
  },

  handleFriendRequestAccepted: (data: { friendshipId: string; friend: Friend }) => {
    set((state) => ({
      // Remove the matching outgoing request
      outgoingRequests: state.outgoingRequests.filter(
        (r) => r.friendshipId !== data.friendshipId
      ),
      // Add the new friend (avoid duplicates)
      friends: state.friends.some((f) => f.friendshipId === data.friendshipId)
        ? state.friends
        : [...state.friends, data.friend],
    }));
  },

  handleFriendRemoved: (data: { friendshipId: string }) => {
    set((state) => ({
      friends: state.friends.filter((f) => f.friendshipId !== data.friendshipId),
    }));
  },

  handleMatchInviteReceived: (data: MatchInvitation) => {
    set((state) => {
      // Avoid duplicate entries
      const exists = state.incomingMatchInvites.some(
        (inv) => inv.inviteId === data.inviteId
      );
      if (exists) return {};
      return {
        incomingMatchInvites: [...state.incomingMatchInvites, data],
      };
    });
  },

  handleMatchInviteAccepted: (data: { inviteId: string; roomCode: string }) => {
    set((state) => ({
      outgoingMatchInvites: state.outgoingMatchInvites.map((inv) =>
        inv.inviteId === data.inviteId
          ? { ...inv, roomCode: data.roomCode }
          : inv
      ),
    }));
  },

  handleMatchInviteDeclined: (inviteId: string) => {
    set((state) => ({
      outgoingMatchInvites: state.outgoingMatchInvites.filter(
        (inv) => inv.inviteId !== inviteId
      ),
    }));
  },

  handleMatchInviteCancelled: (inviteId: string) => {
    set((state) => ({
      incomingMatchInvites: state.incomingMatchInvites.filter(
        (inv) => inv.inviteId !== inviteId
      ),
    }));
  },
}));
