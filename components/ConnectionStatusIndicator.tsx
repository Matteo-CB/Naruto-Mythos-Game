'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useSocketStore } from '@/lib/socket/client';

const CONNECTION_ERROR_KEYS = new Set([
  'game.error.connectionTimeout',
  'game.error.connectionLost',
  'game.error.reconnectFailed',
  'game.error.notConnected',
]);

const OFFLINE_KEYS = new Set([
  'game.error.reconnectFailed',
  'game.error.notConnected',
]);

const RECONNECTING_REVEAL_DELAY_MS = 2500;

const RESYNC_LABEL_KEY = 'resyncing';

type Status = 'hidden' | 'reconnecting' | 'resyncing' | 'offline';

export function ConnectionStatusIndicator() {
  const t = useTranslations('common.connection');
  const { data: session } = useSession();
  const socket = useSocketStore((s) => s.socket);
  const connected = useSocketStore((s) => s.connected);
  const connectionPhase = useSocketStore((s) => s.connectionPhase);
  const errorKey = useSocketStore((s) => s.errorKey);
  const connect = useSocketStore((s) => s.connect);
  const rejoinMatch = useSocketStore((s) => s.rejoinMatch);
  const clearError = useSocketStore((s) => s.clearError);

  const derivedStatus: Status = useMemo(() => {
    if (!session?.user?.id) return 'hidden';
    if (connected) return connectionPhase === 'resyncing' ? 'resyncing' : 'hidden';
    if (errorKey && OFFLINE_KEYS.has(errorKey)) return 'offline';
    if (errorKey && CONNECTION_ERROR_KEYS.has(errorKey)) return 'reconnecting';
    if (socket !== null) return 'reconnecting';
    return 'hidden';
  }, [session?.user?.id, socket, connected, connectionPhase, errorKey]);

  const [status, setStatus] = useState<Status>('hidden');
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    if (derivedStatus === 'hidden' || derivedStatus === 'offline' || derivedStatus === 'resyncing') {
      setStatus(derivedStatus);
      return;
    }
    revealTimerRef.current = setTimeout(() => {
      setStatus('reconnecting');
      revealTimerRef.current = null;
    }, RECONNECTING_REVEAL_DELAY_MS);
    return () => {
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
    };
  }, [derivedStatus]);

  const onRetry = useCallback(() => {
    if (!session?.user?.id) return;
    clearError();
    if (connected) {
      rejoinMatch();
      return;
    }
    connect(session.user.id, session.user.name ?? undefined)
      .then(() => rejoinMatch())
      .catch(() => {});
  }, [session?.user?.id, session?.user?.name, connected, connect, clearError, rejoinMatch]);

  const color = status === 'offline' ? 'var(--t-danger)' : 'var(--t-accent)';
  const label = status === 'offline'
    ? t('offline')
    : status === 'resyncing' && t.has(RESYNC_LABEL_KEY)
      ? t(RESYNC_LABEL_KEY)
      : t('reconnecting');

  return (
    <div className="fixed top-3 right-3 z-50 pointer-events-none">
      <AnimatePresence>
        {status !== 'hidden' && (
          <motion.div
            key={status}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="pointer-events-auto flex items-center gap-2 px-2.5 py-1.5"
            style={{
              backgroundColor: `${color}1f`,
              backdropFilter: 'blur(6px)',
              boxShadow: '0 6px 18px var(--t-shadow)',
            }}
          >
            <SignalBars status={status} color={color} />
            <span
              className="text-[9.5px] uppercase font-bold tabular-nums"
              style={{ color, letterSpacing: '0.16em', lineHeight: 1 }}
            >
              {label}
            </span>
            {(status === 'offline' || status === 'resyncing') && (
              <button
                type="button"
                onClick={onRetry}
                className="text-[9.5px] uppercase font-bold cursor-pointer"
                style={{
                  color: 'var(--t-text)',
                  letterSpacing: '0.16em',
                  background: 'none',
                  border: 'none',
                  padding: '0 0 0 6px',
                  lineHeight: 1,
                  opacity: 0.85,
                }}
              >
                <span className="inline-flex items-center gap-1">
                  <img src="/images/icons/refresh.svg" alt="" draggable={false} style={{ width: 10, height: 10, opacity: 0.85 }} />
                  {t('retry')}
                </span>
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SignalBars({ status, color }: { status: Status; color: string }) {
  const heights = [5, 8, 11];

  if (status === 'offline') {
    return (
      <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden>
        {heights.map((h, i) => (
          <rect
            key={i}
            x={i * 5}
            y={12 - h}
            width="3"
            height={h}
            fill={color}
            opacity={0.32}
          />
        ))}
        <line
          x1="0.5"
          y1="11.5"
          x2="13.5"
          y2="0.5"
          stroke={color}
          strokeWidth="1.2"
          opacity={0.85}
        />
      </svg>
    );
  }

  return (
    <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden>
      {heights.map((h, i) => (
        <motion.rect
          key={i}
          x={i * 5}
          y={12 - h}
          width="3"
          height={h}
          fill={color}
          initial={{ opacity: 0.25 }}
          animate={{ opacity: [0.25, 1, 0.25] }}
          transition={{
            duration: 1.1,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.18,
          }}
        />
      ))}
    </svg>
  );
}
