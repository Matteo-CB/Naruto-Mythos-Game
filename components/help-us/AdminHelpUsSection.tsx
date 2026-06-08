'use client';

import { useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { isAdmin } from '@/lib/auth/admins';
import { AdminDonationsTab } from './AdminDonationsTab';
import { AdminSuggestionsTab } from './AdminSuggestionsTab';

const ACCENT = '#c4a35a';

type Tab = 'donations' | 'suggestions';

export function AdminHelpUsSection() {
  const t = useTranslations('helpUs.admin');
  const { data: session, status } = useSession();
  const [tab, setTab] = useState<Tab>('donations');

  const showAdmin = useMemo(() => {
    if (status !== 'authenticated' || !session?.user) return false;
    return isAdmin({ username: session.user.name ?? null, email: session.user.email ?? null });
  }, [session, status]);

  if (!showAdmin) return null;

  return (
    <section
      className="relative rounded-lg p-5 sm:p-8 mx-auto w-full mt-8 sm:mt-12"
      style={{
        backgroundColor: 'rgba(20,20,24,0.78)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
      }}
    >
      <h2
        className="font-display text-2xl sm:text-3xl tracking-[0.2em] mb-5 uppercase text-center"
        style={{ color: ACCENT }}
      >
        {t('title')}
      </h2>

      <div className="relative flex w-full max-w-md mx-auto mb-6" role="tablist">
        {(['donations', 'suggestions'] as Tab[]).map((k) => {
          const active = tab === k;
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(k)}
              className="relative flex-1 py-2.5 font-display uppercase text-xs sm:text-sm tracking-widest transition-colors"
              style={{ color: active ? ACCENT : '#888' }}
            >
              {k === 'donations' ? t('tabDonations') : t('tabSuggestions')}
              {active && (
                <motion.div
                  layoutId="admin-tab-indicator"
                  className="absolute left-0 right-0 bottom-0 h-[2px]"
                  style={{ backgroundColor: ACCENT }}
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {tab === 'donations' ? <AdminDonationsTab /> : <AdminSuggestionsTab />}
    </section>
  );
}
