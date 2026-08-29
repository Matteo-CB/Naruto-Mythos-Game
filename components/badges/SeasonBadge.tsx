'use client';

import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { imageDuBadge } from '@/lib/badges/saisonBadges';
import { getSetName } from '@/lib/data/sets/registry';

const TAILLES = { sm: 22, md: 34, lg: 56 } as const;

export type TailleDeBadge = keyof typeof TAILLES;

interface SeasonBadgeProps {
  seasonId: string;
  badge: string;
  rank?: number;
  size?: TailleDeBadge;
  showLabel?: boolean;
}

export function SeasonBadge({ seasonId, badge, rank, size = 'md', showLabel = false }: SeasonBadgeProps) {
  const t = useTranslations('seasonBadges');
  const locale = useLocale();
  const cote = TAILLES[size];
  const nomDeSaison = getSetName(seasonId, locale);
  const palier = t.has(`tier.${badge}`) ? t(`tier.${badge}`) : badge;
  const titre = rank ? `${nomDeSaison} - ${palier} (${t('rank', { rank })})` : `${nomDeSaison} - ${palier}`;

  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 }}
      title={titre}
      className="inline-flex items-center gap-2"
    >
      <Image src={imageDuBadge(seasonId, badge)} alt={titre} width={cote} height={cote} unoptimized />
      {showLabel && (
        <span className="flex flex-col leading-tight">
          <span className="font-display text-[11px] uppercase tracking-widest" style={{ color: 'var(--t-accent)' }}>
            {palier}
          </span>
          <span className="font-display text-[9px] uppercase tracking-widest" style={{ color: 'var(--t-muted)' }}>
            {nomDeSaison}
          </span>
        </span>
      )}
    </motion.span>
  );
}
