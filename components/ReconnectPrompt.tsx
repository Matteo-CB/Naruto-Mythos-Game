'use client';

import { useSocketStore } from '@/lib/socket/client';
import { usePathname, useRouter } from '@/lib/i18n/navigation';
import { useTranslations } from 'next-intl';
import { Z_APP_MODAL } from '@/lib/ui/zIndex';
import { shouldOfferResume } from '@/lib/socket/resumeScope';

export function ReconnectPrompt() {
  const t = useTranslations('game');
  const router = useRouter();
  const pathname = usePathname();
  const pendingReconnect = useSocketStore((s) => s.pendingReconnect);
  const acceptReconnect = useSocketStore((s) => s.acceptReconnect);
  const dismissReconnect = useSocketStore((s) => s.dismissReconnect);

  if (!pendingReconnect) return null;
  if (!shouldOfferResume(pathname, pendingReconnect.tournamentId)) return null;

  const handleReconnect = () => {
    acceptReconnect();

    let attempts = 0;
    const checkState = () => {
      const ss = useSocketStore.getState();
      if (ss.seatBound && ss.visibleState && ss.gameStarted) {
        router.push('/game' as '/');
        return;
      }
      attempts += 1;
      if (attempts > 60) return;
      setTimeout(checkState, 250);
    };
    setTimeout(checkState, 250);
  };

  const handleAbandon = () => {
    dismissReconnect();
  };

  return (
    <div
      className="fixed bottom-4 right-4 flex items-center gap-3 px-4 py-3"
      style={{
        zIndex: Z_APP_MODAL - 1,
        backgroundColor: 'var(--t-surface)',
        boxShadow: '0 0 14px rgba(196, 163, 90, 0.22), 0 12px 32px var(--t-shadow)',
        animation: 'pulse-soft 2.4s ease-in-out infinite',
        maxWidth: 'min(92vw, 22rem)',
      }}
    >
      <div className="flex flex-col min-w-0">
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--t-accent)' }}>
          {t('reconnect.title')}
        </span>
        <span className="text-[11px] leading-snug" style={{ color: 'var(--t-muted)' }}>
          {t('reconnect.pillHint')}
        </span>
      </div>
      <button
        onClick={handleReconnect}
        className="shrink-0 px-3 py-2 text-xs font-bold uppercase tracking-wider cursor-pointer"
        style={{ backgroundColor: 'var(--t-success)', color: 'var(--t-on-success)' }}
      >
        {t('reconnect.rejoin')}
      </button>
      <button
        onClick={handleAbandon}
        aria-label={t('reconnect.dismiss')}
        className="shrink-0 px-2 py-2 text-xs cursor-pointer"
        style={{ backgroundColor: 'transparent', color: 'var(--t-dim)' }}
      >
        ✕
      </button>
    </div>
  );
}
