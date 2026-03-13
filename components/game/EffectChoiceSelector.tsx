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
        whileHover={{ scale: 1.05, y: -2 }}
        whileTap={{ scale: 0.97 }}
        onClick={restoreEffectPopup}
        className="fixed z-50 flex items-center gap-2 no-select"
        style={{
          bottom: '14px', left: '50%', transform: 'translateX(-50%)',
          padding: '8px 20px', background: 'rgba(196, 163, 90, 0.92)',
          color: '#0a0a0a', borderRadius: '24px', fontSize: '12px',
          fontWeight: 700, cursor: 'pointer',
          border: '1px solid rgba(255, 215, 0, 0.4)',
          boxShadow: '0 4px 24px rgba(196, 163, 90, 0.4), 0 2px 8px rgba(0, 0, 0, 0.3)',
          letterSpacing: '0.04em',
        }}
      >
        <span style={{ fontSize: '14px', lineHeight: 1 }}>&#x25B2;</span>
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
        <div style={{
          width: 'min(90vw, 520px)',
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: '14px',
        }}>
          <motion.button
            onClick={(e) => { e.stopPropagation(); minimizeEffectPopup(); }}
            className="no-select"
            whileHover={{ scale: 1.25, opacity: 1 }}
            whileTap={{ scale: 0.85 }}
            style={{
              background: 'none',
              border: 'none',
              color: '#d4b36a',
              fontSize: '22px',
              lineHeight: '1',
              cursor: 'pointer',
              fontWeight: 300,
              padding: '4px 6px',
              opacity: 0.7,
              textShadow: '0 0 10px rgba(196, 163, 90, 0.5), 0 0 30px rgba(196, 163, 90, 0.15)',
            }}
            title={t('game.board.minimize')}
          >
            &#x2715;
          </motion.button>
        </div>
        {/* Player announcement banner */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 22 }}
          className="mb-5 flex flex-col items-center gap-2"
        >
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.15, duration: 0.4 }}
            style={{ width: '60px', height: '1px', backgroundColor: 'rgba(196, 163, 90, 0.35)' }}
          />
          <div className="flex items-center gap-3 px-8 py-2">
            <motion.div
              className="rounded-full"
              style={{ width: '8px', height: '8px', backgroundColor: '#c4a35a' }}
              animate={{
                boxShadow: [
                  '0 0 4px rgba(196, 163, 90, 0.3)',
                  '0 0 14px rgba(196, 163, 90, 0.8)',
                  '0 0 4px rgba(196, 163, 90, 0.3)',
                ],
              }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            />
            <span
              className="text-sm font-bold uppercase"
              style={{ color: '#c4a35a', letterSpacing: '0.2em', textShadow: '0 0 20px rgba(196, 163, 90, 0.2)' }}
            >
              {t('game.mustChooseEffect', { player: displayName })}
            </span>
          </div>
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.25, duration: 0.4 }}
            style={{ width: '140px', height: '1px', backgroundColor: 'rgba(196, 163, 90, 0.2)' }}
          />
        </motion.div>

        {/* Description */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 200, damping: 20 }}
          className="mb-6 px-6 py-3 rounded"
          style={{
            backgroundColor: 'rgba(8, 8, 12, 0.8)',
            borderLeft: '2px solid rgba(196, 163, 90, 0.4)',
            maxWidth: '500px',
          }}
        >
          <span className="font-body text-xs leading-relaxed" style={{ color: '#d0d0d0' }}>
            {descriptionKey ? t(descriptionKey, descriptionParams ?? {}) : description}
          </span>
        </motion.div>

        {/* Effect choices */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, type: 'spring', stiffness: 180, damping: 18 }}
          className="flex flex-col gap-3 px-6 py-5 rounded-lg"
          style={{
            backgroundColor: 'rgba(6, 6, 10, 0.7)',
            border: '1px solid rgba(196, 163, 90, 0.06)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(196, 163, 90, 0.04)',
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
                  boxShadow: `0 0 14px ${colors.glow}, 0 4px 12px rgba(0, 0, 0, 0.3)`,
                }}
              >
                {/* Pulsing border glow */}
                <motion.div
                  className="absolute inset-0 rounded-lg"
                  style={{ border: `1px solid ${colors.border}`, pointerEvents: 'none' }}
                  animate={{
                    boxShadow: [
                      `0 0 6px ${colors.glow}`,
                      `0 0 18px ${colors.glow}`,
                      `0 0 6px ${colors.glow}`,
                    ],
                  }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                />

                {/* Effect type badge */}
                <div
                  className="shrink-0 px-3 py-1 rounded text-[10px] font-bold uppercase"
                  style={{
                    backgroundColor: `${colors.border}20`,
                    color: colors.text,
                    border: `1px solid ${colors.border}`,
                    minWidth: '80px',
                    textAlign: 'center',
                    letterSpacing: '0.15em',
                    textShadow: `0 0 12px ${colors.glow}`,
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
                  style={{ color: '#d0d0d0' }}
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
            className="mt-5 px-6 py-2.5 rounded-lg text-xs font-medium uppercase cursor-pointer"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              color: '#777777',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              letterSpacing: '0.12em',
            }}
          >
            {t('game.board.skip')}
          </motion.button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
