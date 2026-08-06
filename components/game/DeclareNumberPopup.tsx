'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  PopupOverlay,
  PopupCornerFrame,
  PopupTitle,
  PopupDescription,
  PopupActionButton,
  PopupDismissLink,
} from './PopupPrimitives';

interface DeclareNumberPopupProps {
  min: number;
  max: number;
  description: string;
  descriptionKey?: string;
  descriptionParams?: Record<string, string | number>;
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
  onConfirm,
  onDecline,
  declineLabelKey,
}: DeclareNumberPopupProps) {
  const t = useTranslations();
  const [raw, setRaw] = useState(String(min));

  const parsed = parseInt(raw, 10);
  const value = Number.isNaN(parsed) ? min : Math.min(max, Math.max(min, parsed));
  const isValid = raw.trim().length > 0 && !Number.isNaN(parsed) && parsed >= min && parsed <= max;

  const text = descriptionKey
    ? t(descriptionKey, descriptionParams as Record<string, string> | undefined)
    : description;

  return (
    <PopupOverlay>
      <PopupCornerFrame>
        <PopupTitle>{t('game.effect.declareNumberTitle')}</PopupTitle>
        <PopupDescription>{text}</PopupDescription>

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
          {t('game.effect.declareNumberConfirm', { value })}
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
