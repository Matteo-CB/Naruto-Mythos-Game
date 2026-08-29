'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { SeasonBadge } from '@/components/badges/SeasonBadge';
import { SeasonBadgeModal } from '@/components/badges/SeasonBadgeModal';
import { LeagueBadge } from '@/components/badges/LeagueBadge';
import { trieLesBadges, type BadgeDeSaison } from '@/lib/badges/saisonBadges';
import { getSetName } from '@/lib/data/sets/registry';

interface SeasonBadgesPanelProps {
  badges: readonly BadgeDeSaison[];
  recompenses?: readonly string[];
}

export function SeasonBadgesPanel({ badges, recompenses = [] }: SeasonBadgesPanelProps) {
  const t = useTranslations('seasonBadges');
  const locale = useLocale();
  const ordonnes = trieLesBadges(badges);
  const [ouvert, setOuvert] = useState<BadgeDeSaison | null>(null);

  return (
    <div className="mb-7">
      <span className="font-display text-[11px] uppercase tracking-widest" style={{ color: 'var(--t-muted)' }}>
        {t('title')}
      </span>
      {ordonnes.length === 0 && recompenses.length === 0 ? (
        <p className="font-display text-xs py-3 uppercase tracking-widest" style={{ color: 'var(--t-dim)' }}>
          {t('empty')}
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-3">
          {recompenses.map((badge) => (
            <motion.div
              key={badge}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="flex items-center gap-4 px-4 py-3"
              style={{ backgroundColor: 'var(--t-panel)', borderRadius: 4 }}
            >
              <SeasonBadge
                seasonId={null}
                badge={badge}
                size="lg"
                showLabel
                onClick={() => setOuvert({ seasonId: '', badge, rank: 0, elo: 0 })}
              />
            </motion.div>
          ))}
          {ordonnes.map((b) => (
            <motion.div
              key={`${b.seasonId}-${b.badge ?? 'sans'}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="flex items-center gap-4 px-4 py-3"
              style={{ backgroundColor: 'var(--t-panel)', borderRadius: 4 }}
            >
              {b.badge && (
                <SeasonBadge
                  seasonId={b.seasonId}
                  badge={b.badge}
                  rank={b.rank}
                  size="lg"
                  showLabel
                  onClick={() => setOuvert(b)}
                />
              )}
              {b.league && <LeagueBadge league={b.league} size="lg" showLabel />}
              <span className="flex flex-col leading-tight">
                {b.rank > 0 && (
                  <span className="font-display text-[10px] uppercase tracking-widest tabular-nums" style={{ color: 'var(--t-dim)' }}>
                    {t('rank', { rank: b.rank })}
                  </span>
                )}
                <span className="font-display text-[9px] uppercase tracking-widest" style={{ color: 'var(--t-muted)' }}>
                  {getSetName(b.seasonId, locale)}
                </span>
              </span>
            </motion.div>
          ))}
        </div>
      )}
      {ouvert?.badge && (
        <SeasonBadgeModal
          seasonId={ouvert.seasonId || null}
          badge={ouvert.badge}
          rank={ouvert.rank || undefined}
          onClose={() => setOuvert(null)}
        />
      )}
    </div>
  );
}
