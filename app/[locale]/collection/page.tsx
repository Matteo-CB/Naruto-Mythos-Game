'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { DecorativeIcons } from '@/components/DecorativeIcons';
import { CardBackgroundDecor } from '@/components/CardBackgroundDecor';
import { CardQuickPreviewModal } from '@/components/cards/CardQuickPreviewModal';
import { cardIdToSlug } from '@/lib/cards/slug';
import { Footer } from '@/components/Footer';
import { normalizeImagePath } from '@/lib/utils/imagePath';
import { useBannedCards } from '@/lib/hooks/useBannedCards';
import { getCardName, getCardGroup, getRarityLabel } from '@/lib/utils/cardLocale';
import { ALL_SET_IDS, SET_REGISTRY, getSetName } from '@/lib/data/sets/registry';
import type { CharacterCard, MissionCard, CardData, Rarity } from '@/lib/engine/types';
import { isVariantCard, isLockedVariantCard } from '@/lib/variants/isVariant';
import { WORLDCUP_CHAMPION_CARD } from '@/lib/variants/constants';
import { holoIdFor, isHoloEligibleCard } from '@/lib/holo/holoId';
import { filterCollectionCards } from '@/lib/collection/filter';
import { useUnlockedVariants } from '@/lib/hooks/useUnlockedVariants';
import { useTrackOnMount } from '@/lib/hooks/useTrackUi';
import { useRevealingStore } from '@/stores/revealingStore';
import { LockedCardWrapper } from '@/components/cards/LockedCardWrapper';
import { VariantHoloOverlay } from '@/components/cards/VariantHoloOverlay';
import { HoloFoilOverlay } from '@/components/cards/HoloFoilOverlay';
import { isLandscapeCard, cardAspectRatio } from '@/lib/cards/orientation';

type AnyCard = CardData;

function StatBadges({ card, costLabel, powerLabel }: { card: AnyCard; costLabel: string; powerLabel: string }) {
  const { chakra, power } = card as CharacterCard;
  const hasCost = typeof chakra === 'number' && Number.isFinite(chakra);
  const hasPower = typeof power === 'number' && Number.isFinite(power);
  if (!hasCost && !hasPower) return null;
  const base = 'absolute z-10 px-1.5 py-0.5 text-[10px] font-bold leading-none';
  return (
    <>
      {hasCost && (
        <span
          className={`${base} top-1 right-1`}
          style={{ backgroundColor: 'rgba(10,10,10,0.78)', color: '#c4a35a', fontVariantNumeric: 'tabular-nums' }}
          title={`${costLabel} ${chakra}`}
        >
          {chakra}
        </span>
      )}
      {hasPower && (
        <span
          className={`${base} bottom-1 left-1`}
          style={{ backgroundColor: 'rgba(10,10,10,0.78)', color: '#e8e8e8', fontVariantNumeric: 'tabular-nums' }}
          title={`${powerLabel} ${power}`}
        >
          {power}
        </span>
      )}
    </>
  );
}

