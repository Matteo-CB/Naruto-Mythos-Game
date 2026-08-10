'use client';

import { useLocale, useTranslations } from 'next-intl';
import { effectTypeLabel } from '@/lib/cards/effectTypeLabel';
import { hasCombatStats } from '@/lib/cards/orientation';
import { Link } from '@/lib/i18n/navigation';
import { normalizeImagePath } from '@/lib/utils/imagePath';
import { getCardName, getCardTitle, getCardGroup, getCardKeyword, getRarityLabel } from '@/lib/utils/cardLocale';
import { getCardEffectDescription } from '@/lib/data/effectDescriptions';
import { useBannedCards } from '@/lib/hooks/useBannedCards';
import { useUnlockedVariants } from '@/lib/hooks/useUnlockedVariants';
import { isLockedVariantCard } from '@/lib/variants/isVariant';
import { VariantLockedBanner } from '@/components/cards/VariantLockedBanner';
import { HoloFoilOverlay } from '@/components/cards/HoloFoilOverlay';
import { ChakraIcon, PowerIcon, CHAKRA_COLOR, POWER_COLOR } from '@/components/icons/GameIcons';
import { cardIdToSlug } from '@/lib/cards/slug';
import { Z_APP_MODAL } from '@/lib/ui/zIndex';
import type { CardData, MissionCard, Rarity } from '@/lib/engine/types';
import { isLandscapeCard } from '@/lib/cards/orientation';
import { RarityIcon } from '@/components/icons/RarityIcon';

const RARITY_COLORS: Record<Rarity, string> = {
  C: '#888888', UC: '#4a9e4a', R: '#4a7ab5', RA: '#8a5ab5',
  S: '#c4a35a', SV: '#c4a35a', M: '#b33e3e', MV: '#b33e3e', L: '#c4a35a',
  SP: '#22b8cf', SPV: '#22b8cf', POP: '#cc4f96', POPV: '#cc4f96',
  CHIBI: '#2f9e8f', CHIBIV: '#2f9e8f', SHINOBI: '#d97706', SHINOBIV: '#d97706', MMS: '#5a8ab5',
};

const EFFECT_TYPE_TEXT_COLOR: Record<string, string> = {
  MAIN: '#e0e0e0', UPGRADE: '#c4a35a', AMBUSH: '#b33e3e', SCORE: '#4a9e4a', DUEL: '#ef4444',
};

