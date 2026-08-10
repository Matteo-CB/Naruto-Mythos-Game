'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useSocialStore } from '@/stores/socialStore';

interface FriendRequestToastProps {
  request: {
    friendshipId: string;
    user: { id: string; username: string; elo: number };
  };
  onDismiss: () => void;
}

export function FriendRequestToast({ request, onDismiss }: FriendRequestToastProps) {
  const t = useTranslations('friends');
  const acceptFriendRequest = useSocialStore((s) => s.acceptFriendRequest);
  const declineFriendRequest = useSocialStore((s) => s.declineFriendRequest);

  const handleAccept = async () => {
    await acceptFriendRequest(request.friendshipId);
    onDismiss();
  };

  const handleDecline = async () => {
    await declineFriendRequest(request.friendshipId);
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
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-medium"
            style={{ color: 'var(--t-text)' }}
          >
            {t('notifications.requestReceived', { name: request.user.username })}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className="text-xs px-2 py-0.5"
            style={{
              backgroundColor: 'var(--t-accent-glow)',
              border: '1px solid rgba(196, 163, 90, 0.25)',
              borderRadius: 4,
              color: 'var(--t-accent)',
            }}
          >
            {request.user.elo}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={handleAccept}
            className="h-8 px-3 text-xs font-bold uppercase tracking-wider cursor-pointer"
            style={{
              backgroundColor: 'var(--t-accent)',
              border: '1px solid var(--t-accent)',
              borderRadius: 4,
              color: 'var(--t-bg)',
            }}
          >
            {t('requests.accept')}
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={handleDecline}
            className="h-8 px-3 text-xs font-bold uppercase tracking-wider cursor-pointer"
            style={{
              backgroundColor: 'transparent',
              border: '1px solid var(--t-border-strong)',
              borderRadius: 4,
              color: 'var(--t-muted)',
            }}
          >
            {t('requests.decline')}
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
