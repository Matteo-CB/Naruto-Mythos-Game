'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { DecorativeIcons } from '@/components/DecorativeIcons';
import { CardBackgroundDecor } from '@/components/CardBackgroundDecor';
import { effectDescriptionsFr } from '@/lib/data/effectTranslationsFr';
import { effectDescriptionsEn } from '@/lib/data/effectDescriptionsEn';
import { Footer } from '@/components/Footer';
import { normalizeImagePath } from '@/lib/utils/imagePath';
import { useBannedCards } from '@/lib/hooks/useBannedCards';
import { getCardName, getCardTitle, getCardGroup, getCardKeyword, getRarityLabel } from '@/lib/utils/cardLocale';
import { ALL_SET_IDS, SET_REGISTRY } from '@/lib/data/sets/registry';
import type { CharacterCard, MissionCard, CardData, Rarity } from '@/lib/engine/types';
import { isVariantCard } from '@/lib/variants/isVariant';
import { filterCollectionCards } from '@/lib/collection/filter';
import { useUnlockedVariants } from '@/lib/hooks/useUnlockedVariants';
import { useTrackOnMount } from '@/lib/hooks/useTrackUi';
import { LockedCardWrapper } from '@/components/cards/LockedCardWrapper';
import { VariantHoloOverlay } from '@/components/cards/VariantHoloOverlay';
import { VariantLockedBanner } from '@/components/cards/VariantLockedBanner';

type AnyCard = CardData;

const RARITY_ORDER: Rarity[] = ['C', 'UC', 'R', 'RA', 'S', 'SV', 'M', 'MV', 'L', 'SP', 'SPV', 'MMS'];
const RARITY_COLORS: Record<Rarity, string> = {
  C: '#888888',
  UC: '#4a9e4a',
  R: '#4a7ab5',
  RA: '#8a5ab5',
  S: '#c4a35a',
  SV: '#c4a35a',
  M: '#b33e3e',
  MV: '#b33e3e',
  L: '#c4a35a',
  SP: '#22b8cf',
  SPV: '#22b8cf',
  MMS: '#5a8ab5',
};

