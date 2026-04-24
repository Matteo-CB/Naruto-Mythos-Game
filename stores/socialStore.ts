'use client';

import { create } from 'zustand';



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
  
  friends: Friend[];
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  incomingMatchInvites: MatchInvitation[];
  outgoingMatchInvites: MatchInvitation[];
  searchResults: SearchResult[];
  searchLoading: boolean;
  loading: boolean;

  
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

  
  handleFriendRequestReceived: (data: FriendRequest) => void;
  handleFriendRequestAccepted: (data: { friendshipId: string; friend: Friend }) => void;
  handleFriendRemoved: (data: { friendshipId: string }) => void;
  handleMatchInviteReceived: (data: MatchInvitation) => void;
  handleMatchInviteAccepted: (data: { inviteId: string; roomCode: string }) => void;
  handleMatchInviteDeclined: (inviteId: string) => void;
  handleMatchInviteCancelled: (inviteId: string) => void;
}



export const useSocialStore = create<SocialStore>((set, get) => ({
  
  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
  incomingMatchInvites: [],
  outgoingMatchInvites: [],
  searchResults: [],
  searchLoading: false,
  loading: false,

  

  fetchFriends: async () => {
    set({ loading: true });
    try {
      const res = await fetch('/api/friends', { credentials: 'include' });
      const data = await res.json();
      if (res.ok) {
        set({ friends: data.friends ?? data });
      }
    } catch {
      
    } finally {
      set({ loading: false });
    }
  },

  fetchRequests: async () => {
    set({ loading: true });
    try {
      const res = await fetch('/api/friends/requests', { credentials: 'include' });
      const data = await res.json();
      if (res.ok) {
        
        const incoming: FriendRequest[] = (data.incoming ?? []).map((r: Record<string, unknown>) => ({
          friendshipId: r.id as string,
          user: r.sender as { id: string; username: string; elo: number },
          createdAt: r.createdAt as string,
        }));
        const outgoing: FriendRequest[] = (data.outgoing ?? []).map((r: Record<string, unknown>) => ({
          friendshipId: r.id as string,
          user: r.receiver as { id: string; username: string; elo: number },
          createdAt: r.createdAt as string,
        }));
        set({ incomingRequests: incoming, outgoingRequests: outgoing });
      }
    } catch {
      
    } finally {
      set({ loading: false });
    }
  },

  fetchPendingInvites: async () => {
    set({ loading: true });
    try {
      const res = await fetch('/api/match-invite/pending', { credentials: 'include' });
      const data = await res.json();
      if (res.ok) {
        set({
          incomingMatchInvites: data.incoming ?? [],
          outgoingMatchInvites: data.outgoing ?? [],
        });
      }
    } catch {
      
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
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`, { credentials: 'include' });
      const data = await res.json();
      if (res.ok) {
        set({ searchResults: data.users ?? data });
      }
    } catch {
      
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
        credentials: 'include',
      });
      if (res.ok) {
        
        await get().fetchRequests();
      }
    } catch {
      
    }
  },

  acceptFriendRequest: async (friendshipId: string) => {
    try {
      const res = await fetch('/api/friends/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendshipId }),
        credentials: 'include',
      });
      if (res.ok) {
        
        set((state) => ({
          incomingRequests: state.incomingRequests.filter(
            (r) => r.friendshipId !== friendshipId
          ),
        }));
        
        await get().fetchFriends();
      }
    } catch {
      
    }
  },

  declineFriendRequest: async (friendshipId: string) => {
    try {
      const res = await fetch('/api/friends/decline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendshipId }),
        credentials: 'include',
      });
      if (res.ok) {
        
        set((state) => ({
          incomingRequests: state.incomingRequests.filter(
            (r) => r.friendshipId !== friendshipId
          ),
        }));
      }
    } catch {
      
    }
  },

  removeFriend: async (friendshipId: string) => {
    try {
      const res = await fetch(`/api/friends/${friendshipId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        
        set((state) => ({
          friends: state.friends.filter((f) => f.friendshipId !== friendshipId),
        }));
      }
    } catch {
      
    }
  },

  sendMatchInvite: async (receiverId: string) => {
    try {
      const res = await fetch('/api/match-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiverId }),
        credentials: 'include',
      });
      if (res.ok) {
        
        await get().fetchPendingInvites();
      }
    } catch {
      
    }
  },

  acceptMatchInvite: async (inviteId: string) => {
    try {
      const res = await fetch('/api/match-invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId }),
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok) {
        
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
        credentials: 'include',
      });
      if (res.ok) {
        
        set((state) => ({
          incomingMatchInvites: state.incomingMatchInvites.filter(
            (inv) => inv.inviteId !== inviteId
          ),
        }));
      }
    } catch {
      
    }
  },

  cancelMatchInvite: async (inviteId: string) => {
    try {
      const res = await fetch('/api/match-invite/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId }),
        credentials: 'include',
      });
      if (res.ok) {
        
        set((state) => ({
          outgoingMatchInvites: state.outgoingMatchInvites.filter(
            (inv) => inv.inviteId !== inviteId
          ),
        }));
      }
    } catch {
      
    }
  },

  clearSearch: () => {
    set({ searchResults: [], searchLoading: false });
  },

  

  handleFriendRequestReceived: (data: FriendRequest) => {
    set((state) => {
      
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
      
      outgoingRequests: state.outgoingRequests.filter(
        (r) => r.friendshipId !== data.friendshipId
      ),
      
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
