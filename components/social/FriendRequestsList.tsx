'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { PlayerNameLink } from '@/components/social/PlayerNameLink';
import { useTranslations } from 'next-intl';
import { useSocialStore } from '@/stores/socialStore';

const ROW_CLIP = 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';

export function FriendRequestsList() {
  const t = useTranslations('friends');
  const incomingRequests = useSocialStore((s) => s.incomingRequests);
  const outgoingRequests = useSocialStore((s) => s.outgoingRequests);
  const fetchRequests = useSocialStore((s) => s.fetchRequests);
  const acceptFriendRequest = useSocialStore((s) => s.acceptFriendRequest);
  const declineFriendRequest = useSocialStore((s) => s.declineFriendRequest);
  const removeFriend = useSocialStore((s) => s.removeFriend);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  return (
    <div className="flex flex-col gap-7">
      <Section title={t('requests.incoming')}>
        {incomingRequests.length === 0 ? (
          <EmptyState text={t('requests.noIncoming')} />
        ) : (
          <div className="flex flex-col">
            {incomingRequests.map((request, i) => (
              <RequestRow
                key={request.friendshipId}
                username={request.user.username}
                elo={request.user.elo}
                index={i}
              >
                <PillButton
                  onClick={() => acceptFriendRequest(request.friendshipId)}
                  color="#5fb05f"
                  label={t('requests.accept')}
                />
                <PillButton
                  onClick={() => declineFriendRequest(request.friendshipId)}
                  color="#888"
                  label={t('requests.decline')}
                />
              </RequestRow>
            ))}
          </div>
        )}
      </Section>

      <Section title={t('requests.outgoing')}>
        {outgoingRequests.length === 0 ? (
          <EmptyState text={t('requests.noOutgoing')} />
        ) : (
          <div className="flex flex-col">
            {outgoingRequests.map((request, i) => (
              <RequestRow
                key={request.friendshipId}
                username={request.user.username}
                elo={request.user.elo}
                index={i}
              >
                <PillButton
                  onClick={() => removeFriend(request.friendshipId)}
                  color="#888"
                  label={t('requests.cancel')}
                />
              </RequestRow>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3
        className="font-display text-[11px] uppercase tracking-widest mb-3"
        style={{ color: '#666' }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="font-display text-sm py-4 uppercase tracking-widest" style={{ color: '#444' }}>
      {text}
    </p>
  );
}

function RequestRow({
  username,
  elo,
  index,
  children,
}: {
  username: string;
  elo: number;
  index: number;
  children: React.ReactNode;
}) {
  const altBg = index % 2 === 0 ? '#0c0b10' : '#0a0a0d';

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.3) }}
      className="relative flex items-center justify-between gap-3 px-3 sm:px-5 py-2.5 mb-1.5"
      style={{ backgroundColor: altBg, clipPath: ROW_CLIP }}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <PlayerNameLink
          username={username}
          className="font-display text-sm sm:text-base truncate"
          style={{ color: '#e8e6df', letterSpacing: '0.03em' }}
        />
        <span className="font-display text-sm tabular-nums shrink-0" style={{ color: '#c4a35a' }}>
          {elo}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {children}
      </div>
    </motion.div>
  );
}

function PillButton({ onClick, color, label }: { onClick: () => void; color: string; label: string }) {
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      className="font-display px-3 sm:px-4 py-2 text-[11px] uppercase tracking-widest cursor-pointer transition-colors"
      style={{
        color,
        backgroundColor: `${color}14`,
        borderRadius: 9999,
      }}
    >
      {label}
    </motion.button>
  );
}
