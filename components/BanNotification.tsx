'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';

interface BanInfo {
  type: 'chat' | 'game';
  permanent: boolean;
  expiresAt: string | null;
}

interface ReportNotification {
  targetName: string;
  action: string | null;
  reward: number | null;
}

export function BanNotification() {
  const t = useTranslations('ban');
  const { data: session } = useSession();
  const [bans, setBans] = useState<BanInfo[]>([]);
  const [notifications, setNotifications] = useState<ReportNotification[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!session?.user?.id) return;

    // Check if already dismissed this session
    try {
      const seen = localStorage.getItem('ban-notif-dismissed');
      if (seen) setDismissed(new Set(JSON.parse(seen)));
    } catch { /* ignore */ }

    fetch('/api/user/bans', { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setBans(data.bans ?? []);
          setNotifications(data.notifications ?? []);
        }
      })
      .catch(() => {});
  }, [session?.user?.id]);

  const dismiss = (key: string) => {
    const newDismissed = new Set(dismissed);
    newDismissed.add(key);
    setDismissed(newDismissed);
    try {
      localStorage.setItem('ban-notif-dismissed', JSON.stringify(Array.from(newDismissed)));
    } catch { /* ignore */ }
  };

  const gameBan = bans.find((b) => b.type === 'game');
  const chatBan = bans.find((b) => b.type === 'chat');

  // Game ban: blocking modal
  if (gameBan && !dismissed.has('gameBan')) {
    const dateStr = gameBan.expiresAt ? new Date(gameBan.expiresAt).toLocaleDateString() : '';
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.9)' }}>
        <div className="flex flex-col items-center gap-4 max-w-md w-full text-center px-6 py-8" style={{
          backgroundColor: '#111', border: '1px solid rgba(179,62,62,0.3)',
        }}>
          <div className="w-16 h-px" style={{ backgroundColor: 'rgba(179,62,62,0.4)' }} />
          <h2 className="text-lg font-bold uppercase tracking-wider" style={{ color: '#b33e3e' }}>
            {t('gameBanned')}
          </h2>
          <p className="text-xs" style={{ color: '#888' }}>
            {gameBan.permanent ? t('gameBannedPerm') : t('gameBannedUntil', { date: dateStr })}
          </p>
          <button onClick={() => dismiss('gameBan')}
            className="px-5 py-2 text-xs font-bold uppercase tracking-wider cursor-pointer mt-2"
            style={{ backgroundColor: 'rgba(179,62,62,0.1)', border: '1px solid rgba(179,62,62,0.3)', color: '#b33e3e' }}>
            {t('understood')}
          </button>
          <div className="w-16 h-px" style={{ backgroundColor: 'rgba(179,62,62,0.4)' }} />
        </div>
      </div>
    );
  }

  const items: Array<{ key: string; content: React.ReactNode }> = [];

  // Chat ban banner
  if (chatBan && !dismissed.has('chatBan')) {
    const dateStr = chatBan.expiresAt ? new Date(chatBan.expiresAt).toLocaleDateString() : '';
    items.push({
      key: 'chatBan',
      content: (
        <span className="text-[11px]" style={{ color: '#b33e3e' }}>
          {chatBan.permanent ? t('chatBannedPerm') : t('chatBannedUntil', { date: dateStr })}
        </span>
      ),
    });
  }

  // Report outcome notifications
  for (let i = 0; i < notifications.length; i++) {
    const notif = notifications[i];
    const key = `report-${i}`;
    if (dismissed.has(key)) continue;

    items.push({
      key,
      content: (
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px]" style={{ color: '#e0e0e0' }}>
            {t('reportResolved', { target: notif.targetName })}
          </span>
          {notif.action && notif.action !== 'dismiss' && (
            <span className="text-[10px]" style={{ color: '#3e8b3e' }}>
              {t('actionTaken', { action: notif.action })}
            </span>
          )}
          {notif.action === 'dismiss' && (
            <span className="text-[10px]" style={{ color: '#888' }}>{t('noAction')}</span>
          )}
          {notif.reward && notif.reward > 0 && (
            <span className="text-[10px] font-bold" style={{ color: '#c4a35a' }}>
              {t('eloRewarded', { amount: notif.reward, target: notif.targetName })}
            </span>
          )}
        </div>
      ),
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[90] flex flex-col gap-2 max-w-md w-full px-4">
      {items.map((item) => (
        <div key={item.key} className="flex items-start gap-3 px-4 py-3 rounded"
          style={{ backgroundColor: 'rgba(10,10,14,0.95)', border: '1px solid #262626', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
          <div className="flex-1">{item.content}</div>
          <button onClick={() => dismiss(item.key)}
            className="text-[10px] px-1.5 py-0.5 shrink-0 cursor-pointer" style={{ color: '#888', border: '1px solid #333' }}>
            X
          </button>
        </div>
      ))}
    </div>
  );
}
