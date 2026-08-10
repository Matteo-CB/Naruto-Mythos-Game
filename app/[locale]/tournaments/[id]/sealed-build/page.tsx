'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { useRouter } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { BoosterOpening } from '@/components/sealed/BoosterOpening';
import { SealedDeckBuilder } from '@/components/sealed/SealedDeckBuilder';
import type { CharacterCard, MissionCard } from '@/lib/engine/types';
import type { BoosterCard, BoosterPack } from '@/lib/sealed/boosterGenerator';
import { buildAISealedDeck } from '@/lib/sealed/aiSealedDeckBuilder';

type Step = 'loading' | 'denied' | 'opening' | 'building' | 'submitting' | 'submitted' | 'expired';

interface PoolResponse {
  pool: { boosters: BoosterPack[]; allCards: BoosterCard[] } | null;
  deck: { cardIds: string[]; missionIds: string[] } | null;
  deadline: number;
  now: number;
}

export default function TournamentSealedBuildPage() {
  const t = useTranslations('tournament');
  const tc = useTranslations('common');
  const tRoot = useTranslations();
  const params = useParams<{ id: string }>();
  const tournamentId = params?.id;
  const router = useRouter();
  const { data: session, status } = useSession();

  const [step, setStep] = useState<Step>('loading');
  const [boosters, setBoosters] = useState<BoosterPack[]>([]);
  const [allCards, setAllCards] = useState<BoosterCard[]>([]);
  const [deadline, setDeadline] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const submitDeck = useCallback(async (characters: CharacterCard[], missions: MissionCard[]) => {
    if (!tournamentId) return;
    setStep('submitting');
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/sealed-deck`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardIds: characters.map((c) => c.id),
          missionIds: missions.map((m) => m.id),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const key = typeof data?.errorKey === 'string' ? data.errorKey : null;
        setError(key && tRoot.has(key) ? tRoot(key) : tc('error'));
        setStep('building');
        return;
      }
      setStep('submitted');
      setTimeout(() => router.push(('/tournaments/' + tournamentId) as '/'), 1500);
    } catch {
      setError('Network error');
      setStep('building');
    }
  }, [tournamentId, router]);

  const autoSubmitRandom = useCallback(async () => {
    if (allCards.length === 0) return;
    try {
      const pool = {
        boosters,
        allCards,
        temporaryVariants: allCards.filter((c) => c.isTemporaryVariant).map((c) => c.id),
      };
      const aiDeck = buildAISealedDeck(pool);
      await submitDeck(aiDeck.characters, aiDeck.missions);
    } catch (err) {
      console.error('[SealedBuild] Auto-build failed:', err);
      setError('Auto-build failed');
    }
  }, [boosters, allCards, submitDeck]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (!tournamentId || status !== 'authenticated') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/tournaments/${tournamentId}/sealed-pool`);
        if (cancelled) return;
        if (!res.ok) {
          setStep('denied');
          return;
        }
        const data: PoolResponse = await res.json();
        if (cancelled) return;
        if (!data.pool) {
          setStep('denied');
          return;
        }
        if (data.deck) {
          setStep('submitted');
          setTimeout(() => router.push(('/tournaments/' + tournamentId) as '/'), 800);
          return;
        }
        const remainingMs = Math.max(0, data.deadline - Date.now());
        if (remainingMs <= 0) {
          setBoosters(data.pool.boosters);
          setAllCards(data.pool.allCards);
          setDeadline(data.deadline);
          setStep('expired');
          return;
        }
        setBoosters(data.pool.boosters);
        setAllCards(data.pool.allCards);
        setDeadline(data.deadline);
        setStep('opening');
      } catch (err) {
        if (!cancelled) {
          console.error('[SealedBuild] Failed to load pool:', err);
          setStep('denied');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [tournamentId, status, router]);

  useEffect(() => {
    if (step !== 'expired') return;
    autoSubmitRandom();
  }, [step, autoSubmitRandom]);

  const handleBoostersComplete = useCallback(() => {
    setStep('building');
  }, []);

  const handleDeckReady = useCallback((characters: CharacterCard[], missions: MissionCard[]) => {
    submitDeck(characters, missions);
  }, [submitDeck]);

  const handleTimeUp = useCallback(() => {
    autoSubmitRandom();
  }, [autoSubmitRandom]);

  if (status === 'loading' || step === 'loading') {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--t-bg)' }}>
        <span className="text-sm" style={{ color: 'var(--t-muted)' }}>{tc('loading')}</span>
      </main>
    );
  }
  if (step === 'denied') {
    return (
      <main className="min-h-screen flex items-center justify-center relative" style={{ backgroundColor: 'var(--t-bg)' }}>
        <CloudBackground />
        <div className="flex flex-col items-center gap-4 relative z-10">
          <span className="text-sm" style={{ color: 'var(--t-danger)' }}>{t('sealedBuildDenied')}</span>
          <button
            onClick={() => router.push(('/tournaments/' + tournamentId) as '/')}
            className="px-6 py-2 text-sm cursor-pointer"
            style={{ backgroundColor: 'var(--t-surface)', border: '1px solid var(--t-border)', color: 'var(--t-accent)' }}
          >
            {tc('back')}
          </button>
        </div>
      </main>
    );
  }
  if (step === 'submitted') {
    return (
      <main className="min-h-screen flex items-center justify-center relative" style={{ backgroundColor: 'var(--t-bg)' }}>
        <CloudBackground />
        <div className="flex flex-col items-center gap-4 relative z-10">
          <span className="text-lg font-bold" style={{ color: 'var(--t-accent)' }}>{t('sealedBuildSubmitted')}</span>
        </div>
      </main>
    );
  }
  if (step === 'submitting') {
    return (
      <main className="min-h-screen flex items-center justify-center relative" style={{ backgroundColor: 'var(--t-bg)' }}>
        <CloudBackground />
        <span className="text-sm relative z-10" style={{ color: 'var(--t-accent)' }}>{tc('loading')}</span>
      </main>
    );
  }
  if (step === 'expired') {
    return (
      <main className="min-h-screen flex items-center justify-center relative" style={{ backgroundColor: 'var(--t-bg)' }}>
        <CloudBackground />
        <div className="flex flex-col items-center gap-4 relative z-10">
          <span className="text-sm" style={{ color: 'var(--t-danger)' }}>{t('sealedBuildExpired')}</span>
        </div>
      </main>
    );
  }
  if (step === 'opening') {
    return <BoosterOpening boosters={boosters} onComplete={handleBoostersComplete} />;
  }

  const timerSeconds = Math.max(0, Math.floor((deadline - Date.now()) / 1000));

  return (
    <>
      {error && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2" style={{ backgroundColor: 'rgba(217,118,118,0.15)', color: 'var(--t-danger)' }}>
          {error}
        </div>
      )}
      <SealedDeckBuilder
        pool={allCards}
        isOnline
        timerSeconds={timerSeconds}
        onDeckReady={handleDeckReady}
        onTimeUp={handleTimeUp}
      />
    </>
  );
}
