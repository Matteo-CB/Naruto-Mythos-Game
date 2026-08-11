'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import { RarityIcon } from '@/components/icons/RarityIcon';
import { getSetName } from '@/lib/data/sets/registry';
import { getCardName, getCardTitle, getCardGroup, getCardKeyword, getRarityLabel } from '@/lib/utils/cardLocale';

export const RARITY_COLORS: Record<string, string> = {
  C: '#8b8f96',
  UC: '#22c55e',
  R: '#3b82f6',
  RA: '#a855f7',
  S: '#eab308',
  SV: '#eab308',
  M: '#ef4444',
  MV: '#ef4444',
  L: '#eab308',
  SP: '#06b6d4',
  SPV: '#06b6d4',
  POP: '#e84393',
  POPV: '#e84393',
  CHIBI: '#10b981',
  CHIBIV: '#10b981',
  SHINOBI: '#d97706',
  SHINOBIV: '#d97706',
  MMS: '#8b8f96',
};

export interface FallbackCard {
  id?: string;
  name_fr?: string;
  name_en?: string;
  title_fr?: string;
  title_en?: string;
  number?: string | number;
  set?: string;
  rarity?: string;
  group?: string | null;
  keywords?: string[] | null;
}

function paddedNumber(value: string | number | undefined): string {
  if (value === undefined || value === null) return '';
  const raw = String(value);
  const m = raw.match(/^(\d+)(.*)$/);
  return m ? `${m[1].padStart(3, '0')}${m[2]}` : raw;
}

interface CardArtFallbackProps {
  card: FallbackCard;
  className?: string;
  style?: CSSProperties;
}

export function CardArtFallback({ card, className = '', style }: CardArtFallbackProps) {
  const locale = useLocale();
  const tCardMeta = useTranslations('cardMeta');
  const t = useTranslations('card');

  const accent = RARITY_COLORS[card.rarity ?? ''] ?? '#8b8f96';
  const nom = getCardName(card as never, locale);
  const titre = getCardTitle(card as never, locale);
  const numero = paddedNumber(card.number);
  const rarete = card.rarity ? getRarityLabel(card.rarity, tCardMeta) : '';

  return (
    <div
      className={`card-fallback ${className}`}
      style={{ backgroundColor: `${accent}14`, ...style }}
      role="img"
      aria-label={`${nom}${titre ? ` ${titre}` : ''} ${numero} ${rarete} ${t('noImage')}`}
    >
      <div className="card-fallback-top">
        {card.set && <span className="card-fallback-set">{getSetName(card.set, locale)}</span>}
      </div>

      <div className="card-fallback-body">
        <span className="card-fallback-name">{nom}</span>
        {titre && <span className="card-fallback-title">{titre}</span>}
        {card.group && <span className="card-fallback-group">{getCardGroup(card.group, tCardMeta)}</span>}
        {card.keywords && card.keywords.length > 0 && (
          <span className="card-fallback-keywords">
            {card.keywords.map((kw) => (
              <span key={kw} className="card-fallback-keyword">
                {getCardKeyword(kw, tCardMeta)}
              </span>
            ))}
          </span>
        )}
      </div>

      <div className="card-fallback-bottom">
        {card.rarity && <RarityIcon rarity={card.rarity} style={{ width: '11cqi', height: '11cqi' }} />}
        <span className="card-fallback-meta" style={{ color: accent }}>
          {numero}
        </span>
        {rarete && <span className="card-fallback-rarity">{rarete}</span>}
      </div>

      <span className="card-fallback-notice">{t('noImage')}</span>
    </div>
  );
}
