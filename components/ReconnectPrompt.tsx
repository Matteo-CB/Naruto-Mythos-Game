'use client';

import { useSocketStore } from '@/lib/socket/client';
import { useRouter } from '@/lib/i18n/navigation';
import { useTranslations } from 'next-intl';

export function ReconnectPrompt() {
  const t = useTranslations('game');
  const router = useRouter();
  const pendingReconnect = useSocketStore((s) => s.pendingReconnect);
  const acceptReconnect = useSocketStore((s) => s.acceptReconnect);
  const dismissReconnect = useSocketStore((s) => s.dismissReconnect);

  if (!pendingReconnect) return null;

  const handleReconnect = () => {
    acceptReconnect();
    router.push('/game' as '/');
  };

  const handleAbandon = () => {
    dismissReconnect();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
      <div
        className="flex flex-col items-center gap-5 px-8 py-6 rounded-xl max-w-sm w-full mx-4 text-center"
        style={{ backgroundColor: '#141414', border: '1px solid #262626' }}
      >
        <div className="w-12 h-px" style={{ backgroundColor: 'rgba(196, 163, 90, 0.4)' }} />
        <h2 className="text-base font-bold uppercase tracking-wider" style={{ color: '#c4a35a' }}>
          {t('reconnect.title')}
        </h2>
        <p className="text-xs leading-relaxed" style={{ color: '#aaa' }}>
          {t('reconnect.description')}
        </p>
        <div className="flex gap-3 w-full">
          <button
            onClick={handleReconnect}
            className="flex-1 py-2.5 text-xs font-bold uppercase tracking-wider cursor-pointer"
            style={{ backgroundColor: '#3e8b3e', color: '#e0e0e0' }}
          >
            {t('reconnect.rejoin')}
          </button>
          <button
            onClick={handleAbandon}
            className="flex-1 py-2.5 text-xs font-bold uppercase tracking-wider cursor-pointer"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #333', color: '#b33e3e' }}
          >
            {t('reconnect.abandon')}
          </button>
        </div>
        <div className="w-12 h-px" style={{ backgroundColor: 'rgba(196, 163, 90, 0.4)' }} />
      </div>
    </div>
  );
}
