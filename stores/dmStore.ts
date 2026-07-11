import { create } from 'zustand';
import { dmThreadKey } from '@/lib/chat/constants';

export interface DmMessage {
  id: string;
  threadKey: string;
  senderId: string;
  receiverId: string;
  body: string;
  createdAt: number;
}

export interface DmThread {
  threadKey: string;
  partner: { userId: string; username: string };
  lastMessage: { body: string; senderId: string; createdAt: string | Date } | null;
  unreadCount: number;
}

export type DmLock = 'not_friends' | 'disabled' | null;

interface DmStore {
  isOpen: boolean;
  view: 'list' | 'thread';
  myUserId: string | null;
  partner: { userId: string; username: string } | null;
  threadKey: string | null;
  friendshipId: string | null;
  locked: DmLock;
  threads: DmThread[];
  messages: DmMessage[];
  loadingThreads: boolean;
  loadingMessages: boolean;
  unreadDms: number;
  pendingRequests: number;

  openList: (myUserId: string) => void;
  openThread: (myUserId: string, partner: { userId: string; username: string }) => void;
  close: () => void;
  backToList: () => void;
  loadThreads: () => Promise<void>;
  loadMessages: () => Promise<void>;
  receiveMessage: (msg: DmMessage) => void;
  setUnreadDms: (n: number) => void;
  refreshBadge: () => Promise<void>;
  markActiveThreadRead: (emitRead: (threadKey: string) => void) => void;
}

export const useDmStore = create<DmStore>((set, get) => ({
  isOpen: false,
  view: 'list',
  myUserId: null,
  partner: null,
  threadKey: null,
  friendshipId: null,
  locked: null,
  threads: [],
  messages: [],
  loadingThreads: false,
  loadingMessages: false,
  unreadDms: 0,
  pendingRequests: 0,

  openList: (myUserId) => {
    set({ isOpen: true, view: 'list', myUserId, partner: null, threadKey: null, locked: null, messages: [] });
    get().loadThreads();
  },

  openThread: (myUserId, partner) => {
    const threadKey = dmThreadKey(myUserId, partner.userId);
    set({ isOpen: true, view: 'thread', myUserId, partner, threadKey, locked: null, messages: [], loadingMessages: true });
    get().loadMessages();
  },

  close: () => set({ isOpen: false, partner: null, threadKey: null, messages: [], locked: null }),

  backToList: () => {
    set({ view: 'list', partner: null, threadKey: null, messages: [], locked: null });
    get().loadThreads();
  },

  loadThreads: async () => {
    set({ loadingThreads: true });
    try {
      const res = await fetch('/api/dm/threads');
      if (res.ok) {
        const data = await res.json();
        set({ threads: data.threads ?? [], unreadDms: data.unreadTotal ?? 0 });
      }
    } catch { }
    set({ loadingThreads: false });
  },

  loadMessages: async () => {
    const { threadKey } = get();
    if (!threadKey) return;
    set({ loadingMessages: true });
    try {
      const res = await fetch(`/api/dm/${encodeURIComponent(threadKey)}`);
      if (res.ok) {
        const data = await res.json();
        if (get().threadKey === threadKey) {
          set({
            messages: data.messages ?? [],
            locked: data.locked ?? null,
            friendshipId: data.friendshipId ?? null,
            partner: data.partner ?? get().partner,
          });
        }
      }
    } catch { }
    set({ loadingMessages: false });
  },

  receiveMessage: (msg) => {
    const { isOpen, view, threadKey, messages } = get();
    if (isOpen && view === 'thread' && threadKey === msg.threadKey) {
      if (!messages.some((m) => m.id === msg.id)) {
        set({ messages: [...messages, msg].slice(-200) });
      }
    } else if (isOpen && view === 'list') {
      get().loadThreads();
    }
  },

  setUnreadDms: (n) => set({ unreadDms: n }),

  refreshBadge: async () => {
    try {
      const res = await fetch('/api/social/badge');
      if (res.ok) {
        const data = await res.json();
        set({ unreadDms: data.unreadDms ?? 0, pendingRequests: data.pendingRequests ?? 0 });
      }
    } catch { }
  },

  markActiveThreadRead: (emitRead) => {
    const { threadKey } = get();
    if (threadKey) emitRead(threadKey);
  },
}));
