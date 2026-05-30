'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from '@/lib/i18n/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { CloudBackground } from '@/components/CloudBackground';
import { Footer } from '@/components/Footer';
import { BattlepassTrack } from '@/components/battlepass/BattlepassTrack';
import { InfiniteSegment } from '@/components/battlepass/InfiniteSegment';
import { BoosterSetTile } from '@/components/boosters/BoosterSetTile';
import { BoosterCarousel } from '@/components/boosters/BoosterCarousel';
import { BoosterRatesPanel } from '@/components/boosters/BoosterRatesPanel';
import { BoosterOpenAnimation } from '@/components/boosters/BoosterOpenAnimation';
import { BoosterOpenFailureScreen } from '@/components/boosters/BoosterOpenFailureScreen';
import { useBoosterInventory, clearBoosterInventoryCache } from '@/lib/hooks/useBoosterInventory';
import { clearUnlockedVariantsCache } from '@/lib/hooks/useUnlockedVariants';
import { markBoostersSeen } from '@/lib/hooks/useBoosterBadge';
import { markBattlepassBoostersSeen, readBattlepassBoostersSeen } from '@/lib/hooks/useBattlepassBadge';
import { useToastStore } from '@/stores/toastStore';
import { getCardById } from '@/lib/data/cardIndex';
import { VARIANT_PACK_SIZE } from '@/lib/variants/constants';
import type { CardData } from '@/lib/engine/types';

type TabKey = 'rewards' | 'boosters' | 'quests';
type Locale = 'en' | 'fr';

interface TierData {
  tier: number;
  xpRequired: number;
  reward: {
    type: 'booster' | 'card';
    setId: string;
    cardId?: string;
    cardOwned?: boolean;
    cardClaimable?: boolean;
  };
  reached: boolean;
}

interface BattlepassState {
  season: { setId: string };
  xp: number;
  tier: number;
  xpForCurrentTier: number;
  xpForNextTier: number | null;
  xpIntoCurrentTier: number;
  xpToNext: number | null;
  isMaxNamedTier: boolean;
  infiniteBoostersEarned: number;
  xpIntoCurrentInfiniteStep: number;
  xpToNextInfiniteBooster: number | null;
  infiniteStepXp: number;
  maxNamedXp: number;
  tierCount: number;
  tiers: TierData[];
}

interface QuestRow {
  id: string;
  level: 1 | 2 | 3 | 4;
  target: number;
  hook: string;
  text_fr: string;
  text_en: string;
  scope: string;
  xpReward: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
}

interface DailyRow {
  date: string;
  quest: {
    id: string;
    level: 1 | 2 | 3 | 4;
    target: number;
    text_fr: string;
    text_en: string;
    xpReward: number;
  };
  progress: number;
  completed: boolean;
  claimed: boolean;
}

interface OpenedBooster {
  cards: CardData[];
  duplicateCardIds: string[];
  setLabel: string;
  boosterImage?: string;
}

const ACCENT = '#c4a35a';
const PANEL_CLIP = 'polygon(14px 0, calc(100% - 14px) 0, 100% 14px, 100% calc(100% - 14px), calc(100% - 14px) 100%, 14px 100%, 0 calc(100% - 14px), 0 14px)';
const STAT_CLIP = 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';
const PANEL_BG = '#0d0c10';
const LEVEL_COLOR: Record<number, string> = {
  1: '#3e8b3e',
  2: '#5fa3df',
  3: '#c4a35a',
  4: '#b33e3e',
};

const TABS: TabKey[] = ['rewards', 'boosters', 'quests'];

