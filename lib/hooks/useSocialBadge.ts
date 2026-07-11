'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useDmStore } from '@/stores/dmStore';

export function useSocialBadge(): { unreadDms: number; pendingRequests: number; total: number } {
  const { data: session } = useSession();
  const unreadDms = useDmStore((s) => s.unreadDms);
  const pendingRequests = useDmStore((s) => s.pendingRequests);
  const refreshBadge = useDmStore((s) => s.refreshBadge);

  useEffect(() => {
    if (!session?.user?.id) return;
    refreshBadge();
  }, [session?.user?.id, refreshBadge]);

  return { unreadDms, pendingRequests, total: unreadDms + pendingRequests };
}