const RARITY_ORDER: Rarity[] = ['C', 'UC', 'R', 'RA', 'S', 'SV', 'M', 'MV', 'L', 'SP', 'SPV', 'POP', 'POPV', 'CHIBI', 'CHIBIV', 'SHINOBI', 'SHINOBIV', 'MMS'];
export default function CollectionPage() {
  const t = useTranslations();
  const locale = useLocale();
  const tCardMeta = useTranslations('cardMeta');
  const [allCards, setAllCards] = useState<AnyCard[]>([]);
  const [cardsLoading, setCardsLoading] = useState(true);
  const [filterRarity, setFilterRarity] = useState<string>('all');
  const [filterGroup, setFilterGroup] = useState<string>('all');
  const [filterSet, setFilterSet] = useState<string>('all');
  const [filterVariantsOnly, setFilterVariantsOnly] = useState(false);
  const [filterHolosOnly, setFilterHolosOnly] = useState(false);
  const [filterTradeableOnly, setFilterTradeableOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCard, setSelectedCard] = useState<CardData | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const CARDS_PER_PAGE = 24;
  const { bannedIds } = useBannedCards();
  const { unlockedIds: unlockedVariantIds, inventory: variantInventory } = useUnlockedVariants();
  useTrackOnMount('ui.collection.opened');

  const revealingVersion = useRevealingStore((s) => s.version);

  useEffect(() => {
    import('@/lib/data/cardLoader').then((mod) => {
      const cards = mod.getAllCards().filter((c) => c.id !== WORLDCUP_CHAMPION_CARD);
      setAllCards(cards);
      setCardsLoading(false);
    });
  }, [revealingVersion]);

  const groups = useMemo(() => {
    const groupSet = new Set<string>();
    allCards.forEach((c) => {
      if (c.group) groupSet.add(c.group);
    });
    return Array.from(groupSet).sort();
  }, [allCards]);

  const filteredCards = useMemo(
    () => {
      let base = filterCollectionCards(allCards, {
        variantsOnly: filterVariantsOnly,
        rarity: filterRarity,
        group: filterGroup,
        set: filterSet,
        searchQuery,
        locale: locale as 'en' | 'fr',
      });
      if (filterHolosOnly) {
        base = base.filter((c) => isHoloEligibleCard(c) && unlockedVariantIds.has(holoIdFor(c.id)));
      }
      if (!filterTradeableOnly) return base;
      return base.filter((c) => (variantInventory.get(filterHolosOnly ? holoIdFor(c.id) : c.id) ?? 0) >= 2);
    },
    [allCards, filterRarity, filterGroup, filterSet, filterVariantsOnly, filterHolosOnly, filterTradeableOnly, unlockedVariantIds, variantInventory, searchQuery, locale],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [filterRarity, filterGroup, filterSet, filterVariantsOnly, filterHolosOnly, filterTradeableOnly, searchQuery]);

  const characterCards = useMemo(() => filteredCards.filter((c) => c.card_type === 'character'), [filteredCards]);
  const totalCharPages = Math.max(1, Math.ceil(characterCards.length / CARDS_PER_PAGE));
  const paginatedChars = useMemo(() => {
    const start = (currentPage - 1) * CARDS_PER_PAGE;
    return characterCards.slice(start, start + CARDS_PER_PAGE);
  }, [characterCards, currentPage]);

  const getImagePath = (card: AnyCard): string | null => normalizeImagePath(card.image_file);

  const characterAttachments = filteredCards.filter((c) => c.card_type === 'attachment' && !isLandscapeCard(c));
  const missionAttachments = filteredCards.filter((c) => c.card_type === 'attachment' && isLandscapeCard(c));

  const renderAttachmentTile = (card: AnyCard) => {
    const imgPath = getImagePath(card);
    const landscape = isLandscapeCard(card);
    return (
      <div
        key={card.id}
        className="relative bg-[#141414] border border-[#262626] overflow-hidden hover:border-[#444] transition-colors group"
        style={{ aspectRatio: cardAspectRatio(card) }}
      >
        <Link
          href={`/cards/${cardIdToSlug(card.id)}`}
          className="block w-full h-full"
          aria-label={getCardName(card, locale)}
        >
          {imgPath ? (
            <img
              src={imgPath}
              alt={getCardName(card, locale)}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
              width={200}
              height={landscape ? 140 : 280}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-1">
              <div className="w-10 h-7 bg-[#1a1a1a] mb-1" />
              <span className="text-[8px] text-[#555] text-center leading-tight">
                {getCardName(card, locale)}
              </span>
            </div>
          )}
        </Link>
        <StatBadges card={card} costLabel={t('collection.details.cost')} powerLabel={t('collection.details.power')} />
        <button
          type="button"
          onClick={() => setSelectedCard(card)}
          className="absolute top-1 left-1 z-20 flex items-center justify-center w-7 h-7 rounded-full opacity-70 hover:opacity-100 transition-opacity"
          style={{ backgroundColor: 'rgba(10,10,10,0.72)', color: '#c4a35a' }}
          aria-label={t('collection.quickPreview')}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
      </div>
    );
  };

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
              <option key={r} value={r}>{getRarityLabel(r, tCardMeta)}</option>
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
              <option key={g} value={g}>{getCardGroup(g, tCardMeta)}</option>
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
              const name = getSetName(sid, locale);
              const suffix = desc.status === 'coming_soon'
                ? ' (' + t('common.comingSoon') + ')'
                : desc.status === 'revealing'
                  ? ' (' + t('common.revealing') + ')'
                  : '';
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
            onClick={() => setFilterHolosOnly((v) => !v)}
            aria-pressed={filterHolosOnly}
            className="px-3 py-2 text-sm uppercase tracking-wider transition-colors"
            style={{
              backgroundColor: filterHolosOnly ? '#a8e6ff1f' : '#141414',
              color: filterHolosOnly ? '#a8e6ff' : '#888888',
              boxShadow: filterHolosOnly ? '0 0 12px #a8e6ff33' : 'none',
            }}
          >
            {t('collection.holosOnly')}
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
            const locked = isLockedVariantCard(card) && !unlockedVariantIds.has(card.id);
            const holoOwned = isHoloEligibleCard(card) && unlockedVariantIds.has(holoIdFor(card.id));
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
                {variant && !locked && <VariantHoloOverlay intensity="subtle" imageUrl={imgPath} />}
                {filterHolosOnly && holoOwned && imgPath && <HoloFoilOverlay intensity="strong" imageUrl={imgPath} />}
              </>
            );
            return (
              <div
                key={card.id}
                className="relative card-aspect bg-[#141414] border border-[#262626] overflow-hidden hover:border-[#444] transition-colors group"
              >
                <Link
                  href={`/cards/${cardIdToSlug(card.id)}`}
                  className="block w-full h-full"
                  aria-label={getCardName(card, locale)}
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
                </Link>
                <StatBadges card={card} costLabel={t('collection.details.cost')} powerLabel={t('collection.details.power')} />
                {isBanned && <BanBadge label={t('collection.bannedPlaceholder')} />}
                {variant && !locked && (variantInventory.get(card.id) ?? 0) >= 2 && (
                  <span
                    className="absolute bottom-1 right-1 z-10 px-1.5 py-0.5 text-[9px] font-bold"
                    style={{ backgroundColor: '#c4a35a33', color: '#c4a35a', fontVariantNumeric: 'tabular-nums' }}
                  >
                    x{variantInventory.get(card.id)}
                  </span>
                )}
                {filterHolosOnly && holoOwned && (variantInventory.get(holoIdFor(card.id)) ?? 0) >= 2 && (
                  <span
                    className="absolute bottom-1 right-1 z-10 px-1.5 py-0.5 text-[9px] font-bold"
                    style={{ backgroundColor: '#a8e6ff26', color: '#a8e6ff', fontVariantNumeric: 'tabular-nums' }}
                  >
                    x{variantInventory.get(holoIdFor(card.id))}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedCard(filterHolosOnly && holoOwned ? { ...card, isHolo: true } : card)}
                  className="absolute top-1 left-1 z-20 flex items-center justify-center w-7 h-7 rounded-full opacity-70 hover:opacity-100 transition-opacity"
                  style={{ backgroundColor: 'rgba(10,10,10,0.72)', color: '#c4a35a' }}
                  aria-label={t('collection.quickPreview')}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </button>
              </div>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredCards.filter((c) => c.card_type === 'mission').map((card) => {
                const isBanned = bannedIds.has(card.id);
                const imgPath = getImagePath(card);
                return (
                  <div
                    key={card.id}
                    className="relative mission-aspect bg-[#141414] border border-[#262626] overflow-hidden hover:border-[#444] transition-colors group"
                  >
                    <Link
                      href={`/cards/${cardIdToSlug(card.id)}`}
                      className="block w-full h-full"
                      aria-label={getCardName(card, locale)}
                    >
                      {imgPath ? (
                        <img
                          src={imgPath}
                          alt={getCardName(card, locale)}
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
                            {getCardName(card, locale)}
                          </span>
                        </div>
                      )}
                    </Link>
                    <StatBadges card={card} costLabel={t('collection.details.cost')} powerLabel={t('collection.details.power')} />
                {isBanned && <BanBadge label={t('collection.bannedPlaceholder')} />}
                    <button
                      type="button"
                      onClick={() => setSelectedCard(card)}
                      className="absolute top-1 left-1 z-20 flex items-center justify-center w-7 h-7 rounded-full opacity-70 hover:opacity-100 transition-opacity"
                      style={{ backgroundColor: 'rgba(10,10,10,0.72)', color: '#c4a35a' }}
                      aria-label={t('collection.quickPreview')}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="11" cy="11" r="7" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {characterAttachments.length > 0 && (
          <>
            <div className="mt-8 mb-4 flex items-center gap-3">
              <div className="flex-1 h-px bg-[#262626]" />
              <span className="text-sm font-bold text-[#888888] uppercase tracking-wider">{t('collection.characterAttachments')}</span>
              <div className="flex-1 h-px bg-[#262626]" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 items-start">
              {characterAttachments.map((card) => renderAttachmentTile(card))}
            </div>
          </>
        )}

        {missionAttachments.length > 0 && (
          <>
            <div className="mt-8 mb-4 flex items-center gap-3">
              <div className="flex-1 h-px bg-[#262626]" />
              <span className="text-sm font-bold text-[#888888] uppercase tracking-wider">{t('collection.missionAttachments')}</span>
              <div className="flex-1 h-px bg-[#262626]" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
              {missionAttachments.map((card) => renderAttachmentTile(card))}
            </div>
          </>
        )}

        {selectedCard && (
          <CardQuickPreviewModal card={selectedCard} onClose={() => setSelectedCard(null)} />
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
