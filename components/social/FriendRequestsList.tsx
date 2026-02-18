'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useSocialStore } from '@/stores/socialStore';

export function FriendRequestsList() {
  const t = useTranslations('friends');
  const incomingRequests = useSocialStore((s) => s.incomingRequests);
  const outgoingRequests = useSocialStore((s) => s.outgoingRequests);
  const loading = useSocialStore((s) => s.loading);
  const fetchRequests = useSocialStore((s) => s.fetchRequests);
  const acceptFriendRequest = useSocialStore((s) => s.acceptFriendRequest);
  const declineFriendRequest = useSocialStore((s) => s.declineFriendRequest);
  const removeFriend = useSocialStore((s) => s.removeFriend);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  return (
    <div className="flex flex-col gap-6">
      {/* Incoming Requests */}
      <div>
        <h3
          className="text-sm uppercase tracking-wider mb-3"
          style={{ color: '#888888' }}
        >
          {t('requests.incoming')}
        </h3>

        {incomingRequests.length === 0 ? (
          <div
            className="text-sm py-3"
            style={{ color: '#555555' }}
          >
            {t('requests.noIncoming')}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {incomingRequests.map((request) => (
              <motion.div
                key={request.friendshipId}
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
                  <span
                    className="text-sm font-medium"
                    style={{ color: '#e0e0e0' }}
                  >
                    {request.user.username}
                  </span>
                  <span
                    className="text-xs px-2 py-0.5"
                    style={{
                      backgroundColor: 'rgba(196, 163, 90, 0.1)',
                      border: '1px solid rgba(196, 163, 90, 0.25)',
                      borderRadius: 4,
                      color: '#c4a35a',
                    }}
                  >
                    {request.user.elo}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => acceptFriendRequest(request.friendshipId)}
                    className="h-8 px-3 text-xs font-bold uppercase tracking-wider cursor-pointer"
                    style={{
                      backgroundColor: '#c4a35a',
                      border: '1px solid #c4a35a',
                      borderRadius: 4,
                      color: '#0a0a0a',
                    }}
                  >
                    {t('requests.accept')}
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => declineFriendRequest(request.friendshipId)}
                    className="h-8 px-3 text-xs font-bold uppercase tracking-wider cursor-pointer"
                    style={{
                      backgroundColor: 'transparent',
                      border: '1px solid #333333',
                      borderRadius: 4,
                      color: '#888888',
                    }}
                  >
                    {t('requests.decline')}
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Outgoing / Sent Requests */}
      <div>
        <h3
          className="text-sm uppercase tracking-wider mb-3"
          style={{ color: '#888888' }}
        >
          {t('requests.outgoing')}
        </h3>

        {outgoingRequests.length === 0 ? (
          <div
            className="text-sm py-3"
            style={{ color: '#555555' }}
          >
            {t('requests.noOutgoing')}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {outgoingRequests.map((request) => (
              <motion.div
                key={request.friendshipId}
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
                  <span
                    className="text-sm font-medium"
                    style={{ color: '#e0e0e0' }}
                  >
                    {request.user.username}
                  </span>
                  <span
                    className="text-xs px-2 py-0.5"
                    style={{
                      backgroundColor: 'rgba(196, 163, 90, 0.1)',
                      border: '1px solid rgba(196, 163, 90, 0.25)',
                      borderRadius: 4,
                      color: '#c4a35a',
                    }}
                  >
                    {request.user.elo}
                  </span>
                </div>

                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => removeFriend(request.friendshipId)}
                  className="h-8 px-3 text-xs font-bold uppercase tracking-wider cursor-pointer"
                  style={{
                    backgroundColor: 'transparent',
                    border: '1px solid #333333',
                    borderRadius: 4,
                    color: '#888888',
                  }}
                >
                  {t('requests.cancel')}
                </motion.button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
