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
        style={{ color: '#555555' }}
      >
        ...
      </div>
    );
  }

  if (friends.length === 0) {
    return (
      <div
        className="text-sm py-6 text-center"
        style={{ color: '#555555' }}
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
            backgroundColor: '#111111',
            border: '1px solid #262626',
            borderRadius: 6,
            padding: '12px 16px',
          }}
        >
          <div className="flex items-center gap-3">
            <Link
              href={`/profile/${friend.username}`}
              className="text-sm font-medium no-underline"
              style={{ color: '#e0e0e0' }}
            >
              {friend.username}
            </Link>
            <span
              className="text-xs px-2 py-0.5"
              style={{
                backgroundColor: 'rgba(196, 163, 90, 0.1)',
                border: '1px solid rgba(196, 163, 90, 0.25)',
                borderRadius: 4,
                color: '#c4a35a',
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
                border: '1px solid #c4a35a',
                borderRadius: 4,
                color: '#c4a35a',
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
                border: '1px solid #333333',
                borderRadius: 4,
                color: '#888888',
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