export default function RewardsHubPage() {
  const t = useTranslations('battlepass');
  const tBoosters = useTranslations('boosters');
  const tQuests = useTranslations('quests');
  const tCommon = useTranslations('common');
  const locale = useLocale() as Locale;
  const searchParams = useSearchParams();
  const showToast = useToastStore((s) => s.showToast);

  const tabParam = searchParams.get('tab');
  const initialTab: TabKey = TABS.includes(tabParam as TabKey) ? (tabParam as TabKey) : 'rewards';
  const [tab, setTab] = useState<TabKey>(initialTab);

  const [bpState, setBpState] = useState<BattlepassState | null>(null);
  const [quests, setQuests] = useState<QuestRow[]>([]);
  const [daily, setDaily] = useState<DailyRow | null>(null);
  const { inventory, totalUnopened, loading: invLoading, refresh: refreshInventory } = useBoosterInventory();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'unauth' | 'load' | null>(null);

  const [claimingTier, setClaimingTier] = useState<number | null>(null);
  const [claimingQuestId, setClaimingQuestId] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [opened, setOpened] = useState<OpenedBooster | null>(null);
  const [failureScreen, setFailureScreen] = useState(false);
  const [claimedCard, setClaimedCard] = useState<CardData | null>(null);
  const [claimedCardTier, setClaimedCardTier] = useState<number | null>(null);
  const animationCloseResolverRef = useRef<(() => void) | null>(null);
  const [activeLevel, setActiveLevel] = useState<number>(1);

  const fetchBpState = useCallback(async (): Promise<BattlepassState | null> => {
    const res = await fetch('/api/battlepass', { credentials: 'include' });
    if (!res.ok) {
      if (res.status === 401) { setError('unauth'); return null; }
      setError('load'); return null;
    }
    return (await res.json()) as BattlepassState;
  }, []);

  const fetchQuests = useCallback(async () => {
    const [qRes, dRes] = await Promise.all([
      fetch('/api/quests', { credentials: 'include' }),
      fetch('/api/quests/daily', { credentials: 'include' }),
    ]);
    if (qRes.status === 401) { setError('unauth'); return; }
    if (!qRes.ok) { setError('load'); return; }
    const qData = await qRes.json();
    const dData = dRes.ok ? await dRes.json() : null;
    setQuests(Array.isArray(qData.quests) ? qData.quests : []);
    setDaily(dData);
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      const [bp] = await Promise.all([
        fetchBpState(),
        fetchQuests(),
        refreshInventory(),
      ]);
      if (bp) {
        setBpState(bp);
        const previouslySeenTier = readBattlepassBoostersSeen();
        if (previouslySeenTier !== null) {
          const newTiersCrossed = Math.max(0, bp.tier - previouslySeenTier);
          const startTier = previouslySeenTier + 1;
          const cardTiersInRange = [25, 50].filter((c) => c >= startTier && c <= bp.tier).length;
          const newBoostersGranted = newTiersCrossed - cardTiersInRange;
          if (newBoostersGranted > 0) {
            showToast({
              type: 'success',
              message: t('boostersGrantedToast', { count: newBoostersGranted }),
              dedupeKey: `bp-boosters-${bp.tier}`,
            });
          }
        }
        markBattlepassBoostersSeen(bp.tier);
      }
      setError(null);
    } catch {
      setError('load');
    } finally {
      setLoading(false);
    }
  }, [fetchBpState, fetchQuests, refreshInventory, showToast, t]);

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!invLoading) {
      markBoostersSeen(totalUnopened);
    }
  }, [invLoading, totalUnopened]);

  const switchTab = (next: TabKey) => {
    if (next === tab) return;
    setTab(next);
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (next === 'rewards') params.delete('tab');
      else params.set('tab', next);
      const search = params.toString();
      const url = `${window.location.pathname}${search ? `?${search}` : ''}`;
      window.history.replaceState(null, '', url);
    }
  };

  const awaitAnimationClose = (): Promise<void> => {
    return new Promise<void>((resolve) => {
      animationCloseResolverRef.current = resolve;
    });
  };

  const handleClaimCard = async (tier: number) => {
    if (claimingTier !== null) return;
    setClaimingTier(tier);
    try {
      const res = await fetch('/api/battlepass/claim-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tier }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const errorKey = typeof body.errorKey === 'string' ? body.errorKey : 'battlepass.error.claimError';
        showToast({ type: 'error', messageKey: errorKey, dedupeKey: `bp-claim-${tier}` });
        return;
      }
      const body: { tier: number; cardId: string } = await res.json();
      clearUnlockedVariantsCache();
      const refreshed = await fetchBpState();
      if (refreshed) setBpState(refreshed);
      const card = getCardById(body.cardId);
      if (card) {
        const closed = awaitAnimationClose();
        setClaimedCardTier(body.tier);
        setClaimedCard(card as CardData);
        await closed;
      } else {
        showToast({
          type: 'success',
          message: t('cardClaimedFallback', { tier }),
          dedupeKey: `bp-claimed-${tier}`,
        });
      }
    } catch {
      showToast({ type: 'error', messageKey: 'battlepass.error.claimError', dedupeKey: `bp-claim-${tier}` });
    } finally {
      setClaimingTier(null);
    }
  };

  const handleCloseClaimAnim = () => {
    setClaimedCard(null);
    setClaimedCardTier(null);
    const resolver = animationCloseResolverRef.current;
    animationCloseResolverRef.current = null;
    if (resolver) resolver();
  };

  const claimableCardTiers = bpState?.tiers.filter((tt) => tt.reward.cardClaimable).map((tt) => tt.tier) ?? [];

  const handleClaimAllCards = async () => {
    if (claimingTier !== null) return;
    for (const tt of claimableCardTiers) {
      await handleClaimCard(tt);
    }
  };

  const handleOpenBooster = async (setId: string) => {
    if (opening) return;
    setOpening(setId);
    try {
      const res = await fetch('/api/boosters/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const errorKey = typeof body.errorKey === 'string' ? body.errorKey : 'boosters.error.serverError';
        showToast({ type: 'error', messageKey: errorKey, dedupeKey: `booster-error-${setId}` });
        return;
      }
      const data = await res.json();
      const ids: string[] = Array.isArray(data.cardIds) ? data.cardIds : [];
      const dups: string[] = Array.isArray(data.duplicateCardIds) ? data.duplicateCardIds : [];
      const cards: CardData[] = [];
      for (const id of ids) {
        const card = getCardById(id);
        if (card) cards.push(card);
      }
      const entry = inventory.find((b) => b.setId === setId);
      if (cards.length === 0) {
        setFailureScreen(true);
        clearBoosterInventoryCache();
        clearUnlockedVariantsCache();
        await refreshInventory();
        return;
      }
      const setLabel = entry ? (locale === 'fr' ? entry.nameFr : entry.nameEn) : setId;
      setOpened({ cards, duplicateCardIds: dups, setLabel, boosterImage: entry?.boosterImage });
      clearBoosterInventoryCache();
      clearUnlockedVariantsCache();
      await refreshInventory();
    } catch {
      setFailureScreen(true);
    } finally {
      setOpening(null);
    }
  };

  const handleClaimQuest = async (questId: string) => {
    if (claimingQuestId !== null) return;
    setClaimingQuestId(questId);
    try {
      const res = await fetch(`/api/quests/${encodeURIComponent(questId)}/claim`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const errorKey = typeof body.errorKey === 'string' ? body.errorKey : 'quests.error.claimError';
        showToast({ type: 'error', messageKey: errorKey, dedupeKey: `q-claim-${questId}` });
        return;
      }
      const body = await res.json();
      showToast({
        type: 'success',
        message: tQuests('claimedXpToast', { xp: body.xpAwarded ?? 0 }),
        dedupeKey: `q-claimed-${questId}`,
      });
      await refreshAll();
    } catch {
      showToast({ type: 'error', messageKey: 'quests.error.claimError', dedupeKey: `q-claim-${questId}` });
    } finally {
      setClaimingQuestId(null);
    }
  };

  const handleClaimDaily = async () => {
    if (claimingQuestId !== null) return;
    setClaimingQuestId('daily');
    try {
      const res = await fetch('/api/quests/daily', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const errorKey = typeof body.errorKey === 'string' ? body.errorKey : 'quests.error.claimError';
        showToast({ type: 'error', messageKey: errorKey, dedupeKey: 'q-claim-daily' });
        return;
      }
      const body = await res.json();
      showToast({
        type: 'success',
        message: tQuests('claimedXpToast', { xp: body.xpAwarded ?? 0 }),
        dedupeKey: 'q-claimed-daily',
      });
      await refreshAll();
    } catch {
      showToast({ type: 'error', messageKey: 'quests.error.claimError', dedupeKey: 'q-claim-daily' });
    } finally {
      setClaimingQuestId(null);
    }
  };

  const claimableCardCount = claimableCardTiers.length;
  const claimableQuestCount =
    quests.filter((q) => q.completed && !q.claimed).length +
    (daily && daily.completed && !daily.claimed ? 1 : 0);

  const tabBadgeCount = (key: TabKey): number => {
    if (key === 'rewards') return claimableCardCount;
    if (key === 'boosters') return totalUnopened;
    return claimableQuestCount;
  };

  const tabLabel = (key: TabKey): string => {
    if (key === 'rewards') return t('tabRewards');
    if (key === 'boosters') return t('tabBoosters');
    return t('tabQuests');
  };

  const recommendedQuests: QuestRow[] = (() => {
    const byLevel: Record<number, QuestRow | null> = { 1: null, 2: null, 3: null, 4: null };
    for (const q of quests) {
      if (q.claimed) continue;
      const cur = byLevel[q.level];
      const qScore = (q.completed ? 1 : 0) * 2 + (q.progress / Math.max(1, q.target));
      const curScore = cur ? (cur.completed ? 1 : 0) * 2 + (cur.progress / Math.max(1, cur.target)) : -1;
      if (!cur || qScore > curScore) byLevel[q.level] = q;
    }
    return [1, 2, 3, 4].map((l) => byLevel[l]).filter((q): q is QuestRow => q !== null);
  })();

  const levelCounts = [1, 2, 3, 4].map((level) => ({
    level,
    total: quests.filter((q) => q.level === level).length,
    completed: quests.filter((q) => q.level === level && q.completed).length,
    claimable: quests.filter((q) => q.level === level && q.completed && !q.claimed).length,
  }));

  const filteredQuests = quests.filter((q) => q.level === activeLevel);

  return (
    <main className="relative min-h-screen flex flex-col overflow-hidden" style={{ backgroundColor: '#08070a', color: '#e8e8e8' }}>
      <CloudBackground />

      <header className="relative z-10 flex items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="text-xs tracking-widest font-display" style={{ color: '#888' }}>
          {'< '}{tCommon('back')}
        </Link>
        <LanguageSwitcher />
      </header>

      <div className="relative z-10 flex-1 px-4 sm:px-6 max-w-6xl w-full mx-auto pb-12">
        <motion.h1
          className="text-2xl sm:text-3xl font-display tracking-[0.3em] mb-1 mt-4"
          style={{ color: ACCENT }}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {t('title')}
        </motion.h1>
        <motion.p
          className="text-xs tracking-widest mb-1 uppercase"
          style={{ color: '#888' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          {t('subtitle')}
        </motion.p>
        <motion.p
          className="text-[11px] mb-1 italic"
          style={{ color: '#4a9e4a' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
        >
          {t('freeNote')}
        </motion.p>
        {tab === 'quests' && (
          <motion.p
            key="quests-subtitle"
            className="text-[11px] mb-6"
            style={{ color: '#666' }}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            {tQuests('subtitle')}
          </motion.p>
        )}
        {tab !== 'quests' && <div className="mb-5" />}

        {loading && (
          <div className="text-sm" style={{ color: '#666' }}>{tCommon('loading')}</div>
        )}

        {error === 'unauth' && (
          <div className="text-sm" style={{ color: ACCENT }}>
            {t('unauthMessage')}{' '}
            <Link href="/login" style={{ color: ACCENT, textDecoration: 'underline' }}>
              {tCommon('signIn')}
            </Link>
          </div>
        )}

        {error === 'load' && (
          <div className="text-sm" style={{ color: '#b33e3e' }}>{t('loadError')}</div>
        )}

        {!loading && !error && bpState && (
          <>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-wrap items-center gap-6 mb-5 px-5 py-5"
              style={{ backgroundColor: PANEL_BG, clipPath: PANEL_CLIP, boxShadow: '0 12px 32px rgba(0,0,0,0.45)' }}
            >
              <div>
                <div className="text-[10px] uppercase tracking-[0.32em]" style={{ color: '#666' }}>
                  {t('currentTier')}
                </div>
                <div className="text-3xl sm:text-4xl font-display mt-1" style={{ color: ACCENT, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>
                  {bpState.tier}
                  <span className="text-sm" style={{ color: '#555' }}> / {bpState.tierCount}</span>
                </div>
              </div>

              <div className="flex-1 min-w-[200px]">
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-[10px] uppercase tracking-widest" style={{ color: '#888' }}>
                    {t('xpProgress')}
                  </span>
                  <span className="text-xs" style={{ color: '#bbb', fontVariantNumeric: 'tabular-nums' }}>
                    {bpState.xp}{bpState.xpForNextTier !== null ? ` / ${bpState.xpForNextTier}` : ''}
                  </span>
                </div>
                <div style={{ height: 6, backgroundColor: '#1a1a1a' }}>
                  <motion.div
                    style={{ height: '100%', backgroundColor: ACCENT }}
                    initial={{ width: 0 }}
                    animate={{
                      width: bpState.xpForNextTier
                        ? `${Math.min(100, (bpState.xpIntoCurrentTier / (bpState.xpForNextTier - bpState.xpForCurrentTier)) * 100)}%`
                        : '100%',
                    }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                </div>
                {bpState.xpToNext !== null && (
                  <div className="text-[10px] mt-1.5" style={{ color: '#888' }}>
                    {t('xpToNext', { xp: bpState.xpToNext })}
                  </div>
                )}
              </div>

              {bpState.isMaxNamedTier && (
                <div>
                  <div className="text-[10px] uppercase tracking-[0.32em]" style={{ color: '#666' }}>
                    {t('infiniteBoosters')}
                  </div>
                  <div className="text-2xl font-display mt-1" style={{ color: ACCENT, fontVariantNumeric: 'tabular-nums' }}>
                    {bpState.infiniteBoostersEarned}
                  </div>
                </div>
              )}
            </motion.div>

            <div className="relative flex gap-1 mb-5" role="tablist">
              {TABS.map((key) => {
                const isActive = tab === key;
                const count = tabBadgeCount(key);
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => switchTab(key)}
                    className="relative px-4 py-2.5 text-[11px] tracking-widest font-display uppercase flex items-center gap-2"
                    style={{
                      color: isActive ? ACCENT : '#777',
                      backgroundColor: isActive ? '#141414' : 'transparent',
                      cursor: 'pointer',
                      transition: 'color 200ms ease, background-color 200ms ease',
                    }}
                  >
                    {tabLabel(key)}
                    {count > 0 && (
                      <motion.span
                        className="px-1.5 py-0.5 text-[9px]"
                        style={{
                          backgroundColor: `${ACCENT}26`,
                          color: ACCENT,
                          fontVariantNumeric: 'tabular-nums',
                          letterSpacing: 0,
                        }}
                        animate={isActive ? undefined : { opacity: [0.6, 1, 0.6] }}
                        transition={{ duration: 2.2, repeat: Infinity }}
                      >
                        {count}
                      </motion.span>
                    )}
                    {isActive && (
                      <motion.span
                        layoutId="active-tab-underline"
                        className="absolute left-0 right-0 bottom-0"
                        style={{ height: 2, backgroundColor: ACCENT }}
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <AnimatePresence mode="wait">
              {tab === 'rewards' && (
                <motion.section
                  key="rewards"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  <div
                    className="mb-6 py-4"
                    style={{ backgroundColor: PANEL_BG, clipPath: PANEL_CLIP, boxShadow: '0 12px 32px rgba(0,0,0,0.45)' }}
                  >
                    <div className="px-5 mb-3 flex items-center justify-between">
                      <h2 className="text-[11px] uppercase tracking-[0.28em]" style={{ color: '#666' }}>
                        {t('trackLabel')}
                      </h2>
                      {claimableCardTiers.length >= 2 && (
                        <motion.button
                          type="button"
                          onClick={handleClaimAllCards}
                          disabled={claimingTier !== null}
                          className="px-3 py-1.5 text-[10px] tracking-widest font-display uppercase"
                          style={{
                            backgroundColor: claimingTier !== null ? '#1a1a1a' : ACCENT,
                            color: claimingTier !== null ? '#888' : '#0a0a0a',
                            cursor: claimingTier !== null ? 'wait' : 'pointer',
                          }}
                          animate={claimingTier !== null ? undefined : { boxShadow: [`0 0 6px ${ACCENT}66`, `0 0 14px ${ACCENT}aa`, `0 0 6px ${ACCENT}66`] }}
                          transition={{ duration: 1.4, repeat: Infinity }}
                        >
                          {t('claimAll')}
                        </motion.button>
                      )}
                    </div>
                    <BattlepassTrack
                      tiers={bpState.tiers}
                      currentTier={bpState.tier}
                      xpIntoCurrentTier={bpState.xpIntoCurrentTier}
                      xpForNextTier={bpState.xpForNextTier}
                      xpForCurrentTier={bpState.xpForCurrentTier}
                      onClaim={handleClaimCard}
                      claimLabel={t('claim')}
                      claimingTier={claimingTier}
                    />
                  </div>

                  <h2 className="mb-2 text-xs uppercase tracking-widest" style={{ color: '#888' }}>
                    {t('infiniteLabel')}
                  </h2>
                  <InfiniteSegment
                    setId={bpState.season.setId}
                    totalEarned={bpState.infiniteBoostersEarned}
                    xpIntoCurrentStep={bpState.xpIntoCurrentInfiniteStep}
                    stepXp={bpState.infiniteStepXp}
                    xpToNext={bpState.xpToNextInfiniteBooster}
                    active={bpState.isMaxNamedTier}
                  />

                  {quests.length > 0 && (
                    <section className="mt-6">
                      <div className="flex items-baseline justify-between mb-3">
                        <h2 className="text-[11px] uppercase tracking-[0.28em]" style={{ color: '#666' }}>
                          {t('recommendedQuestsTitle')}
                        </h2>
                        <button
                          type="button"
                          onClick={() => switchTab('quests')}
                          className="text-[10px] uppercase tracking-widest"
                          style={{ color: ACCENT, cursor: 'pointer' }}
                        >
                          {t('recommendedQuestsSeeAll')}
                        </button>
                      </div>
                      {recommendedQuests.length === 0 ? (
                        <div className="flex flex-col items-center py-6 gap-2">
                          <img src="/images/icons/empty-quests.svg" alt="" draggable={false} style={{ width: 36, height: 36, opacity: 0.2 }} />
                          <p className="text-[11px]" style={{ color: '#555' }}>
                            {t('recommendedQuestsEmpty')}
                          </p>
                        </div>
                      ) : (
                        <div style={{ backgroundColor: PANEL_BG, clipPath: STAT_CLIP, boxShadow: '0 12px 32px rgba(0,0,0,0.45)' }}>
                          {recommendedQuests.map((q) => (
                            <div
                              key={q.id}
                              className="px-4 py-3 flex flex-wrap items-center gap-3"
                              style={{ borderTop: '1px solid #141414' }}
                            >
                              <span
                                className="text-[10px] font-display tracking-widest uppercase shrink-0"
                                style={{ color: LEVEL_COLOR[q.level], width: 48 }}
                              >
                                {tQuests('levelLabel', { level: q.level })}
                              </span>
                              <span className="text-xs flex-1" style={{ color: '#e8e8e8', minWidth: 180 }}>
                                {locale === 'fr' ? q.text_fr : q.text_en}
                              </span>
                              <div className="flex items-center gap-2" style={{ minWidth: 140 }}>
                                <div className="flex-1" style={{ height: 4, backgroundColor: '#1a1a1a', minWidth: 80 }}>
                                  <div
                                    style={{
                                      height: '100%',
                                      backgroundColor: q.completed ? ACCENT : '#666',
                                      width: `${Math.min(100, (q.progress / q.target) * 100)}%`,
                                    }}
                                  />
                                </div>
                                <span className="text-[10px] shrink-0" style={{ color: '#888', fontVariantNumeric: 'tabular-nums' }}>
                                  {q.progress}/{q.target}
                                </span>
                              </div>
                              <span className="text-[10px]" style={{ color: ACCENT, fontVariantNumeric: 'tabular-nums', width: 60, textAlign: 'right' }}>
                                +{q.xpReward} XP
                              </span>
                              <div style={{ width: 96, textAlign: 'right' }}>
                                {q.completed ? (
                                  <button
                                    type="button"
                                    onClick={() => handleClaimQuest(q.id)}
                                    disabled={claimingQuestId !== null}
                                    className="px-2 py-1 text-[10px] tracking-widest font-display uppercase"
                                    style={{
                                      backgroundColor: claimingQuestId === q.id ? '#1a1a1a' : ACCENT,
                                      color: claimingQuestId === q.id ? '#888' : '#0a0a0a',
                                      cursor: claimingQuestId !== null ? 'wait' : 'pointer',
                                    }}
                                  >
                                    {tQuests('claim')}
                                  </button>
                                ) : (
                                  <span className="text-[10px]" style={{ color: '#555' }}>...</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  )}

                  <p className="mt-6 text-[11px] leading-relaxed" style={{ color: '#666' }}>
                    {t('autoGrantNote')}
                  </p>
                </motion.section>
              )}

              {tab === 'boosters' && (
                <motion.section
                  key="boosters"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="flex items-baseline justify-between mb-4">
                    <h2 className="text-xs uppercase tracking-widest" style={{ color: '#888' }}>
                      {tBoosters('title')}
                    </h2>
                    <span className="text-[11px]" style={{ color: '#888', fontVariantNumeric: 'tabular-nums' }}>
                      {tBoosters('totalUnopened', { count: totalUnopened })}
                    </span>
                  </div>

                  {invLoading ? (
                    <div className="flex flex-row gap-6 justify-center mb-8">
                      {[0, 1].map((i) => (
                        <div key={i} className="h-115 w-70 bg-[#111111] animate-pulse" style={{ boxShadow: '0 12px 32px rgba(0,0,0,0.4)' }} />
                      ))}
                    </div>
                  ) : (
                    <div className="mb-6">
                      <BoosterCarousel>
                        {inventory.map((entry) => (
                          <div key={entry.setId} className="shrink-0" style={{ scrollSnapAlign: 'start' }}>
                            <BoosterSetTile
                              entry={entry}
                              locale={locale}
                              countLabel={
                                entry.status === 'coming_soon'
                                  ? tBoosters('unavailable')
                                  : tBoosters('countLine', { count: entry.count })
                              }
                              perBoosterLabel={tBoosters('cardsPerBooster', { count: VARIANT_PACK_SIZE })}
                              openLabel={tBoosters('openCta')}
                              comingSoonLabel={tBoosters('comingSoonCta')}
                              onOpen={() => handleOpenBooster(entry.setId)}
                              disabled={opening !== null}
                            />
                          </div>
                        ))}
                      </BoosterCarousel>
                    </div>
                  )}

                  <BoosterRatesPanel />

                  <section className="mt-6">
                    <h3 className="font-display uppercase tracking-wider mb-3" style={{ color: '#888', fontSize: 11, letterSpacing: '0.18em' }}>
                      {tBoosters('helpTitle')}
                    </h3>
                    <div style={{ height: 1, backgroundColor: '#1a1a1a', marginBottom: 12 }} />
                    <ul className="space-y-2 font-body text-sm" style={{ color: '#aaa' }}>
                      <li>{tBoosters('helpBattlepass')}</li>
                      <li>{tBoosters('helpTournamentWinner')}</li>
                      <li>{tBoosters('helpTournamentFinisher')}</li>
                    </ul>
                  </section>
                </motion.section>
              )}

              {tab === 'quests' && (
                <motion.section
                  key="quests"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  {daily && (
                    <section
                      className="mb-5 px-5 py-4"
                      style={{ backgroundColor: PANEL_BG, clipPath: PANEL_CLIP, boxShadow: '0 12px 32px rgba(0,0,0,0.45)' }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                        <h3 className="text-xs uppercase tracking-[0.24em] font-display" style={{ color: ACCENT }}>
                          {tQuests('dailyHeader')}
                        </h3>
                        <span className="text-[10px] uppercase tracking-widest" style={{ color: '#666', fontVariantNumeric: 'tabular-nums' }}>
                          {daily.date}
                        </span>
                      </div>
                      <p className="text-sm mb-3" style={{ color: '#e8e8e8' }}>
                        {locale === 'fr' ? daily.quest.text_fr : daily.quest.text_en}
                      </p>
                      <div className="flex items-center gap-3">
                        <div className="flex-1" style={{ height: 4, backgroundColor: '#1a1a1a' }}>
                          <div
                            style={{
                              height: '100%',
                              backgroundColor: ACCENT,
                              width: `${Math.min(100, (daily.progress / daily.quest.target) * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="text-[10px]" style={{ color: '#bbb', fontVariantNumeric: 'tabular-nums' }}>
                          {daily.progress} / {daily.quest.target}
                        </span>
                        <span className="text-[10px]" style={{ color: ACCENT, fontVariantNumeric: 'tabular-nums' }}>
                          +{daily.quest.xpReward} XP
                        </span>
                        {daily.claimed ? (
                          <span className="text-[10px] uppercase tracking-widest" style={{ color: '#666' }}>{tQuests('claimed')}</span>
                        ) : daily.completed ? (
                          <button
                            type="button"
                            onClick={handleClaimDaily}
                            disabled={claimingQuestId !== null}
                            className="px-3 py-1.5 text-[10px] tracking-widest font-display uppercase"
                            style={{
                              backgroundColor: claimingQuestId !== null ? '#1a1a1a' : ACCENT,
                              color: claimingQuestId !== null ? '#888' : '#0a0a0a',
                              cursor: claimingQuestId !== null ? 'wait' : 'pointer',
                            }}
                          >
                            {tQuests('claim')}
                          </button>
                        ) : null}
                      </div>
                    </section>
                  )}

                  <div className="flex flex-wrap gap-2 mb-4">
                    {levelCounts.map(({ level, total, completed, claimable }) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setActiveLevel(level)}
                        className="px-3 py-1.5 text-[10px] tracking-widest font-display uppercase flex items-center gap-2"
                        style={{
                          backgroundColor: activeLevel === level ? '#1a1a1a' : '#0f0f0f',
                          color: activeLevel === level ? LEVEL_COLOR[level] : '#888',
                          cursor: 'pointer',
                        }}
                      >
                        {tQuests('levelLabel', { level })}
                        <span style={{ color: '#666', fontVariantNumeric: 'tabular-nums' }}>{completed}/{total}</span>
                        {claimable > 0 && (
                          <span style={{ color: ACCENT, fontVariantNumeric: 'tabular-nums' }}>+{claimable}</span>
                        )}
                      </button>
                    ))}
                  </div>

                  <div style={{ backgroundColor: PANEL_BG, clipPath: STAT_CLIP, boxShadow: '0 12px 32px rgba(0,0,0,0.45)' }}>
                    {filteredQuests.map((q) => (
                      <div
                        key={q.id}
                        className="px-4 py-3 flex flex-wrap items-center gap-3"
                        style={{ borderTop: '1px solid #141414' }}
                      >
                        <span
                          className="text-[10px] font-display tracking-widest uppercase shrink-0"
                          style={{ color: LEVEL_COLOR[q.level], width: 48 }}
                        >
                          {tQuests('levelLabel', { level: q.level })}
                        </span>
                        <span className="text-xs flex-1" style={{ color: '#e8e8e8', minWidth: 200 }}>
                          {locale === 'fr' ? q.text_fr : q.text_en}
                        </span>
                        <div className="flex items-center gap-2" style={{ minWidth: 140 }}>
                          <div className="flex-1" style={{ height: 4, backgroundColor: '#1a1a1a', minWidth: 80 }}>
                            <div
                              style={{
                                height: '100%',
                                backgroundColor: q.completed ? ACCENT : '#666',
                                width: `${Math.min(100, (q.progress / q.target) * 100)}%`,
                              }}
                            />
                          </div>
                          <span className="text-[10px] shrink-0" style={{ color: '#888', fontVariantNumeric: 'tabular-nums' }}>
                            {q.progress}/{q.target}
                          </span>
                        </div>
                        <span className="text-[10px]" style={{ color: ACCENT, fontVariantNumeric: 'tabular-nums', width: 60, textAlign: 'right' }}>
                          +{q.xpReward} XP
                        </span>
                        <div style={{ width: 96, textAlign: 'right' }}>
                          {q.claimed ? (
                            <span className="text-[10px] uppercase tracking-widest" style={{ color: '#555' }}>{tQuests('claimed')}</span>
                          ) : q.completed ? (
                            <button
                              type="button"
                              onClick={() => handleClaimQuest(q.id)}
                              disabled={claimingQuestId !== null}
                              className="px-2 py-1 text-[10px] tracking-widest font-display uppercase"
                              style={{
                                backgroundColor: claimingQuestId === q.id ? '#1a1a1a' : ACCENT,
                                color: claimingQuestId === q.id ? '#888' : '#0a0a0a',
                                cursor: claimingQuestId !== null ? 'wait' : 'pointer',
                              }}
                            >
                              {tQuests('claim')}
                            </button>
                          ) : (
                            <span className="text-[10px]" style={{ color: '#555' }}>...</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.section>
              )}
            </AnimatePresence>
          </>
        )}
      </div>

      <Footer />

      {opened && (
        <BoosterOpenAnimation
          cards={opened.cards}
          duplicateCardIds={opened.duplicateCardIds}
          setLabel={opened.setLabel}
          boosterImage={opened.boosterImage}
          onClose={() => setOpened(null)}
        />
      )}

      {failureScreen && (
        <BoosterOpenFailureScreen
          title={tBoosters('recovery.title')}
          body={tBoosters('recovery.body')}
          backLabel={tBoosters('recovery.back')}
          onClose={() => setFailureScreen(false)}
        />
      )}

      {claimedCard && (
        <BoosterOpenAnimation
          cards={[claimedCard]}
          duplicateCardIds={[]}
          setLabel={claimedCardTier !== null ? t('animationLabel', { tier: claimedCardTier }) : t('title')}
          onClose={handleCloseClaimAnim}
        />
      )}
    </main>
  );
}
