'use client';

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname, useRouter } from '@/lib/i18n/navigation';
import { useSocketStore } from '@/lib/socket/client';

export function MatchEntryGate() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const connect = useSocketStore((s) => s.connect);
  const connected = useSocketStore((s) => s.connected);
  const socket = useSocketStore((s) => s.socket);
  const pendingMatchEntry = useSocketStore((s) => s.pendingMatchEntry);
  const pendingMatchExit = useSocketStore((s) => s.pendingMatchExit);
  const clearPendingMatchEntry = useSocketStore((s) => s.clearPendingMatchEntry);
  const clearPendingMatchExit = useSocketStore((s) => s.clearPendingMatchExit);
  const leaveMatchContext = useSocketStore((s) => s.leaveMatchContext);
  const acknowledgeMatchEntry = useSocketStore((s) => s.acknowledgeMatchEntry);

  const userId = session?.user?.id;
  const userName = session?.user?.name ?? undefined;

  useEffect(() => {
    if (!userId) return;
    if (socket && (connected || socket.active)) return;
    const id = setTimeout(() => {
      const current = useSocketStore.getState().socket;
      if (current && (current.connected || current.active)) return;
      connect(userId, userName).catch(() => {});
    }, 400);
    return () => clearTimeout(id);
  }, [userId, userName, socket, connected, connect]);

  useEffect(() => {
    if (!socket || !userId) return;
    const onConfirm = (d: { matchId?: string; tournamentId?: string }) => {
      if (!d?.matchId || !d?.tournamentId) return;
      socket.emit('tournament:ready', { tournamentId: d.tournamentId, matchId: d.matchId, userId });
    };
    socket.on('tournament:please-confirm-ready', onConfirm);
    return () => { socket.off('tournament:please-confirm-ready', onConfirm); };
  }, [socket, userId]);

  const navigatingToRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pendingMatchEntry) {
      navigatingToRef.current = null;
      return;
    }
    const target = pendingMatchEntry.roomCode;
    if (navigatingToRef.current === target) return;

    const alreadyThere =
      pathname.includes('/play/online') &&
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('room') === target;

    acknowledgeMatchEntry(target);

    if (alreadyThere) {
      clearPendingMatchEntry();
      return;
    }

    navigatingToRef.current = target;
    leaveMatchContext();
    clearPendingMatchEntry();
    router.push(('/play/online?room=' + target) as '/');
  }, [pendingMatchEntry, pathname, router, leaveMatchContext, clearPendingMatchEntry, acknowledgeMatchEntry]);

  useEffect(() => {
    if (!pendingMatchExit) return;
    const tid = pendingMatchExit;
    clearPendingMatchExit();
    router.push(('/tournaments/' + tid) as '/');
  }, [pendingMatchExit, router, clearPendingMatchExit]);

  return null;
}
