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

type Status = 'hidden' | 'reconnecting' | 'offline';

export function ConnectionStatusIndicator() {
  const t = useTranslations('common.connection');
  const { data: session } = useSession();
  const socket = useSocketStore((s) => s.socket);
  const connected = useSocketStore((s) => s.connected);
  const errorKey = useSocketStore((s) => s.errorKey);
  const connect = useSocketStore((s) => s.connect);
  const clearError = useSocketStore((s) => s.clearError);

  const derivedStatus: Status = useMemo(() => {
    if (!session?.user?.id) return 'hidden';
    if (connected) return 'hidden';
    if (errorKey && OFFLINE_KEYS.has(errorKey)) return 'offline';
    if (errorKey && CONNECTION_ERROR_KEYS.has(errorKey)) return 'reconnecting';
    if (socket !== null) return 'reconnecting';
    return 'hidden';
  }, [session?.user?.id, socket, connected, errorKey]);

  const [status, setStatus] = useState<Status>('hidden');
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    if (derivedStatus === 'hidden' || derivedStatus === 'offline') {
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
    connect(session.user.id, session.user.name ?? undefined).catch(() => {});
  }, [session?.user?.id, session?.user?.name, connect, clearError]);

  const color = status === 'offline' ? '#b33e3e' : '#c4a35a';
  const label = status === 'offline' ? t('offline') : t('reconnecting');

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
              boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
            }}
          >
            <SignalBars status={status} color={color} />
            <span
              className="text-[9.5px] uppercase font-bold tabular-nums"
              style={{ color, letterSpacing: '0.16em', lineHeight: 1 }}
            >
              {label}
            </span>
            {status === 'offline' && (
              <button
                type="button"
                onClick={onRetry}
                className="text-[9.5px] uppercase font-bold cursor-pointer"
                style={{
                  color: '#e8e8e8',
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
