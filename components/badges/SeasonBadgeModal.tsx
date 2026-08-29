'use client';

import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { imageDuBadge } from '@/lib/badges/saisonBadges';
import { useTexteDeBadge } from '@/components/badges/SeasonBadge';
import { Z_APP_MODAL } from '@/lib/ui/zIndex';

interface SeasonBadgeModalProps {
  seasonId: string | null;
  badge: string;
  rank?: number;
  onClose: () => void;
}

export function SeasonBadgeModal({ seasonId, badge, rank, onClose }: SeasonBadgeModalProps) {
  const t = useTranslations('seasonBadges');
  const { titre, description, nomDeSaison, palier } = useTexteDeBadge(seasonId, badge, rank);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 flex items-center justify-center p-5"
        style={{ backgroundColor: 'var(--t-overlay)', zIndex: Z_APP_MODAL }}
      >
        <motion.div
          initial={{ opacity: 0, y: 14, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 14, scale: 0.97 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="flex flex-col items-center gap-4 p-7 text-center"
          style={{ backgroundColor: 'var(--t-panel)', boxShadow: '0 24px 60px var(--t-shadow)', maxWidth: 380 }}
        >
          <Image src={imageDuBadge(seasonId ?? '', badge)} alt={titre} width={120} height={120} unoptimized />

          <div className="flex flex-col gap-1">
            <span className="font-display text-lg uppercase tracking-widest" style={{ color: 'var(--t-accent)' }}>
              {palier}
            </span>
            {nomDeSaison && (
              <span className="font-display text-[11px] uppercase tracking-widest" style={{ color: 'var(--t-muted)' }}>
                {nomDeSaison}
              </span>
            )}
          </div>

          <p className="text-xs leading-relaxed" style={{ color: 'var(--t-text)' }}>
            {description}
          </p>

          {rank ? (
            <span className="font-display text-[11px] uppercase tracking-widest tabular-nums" style={{ color: 'var(--t-dim)' }}>
              {t('rank', { rank })}
            </span>
          ) : null}

          <button
            type="button"
            onClick={onClose}
            className="font-display text-[11px] uppercase tracking-widest px-6 py-2 no-select"
            style={{ backgroundColor: 'var(--t-accent)', color: 'var(--t-on-accent)', cursor: 'pointer' }}
          >
            {t('close')}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
