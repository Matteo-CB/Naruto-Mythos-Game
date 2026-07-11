'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { BlockPlayerPopup } from '@/components/chat/BlockPlayerPopup';
import { ReportPlayerPopup } from '@/components/chat/ReportPlayerPopup';

export function ProfileModerationActions({ userId, username }: { userId: string; username: string }) {
  const t = useTranslations();
  const [blockOpen, setBlockOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setReportOpen(true)}
        className="h-9 px-3 text-xs font-bold uppercase tracking-wider cursor-pointer"
        style={{ backgroundColor: 'transparent', border: '1px solid #333333', borderRadius: 4, color: '#888' }}
      >
        {t('chat.menu.report')}
      </button>
      <button
        type="button"
        onClick={() => setBlockOpen(true)}
        className="h-9 px-3 text-xs font-bold uppercase tracking-wider cursor-pointer"
        style={{ backgroundColor: 'transparent', border: '1px solid rgba(179,62,62,0.4)', borderRadius: 4, color: '#b33e3e' }}
      >
        {t('social.block.confirm')}
      </button>
      {blockOpen && (
        <BlockPlayerPopup target={{ userId, username }} onClose={() => setBlockOpen(false)} />
      )}
      {reportOpen && (
        <ReportPlayerPopup target={{ userId, username }} context="profile" onClose={() => setReportOpen(false)} />
      )}
    </>
  );
}
