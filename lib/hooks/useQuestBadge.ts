'use client';

import { useEffect, useState } from 'react';

interface QuestSummary {
  id: string;
  completed: boolean;
  claimed: boolean;
}

interface DailySummary {
  completed: boolean;
  claimed: boolean;
}

export interface UseQuestBadgeResult {
  showBadge: boolean;
  unclaimedStandardCount: number;
  dailyClaimable: boolean;
  dailyAvailable: boolean;
}

export function useQuestBadge(): UseQuestBadgeResult {
  const [state, setState] = useState<UseQuestBadgeResult>({
    showBadge: false,
    unclaimedStandardCount: 0,
    dailyClaimable: false,
    dailyAvailable: false,
  });

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const [questsRes, dailyRes] = await Promise.all([
          fetch('/api/quests', { credentials: 'include' }),
          fetch('/api/quests/daily', { credentials: 'include' }),
        ]);
        const questsData = questsRes.ok ? await questsRes.json() : null;
        const dailyData = dailyRes.ok ? await dailyRes.json() : null;

        if (cancelled) return;

        const dailyQuestId: string | null = dailyData?.quest?.id ?? null;
        const quests: QuestSummary[] = Array.isArray(questsData?.quests) ? questsData.quests : [];
        const unclaimed = quests.filter((q) => q.completed && !q.claimed && q.id !== dailyQuestId);

        const daily: DailySummary | null = dailyData
          ? { completed: !!dailyData.completed, claimed: !!dailyData.claimed }
          : null;
        const dailyAvailable = daily != null && !daily.claimed;
        const dailyClaimable = daily != null && daily.completed && !daily.claimed;

        const showBadge = unclaimed.length > 0 || dailyClaimable;
        setState({
          showBadge,
          unclaimedStandardCount: unclaimed.length,
          dailyClaimable,
          dailyAvailable,
        });
      } catch {
      }
    };

    refresh();

    const onRotated = () => {
      void refresh();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('daily-quest:rotated', onRotated);
    }
    return () => {
      cancelled = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener('daily-quest:rotated', onRotated);
      }
    };
  }, []);

  return state;
}
