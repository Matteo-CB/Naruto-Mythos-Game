'use client';

import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { RANK_TIERS, PLACEMENT_MATCHES_REQUIRED } from '@/components/EloBadge';

interface LeaguesModalProps {
  open: boolean;
  onClose: () => void;
}

const PANEL_CLIP = 'polygon(18px 0, calc(100% - 18px) 0, 100% 18px, 100% calc(100% - 18px), calc(100% - 18px) 100%, 18px 100%, 0 calc(100% - 18px), 0 18px)';
const TIER_CLIP = 'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)';

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
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.82)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 16 }}
            transition={{ type: 'spring', stiffness: 220, damping: 22 }}
            className="w-full max-w-2xl max-h-[85vh] overflow-y-auto"
            style={{
              backgroundColor: '#0d0c10',
              clipPath: PANEL_CLIP,
              boxShadow: '0 24px 80px rgba(0, 0, 0, 0.75), 0 0 70px -30px rgba(196, 163, 90, 0.4)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative px-7 pt-6 pb-3">
              <span
                aria-hidden
                className="font-display pointer-events-none absolute left-7 top-0 leading-none"
                style={{
                  color: 'rgba(196, 163, 90, 0.08)',
                  fontSize: '110px',
                  letterSpacing: '-0.04em',
                  top: -22,
                }}
              >
                {t('leagues').toString().slice(0, 1)}
              </span>

              <div className="relative flex items-end justify-between gap-3 flex-wrap">
                <div>
                  <h2
                    className="font-display text-2xl sm:text-3xl uppercase tracking-wider leading-none"
                    style={{ color: '#f2efe7', letterSpacing: '0.08em', textShadow: '0 0 18px rgba(196, 163, 90, 0.18)' }}
                  >
                    {t('leagues')}
                  </h2>
                  <p
                    className="text-[11px] mt-2.5"
                    style={{ color: '#666' }}
                  >
                    {t('subtitle', { count: PLACEMENT_MATCHES_REQUIRED })}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="font-display text-[11px] uppercase tracking-widest px-3 py-1.5 cursor-pointer transition-colors hover:text-[#c4a35a]"
                  style={{ color: '#888' }}
                >
                  {tc('close')}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 px-7 pb-7 pt-3">
              {RANK_TIERS.map((tier, i) => {
                const nextTier = RANK_TIERS[i + 1];
                const isTop = i === RANK_TIERS.length - 1;
                const eloRange = isTop
                  ? t('eloRangeTop', { min: tier.minElo })
                  : t('eloRange', { min: tier.minElo, max: nextTier.minElo - 1 });

                return (
                  <motion.div
                    key={tier.key}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    whileHover={{ y: -2 }}
                    className={`relative flex items-center gap-4 px-4 py-3 ${isTop ? 'sm:col-span-2 sm:justify-center' : ''}`}
                    style={{
                      backgroundColor: '#0a0a0d',
                      clipPath: TIER_CLIP,
                      boxShadow: `0 0 24px -10px ${tier.color}, inset 0 0 0 1px ${tier.color}18`,
                    }}
                  >
                    <Image
                      src={tier.image}
                      alt=""
                      width={isTop ? 64 : 52}
                      height={isTop ? 64 : 52}
                      unoptimized
                      className="shrink-0"
                      style={{ filter: `drop-shadow(0 0 8px ${tier.color}40)` }}
                    />

                    <div className="flex flex-col gap-1 min-w-0">
                      <span
                        className="font-display text-base sm:text-lg leading-none uppercase tracking-wider"
                        style={{
                          color: tier.color,
                          textShadow: `0 0 14px ${tier.color}40`,
                          letterSpacing: '0.06em',
                        }}
                      >
                        {tp(`rankNames.${tier.key}`)}
                      </span>
                      <span
                        className="font-inter-force text-[11px] tabular-nums"
                        style={{ color: '#777' }}
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
