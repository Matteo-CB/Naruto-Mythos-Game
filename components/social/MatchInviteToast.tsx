'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useSocialStore } from '@/stores/socialStore';

interface MatchInviteToastProps {
  invite: {
    inviteId: string;
    user: { id: string; username: string; elo: number };
    expiresAt: string;
  };
  onDismiss: () => void;
  onAccepted: (roomCode: string) => void;
}

export function MatchInviteToast({ invite, onDismiss, onAccepted }: MatchInviteToastProps) {
  const t = useTranslations('matchInvite');
  const acceptMatchInvite = useSocialStore((s) => s.acceptMatchInvite);
  const declineMatchInvite = useSocialStore((s) => s.declineMatchInvite);

  const computeRemaining = useCallback(() => {
    const expiresMs = new Date(invite.expiresAt).getTime();
    const nowMs = Date.now();
    return Math.max(0, Math.ceil((expiresMs - nowMs) / 1000));
  }, [invite.expiresAt]);

  const [remaining, setRemaining] = useState(computeRemaining);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const newRemaining = computeRemaining();
      setRemaining(newRemaining);
      if (newRemaining <= 0) {
        clearInterval(interval);
        onDismiss();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [computeRemaining, onDismiss]);

  const handleAccept = async () => {
    setActionLoading(true);
    const roomCode = await acceptMatchInvite(invite.inviteId);
    if (roomCode) {
      onAccepted(roomCode);
    }
    onDismiss();
  };

  const handleDecline = async () => {
    setActionLoading(true);
    await declineMatchInvite(invite.inviteId);
    onDismiss();
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 100 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      style={{
        backgroundColor: '#111111',
        border: '1px solid #c4a35a',
        borderRadius: 8,
        padding: 16,
        maxWidth: 320,
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
      }}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span
            className="text-sm font-medium"
            style={{ color: '#e0e0e0' }}
          >
            {t('inviteFrom', { name: invite.user.username })}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span
            className="text-xs px-2 py-0.5"
            style={{
              backgroundColor: 'rgba(196, 163, 90, 0.1)',
              border: '1px solid rgba(196, 163, 90, 0.25)',
              borderRadius: 4,
              color: '#c4a35a',
            }}
          >
            {invite.user.elo}
          </span>
          <span
            className="text-xs"
            style={{
              color: remaining <= 10 ? '#b33e3e' : '#888888',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {t('expiresIn', { time: String(remaining) })}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <motion.button
            whileHover={actionLoading ? {} : { scale: 1.04 }}
            whileTap={actionLoading ? {} : { scale: 0.96 }}
            onClick={handleAccept}
            disabled={actionLoading}
            className="h-8 px-3 text-xs font-bold uppercase tracking-wider cursor-pointer"
            style={{
              backgroundColor: '#c4a35a',
              border: '1px solid #c4a35a',
              borderRadius: 4,
              color: '#0a0a0a',
              opacity: actionLoading ? 0.5 : 1,
              cursor: actionLoading ? 'not-allowed' : 'pointer',
            }}
          >
            {t('accept')}
          </motion.button>

          <motion.button
            whileHover={actionLoading ? {} : { scale: 1.04 }}
            whileTap={actionLoading ? {} : { scale: 0.96 }}
            onClick={handleDecline}
            disabled={actionLoading}
            className="h-8 px-3 text-xs font-bold uppercase tracking-wider cursor-pointer"
            style={{
              backgroundColor: 'transparent',
              border: '1px solid #333333',
              borderRadius: 4,
              color: '#888888',
              opacity: actionLoading ? 0.5 : 1,
              cursor: actionLoading ? 'not-allowed' : 'pointer',
            }}
          >
            {t('decline')}
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
