'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useRouter } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { Footer } from '@/components/Footer';
import { useSocketStore } from '@/lib/socket/client';
import { useToastStore } from '@/stores/toastStore';
import { clearUnlockedVariantsCache } from '@/lib/hooks/useUnlockedVariants';
import { validateOffer } from '@/lib/trade/inventory-rules';
import { TradeOfferPanel } from '@/components/trade/TradeOfferPanel';
import { TradeReceivePanel } from '@/components/trade/TradeReceivePanel';
import { TradeInventoryGrid } from '@/components/trade/TradeInventoryGrid';
import { TradeConfirmBar } from '@/components/trade/TradeConfirmBar';

const PANEL_CLIP = 'polygon(14px 0, calc(100% - 14px) 0, 100% 14px, 100% calc(100% - 14px), calc(100% - 14px) 100%, 14px 100%, 0 calc(100% - 14px), 0 14px)';
const PANEL_BG = '#0d0c10';

interface RoomState {
  roomId: string;
  status: string;
  side: 'creator' | 'guest';
  creatorOffer: string[];
  guestOffer: string[];
  creatorReady: boolean;
  guestReady: boolean;
  myUsername: string;
  partnerUsername: string;
}

function countOccurrences(cards: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of cards) m.set(c, (m.get(c) ?? 0) + 1);
  return m;
}

