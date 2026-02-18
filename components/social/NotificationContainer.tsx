'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useSocialStore } from '@/stores/socialStore';
import { FriendRequestToast } from './FriendRequestToast';
import { MatchInviteToast } from './MatchInviteToast';

interface Notification {
  type: 'friend' | 'match';
  id: string;
  data: any;
  addedAt: number;
}

const MAX_VISIBLE = 3;
const FRIEND_REQUEST_TIMEOUT = 15000;

export function NotificationContainer() {
  const router = useRouter();
  const incomingRequests = useSocialStore((s) => s.incomingRequests);
  const incomingMatchInvites = useSocialStore((s) => s.incomingMatchInvites);

  const [activeNotifications, setActiveNotifications] = useState<Notification[]>([]);

  const prevRequestIdsRef = useRef<Set<string>>(new Set());
  const prevInviteIdsRef = useRef<Set<string>>(new Set());
  const dismissTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Watch for new incoming friend requests
  useEffect(() => {
    const currentIds = new Set(incomingRequests.map((r) => r.friendshipId));
    const prevIds = prevRequestIdsRef.current;

    const newRequests = incomingRequests.filter(
      (r) => !prevIds.has(r.friendshipId),
    );

    if (newRequests.length > 0) {
      setActiveNotifications((prev) => {
        const newNotifs: Notification[] = newRequests.map((r) => ({
          type: 'friend' as const,
          id: `friend-${r.friendshipId}`,
          data: r,
          addedAt: Date.now(),
        }));

        // Filter out duplicates
        const existingIds = new Set(prev.map((n) => n.id));
        const uniqueNew = newNotifs.filter((n) => !existingIds.has(n.id));

        return [...prev, ...uniqueNew];
      });

      // Set auto-dismiss timers for friend requests
      for (const r of newRequests) {
        const notifId = `friend-${r.friendshipId}`;
        const timer = setTimeout(() => {
          dismiss(notifId);
        }, FRIEND_REQUEST_TIMEOUT);
        dismissTimersRef.current.set(notifId, timer);
      }
    }

    prevRequestIdsRef.current = currentIds;
  }, [incomingRequests]);

  // Watch for new incoming match invites
  useEffect(() => {
    const currentIds = new Set(incomingMatchInvites.map((inv) => inv.inviteId));
    const prevIds = prevInviteIdsRef.current;

    const newInvites = incomingMatchInvites.filter(
      (inv) => !prevIds.has(inv.inviteId),
    );

    if (newInvites.length > 0) {
      setActiveNotifications((prev) => {
        const newNotifs: Notification[] = newInvites.map((inv) => ({
          type: 'match' as const,
          id: `match-${inv.inviteId}`,
          data: inv,
          addedAt: Date.now(),
        }));

        const existingIds = new Set(prev.map((n) => n.id));
        const uniqueNew = newNotifs.filter((n) => !existingIds.has(n.id));

        return [...prev, ...uniqueNew];
      });
    }

    prevInviteIdsRef.current = currentIds;
  }, [incomingMatchInvites]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of dismissTimersRef.current.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  const dismiss = useCallback((notifId: string) => {
    setActiveNotifications((prev) => prev.filter((n) => n.id !== notifId));
    const timer = dismissTimersRef.current.get(notifId);
    if (timer) {
      clearTimeout(timer);
      dismissTimersRef.current.delete(notifId);
    }
  }, []);

  const handleMatchAccepted = useCallback(
    (roomCode: string) => {
      router.push(`/play/online?room=${roomCode}`);
    },
    [router],
  );

  // Only show the most recent MAX_VISIBLE notifications
  const visibleNotifications = activeNotifications.slice(-MAX_VISIBLE);

  return (
    <div
      className="flex flex-col gap-3"
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 50,
        pointerEvents: 'none',
      }}
    >
      <AnimatePresence mode="popLayout">
        {visibleNotifications.map((notif) => (
          <div key={notif.id} style={{ pointerEvents: 'auto' }}>
            {notif.type === 'friend' && (
              <FriendRequestToast
                request={notif.data}
                onDismiss={() => dismiss(notif.id)}
              />
            )}
            {notif.type === 'match' && (
              <MatchInviteToast
                invite={notif.data}
                onDismiss={() => dismiss(notif.id)}
                onAccepted={handleMatchAccepted}
              />
            )}
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
