'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { useRouter } from '@/lib/i18n/navigation';
import { useToastStore } from '@/stores/toastStore';

const POLL_MS = 20000;

export function TradeInviteToast() {
  const t = useTranslations('trade');
  const { data: session } = useSession();
  const router = useRouter();
  const showToast = useToastStore((s) => s.showToast);
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!session?.user?.id) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch('/api/trade/pending', { credentials: 'include' });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const invites: Array<{ roomId: string; fromUsername: string }> = Array.isArray(data.invites) ? data.invites : [];
        for (const inv of invites) {
          if (seenRef.current.has(inv.roomId)) continue;
          seenRef.current.add(inv.roomId);
          showToast({
            type: 'info',
            message: t('inviteToast', { name: inv.fromUsername }),
            durationMs: 60000,
            dedupeKey: `trade-invite-${inv.roomId}`,
            action: {
              label: t('accept'),
              onClick: () => router.push(`/trade/${inv.roomId}` as '/trade/[roomId]'),
            },
          });
        }
      } catch {
        // ignore
      }
    };

    void poll();
    const interval = setInterval(poll, POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [session?.user?.id, t, router, showToast]);

  return null;
}
