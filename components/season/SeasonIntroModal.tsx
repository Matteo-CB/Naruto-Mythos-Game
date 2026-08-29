'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { AnimatePresence, motion } from 'framer-motion';
import { useLocale, useTranslations } from 'next-intl';
import { Z_APP_MODAL } from '@/lib/ui/zIndex';
import { SeasonBadge } from '@/components/badges/SeasonBadge';
import { LeagueBadge } from '@/components/badges/LeagueBadge';
import { getSetName } from '@/lib/data/sets/registry';
import { niveauRomain } from '@/lib/leagues/paliers';
import { pagesAAfficher, type DonneesDeLintro, type PageDeLintro } from '@/lib/season/intro';

interface SeasonIntroModalProps {
  donnees: DonneesDeLintro;
  onClose: () => void;
}

export function SeasonIntroModal({ donnees, onClose }: SeasonIntroModalProps) {
  const t = useTranslations('seasonIntro');
  const tProfil = useTranslations('profile');
  const locale = useLocale();
  const pages = useMemo(() => pagesAAfficher(donnees), [donnees]);
  const [index, setIndex] = useState(0);

  const page = pages[Math.min(index, pages.length - 1)];
  const derniere = index >= pages.length - 1;
  const nomDeSaison = getSetName(donnees.seasonId, locale);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--t-overlay)', zIndex: Z_APP_MODAL }}
    >
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="flex w-full max-w-lg flex-col overflow-hidden"
        style={{ backgroundColor: 'var(--t-panel)', maxHeight: '90vh' }}
      >
        <div className="px-6 pt-6 pb-4" style={{ backgroundColor: 'var(--t-surface-2)' }}>
          <span className="font-display text-[11px] uppercase tracking-widest" style={{ color: 'var(--t-muted)' }}>
            {t('kicker')}
          </span>
          <h2 className="font-display mt-1 text-lg uppercase tracking-widest" style={{ color: 'var(--t-accent)' }}>
            {t('title')}
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -14 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col gap-4"
            >
              <h3 className="font-display text-base uppercase tracking-widest" style={{ color: 'var(--t-text)' }}>
                {t(`page.${page}.title`, { season: nomDeSaison })}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--t-muted)' }}>
                {t(`page.${page}.body`, { season: nomDeSaison })}
              </p>

              {page === 'badges' && (
                <Image
                  src="/images/season-intro/badge-picker.webp"
                  alt={t('page.badges.imageAlt')}
                  width={501}
                  height={254}
                  unoptimized
                  className="w-full"
                  style={{ borderRadius: 4 }}
                />
              )}

              {page === 'saison' && (
                <div className="flex flex-wrap gap-3">
                  {donnees.badges.map((b) => (
                    <div
                      key={`${b.seasonId}-${b.badge}`}
                      className="flex items-center gap-3 px-4 py-3"
                      style={{ backgroundColor: 'var(--t-surface-2)', borderRadius: 4 }}
                    >
                      <SeasonBadge seasonId={b.seasonId} badge={b.badge} rank={b.rank} size="lg" showLabel />
                      <span className="font-display text-[10px] uppercase tracking-widest tabular-nums" style={{ color: 'var(--t-dim)' }}>
                        {t('rank', { rank: b.rank })}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {page === 'elo' && (
                <div className="flex flex-col gap-4">
                  <div className="flex items-end justify-center gap-4">
                    {donnees.ancienElo !== null && (
                      <span className="flex flex-col items-center">
                        <span className="font-display text-[10px] uppercase tracking-widest" style={{ color: 'var(--t-dim)' }}>
                          {t('page.elo.before')}
                        </span>
                        <span className="font-display text-2xl tabular-nums" style={{ color: 'var(--t-dim)' }}>
                          {donnees.ancienElo}
                        </span>
                      </span>
                    )}
                    <span className="flex flex-col items-center">
                      <span className="font-display text-[10px] uppercase tracking-widest" style={{ color: 'var(--t-muted)' }}>
                        {t('page.elo.after')}
                      </span>
                      <span className="font-display text-4xl tabular-nums" style={{ color: 'var(--t-accent)' }}>
                        {donnees.nouvelElo}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center justify-center gap-3 px-4 py-3" style={{ backgroundColor: 'var(--t-surface-2)', borderRadius: 4 }}>
                    <LeagueBadge league={donnees.ligue} size="lg" />
                    <span className="font-display text-sm uppercase tracking-widest" style={{ color: 'var(--t-accent)' }}>
                      {tProfil('rankDivision', {
                        name: tProfil(`rankNames.${donnees.ligue}`),
                        level: niveauRomain(donnees.niveau),
                      })}
                    </span>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-between gap-4 px-6 py-4" style={{ backgroundColor: 'var(--t-surface-2)' }}>
          <div className="flex items-center gap-1.5">
            {pages.map((p, i) => (
              <motion.span
                key={p}
                animate={{ opacity: i === index ? 1 : 0.3, width: i === index ? 18 : 8 }}
                transition={{ duration: 0.2 }}
                style={{ height: 3, borderRadius: 2, backgroundColor: 'var(--t-accent)' }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => (derniere ? onClose() : setIndex((i) => i + 1))}
            className="font-display px-6 py-2 text-[11px] uppercase tracking-widest no-select"
            style={{ backgroundColor: 'var(--t-accent)', color: 'var(--t-on-accent)', cursor: 'pointer' }}
          >
            {derniere ? t('close') : t('next')}
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
