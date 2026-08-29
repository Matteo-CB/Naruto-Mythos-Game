'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { SeasonBadge } from '@/components/badges/SeasonBadge';
import { useSettingsStore } from '@/stores/settingsStore';
import { formatBadgeChoisi } from '@/lib/badges/badgeChoisi';
import { getSetName } from '@/lib/data/sets/registry';

interface BadgeGagne {
  seasonId: string;
  badge: string | null;
  rank: number;
}

interface BadgeDeRecompense {
  badge: string;
}

export function SeasonBadgePicker({ disabled }: { disabled?: boolean }) {
  const t = useTranslations('seasonBadges');
  const locale = useLocale();
  const selectedSeasonBadge = useSettingsStore((s) => s.selectedSeasonBadge);
  const setSelectedSeasonBadge = useSettingsStore((s) => s.setSelectedSeasonBadge);
  const [gagnes, setGagnes] = useState<BadgeGagne[]>([]);
  const [recompenses, setRecompenses] = useState<BadgeDeRecompense[]>([]);
  const [charge, setCharge] = useState(false);

  useEffect(() => {
    let annule = false;
    fetch('/api/user/badges')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { seasonBadges?: BadgeGagne[]; awardBadges?: BadgeDeRecompense[] } | null) => {
        if (annule) return;
        setGagnes((d?.seasonBadges ?? []).filter((b) => !!b.badge));
        setRecompenses(d?.awardBadges ?? []);
        setCharge(true);
      })
      .catch(() => { if (!annule) setCharge(true); });
    return () => { annule = true; };
  }, []);

  if (charge && gagnes.length === 0 && recompenses.length === 0) {
    return (
      <p className="text-xs tracking-wide" style={{ color: 'var(--t-dim)' }}>
        {t('pickerEmpty')}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <BoutonDeBadge
        actif={!selectedSeasonBadge}
        disabled={disabled}
        onClick={() => setSelectedSeasonBadge(null)}
        libelle={t('pickerNone')}
      />
      {recompenses.map((r) => {
        const valeur = formatBadgeChoisi(null, r.badge);
        return (
          <BoutonDeBadge
            key={valeur}
            actif={selectedSeasonBadge === valeur}
            disabled={disabled}
            onClick={() => setSelectedSeasonBadge(valeur)}
            libelle={t.has(`tier.${r.badge}`) ? t(`tier.${r.badge}`) : r.badge}
            visuel={<SeasonBadge seasonId={null} badge={r.badge} size="md" />}
          />
        );
      })}
      {gagnes.map((b) => {
        const valeur = formatBadgeChoisi(b.seasonId, b.badge as string);
        return (
          <BoutonDeBadge
            key={valeur}
            actif={selectedSeasonBadge === valeur}
            disabled={disabled}
            onClick={() => setSelectedSeasonBadge(valeur)}
            libelle={getSetName(b.seasonId, locale)}
            visuel={<SeasonBadge seasonId={b.seasonId} badge={b.badge as string} rank={b.rank} size="md" />}
          />
        );
      })}
    </div>
  );
}

function BoutonDeBadge({
  actif, disabled, onClick, libelle, visuel,
}: {
  actif: boolean;
  disabled?: boolean;
  onClick: () => void;
  libelle: string;
  visuel?: React.ReactNode;
}) {
  return (
    <motion.button
      type="button"
      whileTap={disabled ? undefined : { scale: 0.96 }}
      onClick={disabled ? undefined : onClick}
      className="flex items-center gap-2 px-3 py-2 no-select"
      style={{
        backgroundColor: actif ? 'var(--t-accent-glow)' : 'var(--t-surface-2)',
        color: actif ? 'var(--t-accent)' : 'var(--t-muted)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        borderRadius: 4,
      }}
    >
      {visuel}
      <span className="font-display text-[10px] uppercase tracking-widest">{libelle}</span>
    </motion.button>
  );
}
