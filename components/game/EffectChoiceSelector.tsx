'use client';

import { useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';

const EFFECT_TYPE_COLORS: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  MAIN: { bg: '#0a1a14', border: '#3e8b3e', text: '#4aff6b', glow: 'rgba(62, 139, 62, 0.4)' },
  AMBUSH: { bg: '#1a0a14', border: '#b33e8b', text: '#ff6bb3', glow: 'rgba(179, 62, 139, 0.4)' },
  UPGRADE: { bg: '#14140a', border: '#c4a35a', text: '#ffd700', glow: 'rgba(196, 163, 90, 0.4)' },
};

const DEFAULT_COLORS = { bg: '#141414', border: '#555555', text: '#e0e0e0', glow: 'rgba(85, 85, 85, 0.3)' };

export function EffectChoiceSelector() {
  const t = useTranslations();
  const pendingTargetSelection = useGameStore((s) => s.pendingTargetSelection);
  const selectTarget = useGameStore((s) => s.selectTarget);

  const handleSelect = useCallback(
    (effectType: string, description: string) => {
      selectTarget(`${effectType}::${description}`);
    },
    [selectTarget],
  );

  if (!pendingTargetSelection || pendingTargetSelection.selectionType !== 'CHOOSE_EFFECT') {
    return null;
  }

  const { effectChoices, description, descriptionKey, descriptionParams, playerName } = pendingTargetSelection;
  const displayName = playerName || t('game.you');

  if (!effectChoices || effectChoices.length === 0) return null;

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
                  {t(`game.effectType.${choice.effectType}`)}
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
      </motion.div>
    </AnimatePresence>
  );
}
