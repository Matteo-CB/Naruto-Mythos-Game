'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations, useLocale } from 'next-intl';
import { localizeMessageParams } from '@/lib/i18n/localizeMessageParams';
import { normalizeImagePath, portraitImagePath } from '@/lib/utils/imagePath';
import { getCardName } from '@/lib/utils/cardLocale';
import { useUIStore } from '@/stores/uiStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { ManualGuess } from './ManualGuess';
import type { CharacterCard, MissionCard } from '@/lib/engine/types';
import {
  PopupOverlay,
  PopupCornerFrame,
  PopupTitle,
  EffectPromptTitle,
  PopupActionButton,
  PopupDismissLink,
  PopupMinimizeX,
  PopupMinimizePill,
} from './PopupPrimitives';

export interface OrderTarget {
  instanceId: string;
  name_fr: string;
  name_en?: string;
  name_ja?: string;
  name_es?: string;
  image_file?: string;
  chakra?: number;
  power?: number;
  missionIndex: number;
  missionRank?: string;
  isHidden?: boolean;
  isOwn?: boolean;
}

interface TargetOrderPopupProps {
  mode: 'defeat' | 'hide';
  targets: OrderTarget[];
  description: string;
  descriptionKey?: string;
  promptTag?: { effectType: string; duelPartner?: string };
  descriptionParams?: Record<string, string | number>;
  sourceCardName?: string;
  onConfirm: (orderedIds: string[]) => void;
  onDecline?: () => void;
  canDecline?: boolean;
}

const rankColorMap: Record<string, string> = {
  D: '#3e8b3e', C: '#c4a35a', B: '#b37e3e', A: '#b33e3e',
};

