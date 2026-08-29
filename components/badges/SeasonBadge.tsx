'use client';

import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { imageDuBadge, estUnBadgeDePalier, palierDuBadge } from '@/lib/badges/saisonBadges';
import { getSetName } from '@/lib/data/sets/registry';
import { BadgeTooltip } from '@/components/badges/BadgeTooltip';

const TAILLES = { xs: 16, sm: 22, md: 34, lg: 56 } as const;

export type TailleDeBadge = keyof typeof TAILLES;

interface SeasonBadgeProps {
  seasonId: string | null;
  badge: string;
  rank?: number;
  size?: TailleDeBadge;
  showLabel?: boolean;
  onClick?: () => void;
}

export function useTexteDeBadge(seasonId: string | null, badge: string, rank?: number) {
  const t = useTranslations('seasonBadges');
  const locale = useLocale();
  const nomDeSaison = seasonId ? getSetName(seasonId, locale) : '';
  const numeroDePalier = palierDuBadge(badge);
  const palier = estUnBadgeDePalier(badge) && numeroDePalier !== null
    ? t('battlepassTier', { tier: numeroDePalier })
    : t.has(`tier.${badge}`) ? t(`tier.${badge}`) : badge;
  const titre = nomDeSaison ? `${nomDeSaison} ${palier}` : palier;
  const resume = estUnBadgeDePalier(badge) && numeroDePalier !== null
    ? t('explicationPalier', { tier: numeroDePalier, season: nomDeSaison })
    : t.has(`explication.${badge}`)
      ? t(`explication.${badge}`, { season: nomDeSaison })
      : titre;
  const description = estUnBadgeDePalier(badge) && numeroDePalier !== null
    ? t('descriptionPalier', { tier: numeroDePalier, season: nomDeSaison })
    : t.has(`description.${badge}`)
      ? t(`description.${badge}`, { season: nomDeSaison, rank: rank ?? 0 })
      : resume;
  return { nomDeSaison, palier, titre, resume, description };
}

export function SeasonBadge({ seasonId, badge, rank, size = 'md', showLabel = false, onClick }: SeasonBadgeProps) {
  const cote = TAILLES[size];
  const { nomDeSaison, palier, titre, resume } = useTexteDeBadge(seasonId, badge, rank);

  return (
    <BadgeTooltip titre={titre} texte={resume} onClick={onClick}>
      <motion.span
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25 }}
        className="inline-flex items-center gap-2"
      >
        <Image src={imageDuBadge(seasonId ?? '', badge)} alt={titre} width={cote} height={cote} unoptimized />
        {showLabel && (
          <span className="flex flex-col leading-tight">
            <span className="font-display text-[11px] uppercase tracking-widest" style={{ color: 'var(--t-accent)' }}>
              {palier}
            </span>
            {nomDeSaison && (
              <span className="font-display text-[9px] uppercase tracking-widest" style={{ color: 'var(--t-muted)' }}>
                {nomDeSaison}
              </span>
            )}
          </span>
        )}
      </motion.span>
    </BadgeTooltip>
  );
}
