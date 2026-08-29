'use client';

import { useCallback, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { SeasonIntroModal } from '@/components/season/SeasonIntroModal';
import { PALIERS_DE_BADGE, SAISON_ARCHIVEE } from '@/lib/badges/saisonBadges';
import { LIGUES } from '@/lib/leagues/paliers';
import { eloApresReset } from '@/lib/elo/resetDeSaison';
import type { DonneesDeLintro } from '@/lib/season/intro';

function entre(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function donneesAleatoires(): DonneesDeLintro {
  const palier = PALIERS_DE_BADGE[entre(0, PALIERS_DE_BADGE.length - 1)];
  const rang = entre(1, palier.rangMax);
  const avecBadge = Math.random() > 0.3;
  const ancienElo = entre(320, 5900);
  const nouvelElo = eloApresReset(ancienElo);
  const ligue = LIGUES.filter((l) => nouvelElo >= l.seuils[0]).at(-1) ?? LIGUES[0];
  const niveau = ligue.seuils.filter((s) => nouvelElo >= s).length || 1;

  return {
    seasonId: SAISON_ARCHIVEE,
    badges: avecBadge ? [{ seasonId: SAISON_ARCHIVEE, badge: palier.badge, rank: rang }] : [],
    ancienElo,
    nouvelElo,
    ligue: ligue.key,
    niveau,
  };
}

export function SeasonIntroPreview() {
  const t = useTranslations('adminSeasonIntro');
  const [donnees, setDonnees] = useState<DonneesDeLintro | null>(null);

  const lancer = useCallback(() => setDonnees(donneesAleatoires()), []);

  return (
    <div className="rounded-lg p-6 mb-6" style={{ backgroundColor: 'var(--t-surface)', border: '1px solid var(--t-border)' }}>
      <h2 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--t-muted)' }}>{t('title')}</h2>
      <p className="text-xs mb-4" style={{ color: 'var(--t-dim)' }}>{t('subtitle')}</p>
      <button
        type="button"
        onClick={lancer}
        className="inline-block px-6 py-2 text-sm font-bold uppercase tracking-wider rounded cursor-pointer"
        style={{ backgroundColor: 'var(--t-surface-2)', color: 'var(--t-accent)', border: '1px solid var(--t-accent)' }}
      >
        {t('cta')}
      </button>
      {donnees && (
        <p className="text-[11px] mt-3 font-mono" style={{ color: 'var(--t-dim)' }}>
          {t('drawn', {
            badges: donnees.badges.length,
            before: donnees.ancienElo ?? 0,
            after: donnees.nouvelElo,
          })}
        </p>
      )}
      <AnimatePresence>
        {donnees && (
          <SeasonIntroModal key="apercu" donnees={donnees} onClose={() => setDonnees(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
