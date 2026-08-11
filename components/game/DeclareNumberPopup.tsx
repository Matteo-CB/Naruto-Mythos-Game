'use client';

import React, { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { portraitImagePath } from '@/lib/utils/imagePath';
import { getCardName } from '@/lib/utils/cardLocale';
import {
  PopupOverlay,
  PopupCornerFrame,
  PopupTitle,
  PopupDescription,
  PopupActionButton,
  PopupDismissLink,
} from './PopupPrimitives';
import { CardArtFallback } from '@/components/cards/CardArtFallback';

export interface NumberPreviewCard {
  position: number;
  card: { name_fr: string; name_en?: string; chakra?: number; power?: number; image_file?: string; id?: string };
}

interface DeclareNumberPopupProps {
  min: number;
  max: number;
  description: string;
  descriptionKey?: string;
  descriptionParams?: Record<string, string | number>;
  previewCards?: NumberPreviewCard[];
  onConfirm: (value: number) => void;
  onDecline?: () => void;
  declineLabelKey?: string;
}

export function DeclareNumberPopup({
  min,
  max,
  description,
  descriptionKey,
  descriptionParams,
  previewCards,
  onConfirm,
  onDecline,
  declineLabelKey,
}: DeclareNumberPopupProps) {
  const t = useTranslations();
  const locale = useLocale();
  const [raw, setRaw] = useState(String(min));

  const parsed = parseInt(raw, 10);
  const value = Number.isNaN(parsed) ? min : Math.min(max, Math.max(min, parsed));
  const isValid = raw.trim().length > 0 && !Number.isNaN(parsed) && parsed >= min && parsed <= max;

  const text = descriptionKey
    ? t(descriptionKey, descriptionParams as Record<string, string> | undefined)
    : description;

  const hasPreview = !!previewCards && previewCards.length > 0;

  return (
    <PopupOverlay>
      <PopupCornerFrame maxWidth={hasPreview ? '680px' : '560px'}>
        <PopupTitle>
          {hasPreview ? t('game.effect.chooseCountTitle') : t('game.effect.declareNumberTitle')}
        </PopupTitle>
        <PopupDescription>{text}</PopupDescription>

        {hasPreview && (
          <div
            className="flex flex-wrap gap-2 justify-center"
            style={{ margin: '14px 0 4px' }}
          >
            {previewCards!.map((entry) => {
              const taken = entry.position <= value;
              const image = portraitImagePath(entry.card as never) ?? undefined;
              return (
                <button
                  key={entry.position}
                  type="button"
                  onClick={() => setRaw(String(entry.position))}
                  title={getCardName(entry.card as never, locale)}
                  style={{
                    width: '78px',
                    height: '108px',
                    borderRadius: '4px',
                    backgroundImage: image ? `url('${image}')` : undefined,
                    backgroundColor: '#141414',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    opacity: taken ? 1 : 0.32,
                    boxShadow: taken ? '0 0 12px rgba(196, 163, 90, 0.45)' : 'none',
                    cursor: 'pointer',
                    position: 'relative',
                  }}
                >
                  {!image && <CardArtFallback card={entry.card as never} />}
                  <span
                    style={{
                      position: 'absolute', bottom: '2px', left: '50%', transform: 'translateX(-50%)',
                      background: 'rgba(8, 8, 14, 0.85)', color: taken ? '#c4a35a' : '#8a8a8a',
                      fontSize: '11px', letterSpacing: '0.08em', padding: '1px 6px', borderRadius: '3px',
                    }}
                  >
                    {entry.position}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', margin: '18px 0 22px' }}>
          <button
            type="button"
            onClick={() => setRaw(String(Math.max(min, value - 1)))}
            aria-label={t('game.effect.declareNumberMinus')}
            style={{
              width: '44px', height: '44px', borderRadius: '4px',
              background: '#141414', color: '#c4a35a', fontSize: '22px',
              border: '1px solid #262626', cursor: 'pointer',
            }}
          >
            -
          </button>

          <input
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            value={raw}
            onChange={(e) => setRaw(e.target.value.replace(/[^0-9]/g, '').slice(0, String(max).length))}
            aria-label={t('game.effect.declareNumberTitle')}
            style={{
              width: '120px', height: '52px', textAlign: 'center',
              background: '#0a0a0a', color: '#e8e8e8', fontSize: '28px',
              letterSpacing: '0.08em', border: '1px solid #262626', borderRadius: '4px',
            }}
          />

          <button
            type="button"
            onClick={() => setRaw(String(Math.min(max, value + 1)))}
            aria-label={t('game.effect.declareNumberPlus')}
            style={{
              width: '44px', height: '44px', borderRadius: '4px',
              background: '#141414', color: '#c4a35a', fontSize: '22px',
              border: '1px solid #262626', cursor: 'pointer',
            }}
          >
            +
          </button>
        </div>

        <PopupActionButton onClick={() => onConfirm(value)} disabled={!isValid}>
          {hasPreview
            ? t('game.effect.chooseCountConfirm', { value })
            : t('game.effect.declareNumberConfirm', { value })}
        </PopupActionButton>

        {onDecline && (
          <PopupDismissLink onClick={onDecline}>
            {t(declineLabelKey ?? 'game.board.skip')}
          </PopupDismissLink>
        )}
      </PopupCornerFrame>
    </PopupOverlay>
  );
}