export default function CollectionPage() {
  const t = useTranslations();
  const locale = useLocale();
  const [allCards, setAllCards] = useState<AnyCard[]>([]);
  const [cardsLoading, setCardsLoading] = useState(true);
  const [filterRarity, setFilterRarity] = useState<string>('all');
  const [filterGroup, setFilterGroup] = useState<string>('all');
  const [filterSet, setFilterSet] = useState<string>('all');
  const [filterVariantsOnly, setFilterVariantsOnly] = useState(false);
  const [filterTradeableOnly, setFilterTradeableOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCard, setSelectedCard] = useState<CardData | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const CARDS_PER_PAGE = 24;
  const { bannedIds } = useBannedCards();
  const { unlockedIds: unlockedVariantIds, inventory: variantInventory } = useUnlockedVariants();
  useTrackOnMount('ui.collection.opened');

  useEffect(() => {
    import('@/lib/data/cardLoader').then((mod) => {
      const cards = mod.getAllCards();
      setAllCards(cards);
      setCardsLoading(false);
    });
  }, []);

  const groups = useMemo(() => {
    const groupSet = new Set<string>();
    allCards.forEach((c) => {
      if (c.group) groupSet.add(c.group);
    });
    return Array.from(groupSet).sort();
  }, [allCards]);

  const filteredCards = useMemo(
    () => {
      const base = filterCollectionCards(allCards, {
        variantsOnly: filterVariantsOnly,
        rarity: filterRarity,
        group: filterGroup,
        set: filterSet,
        searchQuery,
        locale: locale as 'en' | 'fr',
      });
      if (!filterTradeableOnly) return base;
      return base.filter((c) => (variantInventory.get(c.id) ?? 0) >= 2);
    },
    [allCards, filterRarity, filterGroup, filterSet, filterVariantsOnly, filterTradeableOnly, variantInventory, searchQuery, locale],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [filterRarity, filterGroup, filterSet, filterVariantsOnly, filterTradeableOnly, searchQuery]);

  const characterCards = useMemo(() => filteredCards.filter((c) => c.card_type !== 'mission'), [filteredCards]);
  const totalCharPages = Math.max(1, Math.ceil(characterCards.length / CARDS_PER_PAGE));
  const paginatedChars = useMemo(() => {
    const start = (currentPage - 1) * CARDS_PER_PAGE;
    return characterCards.slice(start, start + CARDS_PER_PAGE);
  }, [characterCards, currentPage]);

  const getImagePath = (card: AnyCard): string | null => normalizeImagePath(card.image_file);

  return (
    <main id="main-content" className="min-h-screen relative bg-[#0a0a0a] flex flex-col">
      <CloudBackground />
      <DecorativeIcons />
      <CardBackgroundDecor variant="collection" />
      <div className="max-w-7xl mx-auto relative z-10 flex-1 px-4 py-8">
        
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#e0e0e0]">{t('collection.title')}</h1>
            <p className="text-sm text-[#888888]">{t('collection.total', { count: allCards.length })}</p>
          </div>
          <Link
            href="/"
            className="px-4 py-2 bg-[#141414] border border-[#262626] text-[#888888] text-sm hover:bg-[#1a1a1a] transition-colors"
          >
            {t('common.back')}
          </Link>
        </div>

        <div className="flex flex-wrap gap-3 mb-6">
          <input
            type="search"
            placeholder={t('collection.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-3 py-2 bg-[#141414] border border-[#262626] text-[#e0e0e0] text-sm placeholder-[#555] focus:outline-none focus:border-[#444] w-full sm:w-64"
            aria-label={t('collection.search')}
          />
          <select
            value={filterRarity}
            onChange={(e) => setFilterRarity(e.target.value)}
            className="px-3 py-2 bg-[#141414] border border-[#262626] text-[#e0e0e0] text-sm focus:outline-none"
            aria-label={t('collection.allRarities')}
          >
            <option value="all">{t('collection.allRarities')}</option>
            {RARITY_ORDER.map((r) => (
              <option key={r} value={r}>{getRarityLabel(r, locale as 'en' | 'fr')}</option>
            ))}
          </select>
          <select
            value={filterGroup}
            onChange={(e) => setFilterGroup(e.target.value)}
            className="px-3 py-2 bg-[#141414] border border-[#262626] text-[#e0e0e0] text-sm focus:outline-none"
            aria-label={t('collection.allGroups')}
          >
            <option value="all">{t('collection.allGroups')}</option>
            {groups.map((g) => (
              <option key={g} value={g}>{getCardGroup(g, locale as 'en' | 'fr')}</option>
            ))}
          </select>
          <select
            value={filterSet}
            onChange={(e) => setFilterSet(e.target.value)}
            className="px-3 py-2 bg-[#141414] border border-[#262626] text-[#e0e0e0] text-sm focus:outline-none"
            aria-label={t('collection.allSets')}
          >
            <option value="all">{t('collection.allSets')}</option>
            {ALL_SET_IDS.map((sid) => {
              const desc = SET_REGISTRY[sid];
              const name = locale === 'fr' ? desc.nameFr : desc.nameEn;
              const suffix = desc.status === 'coming_soon' ? ' (' + t('common.comingSoon') + ')' : '';
              return <option key={sid} value={sid}>{name + suffix}</option>;
            })}
          </select>
          <button
            type="button"
            onClick={() => setFilterVariantsOnly((v) => !v)}
            aria-pressed={filterVariantsOnly}
            className="px-3 py-2 text-sm uppercase tracking-wider transition-colors"
            style={{
              backgroundColor: filterVariantsOnly ? '#c4a35a1f' : '#141414',
              color: filterVariantsOnly ? '#c4a35a' : '#888888',
              boxShadow: filterVariantsOnly ? '0 0 12px #c4a35a33' : 'none',
            }}
          >
            {t('collection.variantsOnly')}
          </button>
          <button
            type="button"
            onClick={() => setFilterTradeableOnly((v) => !v)}
            aria-pressed={filterTradeableOnly}
            className="px-3 py-2 text-sm uppercase tracking-wider transition-colors"
            style={{
              backgroundColor: filterTradeableOnly ? '#c4a35a1f' : '#141414',
              color: filterTradeableOnly ? '#c4a35a' : '#888888',
              boxShadow: filterTradeableOnly ? '0 0 12px #c4a35a33' : 'none',
            }}
          >
            {t('collection.filterTradeable')}
          </button>
        </div>

        <p className="text-xs text-[#555] mb-4">{t('collection.total', { count: filteredCards.length })}</p>

        {cardsLoading && (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 mb-4">
            {Array.from({ length: 24 }).map((_, i) => (
              <div key={i} className="card-aspect bg-[#141414] border border-[#262626] animate-pulse" />
            ))}
          </div>
        )}

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
          {paginatedChars.map((card) => {
            const isBanned = bannedIds.has(card.id);
            const imgPath = getImagePath(card);
            const variant = isVariantCard(card);
            const locked = variant && !unlockedVariantIds.has(card.id);
            const inner = (
              <>
                {imgPath ? (
                  <img
                    src={imgPath}
                    alt={getCardName(card, locale as 'en' | 'fr')}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
                    width={140}
                    height={196}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-1">
                    <div className="w-8 h-10 bg-[#1a1a1a] mb-1" />
                    <span className="text-[8px] text-[#555] text-center leading-tight">
                      {getCardName(card, locale as 'en' | 'fr')}
                    </span>
                  </div>
                )}
                {variant && !locked && <VariantHoloOverlay intensity="subtle" />}
              </>
            );
            return (
              <button
                key={card.id}
                onClick={() => setSelectedCard(card)}
                className="relative card-aspect bg-[#141414] border border-[#262626] overflow-hidden hover:border-[#444] transition-colors group"
                aria-label={getCardName(card, locale as 'en' | 'fr')}
              >
                {locked ? (
                  <LockedCardWrapper
                    badgeLabel={t('collection.lockedBadge')}
                    badgeTooltip={t('collection.lockedTooltip')}
                  >
                    {inner}
                  </LockedCardWrapper>
                ) : (
                  inner
                )}
                {isBanned && <BanBadge label={t('collection.bannedPlaceholder')} />}
                {variant && !locked && (variantInventory.get(card.id) ?? 0) >= 2 && (
                  <span
                    className="absolute bottom-1 right-1 z-10 px-1.5 py-0.5 text-[9px] font-bold"
                    style={{ backgroundColor: '#c4a35a33', color: '#c4a35a', fontVariantNumeric: 'tabular-nums' }}
                  >
                    x{variantInventory.get(card.id)}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {totalCharPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-4 mb-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="px-3 py-1.5 text-xs transition-colors disabled:opacity-30"
              style={{ backgroundColor: '#141414', border: '1px solid #262626', color: '#888888' }}
            >
              {t('common.previous')}
            </button>
            <span className="text-xs" style={{ color: '#888888' }}>
              {currentPage} / {totalCharPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalCharPages, p + 1))}
              disabled={currentPage >= totalCharPages}
              className="px-3 py-1.5 text-xs transition-colors disabled:opacity-30"
              style={{ backgroundColor: '#141414', border: '1px solid #262626', color: '#888888' }}
            >
              {t('common.next')}
            </button>
          </div>
        )}

        {filteredCards.some((c) => c.card_type === 'mission') && (
          <>
            <div className="mt-8 mb-4 flex items-center gap-3">
              <div className="flex-1 h-px bg-[#262626]" />
              <span className="text-sm font-bold text-[#888888] uppercase tracking-wider">{t('collection.missions')}</span>
              <div className="flex-1 h-px bg-[#262626]" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filteredCards.filter((c) => c.card_type === 'mission').map((card) => {
                const isBanned = bannedIds.has(card.id);
                const imgPath = getImagePath(card);
                return (
                  <button
                    key={card.id}
                    onClick={() => setSelectedCard(card)}
                    className="relative mission-aspect bg-[#141414] border border-[#262626] overflow-hidden hover:border-[#444] transition-colors group"
                  >
                    {imgPath ? (
                      <img
                        src={imgPath}
                        alt={getCardName(card, locale as 'en' | 'fr')}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                        width={200}
                        height={140}
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-1">
                        <div className="w-10 h-7 bg-[#1a1a1a] mb-1" />
                        <span className="text-[8px] text-[#555] text-center leading-tight">
                          {getCardName(card, locale as 'en' | 'fr')}
                        </span>
                      </div>
                    )}
                    {isBanned && <BanBadge label={t('collection.bannedPlaceholder')} />}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {selectedCard && (
          <div
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedCard(null)}
            role="dialog"
            aria-modal="true"
            aria-label={getCardName(selectedCard, locale as 'en' | 'fr')}
          >
            <div
              className="bg-[#141414] border border-[#262626] max-w-lg w-full max-h-[90vh] overflow-y-auto p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className={selectedCard.card_type === 'mission' ? 'flex flex-col gap-4' : 'flex gap-4'}>
                
                <div className={`relative ${selectedCard.card_type === 'mission' ? 'w-full' : 'w-40 shrink-0'}`}>
                  {getImagePath(selectedCard) ? (
                    <img
                      src={getImagePath(selectedCard)!}
                      alt={getCardName(selectedCard, locale as 'en' | 'fr')}
                      className={`w-full ${selectedCard.card_type === 'mission' ? 'mission-aspect' : 'card-aspect'} object-cover`}
                      loading="eager"
                      decoding="async"
                    />
                  ) : (
                    <div className={`w-full ${selectedCard.card_type === 'mission' ? 'mission-aspect' : 'card-aspect'} bg-[#1a1a1a] flex items-center justify-center`}>
                      <span className="text-xs text-[#555]">{t('card.noImage')}</span>
                    </div>
                  )}
                  {bannedIds.has(selectedCard.id) && <BanBadge label={t('collection.bannedPlaceholder')} />}
                </div>

                <div className="flex-1 min-w-0 font-body">
                  <h2 className="text-xl font-bold text-[#e0e0e0]">{getCardName(selectedCard, locale as 'en' | 'fr')}</h2>
                  <p className="text-sm text-[#888888] mb-3">{getCardTitle(selectedCard, locale as 'en' | 'fr')}</p>

                  <div className="flex gap-4 mb-3 text-sm">
                    <span className="text-[#888888]">
                      ID: <span className="text-[#e0e0e0]">{selectedCard.id}</span>
                    </span>
                    <span style={{ color: RARITY_COLORS[selectedCard.rarity] }}>
                      {getRarityLabel(selectedCard.rarity, locale as 'en' | 'fr')}
                    </span>
                  </div>

                  {selectedCard.card_type === 'character' && (
                    <div className="flex gap-4 mb-3 text-sm">
                      <span className="text-[#888888]">
                        {t('collection.details.cost')}: <span className="text-[#e0e0e0]">{selectedCard.chakra}</span>
                      </span>
                      <span className="text-[#888888]">
                        {t('collection.details.power')}: <span className="text-[#e0e0e0]">{selectedCard.power}</span>
                      </span>
                    </div>
                  )}

                  {selectedCard.card_type === 'mission' && 'basePoints' in selectedCard && (
                    <div className="flex gap-4 mb-3 text-sm">
                      <span className="text-[#888888]">
                        {t('collection.basePoints')}: <span className="text-[#e0e0e0]">{(selectedCard as unknown as MissionCard).basePoints}</span>
                      </span>
                    </div>
                  )}

                  {selectedCard.group && (
                    <p className="text-xs text-[#888888] mb-2">
                      {t('collection.details.group')}: <span className="text-[#e0e0e0]">{getCardGroup(selectedCard.group, locale as 'en' | 'fr')}</span>
                    </p>
                  )}

                  {selectedCard.keywords && selectedCard.keywords.length > 0 && (
                    <p className="text-xs text-[#888888] mb-3">
                      {t('collection.details.keywords')}: <span className="text-[#e0e0e0]">{selectedCard.keywords.map((kw) => getCardKeyword(kw, locale as 'en' | 'fr')).join(', ')}</span>
                    </p>
                  )}

                  {selectedCard.effects && selectedCard.effects.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {selectedCard.effects.map((effect, i) => {
                        const raFallbackId = selectedCard.id.endsWith('-RA') ? selectedCard.id.replace('-RA', '-R') : undefined;
                        const frDescriptions = effectDescriptionsFr[selectedCard.id] ?? (raFallbackId ? effectDescriptionsFr[raFallbackId] : undefined);
                        const enDescriptions = effectDescriptionsEn[selectedCard.id] ?? (raFallbackId ? effectDescriptionsEn[raFallbackId] : undefined);
                        const description = locale === 'fr'
                          ? (frDescriptions?.[i] ?? enDescriptions?.[i] ?? effect.description)
                          : (enDescriptions?.[i] ?? effect.description);
                        return (
                          <div key={i} className="text-xs">
                            <span
                              className="font-bold mr-1"
                              style={{
                                color:
                                  effect.type === 'MAIN' ? '#e0e0e0' :
                                  effect.type === 'UPGRADE' ? '#c4a35a' :
                                  effect.type === 'AMBUSH' ? '#b33e3e' :
                                  effect.type === 'SCORE' ? '#4a9e4a' : '#888888',
                              }}
                            >
                              [{effect.type}]
                            </span>
                            <span className="font-body text-[#aaa]">{description}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {isVariantCard(selectedCard) && !unlockedVariantIds.has(selectedCard.id) && (
                <VariantLockedBanner
                  title={t('collection.lockedBannerTitle')}
                  description={t('collection.lockedBannerDescription')}
                />
              )}

              <button
                onClick={() => setSelectedCard(null)}
                className="mt-4 w-full py-2 bg-[#1a1a1a] border border-[#262626] text-[#888888] text-sm hover:bg-[#222] transition-colors"
                aria-label={t('common.cancel')}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}
      </div>
      <Footer />
    </main>
  );
}

function BanBadge({ label }: { label: string }) {
  return (
    <span
      aria-hidden
      className="absolute font-display font-bold uppercase pointer-events-none"
      style={{
        top: 4,
        right: 4,
        padding: '2px 6px',
        fontSize: 9,
        letterSpacing: '0.18em',
        color: '#ffffff',
        backgroundColor: 'rgba(179, 62, 62, 0.95)',
        boxShadow: '0 2px 6px rgba(0,0,0,0.45)',
        zIndex: 2,
      }}
    >
      {label}
    </span>
  );
}
