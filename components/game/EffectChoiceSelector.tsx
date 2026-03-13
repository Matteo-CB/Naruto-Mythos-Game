'use client';

import { useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';
import { useUIStore } from '@/stores/uiStore';
import {
  PopupOverlay,
  PopupCornerFrame,
  PopupTitle,
  PopupDescription,
  PopupDismissLink,
  PopupMinimizePill,
  PopupMinimizeX,
} from './PopupPrimitives';

const EFFECT_TYPE_STYLES: Record<string, { accent: string; text: string; bg: string }> = {
  MAIN:    { accent: '#3e8b3e', text: '#4aff6b', bg: 'rgba(62, 139, 62, 0.08)' },
  AMBUSH:  { accent: '#b33e8b', text: '#ff6bb3', bg: 'rgba(179, 62, 139, 0.08)' },
  UPGRADE: { accent: '#c4a35a', text: '#ffd700', bg: 'rgba(196, 163, 90, 0.08)' },
  SCORE:   { accent: '#3e5cb3', text: '#6b9eff', bg: 'rgba(62, 92, 179, 0.08)' },
};

const DEFAULT_STYLE = { accent: '#555555', text: '#e0e0e0', bg: 'rgba(85, 85, 85, 0.06)' };

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
    return <PopupMinimizePill text={effectDesc} onRestore={restoreEffectPopup} />;
  }

  return (
    <AnimatePresence>
      <PopupOverlay>
        <PopupCornerFrame accentColor="rgba(196, 163, 90, 0.3)" maxWidth="560px">
          <PopupMinimizeX onClick={minimizeEffectPopup} />

          <PopupTitle accentColor="#c4a35a" size="lg">
            {t('game.mustChooseEffect', { player: displayName })}
          </PopupTitle>

          <PopupDescription>
            {descriptionKey ? t(descriptionKey, descriptionParams ?? {}) : description}
          </PopupDescription>

          {/* Effect choices — staggered from alternating sides */}
          <div className="flex flex-col gap-3 mb-5">
            {effectChoices.map((choice, idx) => {
              const style = EFFECT_TYPE_STYLES[choice.effectType] || DEFAULT_STYLE;
              const fromLeft = idx % 2 === 0;

              return (
                <motion.button
                  key={`${choice.effectType}-${idx}`}
                  initial={{ x: fromLeft ? -30 : 30, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.2 + idx * 0.08, type: 'spring', stiffness: 200, damping: 18 }}
                  whileHover={{
                    backgroundColor: `${style.accent}30`,
                    borderLeftWidth: '5px',
                  }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleSelect(choice.effectType, choice.description)}
                  className="relative flex items-start gap-4 px-5 py-4 text-left cursor-pointer no-select"
                  style={{
                    backgroundColor: style.bg,
                    border: 'none',
                    borderLeft: `3px solid ${style.accent}`,
                    boxShadow: `0 2px 12px rgba(0, 0, 0, 0.3)`,
                    transition: 'background-color 0.2s, border-left-width 0.15s',
                  }}
                >
                  {/* Effect type — vertical strip badge */}
                  <div
                    className="shrink-0 px-2.5 py-1 text-[9px] font-bold uppercase text-center"
                    style={{
                      color: style.text,
                      letterSpacing: '0.15em',
                      minWidth: '72px',
                      backgroundColor: `${style.accent}15`,
                      border: `1px solid ${style.accent}40`,
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
                    className="font-body text-[12px] leading-relaxed flex-1"
                    style={{ color: '#c8c8c8' }}
                  >
                    {choice.description}
                  </span>
                </motion.button>
              );
            })}
          </div>

          {canDecline && (
            <div className="flex justify-center">
              <PopupDismissLink onClick={handleDecline}>
                {t('game.board.skip')}
              </PopupDismissLink>
            </div>
          )}
        </PopupCornerFrame>
      </PopupOverlay>
    </AnimatePresence>
  );
}
