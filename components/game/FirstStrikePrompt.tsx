'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations, useLocale } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';
import { getCardName, getCardTitle } from '@/lib/utils/cardLocale';
import { canUseVisibleFirstStrike, getVisibleFirstStrikeCandidates } from '@/lib/engine/rules/firstStrike';
import { getCardById } from '@/lib/data/cardIndex';
import { normalizeImagePath } from '@/lib/utils/imagePath';
import { Z_APP_MODAL } from '@/lib/ui/zIndex';

export function FirstStrikePrompt() {
  const t = useTranslations('firstStrike');
  const locale = useLocale();
  const visibleState = useGameStore((s) => s.visibleState);
  const performAction = useGameStore((s) => s.performAction);
  const isProcessing = useGameStore((s) => s.isProcessing);
  const [expanded, setExpanded] = useState(false);

  const candidates = useMemo(() => {
    if (!visibleState) return [];
    if (!canUseVisibleFirstStrike(visibleState)) return [];
    return getVisibleFirstStrikeCandidates(visibleState);
  }, [visibleState]);

  if (candidates.length === 0) return null;

  const strike = (instanceId: string) => {
    setExpanded(false);
    performAction({ type: 'USE_FIRST_STRIKE', characterInstanceId: instanceId });
  };

  const skip = () => {
    setExpanded(false);
    performAction({ type: 'DECLINE_FIRST_STRIKE' });
  };

  const chooser = expanded && candidates.length > 1;

  const banner = (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="pointer-events-auto w-full max-w-[520px] px-3 py-3 sm:px-4"
      style={{ backgroundColor: '#121016', boxShadow: '0 12px 32px rgba(0,0,0,0.55), 0 0 18px rgba(74,158,255,0.18)' }}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <motion.span
          className="font-display text-[11px] font-black uppercase"
          style={{ color: '#4a9eff', letterSpacing: '0.22em' }}
          animate={{ opacity: [1, 0.55, 1] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          {t('title')}
        </motion.span>
        <span className="text-[10px] uppercase tracking-[0.16em]" style={{ color: '#6d6d74' }}>
          {t('subtitle')}
        </span>
      </div>

      <p className="mt-1.5 text-[12px] leading-snug" style={{ color: '#b9b7b1' }}>
        {t('body')}
      </p>

      <div className="mt-2.5 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isProcessing}
          onClick={() => (candidates.length === 1 ? strike(candidates[0].instanceId) : setExpanded(true))}
          className="font-display px-4 py-2 text-[11px] font-bold uppercase disabled:opacity-50"
          style={{ backgroundColor: 'rgba(74,158,255,0.16)', color: '#4a9eff', letterSpacing: '0.16em', border: 'none', cursor: isProcessing ? 'default' : 'pointer' }}
        >
          {t('use')}
        </button>
        <button
          type="button"
          disabled={isProcessing}
          onClick={skip}
          className="font-display px-4 py-2 text-[11px] font-bold uppercase disabled:opacity-50"
          style={{ backgroundColor: '#1a1a1a', color: '#888888', letterSpacing: '0.16em', border: 'none', cursor: isProcessing ? 'default' : 'pointer' }}
        >
          {t('skip')}
        </button>
      </div>
    </motion.div>
  );

  const picker = chooser && typeof document !== 'undefined' ? createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.78)', zIndex: Z_APP_MODAL }}
      onClick={() => setExpanded(false)}
      role="dialog"
      aria-modal="true"
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden"
        style={{ backgroundColor: '#111111', boxShadow: '0 16px 40px rgba(0,0,0,0.6)' }}
      >
        <div className="px-4 py-3 sm:px-5">
          <span className="font-display block text-[11px] font-black uppercase" style={{ color: '#4a9eff', letterSpacing: '0.22em' }}>
            {t('title')}
          </span>
          <span className="mt-1 block text-[12px]" style={{ color: '#b9b7b1' }}>{t('choose')}</span>
        </div>
        <div className="flex flex-col gap-1.5 overflow-y-auto px-3 pb-3 sm:px-4">
          {candidates.map((c) => {
            const card = getCardById(c.cardId);
            const img = card ? normalizeImagePath(card.image_file) : null;
            return (
              <button
                key={c.instanceId}
                type="button"
                onClick={() => strike(c.instanceId)}
                className="flex items-center gap-3 p-2 text-left transition-colors"
                style={{ backgroundColor: '#171717', border: 'none', cursor: 'pointer' }}
              >
                {img && (
                  <img src={img} alt="" aria-hidden="true" loading="lazy"
                    className="shrink-0 object-cover" style={{ width: 40, height: 55 }} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm" style={{ color: '#e8e6df' }}>
                    {card ? getCardName(card, locale) : c.cardId}
                  </span>
                  {card && getCardTitle(card, locale) && (
                    <span className="block truncate text-[11px]" style={{ color: '#6d6d74' }}>
                      {getCardTitle(card, locale)}
                    </span>
                  )}
                  <span className="mt-0.5 block text-[10px] uppercase tracking-[0.14em]" style={{ color: '#4a9eff' }}>
                    {t('badge')}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="px-3 pb-3 sm:px-4">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="font-display w-full px-4 py-2 text-[11px] font-bold uppercase"
            style={{ backgroundColor: '#1a1a1a', color: '#888888', letterSpacing: '0.16em', border: 'none', cursor: 'pointer' }}
          >
            {t('skip')}
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  ) : null;

  return (
    <>
      <AnimatePresence>{banner}</AnimatePresence>
      <AnimatePresence>{picker}</AnimatePresence>
    </>
  );
}
