'use client';

import { useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';
import { useUIStore } from '@/stores/uiStore';

const EFFECT_TYPE_COLORS: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  MAIN: { bg: '#0a1a14', border: '#3e8b3e', text: '#4aff6b', glow: 'rgba(62, 139, 62, 0.4)' },
  AMBUSH: { bg: '#1a0a14', border: '#b33e8b', text: '#ff6bb3', glow: 'rgba(179, 62, 139, 0.4)' },
  UPGRADE: { bg: '#14140a', border: '#c4a35a', text: '#ffd700', glow: 'rgba(196, 163, 90, 0.4)' },
  SCORE: { bg: '#0a0a1a', border: '#3e5cb3', text: '#6b9eff', glow: 'rgba(62, 92, 179, 0.4)' },
};

const DEFAULT_COLORS = { bg: '#141414', border: '#555555', text: '#e0e0e0', glow: 'rgba(85, 85, 85, 0.3)' };

export function EffectChoiceSelector() {
  const t = useTranslations();
  const pendingTargetSelection = useGameStore((s) => s.pendingTargetSelection);
  const selectTarget = useGameStore((s) => s.selectTarget);
  const declineTarget = useGameStore((s) => s.declineTarget);
  const effectPopupMinimized = useUIStore((s) => s.effectPopupMinimized);
  const minimizeEffectPopup = useUIStore((s) => s.minimizeEffectPopup);
  const restoreEffectPopup = useUIStore((s) => s.restoreEffectPopup);

  const prevPendingIdRef = useRef<string | null>(null);
  const currentPendingId = pendingTargetSelection?.descriptionKey ?? pendingTargetSelection?.description ?? null;
  useEffect(() => {
    if (currentPendingId && currentPendingId !== prevPendingIdRef.current) {
      restoreEffectPopup();
    }
    prevPendingIdRef.current = currentPendingId;
  }, [currentPendingId, restoreEffectPopup]);

  const handleSelect = useCallback(
    (effectType: string, description: string) => {
      selectTarget(`${effectType}::${description}`);
    },
    [selectTarget],
  );

  const handleDecline = useCallback(() => {
    declineTarget();
  }, [declineTarget]);

  if (!pendingTargetSelection || pendingTargetSelection.selectionType !== 'CHOOSE_EFFECT') {
    return null;
  }

  const { effectChoices, description, descriptionKey, descriptionParams, onDecline, playerName } = pendingTargetSelection;
  const canDecline = !!onDecline;
  const displayName = playerName || t('game.you');

  if (!effectChoices || effectChoices.length === 0) return null;

  if (effectPopupMinimized) {
    const effectDesc = descriptionKey
      ? t(descriptionKey, descriptionParams as Record<string, string> | undefined)
      : (description || t('game.board.restoreEffect'));
    const pillText = effectDesc.length > 40 ? effectDesc.slice(0, 37) + '...' : effectDesc;
    return (
      <motion.button
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        onClick={restoreEffectPopup}
        className="fixed z-50 flex items-center gap-2 no-select"
        style={{
          bottom: '12px', left: '50%', transform: 'translateX(-50%)',
          padding: '8px 18px', background: 'rgba(196, 163, 90, 0.95)',
          color: '#0a0a0a', borderRadius: '24px', fontSize: '13px',
          fontWeight: 700, cursor: 'pointer',
          border: '1px solid rgba(255, 215, 0, 0.4)',
          boxShadow: '0 4px 20px rgba(196, 163, 90, 0.5)',
        }}
      >
        <span style={{ fontSize: '16px', lineHeight: 1 }}>&#x25B2;</span>
        {pillText}
      </motion.button>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-50 flex flex-col items-center justify-center"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.92)' }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); minimizeEffectPopup(); }}
          className="no-select"
          style={{
            marginBottom: '10px', padding: '6px 16px',
            background: 'rgba(196, 163, 90, 0.1)',
            border: '1px solid rgba(196, 163, 90, 0.3)', borderRadius: '6px',
            color: '#c4a35a', fontSize: '11px', cursor: 'pointer', fontWeight: 600,
            letterSpacing: '0.04em',
          }}
          title={t('game.board.minimize')}
        >
          {t('game.board.minimize')}
        </button>
        {/* Player announcement banner */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 22 }}
          className="mb-4 px-10 py-3 rounded-lg flex items-center gap-3"
          style={{
            backgroundColor: 'rgba(196, 163, 90, 0.08)',
            border: '2px solid rgba(196, 163, 90, 0.3)',
            boxShadow: '0 0 24px rgba(196, 163, 90, 0.15)',
          }}
        >
          <motion.div
            className="rounded-full"
            style={{ width: '10px', height: '10px', backgroundColor: '#c4a35a' }}
            animate={{
              boxShadow: [
                '0 0 4px rgba(196, 163, 90, 0.4)',
                '0 0 12px rgba(196, 163, 90, 0.8)',
                '0 0 4px rgba(196, 163, 90, 0.4)',
              ],
            }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          />
          <span
            className="text-lg font-bold uppercase tracking-wider"
            style={{ color: '#c4a35a' }}
          >
            {t('game.mustChooseEffect', { player: displayName })}
          </span>
        </motion.div>

        {/* Description */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 200, damping: 20 }}
          className="mb-8 px-6 py-3 rounded-lg"
          style={{
            backgroundColor: '#0a0a0a',
            border: '1px solid #333333',
            maxWidth: '500px',
          }}
        >
          <span className="font-body text-xs text-center leading-relaxed" style={{ color: '#e0e0e0' }}>
            {descriptionKey ? t(descriptionKey, descriptionParams ?? {}) : description}
          </span>
        </motion.div>

        {/* Effect choices */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, type: 'spring', stiffness: 180, damping: 18 }}
          className="flex flex-col gap-3 px-6 py-4 rounded-lg"
          style={{
            backgroundColor: 'rgba(10, 10, 14, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            maxWidth: '600px',
            width: '90vw',
          }}
        >
          {effectChoices.map((choice, idx) => {
            const colors = EFFECT_TYPE_COLORS[choice.effectType] || DEFAULT_COLORS;

            return (
              <motion.button
                key={`${choice.effectType}-${idx}`}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.2 + idx * 0.1, type: 'spring', stiffness: 200, damping: 18 }}
                whileHover={{ scale: 1.02, x: 4 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleSelect(choice.effectType, choice.description)}
                className="relative flex items-start gap-4 px-5 py-4 rounded-lg text-left cursor-pointer"
                style={{
                  backgroundColor: colors.bg,
                  border: `2px solid ${colors.border}`,
                  boxShadow: `0 0 12px ${colors.glow}`,
                }}
              >
                {/* Pulsing border glow */}
                <motion.div
                  className="absolute inset-0 rounded-lg"
                  style={{ border: `1px solid ${colors.border}`, pointerEvents: 'none' }}
                  animate={{
                    boxShadow: [
                      `0 0 6px ${colors.glow}`,
                      `0 0 16px ${colors.glow}`,
                      `0 0 6px ${colors.glow}`,
                    ],
                  }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                />

                {/* Effect type badge */}
                <div
                  className="shrink-0 px-3 py-1 rounded text-[10px] font-bold uppercase tracking-widest"
                  style={{
                    backgroundColor: `${colors.border}20`,
                    color: colors.text,
                    border: `1px solid ${colors.border}`,
                    minWidth: '80px',
                    textAlign: 'center',
                  }}
                >
                  {t(`card.effectTypes.${choice.effectType}` as
                    | 'card.effectTypes.MAIN'
                    | 'card.effectTypes.UPGRADE'
                    | 'card.effectTypes.AMBUSH'
                    | 'card.effectTypes.SCORE'
                  )}
                </div>

                {/* Effect description */}
                <span
                  className="font-body text-sm leading-relaxed flex-1"
                  style={{ color: '#e0e0e0' }}
                >
                  {choice.description}
                </span>
              </motion.button>
            );
          })}
        </motion.div>

        {/* Skip / Decline button for optional effects */}
        {canDecline && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleDecline}
            className="mt-6 px-6 py-2.5 rounded-md text-sm font-medium uppercase tracking-wider cursor-pointer"
            style={{
              backgroundColor: 'transparent',
              color: '#888888',
              border: '1px solid #333333',
            }}
          >
            {t('game.board.skip')}
          </motion.button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
