'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useSocialStore } from '@/stores/socialStore';
import { Link } from '@/lib/i18n/navigation';

export function FriendsList() {
  const t = useTranslations('friends');
  const friends = useSocialStore((s) => s.friends);
  const loading = useSocialStore((s) => s.loading);
  const fetchFriends = useSocialStore((s) => s.fetchFriends);
  const sendMatchInvite = useSocialStore((s) => s.sendMatchInvite);
  const removeFriend = useSocialStore((s) => s.removeFriend);

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  if (loading && friends.length === 0) {
    return (
      <div
        className="text-sm py-6 text-center"
        style={{ color: 'var(--t-dim)' }}
      >
        ...
      </div>
    );
  }

  if (friends.length === 0) {
    return (
      <div
        className="text-sm py-6 text-center"
        style={{ color: 'var(--t-dim)' }}
      >
        {t('list.empty')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {friends.map((friend) => (
        <motion.div
          key={friend.friendshipId}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
          style={{
            backgroundColor: 'var(--t-panel)',
            border: '1px solid var(--t-border)',
            borderRadius: 6,
            padding: '12px 16px',
          }}
        >
          <div className="flex items-center gap-3">
            <Link
              href={`/profile/${encodeURIComponent(friend.username)}`}
              className="text-sm font-medium no-underline"
              style={{ color: 'var(--t-text)' }}
            >
              {friend.username}
            </Link>
            <span
              className="text-xs px-2 py-0.5"
              style={{
                backgroundColor: 'var(--t-accent-glow)',
                border: '1px solid rgba(196, 163, 90, 0.25)',
                borderRadius: 4,
                color: 'var(--t-accent)',
              }}
            >
              {friend.elo}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => sendMatchInvite(friend.id)}
              className="h-8 px-3 text-xs font-medium cursor-pointer"
              style={{
                backgroundColor: 'transparent',
                border: '1px solid var(--t-accent)',
                borderRadius: 4,
                color: 'var(--t-accent)',
              }}
            >
              {t('list.invite')}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => removeFriend(friend.friendshipId)}
              className="h-8 px-3 text-xs font-medium cursor-pointer"
              style={{
                backgroundColor: 'transparent',
                border: '1px solid var(--t-border-strong)',
                borderRadius: 4,
                color: 'var(--t-muted)',
              }}
            >
              {t('list.remove')}
            </motion.button>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