export function TargetOrderPopup({
  mode,
  targets,
  description,
  descriptionKey,
  promptTag,
  descriptionParams,
  sourceCardName,
  onConfirm,
  onDecline,
  canDecline,
}: TargetOrderPopupProps) {
  const t = useTranslations();
  const manualPowerMode = useSettingsStore((s) => s.manualPowerMode);
  const locale = useLocale() as 'en' | 'fr';
  const zoomCard = useUIStore((s) => s.zoomCard);
  const effectPopupMinimized = useUIStore((s) => s.effectPopupMinimized);
  const minimizeEffectPopup = useUIStore((s) => s.minimizeEffectPopup);
  const restoreEffectPopup = useUIStore((s) => s.restoreEffectPopup);

  const [orderedIds, setOrderedIds] = useState<string[]>([]);

  const accentColor = mode === 'defeat' ? '#b33e3e' : '#4a9eff';
  const badgeLabel = mode === 'defeat'
    ? t('game.effect.defeatBadge')
    : t('game.effect.hideBadge');
  const titleKey = mode === 'defeat'
    ? 'game.effect.orderDefeatTitle'
    : 'game.effect.orderHideTitle';

  const toggleTarget = useCallback((instanceId: string) => {
    setOrderedIds((prev) => {
      if (prev.includes(instanceId)) {
        return prev.filter((id) => id !== instanceId);
      }
      return [...prev, instanceId];
    });
  }, []);

  const allSelected = orderedIds.length === targets.length;

  const handleConfirm = useCallback(() => {
    if (allSelected) {
      onConfirm(orderedIds);
    }
  }, [allSelected, orderedIds, onConfirm]);

  const autoConfirmedRef = useRef(false);

  useEffect(() => {
    if (allSelected && targets.length > 1 && !autoConfirmedRef.current) {
      autoConfirmedRef.current = true;
      onConfirm(orderedIds);
    }
  }, [allSelected, orderedIds, targets.length, onConfirm]);

  useEffect(() => {
    if (targets.length === 1 && !autoConfirmedRef.current) {
      autoConfirmedRef.current = true;
      onConfirm([targets[0].instanceId]);
    }
  }, [targets, onConfirm]);

  if (targets.length === 1) {
    return null;
  }

  if (effectPopupMinimized) {
    const titleText = t.has(titleKey) ? t(titleKey) : badgeLabel;
    return <PopupMinimizePill text={titleText} onRestore={restoreEffectPopup} />;
  }

  return (
    <AnimatePresence>
      <PopupOverlay holdForEntrance>
        <PopupCornerFrame accentColor={`${accentColor}55`} maxWidth="600px" padding="24px 20px">
          <PopupMinimizeX onClick={minimizeEffectPopup} />

          <EffectPromptTitle tag={promptTag} accentColor={accentColor} size="lg">
            {descriptionKey ? t(descriptionKey, localizeMessageParams(descriptionParams ?? {}, locale) ?? {}) : description}
          </EffectPromptTitle>

          <p
            className="font-body text-xs text-center mb-4"
            style={{ color: '#777' }}
          >
            {t.has(titleKey) ? t(titleKey) : (
              mode === 'defeat'
                ? 'Click targets in the order you want to defeat them'
                : 'Click targets in the order you want to hide them'
            )}
          </p>

          {sourceCardName && (
            <div className="flex justify-center mb-3">
              <span
                className="text-[10px] font-bold uppercase tracking-wider px-3 py-1"
                style={{
                  color: accentColor,
                  backgroundColor: `${accentColor}12`,
                }}
              >
                {sourceCardName}
              </span>
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-3 mb-5">
            {targets.map((target) => {
              const orderIndex = orderedIds.indexOf(target.instanceId);
              const isSelected = orderIndex >= 0;
              const imagePath = portraitImagePath(target);
              const displayName = getCardName(target, locale);
              const missionColor = rankColorMap[target.missionRank ?? ''] ?? '#888';

              return (
                <motion.div
                  key={target.instanceId}
                  whileHover={{ scale: 1.06, y: -3 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => toggleTarget(target.instanceId)}
                  data-gp="true"
                  role="button"
                  tabIndex={-1}
                  className="relative cursor-pointer no-select"
                  style={{
                    width: '100px',
                    height: '150px',
                    borderRadius: '6px',
                    overflow: 'hidden',
                    border: isSelected
                      ? `2px solid ${accentColor}`
                      : '2px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: isSelected
                      ? `0 0 20px ${accentColor}50, 0 4px 16px rgba(0, 0, 0, 0.6)`
                      : '0 2px 8px rgba(0, 0, 0, 0.4)',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                  }}
                >
                  
                  {target.isHidden ? (
                    <img
                      src="/images/card-back.webp"
                      alt={t('a11y.hiddenCard')}
                      draggable={false}
                      className="w-full h-full object-cover"
                    />
                  ) : imagePath ? (
                    <div
                      className="w-full h-full bg-cover bg-center"
                      style={{
                        backgroundImage: `url('${imagePath}')`,
                        filter: isSelected
                          ? (mode === 'defeat' ? 'brightness(0.5) saturate(0.4)' : 'brightness(0.5)')
                          : 'brightness(0.85)',
                        transition: 'filter 0.2s',
                      }}
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center"
                      style={{ backgroundColor: '#1a1a1a' }}
                    >
                      <span className="text-[9px] text-center px-1" style={{ color: '#888' }}>
                        {displayName}
                      </span>
                    </div>
                  )}

                  {isSelected && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                      className="absolute top-1.5 left-1.5 flex items-center justify-center"
                      style={{
                        width: '26px',
                        height: '26px',
                        borderRadius: '50%',
                        backgroundColor: accentColor,
                        boxShadow: `0 0 10px ${accentColor}80`,
                      }}
                    >
                      <span className="text-xs font-bold" style={{ color: '#fff' }}>
                        {orderIndex + 1}
                      </span>
                    </motion.div>
                  )}

                  {isSelected && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="absolute inset-0 flex items-center justify-center"
                      style={{ pointerEvents: 'none' }}
                    >
                      <span
                        className="text-[9px] font-bold uppercase px-2 py-0.5"
                        style={{
                          backgroundColor: `${accentColor}dd`,
                          color: '#fff',
                          letterSpacing: '0.1em',
                          transform: 'skewX(-4deg)',
                        }}
                      >
                        <span style={{ display: 'inline-block', transform: 'skewX(4deg)' }}>
                          {badgeLabel}
                        </span>
                      </span>
                    </motion.div>
                  )}

                  {!isSelected && (
                    <motion.div
                      className="absolute inset-0 pointer-events-none"
                      style={{ borderRadius: '6px', border: `2px solid ${accentColor}60` }}
                      animate={{
                        boxShadow: [
                          `0 0 4px ${accentColor}20`,
                          `0 0 12px ${accentColor}40`,
                          `0 0 4px ${accentColor}20`,
                        ],
                      }}
                      transition={{ repeat: Infinity, duration: 1.5 }}
                    />
                  )}

                  <div
                    className="absolute top-1 right-1 px-1.5 py-0.5 text-[8px] font-bold uppercase"
                    style={{
                      backgroundColor: 'rgba(0, 0, 0, 0.85)',
                      color: missionColor,
                      border: `1px solid ${missionColor}40`,
                    }}
                  >
                    {target.missionRank ?? `M${target.missionIndex + 1}`}
                  </div>

                  <div
                    className="absolute inset-x-0 bottom-0 px-1 py-1 text-center"
                    style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)' }}
                  >
                    <span
                      className="text-[8px] font-bold truncate block"
                      style={{ color: isSelected ? accentColor : '#ccc' }}
                    >
                      {displayName}
                    </span>
                    {target.power != null && !target.isHidden && (
                      <span className="text-[7px] tabular-nums" style={{ color: '#666' }}>
                        {manualPowerMode ? (
                          <>P:<ManualGuess actual={target.power} color="#888" /> C:<ManualGuess actual={target.chakra ?? 0} color="#888" /></>
                        ) : (
                          <>P:{target.power} C:{target.chakra ?? 0}</>
                        )}
                      </span>
                    )}
                  </div>

                  {!target.isHidden && target.image_file && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        zoomCard({ name_fr: target.name_fr, name_en: target.name_en, name_ja: target.name_ja, name_es: target.name_es, image_file: target.image_file } as CharacterCard);
                      }}
                      className="absolute top-1 left-1 px-1 py-px text-[7px] font-bold cursor-pointer opacity-0 hover:opacity-100 transition-opacity"
                      style={{
                        backgroundColor: 'rgba(0,0,0,0.85)',
                        color: '#c4a35a',
                        border: '1px solid rgba(196,163,90,0.3)',
                      }}
                    >
                      {t('game.board.details')}
                    </button>
                  )}
                </motion.div>
              );
            })}
          </div>

          <div className="flex justify-center gap-1.5 mb-4">
            {targets.map((_, i) => (
              <div
                key={i}
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: i < orderedIds.length ? accentColor : 'rgba(255,255,255,0.1)',
                  transition: 'background-color 0.2s',
                  boxShadow: i < orderedIds.length ? `0 0 6px ${accentColor}60` : 'none',
                }}
              />
            ))}
          </div>

          <div className="flex items-center justify-center gap-5">
            <PopupActionButton
              onClick={handleConfirm}
              accentColor={accentColor}
              disabled={!allSelected}
            >
              {t('game.effect.confirmOrderBtn')}
              {allSelected ? '' : ` (${orderedIds.length}/${targets.length})`}
            </PopupActionButton>

            {orderedIds.length > 0 && (
              <PopupDismissLink onClick={() => setOrderedIds([])}>
                {t('game.effect.resetOrderBtn')}
              </PopupDismissLink>
            )}

            {canDecline && onDecline && (
              <PopupDismissLink onClick={onDecline}>
                {t('game.board.skip')}
              </PopupDismissLink>
            )}
          </div>
        </PopupCornerFrame>
      </PopupOverlay>
    </AnimatePresence>
  );
}
