'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/lib/i18n/navigation';
import { useSocketStore, requestRejoinIfNeeded, armReadiedMatch, isMatchReadied, clearReadiedMatch } from '@/lib/socket/client';
import { Z_APP_MODAL } from '@/lib/ui/zIndex';

const READY_WINDOW_MS = 2 * 60 * 1000;

export function MatchEntryGate() {
  const { data: session } = useSession();
  const t = useTranslations('tournament');
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

  const [pendingReady, setPendingReady] = useState<{ matchId: string; tournamentId: string; deadline: number } | null>(null);
  const [readyNow, setReadyNow] = useState(0);

  useEffect(() => {
    if (!socket || !userId) return;
    const onConfirm = (d: { matchId?: string; tournamentId?: string }) => {
      if (!d?.matchId || !d?.tournamentId) return;
      if (isMatchReadied(d.matchId)) {
        socket.emit('tournament:ready', { tournamentId: d.tournamentId, matchId: d.matchId, userId });
        return;
      }
      setPendingReady((current) =>
        current && current.matchId === d.matchId
          ? current
          : { matchId: d.matchId!, tournamentId: d.tournamentId!, deadline: Date.now() + READY_WINDOW_MS },
      );
    };
    const onMatchUpdated = (d: { matchId?: string; status?: string }) => {
      if (!d?.matchId) return;
      if (d.status === 'in_progress' || d.status === 'completed' || d.status === 'forfeit') {
        clearReadiedMatch(d.matchId);
        setPendingReady((current) => (current?.matchId === d.matchId ? null : current));
      }
    };
    socket.on('tournament:please-confirm-ready', onConfirm);
    socket.on('tournament:match-updated', onMatchUpdated);
    return () => {
      socket.off('tournament:please-confirm-ready', onConfirm);
      socket.off('tournament:match-updated', onMatchUpdated);
    };
  }, [socket, userId]);

  useEffect(() => {
    if (!pendingReady) return;
    const id = setInterval(() => setReadyNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [pendingReady]);

  const confirmReady = () => {
    if (!pendingReady || !socket || !userId) return;
    armReadiedMatch(pendingReady.matchId);
    socket.emit('tournament:ready', { tournamentId: pendingReady.tournamentId, matchId: pendingReady.matchId, userId });
    setPendingReady(null);
  };

  useEffect(() => {
    if (!pendingReady) return;
    if (readyNow >= pendingReady.deadline && readyNow > 0) confirmReady();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyNow, pendingReady]);

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
      const st = useSocketStore.getState();
      if (st.roomCode === target && !st.seatBound && !st.gameStarted) {
        requestRejoinIfNeeded(true);
      } else if (st.roomCode !== target && st.socket && st.userId) {
        st.joinRoom(target, st.userId);
      }
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

  if (!pendingReady) return null;

  const secondsLeft = Math.max(0, Math.ceil((pendingReady.deadline - (readyNow || Date.now())) / 1000));
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 px-5 py-3"
      style={{
        zIndex: Z_APP_MODAL - 1,
        backgroundColor: '#141414',
        boxShadow: '0 0 14px rgba(196, 163, 90, 0.25), 0 12px 32px rgba(0,0,0,0.5)',
        maxWidth: 'min(94vw, 26rem)',
      }}
    >
      <div className="flex flex-col min-w-0">
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#c4a35a' }}>
          {t('readyPrompt.title')}
        </span>
        <span className="text-[11px] leading-snug" style={{ color: '#999' }}>
          {t('readyPrompt.hint')}
        </span>
      </div>
      <span className="shrink-0 text-base font-bold tabular-nums" style={{ color: secondsLeft <= 30 ? '#b37e3e' : '#e0e0e0' }}>
        {minutes}:{seconds}
      </span>
      <button
        onClick={confirmReady}
        className="shrink-0 px-4 py-2 text-xs font-bold uppercase tracking-wider cursor-pointer"
        style={{ backgroundColor: '#c4a35a', color: '#0a0a0a' }}
      >
        {t('readyPrompt.ready')}
      </button>
    </div>
  );
}
