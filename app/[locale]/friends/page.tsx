'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { Link } from '@/lib/i18n/navigation';
import { motion } from 'framer-motion';
import { CloudBackground } from '@/components/CloudBackground';
import { DecorativeIcons } from '@/components/DecorativeIcons';
import { CardBackgroundDecor } from '@/components/CardBackgroundDecor';
import { Footer } from '@/components/Footer';
import { UserSearchDropdown } from '@/components/social/UserSearchDropdown';
import { FriendsList } from '@/components/social/FriendsList';
import { FriendRequestsList } from '@/components/social/FriendRequestsList';
import { useSocialStore } from '@/stores/socialStore';

type FriendsTab = 'friends' | 'requests';

export default function FriendsPage() {
  const t = useTranslations('friends');
  const tc = useTranslations('common');
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<FriendsTab>('friends');

  const {
    friends,
    incomingRequests,
    fetchFriends,
    fetchRequests,
  } = useSocialStore();

  useEffect(() => {
    if (session?.user) {
      fetchFriends();
      fetchRequests();
    }
  }, [session, fetchFriends, fetchRequests]);

  const incomingCount = incomingRequests.length;

  // Not authenticated
  if (!session?.user) {
    return (
      <div
        id="main-content"
        className="min-h-screen relative flex flex-col"
        style={{ backgroundColor: '#0a0a0a' }}
      >
        <CloudBackground />
        <DecorativeIcons />
        <CardBackgroundDecor variant="profile" />

        <div className="flex-1 flex flex-col items-center justify-center relative z-10 px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center"
          >
            <h1
              className="text-2xl font-bold uppercase tracking-wider mb-6"
              style={{ color: '#c4a35a' }}
            >
              {t('title')}
            </h1>
            <p className="text-sm mb-6" style={{ color: '#888888' }}>
              {t('signInRequired')}
            </p>
            <Link
              href="/login"
              className="px-6 py-2.5 text-sm font-medium rounded transition-colors"
              style={{
                backgroundColor: 'rgba(196, 163, 90, 0.1)',
                border: '1px solid rgba(196, 163, 90, 0.3)',
                color: '#c4a35a',
              }}
            >
              {tc('signIn')}
            </Link>
          </motion.div>
        </div>

        <Footer />
      </div>
    );
  }

  return (
    <div
      id="main-content"
      className="min-h-screen relative flex flex-col"
      style={{ backgroundColor: '#0a0a0a' }}
    >
      <CloudBackground />
      <DecorativeIcons />
      <CardBackgroundDecor variant="profile" />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="max-w-2xl mx-auto relative z-10 flex-1 w-full px-4 py-8"
      >
        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-2xl font-bold uppercase tracking-wider text-center mb-6"
          style={{ color: '#c4a35a' }}
        >
          {t('title')}
        </motion.h1>

        {/* Search bar */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="mb-6"
        >
          <UserSearchDropdown />
        </motion.div>

        {/* Tabs */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="flex mb-6"
          style={{ borderBottom: '1px solid #262626' }}
        >
          <button
            onClick={() => setActiveTab('friends')}
            className="flex-1 py-3 text-sm font-medium uppercase tracking-wider transition-colors"
            style={{
              color: activeTab === 'friends' ? '#c4a35a' : '#555555',
              borderBottom: activeTab === 'friends' ? '2px solid #c4a35a' : '2px solid transparent',
              backgroundColor: 'transparent',
            }}
          >
            {t('tabs.friends')}
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className="flex-1 py-3 text-sm font-medium uppercase tracking-wider transition-colors relative"
            style={{
              color: activeTab === 'requests' ? '#c4a35a' : '#555555',
              borderBottom: activeTab === 'requests' ? '2px solid #c4a35a' : '2px solid transparent',
              backgroundColor: 'transparent',
            }}
          >
            {t('tabs.requests')}
            {incomingCount > 0 && (
              <span
                className="ml-2 inline-flex items-center justify-center text-xs font-bold rounded-full"
                style={{
                  backgroundColor: '#c4a35a',
                  color: '#0a0a0a',
                  minWidth: '20px',
                  height: '20px',
                  padding: '0 6px',
                }}
              >
                {incomingCount}
              </span>
            )}
          </button>
        </motion.div>

        {/* Tab content */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {activeTab === 'friends' && <FriendsList />}
          {activeTab === 'requests' && <FriendRequestsList />}
        </motion.div>

        {/* Back to menu */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.4 }}
          className="mt-8 text-center"
        >
          <Link
            href="/"
            className="text-sm transition-colors"
            style={{ color: '#888888' }}
          >
            &lt; {t('backToMenu')}
          </Link>
        </motion.div>
      </motion.div>

      <Footer />
    </div>
  );
}
