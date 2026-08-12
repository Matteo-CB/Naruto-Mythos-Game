'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useLocaleBcp47 } from '@/lib/i18n/useLocaleMeta';
import { CountryFlag } from '@/components/CountryFlag';

const CHAMPION_GLOW = 'color-mix(in srgb, var(--t-champion) 8%, transparent)';
const CHAMPION_SHEEN = 'color-mix(in srgb, var(--t-champion) 14%, transparent)';

interface Champion {
  countryCode: string;
  endMonth: string;
  podium: Array<{ rank: number; countryCode: string; score: number; players: { username: string }[] }> | null;
}

function monthLabel(ym: string, bcp47: string): string {
  try {
    const [y, m] = ym.split('-').map(Number);
    return new Intl.DateTimeFormat(bcp47, { month: 'long', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, 1)));
  } catch { return ym; }
}

export function WorldcupBanner({ champion, countryName }: { champion: Champion; countryName: (c: string) => string }) {
  const t = useTranslations('worldcup');
  const bcp47 = useLocaleBcp47();

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative mb-6 flex items-center gap-4 overflow-hidden px-5 py-4"
      style={{ backgroundColor: 'var(--t-champion-surface)', boxShadow: `0 0 32px ${CHAMPION_GLOW}` }}
    >
      <motion.span
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{ background: `linear-gradient(115deg, transparent 35%, ${CHAMPION_SHEEN} 50%, transparent 65%)` }}
        animate={{ x: ['-110%', '110%'] }}
        transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut', repeatDelay: 2 }}
      />
      <CountryFlag code={champion.countryCode} size={44} />
      <div className="min-w-0">
        <div className="font-display text-[10px] uppercase tracking-[0.3em]" style={{ color: 'var(--t-champion)' }}>
          {t('lastChampionLabel', { month: monthLabel(champion.endMonth, bcp47) })}
        </div>
        <div className="font-display text-lg sm:text-xl uppercase tracking-wider truncate" style={{ color: 'var(--t-text)' }}>
          {countryName(champion.countryCode)}
        </div>
      </div>
    </motion.div>
  );
}
