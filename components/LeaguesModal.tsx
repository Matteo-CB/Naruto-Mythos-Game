'use client';

import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { RANK_TIERS, PLACEMENT_MATCHES_REQUIRED } from '@/components/EloBadge';

interface LeaguesModalProps {
  open: boolean;
  onClose: () => void;
}

export function LeaguesModal({ open, onClose }: LeaguesModalProps) {
  const t = useTranslations('leaderboard');
  const tp = useTranslations('profile');
  const tc = useTranslations('common');

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl"
            style={{
              backgroundColor: 'rgba(10, 10, 14, 0.95)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow: '0 16px 64px rgba(0, 0, 0, 0.7)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
            >
              <h2
                className="text-lg font-bold uppercase tracking-widest"
                style={{ color: '#c4a35a' }}
              >
                {t('leagues')}
              </h2>
              <button
                onClick={onClose}
                className="text-sm px-3 py-1 cursor-pointer"
                style={{ color: '#666', border: '1px solid #333', backgroundColor: '#141414' }}
              >
                {tc('close')}
              </button>
            </div>

            {/* Subtitle */}
            <p
              className="px-6 pt-3 text-xs"
              style={{ color: '#666' }}
            >
              {t('subtitle', { count: PLACEMENT_MATCHES_REQUIRED })}
            </p>

            {/* League cards grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-6">
              {RANK_TIERS.map((tier, i) => {
                const nextTier = RANK_TIERS[i + 1];
                const isTop = i === RANK_TIERS.length - 1;
                const eloRange = isTop
                  ? t('eloRangeTop', { min: tier.minElo })
                  : t('eloRange', { min: tier.minElo, max: nextTier.minElo - 1 });

                return (
                  <motion.div
                    key={tier.key}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="relative flex items-center gap-4 rounded-lg p-4"
                    style={{
                      backgroundColor: tier.bgColor,
                      border: `1px solid ${tier.borderColor}`,
                      boxShadow: `0 0 16px ${tier.glowColor}`,
                    }}
                  >
                    {/* Top decorative line */}
                    <div
                      className="absolute top-0 left-0 right-0 h-px rounded-t-lg"
                      style={{
                        background: `linear-gradient(90deg, transparent, ${tier.color}, transparent)`,
                        opacity: 0.3,
                      }}
                    />

                    {/* League image */}
                    <Image
                      src={tier.image}
                      alt=""
                      width={52}
                      height={52}
                      className="shrink-0"
                      style={{ filter: `drop-shadow(0 0 6px ${tier.glowColor})` }}
                    />

                    {/* Info */}
                    <div className="flex flex-col gap-1 min-w-0">
                      <span
                        className="font-bold uppercase tracking-widest text-sm"
                        style={{
                          color: tier.color,
                          textShadow: `0 0 8px ${tier.glowColor}`,
                        }}
                      >
                        {tp(`rankNames.${tier.key}`)}
                      </span>
                      <span
                        className="text-xs tabular-nums"
                        style={{ color: tier.color, opacity: 0.6 }}
                      >
                        {eloRange} ELO
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
