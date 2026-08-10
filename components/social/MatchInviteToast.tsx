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
        backgroundColor: 'var(--t-panel)',
        border: '1px solid var(--t-accent)',
        borderRadius: 8,
        padding: 16,
        maxWidth: 320,
        boxShadow: '0 8px 32px var(--t-shadow)',
      }}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--t-text)' }}>
            <img src="/images/icons/match-invite.svg" alt="" draggable={false} style={{ width: 16, height: 16, opacity: 0.7 }} />
            {t('inviteFrom', { name: invite.user.username })}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span
            className="text-xs px-2 py-0.5"
            style={{
              backgroundColor: 'var(--t-accent-glow)',
              border: '1px solid rgba(196, 163, 90, 0.25)',
              borderRadius: 4,
              color: 'var(--t-accent)',
            }}
          >
            {invite.user.elo}
          </span>
          <span
            className="text-xs"
            style={{
              color: remaining <= 10 ? 'var(--t-danger)' : 'var(--t-muted)',
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
              backgroundColor: 'var(--t-accent)',
              border: '1px solid var(--t-accent)',
              borderRadius: 4,
              color: 'var(--t-bg)',
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
              border: '1px solid var(--t-border-strong)',
              borderRadius: 4,
              color: 'var(--t-muted)',
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
