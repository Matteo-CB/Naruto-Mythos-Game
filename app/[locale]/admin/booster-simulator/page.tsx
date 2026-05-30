'use client';

import { useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations, useLocale } from 'next-intl';
import { motion } from 'framer-motion';
import { Link } from '@/lib/i18n/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { CloudBackground } from '@/components/CloudBackground';
import { Footer } from '@/components/Footer';
import { BoosterOpenAnimation } from '@/components/boosters/BoosterOpenAnimation';
import { getCardById } from '@/lib/data/cardIndex';
import { getCardName, getCardTitle } from '@/lib/utils/cardLocale';
import { isAdmin as isAdminUser } from '@/lib/auth/admins';
import { getAvailableSetIds, SET_REGISTRY } from '@/lib/data/sets/registry';
import type { CardData } from '@/lib/engine/types';

type Mode = 'normal' | 'forceL' | 'forceSV';
type Rarity = 'RA' | 'MV' | 'SV' | 'L';

const RARITIES: Rarity[] = ['L', 'SV', 'MV', 'RA'];
const COUNTS = [1, 10, 100, 1000, 10000] as const;
const ACCENT = '#c4a35a';

interface SimResult {
  setId: string;
  mode: Mode;
  count: number;
  totalSlots: number;
  perRarityCounts: Record<Rarity, number>;
  perRarityExpected: Record<Rarity, number>;
  perRarityDeviationPct: Record<Rarity, number>;
  perCardCounts: Array<{ cardId: string; count: number; rarity: Rarity }>;
  sampleBoosterCardIds: string[];
}