export function CardQuickPreviewModal({ card, onClose }: { card: CardData; onClose: () => void }) {
  const locale = useLocale();
  const t = useTranslations();
  const tCardMeta = useTranslations('cardMeta');
  const { bannedIds } = useBannedCards();
  const { unlockedIds } = useUnlockedVariants();

  const isMission = isLandscapeCard(card);
  const imgPath = normalizeImagePath(card.image_file);
  const isBanned = bannedIds.has(card.id);
  const locked = isLockedVariantCard(card) && !unlockedIds.has(card.id);

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center p-4"
      style={{ zIndex: Z_APP_MODAL }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={getCardName(card, locale)}
    >
      <div
        className="bg-[#141414] border border-[#262626] max-w-lg w-full max-h-[90vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={isMission ? 'flex flex-col gap-4' : 'flex gap-4'}>
          <div className={`relative ${isMission ? 'w-full' : 'w-40 shrink-0'}`}>
            {imgPath ? (
              <>
                <img
                  src={imgPath}
                  alt={getCardName(card, locale)}
                  className={`w-full ${isMission ? 'mission-aspect' : 'card-aspect'} object-cover`}
                  loading="eager"
                  decoding="async"
                />
                {card.isHolo && <HoloFoilOverlay intensity="preview" imageUrl={imgPath} />}
              </>
            ) : (
              <div className={`w-full ${isMission ? 'mission-aspect' : 'card-aspect'} bg-[#1a1a1a] flex items-center justify-center`}>
                <span className="text-xs text-[#555]">{t('card.noImage')}</span>
              </div>
            )}
            {isBanned && (
              <span
                aria-hidden
                className="absolute font-display font-bold uppercase pointer-events-none"
                style={{ top: 4, right: 4, padding: '2px 6px', fontSize: 9, letterSpacing: '0.18em', color: '#ffffff', backgroundColor: 'rgba(179, 62, 62, 0.95)', boxShadow: '0 2px 6px rgba(0,0,0,0.45)', zIndex: 2 }}
              >
                {t('collection.bannedPlaceholder')}
              </span>
            )}
          </div>

          <div className="flex-1 min-w-0 font-body">
            <h2 className="text-xl font-bold text-[#e0e0e0]">{getCardName(card, locale)}</h2>
            <p className="text-sm text-[#888888] mb-3">{getCardTitle(card, locale)}</p>

            <div className="flex gap-4 mb-3 text-sm">
              <span className="text-[#888888]">N° <span className="text-[#e0e0e0]">{String(card.number).padStart(3, '0')}</span></span>
              <span className="inline-flex items-center gap-1.5" style={{ color: RARITY_COLORS[card.rarity] }}><RarityIcon rarity={card.rarity} size={14} />{getRarityLabel(card.rarity, tCardMeta)}</span>
            </div>

            {hasCombatStats(card) && (
              <div className="flex gap-4 mb-3 text-sm">
                <span className="inline-flex items-center gap-1.5 text-[#888888]">
                  <ChakraIcon size={15} color={CHAKRA_COLOR} />
                  {t('collection.details.cost')}: <span className="text-[#e0e0e0]">{card.chakra}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 text-[#888888]">
                  <PowerIcon size={15} color={POWER_COLOR} />
                  {t('collection.details.power')}: <span className="text-[#e0e0e0]">{card.power}</span>
                </span>
              </div>
            )}

            {isMission && 'basePoints' in card && (
              <div className="flex gap-4 mb-3 text-sm">
                <span className="text-[#888888]">{t('collection.basePoints')}: <span className="text-[#e0e0e0]">{(card as unknown as MissionCard).basePoints}</span></span>
              </div>
            )}

            {card.group && (
              <p className="text-xs text-[#888888] mb-2">
                {t('collection.details.group')}: <span className="text-[#e0e0e0]">{getCardGroup(card.group, tCardMeta)}</span>
              </p>
            )}

            {card.keywords && card.keywords.length > 0 && (
              <p className="text-xs text-[#888888] mb-3">
                {t('collection.details.keywords')}: <span className="text-[#e0e0e0]">{card.keywords.map((kw) => getCardKeyword(kw, tCardMeta)).join(', ')}</span>
              </p>
            )}

            {card.effects && card.effects.length > 0 && (
              <div className="mt-3 space-y-2">
                {card.effects.map((effect, i) => {
                  const description = getCardEffectDescription(card.id, i, locale, effect.description);
                  return (
                    <div key={i} className="text-xs">
                      <span className="font-bold mr-1" style={{ color: EFFECT_TYPE_TEXT_COLOR[effect.type] ?? '#888888' }}>
                        [{effectTypeLabel(effect.type)}]
                      </span>
                      <span className="font-body text-[#aaa]">{description}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {locked && (
          <VariantLockedBanner
            title={t('collection.lockedBannerTitle')}
            description={t('collection.lockedBannerDescription')}
          />
        )}

        <div className="mt-4 flex gap-2">
          <Link
            href={`/cards/${cardIdToSlug(card.id)}`}
            className="flex-1 py-2 text-center bg-[#c4a35a1f] text-[#c4a35a] text-sm hover:bg-[#c4a35a33] transition-colors"
          >
            {t('cardPage.viewFullPage')}
          </Link>
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-[#1a1a1a] border border-[#262626] text-[#888888] text-sm hover:bg-[#222] transition-colors"
            aria-label={t('common.cancel')}
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