export default function TradePage() {
  const t = useTranslations('trade');
  const params = useParams();
  const roomId = typeof params.roomId === 'string' ? params.roomId : Array.isArray(params.roomId) ? params.roomId[0] : '';
  const router = useRouter();
  const { data: session } = useSession();
  const showToast = useToastStore((s) => s.showToast);

  const [room, setRoom] = useState<RoomState | null>(null);
  const [inventory, setInventory] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelPrompt, setCancelPrompt] = useState(false);
  const [done, setDone] = useState(false);

  const myOffer = room ? (room.side === 'creator' ? room.creatorOffer : room.guestOffer) : [];
  const theirOffer = room ? (room.side === 'creator' ? room.guestOffer : room.creatorOffer) : [];
  const myReady = room ? (room.side === 'creator' ? room.creatorReady : room.guestReady) : false;
  const partnerReady = room ? (room.side === 'creator' ? room.guestReady : room.creatorReady) : false;

  const fetchRoom = useCallback(async (): Promise<RoomState | null> => {
    const res = await fetch(`/api/trade/${roomId}`, { credentials: 'include' });
    if (!res.ok) {
      setError(res.status === 404 ? 'notFound' : 'loadError');
      return null;
    }
    return (await res.json()) as RoomState;
  }, [roomId]);

  const fetchInventory = useCallback(async () => {
    try {
      const res = await fetch('/api/users/me/unlocks', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      const inv = new Map<string, number>();
      if (data.inventory && typeof data.inventory === 'object') {
        for (const [k, v] of Object.entries(data.inventory)) {
          if (typeof v === 'number' && v > 0) inv.set(k, v);
        }
      }
      setInventory(inv);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [r] = await Promise.all([fetchRoom(), fetchInventory()]);
      if (cancelled) return;
      if (r) {
        setRoom(r);
        if (r.status === 'pending' && r.side === 'guest') {
          await fetch(`/api/trade/${roomId}/join`, { method: 'POST', credentials: 'include' }).catch(() => {});
          const refreshed = await fetchRoom();
          if (refreshed && !cancelled) setRoom(refreshed);
        }
        if (r.status === 'completed') setDone(true);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(() => {
    if (!session?.user?.id || !roomId) return;
    const store = useSocketStore.getState();
    let socket = store.socket;

    const attach = (s: NonNullable<typeof socket>) => {
      s.emit('trade:subscribe', { roomId });
      const onOffer = () => { void fetchRoom().then((r) => r && setRoom(r)); };
      const onReady = () => { void fetchRoom().then((r) => r && setRoom(r)); };
      const onJoined = () => { void fetchRoom().then((r) => r && setRoom(r)); };
      const onExecuted = () => {
        clearUnlockedVariantsCache();
        setDone(true);
        void fetchRoom().then((r) => r && setRoom(r));
      };
      const onCancelled = (data: { by?: string }) => {
        const byMe = data?.by === session.user?.id;
        showToast({ type: byMe ? 'info' : 'error', messageKey: byMe ? 'trade.cancelled' : 'trade.cancelledBy' });
        setTimeout(() => router.push('/leaderboard?tab=friends' as '/leaderboard'), 1500);
      };
      const onErr = () => {
        showToast({ type: 'error', messageKey: 'trade.error.executeFailed' });
        void fetchRoom().then((r) => r && setRoom(r));
      };
      s.on('trade:offer-updated', onOffer);
      s.on('trade:ready-changed', onReady);
      s.on('trade:joined', onJoined);
      s.on('trade:executed', onExecuted);
      s.on('trade:cancelled', onCancelled);
      s.on('trade:error', onErr);
      return () => {
        s.emit('trade:unsubscribe', { roomId });
        s.off('trade:offer-updated', onOffer);
        s.off('trade:ready-changed', onReady);
        s.off('trade:joined', onJoined);
        s.off('trade:executed', onExecuted);
        s.off('trade:cancelled', onCancelled);
        s.off('trade:error', onErr);
      };
    };

    let detach: (() => void) | undefined;
    if (socket && store.connected) {
      detach = attach(socket);
    } else {
      void store.connect(session.user.id, session.user.name ?? undefined).then(() => {
        socket = useSocketStore.getState().socket;
        if (socket) detach = attach(socket);
      });
    }
    return () => { if (detach) detach(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, roomId]);

  const pushOffer = useCallback(async (next: string[]) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/trade/${roomId}/offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ cardIds: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showToast({ type: 'error', messageKey: typeof body.errorKey === 'string' ? body.errorKey : 'trade.error.loadError' });
        return;
      }
      const refreshed = await fetchRoom();
      if (refreshed) setRoom(refreshed);
    } finally {
      setBusy(false);
    }
  }, [roomId, fetchRoom, showToast]);

  const handleAdd = (cardId: string) => {
    if (!room || busy) return;
    pushOffer([...myOffer, cardId]);
  };

  const handleRemove = (index: number) => {
    if (!room || busy) return;
    const next = [...myOffer];
    next.splice(index, 1);
    pushOffer(next);
  };

  const handleToggleReady = async () => {
    if (!room || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/trade/${roomId}/ready`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ready: !myReady }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({ type: 'error', messageKey: typeof body.errorKey === 'string' ? body.errorKey : 'trade.error.executeFailed' });
        const refreshed = await fetchRoom();
        if (refreshed) setRoom(refreshed);
        return;
      }
      if (body.executed) {
        clearUnlockedVariantsCache();
        setDone(true);
        return;
      }
      const refreshed = await fetchRoom();
      if (refreshed) setRoom(refreshed);
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    setCancelPrompt(false);
    setBusy(true);
    try {
      await fetch(`/api/trade/${roomId}/cancel`, { method: 'POST', credentials: 'include' }).catch(() => {});
      showToast({ type: 'info', messageKey: 'trade.cancelled' });
      router.push('/leaderboard?tab=friends' as '/leaderboard');
    } finally {
      setBusy(false);
    }
  };

  const doneRedirectRef = useRef(false);
  useEffect(() => {
    if (done && !doneRedirectRef.current) {
      doneRedirectRef.current = true;
      showToast({ type: 'success', message: t('completed', { count: theirOffer.length }) });
      setTimeout(() => router.push('/leaderboard?tab=friends' as '/leaderboard'), 2600);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const offerCounts = countOccurrences(myOffer);
  const offerValid = validateOffer(myOffer, theirOffer).valid;

  return (
    <main className="relative min-h-screen flex flex-col overflow-hidden" style={{ backgroundColor: '#08070a', color: '#e8e8e8' }}>
      <CloudBackground />

      <header className="relative z-10 flex items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/leaderboard?tab=friends" className="text-xs tracking-widest font-display" style={{ color: '#888' }}>
          {'< '}{t('back')}
        </Link>
      </header>

      <div className="relative z-10 flex-1 px-4 sm:px-6 max-w-5xl w-full mx-auto pb-10">
        <motion.h1
          className="text-2xl sm:text-3xl font-display tracking-[0.3em] mb-4 mt-2"
          style={{ color: '#c4a35a' }}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {t('title')}
        </motion.h1>

        {loading && <p className="text-sm" style={{ color: '#666' }}>{t('loading')}</p>}

        {error && (
          <p className="text-sm" style={{ color: '#b33e3e' }}>{t(`error.${error}` as 'error.loadError')}</p>
        )}

        {!loading && !error && room && (
          <>
            {room.status === 'pending' && room.side === 'creator' && (
              <p className="text-[11px] mb-4" style={{ color: '#888' }}>
                {t('waitingJoin', { name: room.partnerUsername })}
              </p>
            )}

            <div className="flex items-center justify-between text-[11px] uppercase tracking-widest mb-3" style={{ color: '#888' }}>
              <span style={{ color: '#c4a35a' }}>{room.myUsername}</span>
              <span style={{ color: '#555' }}>{'<->'}</span>
              <span>{room.partnerUsername}</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <TradeOfferPanel title={t('yourOffer')} cardIds={myOffer} editable={!myReady && !done} onRemove={handleRemove} />
              <TradeReceivePanel title={t('theirOffer', { name: room.partnerUsername })} cardIds={theirOffer} />
            </div>

            <p className="text-[10px] mb-3" style={{ color: '#666' }}>{t('tournamentNote')}</p>

            {!done && (
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className="mb-5 px-4 py-4"
                style={{ backgroundColor: PANEL_BG, clipPath: PANEL_CLIP, boxShadow: '0 12px 32px rgba(0,0,0,0.45)' }}
              >
                <span className="font-display text-[11px] uppercase tracking-[0.28em] block mb-3" style={{ color: '#666' }}>
                  {t('yourInventory')}
                </span>
                <div className="max-h-[280px] overflow-y-auto">
                  <TradeInventoryGrid
                    inventory={inventory}
                    offerCounts={offerCounts}
                    onAdd={handleAdd}
                    disabled={myReady || busy}
                  />
                </div>
              </motion.div>
            )}

            {!done && (
              <TradeConfirmBar
                myReady={myReady}
                partnerReady={partnerReady}
                partnerName={room.partnerUsername}
                busy={busy || !offerValid}
                onToggleReady={handleToggleReady}
                onCancel={() => setCancelPrompt(true)}
              />
            )}

            {done && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-6"
              >
                <span className="font-display text-lg uppercase tracking-widest" style={{ color: '#5fb05f' }}>
                  {t('completed', { count: theirOffer.length })}
                </span>
              </motion.div>
            )}
          </>
        )}
      </div>

      <Footer />

      <AnimatePresence>
        {cancelPrompt && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="p-6 max-w-sm w-full text-center"
              style={{ backgroundColor: PANEL_BG, clipPath: PANEL_CLIP, boxShadow: '0 16px 44px rgba(0,0,0,0.7)' }}
              initial={{ scale: 0.9, y: 10 }}
              animate={{ scale: 1, y: 0 }}
            >
              <p className="font-display text-sm uppercase tracking-widest mb-5" style={{ color: '#e8e8e8' }}>
                {t('cancelConfirm')}
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  type="button"
                  onClick={() => setCancelPrompt(false)}
                  className="font-display px-4 py-2 text-[11px] uppercase tracking-widest"
                  style={{ color: '#c4a35a', backgroundColor: '#1a1a1a' }}
                >
                  {t('cancelConfirmNo')}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="font-display px-4 py-2 text-[11px] uppercase tracking-widest"
                  style={{ color: '#0a0a0a', backgroundColor: '#b33e3e' }}
                >
                  {t('cancelConfirmYes')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
