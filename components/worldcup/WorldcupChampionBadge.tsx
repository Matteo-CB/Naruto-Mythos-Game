'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useLocaleBcp47 } from '@/lib/i18n/useLocaleMeta';
import { CountryFlag } from '@/components/CountryFlag';

const CHAMPION_SHEEN = 'color-mix(in srgb, var(--t-champion) 22%, transparent)';

interface WorldcupTitle {
  month: string;
  countryCode: string;
}

interface Props {
  titles: WorldcupTitle[];
  reigningChampionMonth: string | null;
  countryCode: string | null;
}

function monthLabel(ym: string, bcp47: string): string {
  try {
    const [y, m] = ym.split('-').map(Number);
    return new Intl.DateTimeFormat(bcp47, { month: 'long', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, 1)));
  } catch {
    return ym;
  }
}

export function WorldcupChampionBadge({ titles, reigningChampionMonth, countryCode }: Props) {
  const t = useTranslations('worldcup');
  const bcp47 = useLocaleBcp47();

  const showReigning = !!reigningChampionMonth && !!countryCode;
  if (titles.length === 0 && !showReigning) return null;

  return (
    <div className="mt-2 flex flex-col items-center gap-1.5">
      {titles.map((title) => (
        <motion.div
          key={title.month}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative flex items-center gap-2 px-3 py-1.5 overflow-hidden"
          style={{ backgroundColor: 'var(--t-champion-surface)' }}
        >
          <motion.span
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{ background: `linear-gradient(115deg, transparent 30%, ${CHAMPION_SHEEN} 50%, transparent 70%)` }}
            animate={{ x: ['-120%', '120%'] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut', repeatDelay: 1.4 }}
          />
          <CountryFlag code={title.countryCode} size={18} />
          <span className="font-display text-[11px] uppercase tracking-widest" style={{ color: 'var(--t-champion)' }}>
            {t('championTitle', { month: monthLabel(title.month, bcp47) })}
          </span>
        </motion.div>
      ))}

      {showReigning && (
        <div className="flex items-center gap-1.5 px-2.5 py-1" style={{ backgroundColor: 'var(--t-accent-tint)' }}>
          <CountryFlag code={countryCode!} size={15} />
          <span className="font-display text-[10px] uppercase tracking-widest" style={{ color: 'var(--t-accent)' }}>
            {t('reigningNation', { month: monthLabel(reigningChampionMonth!, bcp47) })}
          </span>
        </div>
      )}
    </div>
  );
}
