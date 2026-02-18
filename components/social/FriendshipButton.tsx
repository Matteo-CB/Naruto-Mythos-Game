'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useSocialStore } from '@/stores/socialStore';

type FriendshipStatus = 'loading' | 'none' | 'pending_sent' | 'pending_received' | 'accepted';

interface FriendshipButtonProps {
  userId: string;
  username: string;
}

export function FriendshipButton({ userId, username }: FriendshipButtonProps) {
  const t = useTranslations('friends');
  const sendFriendRequest = useSocialStore((s) => s.sendFriendRequest);
  const acceptFriendRequest = useSocialStore((s) => s.acceptFriendRequest);
  const removeFriend = useSocialStore((s) => s.removeFriend);

  const [status, setStatus] = useState<FriendshipStatus>('loading');
  const [friendshipId, setFriendshipId] = useState<string | null>(null);
  const [showRemove, setShowRemove] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/friends/status/${userId}`);
      const data = await res.json();
      if (res.ok) {
        setStatus(data.status === 'self' ? 'accepted' : data.status);
        setFriendshipId(data.friendshipId ?? null);
      }
    } catch {
      setStatus('none');
    }
  }, [userId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleAddFriend = async () => {
    setActionLoading(true);
    await sendFriendRequest(userId);
    setStatus('pending_sent');
    setActionLoading(false);
  };

  const handleAccept = async () => {
    if (!friendshipId) return;
    setActionLoading(true);
    await acceptFriendRequest(friendshipId);
    setStatus('accepted');
    setActionLoading(false);
  };

  const handleRemove = async () => {
    if (!friendshipId) return;
    setActionLoading(true);
    await removeFriend(friendshipId);
    setStatus('none');
    setFriendshipId(null);
    setShowRemove(false);
    setActionLoading(false);
  };

  if (status === 'loading') {
    return (
      <button
        disabled
        className="h-9 px-4 text-xs font-bold uppercase tracking-wider"
        style={{
          backgroundColor: 'transparent',
          border: '1px solid #262626',
          borderRadius: 4,
          color: '#555555',
          cursor: 'not-allowed',
        }}
      >
        ...
      </button>
    );
  }

  if (status === 'none') {
    return (
      <motion.button
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        onClick={handleAddFriend}
        disabled={actionLoading}
        className="h-9 px-4 text-xs font-bold uppercase tracking-wider cursor-pointer"
        style={{
          backgroundColor: 'transparent',
          border: '1px solid #c4a35a',
          borderRadius: 4,
          color: '#c4a35a',
          opacity: actionLoading ? 0.5 : 1,
          cursor: actionLoading ? 'not-allowed' : 'pointer',
        }}
      >
        {t('actions.addFriend')}
      </motion.button>
    );
  }

  if (status === 'pending_sent') {
    return (
      <button
        disabled
        className="h-9 px-4 text-xs font-bold uppercase tracking-wider"
        style={{
          backgroundColor: 'transparent',
          border: '1px solid #333333',
          borderRadius: 4,
          color: '#555555',
          cursor: 'not-allowed',
        }}
      >
        {t('actions.requestSent')}
      </button>
    );
  }

  if (status === 'pending_received') {
    return (
      <motion.button
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        onClick={handleAccept}
        disabled={actionLoading}
        className="h-9 px-4 text-xs font-bold uppercase tracking-wider cursor-pointer"
        style={{
          backgroundColor: '#c4a35a',
          border: '1px solid #c4a35a',
          borderRadius: 4,
          color: '#0a0a0a',
          opacity: actionLoading ? 0.5 : 1,
          cursor: actionLoading ? 'not-allowed' : 'pointer',
        }}
      >
        {t('actions.acceptRequest')}
      </motion.button>
    );
  }

  // status === 'accepted'
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-9 px-4 flex items-center text-xs font-bold uppercase tracking-wider"
        style={{
          color: '#555555',
        }}
      >
        {t('actions.alreadyFriends')}
      </span>
      {!showRemove ? (
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setShowRemove(true)}
          className="h-9 w-9 flex items-center justify-center cursor-pointer"
          style={{
            backgroundColor: 'transparent',
            border: '1px solid #333333',
            borderRadius: 4,
            color: '#555555',
            fontSize: 14,
            lineHeight: 1,
          }}
          aria-label={t('actions.removeFriend')}
        >
          X
        </motion.button>
      ) : (
        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={handleRemove}
          disabled={actionLoading}
          className="h-9 px-3 text-xs font-bold uppercase tracking-wider cursor-pointer"
          style={{
            backgroundColor: 'transparent',
            border: '1px solid #b33e3e',
            borderRadius: 4,
            color: '#b33e3e',
            opacity: actionLoading ? 0.5 : 1,
            cursor: actionLoading ? 'not-allowed' : 'pointer',
          }}
        >
          {t('actions.removeFriend')}
        </motion.button>
      )}
    </div>
  );
}