export default function AdminBoosterSimulatorPage() {
  const t = useTranslations('adminBoosterSim');
  const tCommon = useTranslations('common');
  const locale = useLocale() as 'en' | 'fr';
  const { data: session } = useSession();
  const admin = isAdminUser({ username: session?.user?.name, email: session?.user?.email });

  const availableSets = useMemo(() => getAvailableSetIds(), []);
  const [setId, setSetId] = useState<string>(availableSets[0] ?? 'KS');
  const [mode, setMode] = useState<Mode>('normal');
  const [count, setCount] = useState<number>(10);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SimResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sampleCards, setSampleCards] = useState<CardData[] | null>(null);

  const runSim = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setSampleCards(null);
    try {
      const res = await fetch('/api/admin/booster-simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ setId, mode, count }),
      });
      if (!res.ok) {
        setError('serverError');
        return;
      }
      const data: SimResult = await res.json();
      setResult(data);
    } catch {
      setError('serverError');
    } finally {
      setLoading(false);
    }
  };

  const playSample = () => {
    if (!result) return;
    const cards = result.sampleBoosterCardIds
      .map((id) => getCardById(id))
      .filter((c): c is NonNullable<typeof c> => c != null) as CardData[];
    if (cards.length > 0) setSampleCards(cards);
  };

  if (session === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
        <span className="text-sm" style={{ color: '#555' }}>...</span>
      </main>
    );
  }
  if (!admin) {
    return (
      <main className="relative min-h-screen flex flex-col" style={{ backgroundColor: '#0a0a0a', color: '#e8e8e8' }}>
        <CloudBackground />
        <header className="relative z-10 flex items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="text-xs tracking-widest font-display" style={{ color: '#888' }}>
            ← {tCommon('back')}
          </Link>
          <LanguageSwitcher />
        </header>
        <div className="relative z-10 flex-1 px-6 py-12 max-w-3xl mx-auto">
          <p className="text-sm" style={{ color: '#b33e3e' }}>{t('forbidden')}</p>
        </div>
        <Footer />
      </main>
    );
  }

  const maxCardCount = result ? Math.max(1, ...result.perCardCounts.map((c) => c.count)) : 1;

  return (
    <main className="relative min-h-screen flex flex-col" style={{ backgroundColor: '#0a0a0a', color: '#e8e8e8' }}>
      <CloudBackground />

      <header className="relative z-10 flex items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/admin" className="text-xs tracking-widest font-display" style={{ color: '#888' }}>
          ← {tCommon('back')}
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
        <p className="text-xs tracking-widest mb-6 uppercase" style={{ color: '#888' }}>
          {t('subtitle')}
        </p>

        <div
          className="p-4 mb-6 grid gap-4 sm:grid-cols-3"
          style={{ backgroundColor: '#0f0f0f', boxShadow: '0 12px 32px rgba(0,0,0,0.4)' }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-widest" style={{ color: '#888' }}>{t('setLabel')}</span>
            <select
              value={setId}
              onChange={(e) => setSetId(e.target.value)}
              className="px-3 py-2 text-xs"
              style={{ backgroundColor: '#0a0a0a', color: '#e8e8e8', border: '1px solid #1a1a1a' }}
            >
              {availableSets.map((s) => (
                <option key={s} value={s}>{SET_REGISTRY[s]?.nameEn ?? s}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-widest" style={{ color: '#888' }}>{t('modeLabel')}</span>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
              className="px-3 py-2 text-xs"
              style={{ backgroundColor: '#0a0a0a', color: '#e8e8e8', border: '1px solid #1a1a1a' }}
            >
              <option value="normal">{t('modeNormal')}</option>
              <option value="forceL">{t('modeForceL')}</option>
              <option value="forceSV">{t('modeForceSV')}</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-widest" style={{ color: '#888' }}>{t('countLabel')}</span>
            <select
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value, 10))}
              className="px-3 py-2 text-xs"
              style={{ backgroundColor: '#0a0a0a', color: '#e8e8e8', border: '1px solid #1a1a1a' }}
            >
              {COUNTS.map((c) => (
                <option key={c} value={c}>{c.toLocaleString('en')}</option>
              ))}
            </select>
          </label>

          <div className="sm:col-span-3 flex gap-3">
            <button
              type="button"
              onClick={runSim}
              disabled={loading}
              className="px-4 py-2 text-xs font-display tracking-widest uppercase"
              style={{
                backgroundColor: loading ? '#1a1a1a' : ACCENT,
                color: loading ? '#888' : '#0a0a0a',
                cursor: loading ? 'wait' : 'pointer',
              }}
            >
              {loading ? t('running') : t('runCta')}
            </button>
            {result && (
              <button
                type="button"
                onClick={playSample}
                className="px-4 py-2 text-xs font-display tracking-widest uppercase"
                style={{ backgroundColor: '#1a1a1a', color: ACCENT, cursor: 'pointer' }}
              >
                {t('playSample')}
              </button>
            )}
          </div>
        </div>

        {error && (
          <p className="text-sm mb-4" style={{ color: '#b33e3e' }}>{t('serverError')}</p>
        )}

        {result && (
          <>
            <h2 className="mb-2 text-xs uppercase tracking-widest" style={{ color: '#888' }}>
              {t('perRarityHeader', { count: result.totalSlots })}
            </h2>
            <div className="overflow-x-auto mb-6" style={{ backgroundColor: '#0f0f0f', boxShadow: '0 12px 32px rgba(0,0,0,0.4)' }}>
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: '#888', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                    <th className="px-4 py-2 text-left">{t('colRarity')}</th>
                    <th className="px-4 py-2 text-right">{t('colActual')}</th>
                    <th className="px-4 py-2 text-right">{t('colExpected')}</th>
                    <th className="px-4 py-2 text-right">{t('colDeviation')}</th>
                  </tr>
                </thead>
                <tbody>
                  {RARITIES.map((r) => {
                    const actual = result.perRarityCounts[r];
                    const expected = result.perRarityExpected[r];
                    const dev = result.perRarityDeviationPct[r];
                    return (
                      <tr key={r} style={{ borderTop: '1px solid #1a1a1a' }}>
                        <td className="px-4 py-2 font-display" style={{ color: ACCENT }}>{r}</td>
                        <td className="px-4 py-2 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>{actual}</td>
                        <td className="px-4 py-2 text-right" style={{ color: '#888', fontVariantNumeric: 'tabular-nums' }}>{expected.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right" style={{ color: Math.abs(dev) > 25 ? '#b33e3e' : '#888', fontVariantNumeric: 'tabular-nums' }}>
                          {dev >= 0 ? '+' : ''}{dev.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <h2 className="mb-2 text-xs uppercase tracking-widest" style={{ color: '#888' }}>
              {t('perCardHeader', { count: result.perCardCounts.length })}
            </h2>
            <div className="overflow-y-auto" style={{ maxHeight: 480, backgroundColor: '#0f0f0f', boxShadow: '0 12px 32px rgba(0,0,0,0.4)' }}>
              {result.perCardCounts.map((entry) => {
                const ratio = entry.count / maxCardCount;
                const card = getCardById(entry.cardId);
                const numberPart = entry.cardId.split('-')[1] ?? '';
                const displayLabel = card
                  ? `${getCardName(card, locale)} ${getCardTitle(card, locale)} ${numberPart}`
                  : entry.cardId;
                return (
                  <div key={entry.cardId} className="px-4 py-1.5 flex items-center gap-3" style={{ borderTop: '1px solid #141414' }}>
                    <span className="text-[10px] font-display" style={{ color: ACCENT, width: 28 }}>{entry.rarity}</span>
                    <span className="text-xs flex-1 truncate" style={{ color: '#bbb' }} title={displayLabel}>{displayLabel}</span>
                    <div className="flex-1" style={{ height: 4, backgroundColor: '#0a0a0a' }}>
                      <div style={{ width: `${ratio * 100}%`, height: '100%', backgroundColor: ACCENT }} />
                    </div>
                    <span className="text-xs text-right" style={{ width: 64, fontVariantNumeric: 'tabular-nums', color: '#bbb' }}>{entry.count}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <Footer />

      {sampleCards && (
        <BoosterOpenAnimation
          cards={sampleCards}
          duplicateCardIds={[]}
          setLabel={t('sampleAnimationLabel')}
          onClose={() => setSampleCards(null)}
        />
      )}
    </main>
  );
}
