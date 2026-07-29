'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslations, useLocale } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';
import { getCardById } from '@/lib/data/cardIndex';
import { getCardName, getCardTitle } from '@/lib/utils/cardLocale';
import { getCardEffectDescription } from '@/lib/data/effectDescriptions';
import { canUseVisibleFirstStrike, getVisibleFirstStrikeCandidates } from '@/lib/engine/rules/firstStrike';
import type { CharacterCard } from '@/lib/engine/types';
import {
  PopupOverlay,
  PopupCornerFrame,
  PopupTitle,
  PopupDescription,
  PopupActionButton,
  PopupDismissLink,
} from './PopupPrimitives';

const ACCENT = '#c4a35a';

export function FirstStrikePrompt() {
  const t = useTranslations();
  const locale = useLocale();
  const visibleState = useGameStore((s) => s.visibleState);
  const performAction = useGameStore((s) => s.performAction);
  const isProcessing = useGameStore((s) => s.isProcessing);

  const [picked, setPicked] = useState<string | null>(null);

  const available = !!visibleState && !isProcessing && canUseVisibleFirstStrike(visibleState);
  const candidates = visibleState && available ? getVisibleFirstStrikeCandidates(visibleState) : [];

  const soleCandidateId = candidates.length === 1 ? candidates[0].instanceId : null;
  const selected = candidates.some((c) => c.instanceId === picked) ? picked : soleCandidateId;

  const handleStrike = () => {
    if (!selected) return;
    performAction({ type: 'USE_FIRST_STRIKE', characterInstanceId: selected });
  };

  const handleSkip = () => {
    performAction({ type: 'DECLINE_FIRST_STRIKE' });
  };

  if (!available || candidates.length === 0) return null;

  const multiple = candidates.length > 1;

  return (
    <AnimatePresence>
      <PopupOverlay holdForEntrance>
        <PopupCornerFrame accentColor={`${ACCENT}70`}>
          <PopupTitle accentColor={ACCENT}>{t('firstStrike.title')}</PopupTitle>
          <span
            className="uppercase text-center block"
            style={{ color: '#8a8a8a', fontSize: '10px', letterSpacing: '0.18em', marginBottom: '10px' }}
          >
            {t('firstStrike.subtitle')}
          </span>
          <PopupDescription>{t('firstStrike.body')}</PopupDescription>

          <div className="flex flex-col items-stretch w-full" style={{ gap: '8px', marginBottom: '18px' }}>
            {multiple && (
              <span
                className="uppercase text-center"
                style={{ color: '#8a8a8a', fontSize: '10px', letterSpacing: '0.18em', marginBottom: '4px' }}
              >
                {t('firstStrike.choose')}
              </span>
            )}

            {candidates.map((candidate) => {
              const card = getCardById(candidate.cardId) as CharacterCard | undefined;
              const isSelected = selected === candidate.instanceId;
              const effectIndex = (card?.effects ?? []).findIndex((e) => e.type === 'FIRST_STRIKE');
              const effectText = card && effectIndex >= 0
                ? getCardEffectDescription(card.id, effectIndex, locale, candidate.description)
                : candidate.description;

              return (
                <motion.button
                  key={candidate.instanceId}
                  onClick={() => setPicked(candidate.instanceId)}
                  whileHover={{ backgroundColor: `${ACCENT}1f` }}
                  whileTap={{ scale: 0.99 }}
                  className="text-left cursor-pointer"
                  style={{
                    padding: '10px 14px',
                    backgroundColor: isSelected ? `${ACCENT}1f` : 'rgba(255,255,255,0.02)',
                    border: 'none',
                    boxShadow: isSelected ? `0 0 14px ${ACCENT}22` : 'none',
                  }}
                >
                  <span
                    className="uppercase block"
                    style={{
                      color: isSelected ? ACCENT : '#e8e8e8',
                      fontSize: '12px',
                      letterSpacing: '0.1em',
                    }}
                  >
                    {card ? getCardName(card, locale) : candidate.cardId}
                    {card && getCardTitle(card, locale) ? ` ${getCardTitle(card, locale)}` : ''}
                  </span>
                  <span className="font-body block" style={{ color: '#a8a8a8', fontSize: '11px', marginTop: '3px', lineHeight: 1.45 }}>
                    {effectText}
                  </span>
                </motion.button>
              );
            })}
          </div>

          <div className="flex flex-col items-center" style={{ gap: '10px' }}>
            <PopupActionButton onClick={handleStrike} accentColor={ACCENT} disabled={!selected}>
              {t('firstStrike.use')}
            </PopupActionButton>
            <PopupDismissLink onClick={handleSkip}>{t('firstStrike.skip')}</PopupDismissLink>
          </div>
        </PopupCornerFrame>
      </PopupOverlay>
    </AnimatePresence>
  );
}
