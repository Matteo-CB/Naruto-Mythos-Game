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
import type { CharacterCard, MissionCard, CardData, Rarity } from '@/lib/engine/types';

type AnyCard = CardData;

const RARITY_ORDER: Rarity[] = ['C', 'UC', 'R', 'RART', 'S', 'SV', 'M', 'L', 'MMS'];
const RARITY_COLORS: Record<string, string> = {
  C: '#888888',
  UC: '#4a9e4a',
  R: '#4a7ab5',
  RART: '#8a5ab5',
  S: '#c4a35a',
  SV: '#c4a35a',
  M: '#b33e3e',
  L: '#c4a35a',
  MMS: '#5a8ab5',
};

export default function CollectionPage() {
  const t = useTranslations();
  const locale = useLocale();
  const [allCards, setAllCards] = useState<AnyCard[]>([]);
  const [filterRarity, setFilterRarity] = useState<string>('all');
  const [filterGroup, setFilterGroup] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCard, setSelectedCard] = useState<CardData | null>(null);
  const { bannedIds } = useBannedCards();

  useEffect(() => {
    import('@/lib/data/cardLoader').then((mod) => {
      const cards = mod.getAllCards();
      setAllCards(cards);
    });
  }, []);

  const groups = useMemo(() => {
    const groupSet = new Set<string>();
    allCards.forEach((c) => {
      if (c.group) groupSet.add(c.group);
    });
    return Array.from(groupSet).sort();
  }, [allCards]);

  const filteredCards = useMemo(() => {
    return allCards.filter((card) => {
      if (filterRarity !== 'all' && card.rarity !== filterRarity) return false;
      if (filterGroup !== 'all' && card.group !== filterGroup) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (
          !card.name_fr.toLowerCase().includes(q) &&
          !card.title_fr.toLowerCase().includes(q) &&
          !card.id.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [allCards, filterRarity, filterGroup, searchQuery]);

  const getImagePath = (card: AnyCard): string | null => normalizeImagePath(card.image_file);

  return (
    <main id="main-content" className="min-h-screen relative bg-[#0a0a0a] flex flex-col">
      <CloudBackground />
      <DecorativeIcons />
      <CardBackgroundDecor variant="collection" />
      <div className="max-w-7xl mx-auto relative z-10 flex-1 px-4 py-8">
        {/* Header */}
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

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <input
            type="search"
            placeholder={t('collection.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-3 py-2 bg-[#141414] border border-[#262626] text-[#e0e0e0] text-sm placeholder-[#555] focus:outline-none focus:border-[#444] w-64"
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
              <option key={r} value={r}>{r}</option>
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
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>

        {/* Card count */}
        <p className="text-xs text-[#555] mb-4">{t('collection.total', { count: filteredCards.length })}</p>

        {/* Card grid */}
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
          {filteredCards.map((card) => {
            const isBanned = bannedIds.has(card.id);
            const imgPath = isBanned ? null : getImagePath(card);
            return (
              <button
                key={card.id}
                onClick={() => setSelectedCard(card)}
                className={`relative ${card.card_type === 'mission' ? 'mission-aspect' : 'card-aspect'} bg-[#141414] border border-[#262626] overflow-hidden hover:border-[#444] transition-colors group`}
                style={{ opacity: isBanned ? 0.5 : 1 }}
              >
                {imgPath ? (
                  <img
                    src={imgPath}
                    alt={card.name_fr}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
                    width={140}
                    height={196}
                  />
                ) : isBanned ? (
                  <div className="w-full h-full flex flex-col items-center justify-center p-1" style={{ backgroundColor: '#1a1a1a' }}>
                    <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#333333' }}>MYTHOS</div>
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-1">
                    <div className="w-8 h-10 bg-[#1a1a1a] mb-1" />
                    <span className="text-[8px] text-[#555] text-center leading-tight">
                      {card.name_fr}
                    </span>
                  </div>
                )}
                {/* Rarity bar */}
                <div
                  className="absolute bottom-0 left-0 right-0 h-0.5"
                  style={{ backgroundColor: RARITY_COLORS[card.rarity] ?? '#555' }}
                />
              </button>
            );
          })}
        </div>

        {/* Card detail modal */}
        {selectedCard && (
          <div
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedCard(null)}
            role="dialog"
            aria-modal="true"
            aria-label={selectedCard.name_fr}
          >
            <div
              className="bg-[#141414] border border-[#262626] max-w-lg w-full max-h-[90vh] overflow-y-auto p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className={selectedCard.card_type === 'mission' ? 'flex flex-col gap-4' : 'flex gap-4'}>
                {/* Card image */}
                <div className={selectedCard.card_type === 'mission' ? 'w-full' : 'w-40 shrink-0'}>
                  {!bannedIds.has(selectedCard.id) && getImagePath(selectedCard) ? (
                    <img
                      src={getImagePath(selectedCard)!}
                      alt={selectedCard.name_fr}
                      className={`w-full ${selectedCard.card_type === 'mission' ? 'mission-aspect' : 'card-aspect'} object-cover`}
                      loading="eager"
                      decoding="async"
                    />
                  ) : (
                    <div className={`w-full ${selectedCard.card_type === 'mission' ? 'mission-aspect' : 'card-aspect'} bg-[#1a1a1a] flex items-center justify-center`}>
                      <span className="text-xs text-[#555]">{t('card.noImage')}</span>
                    </div>
                  )}
                </div>

                {/* Card info */}
                <div className="flex-1 min-w-0 font-body">
                  <h2 className="text-xl font-bold text-[#e0e0e0]">{selectedCard.name_fr}</h2>
                  <p className="text-sm text-[#888888] mb-3">{selectedCard.title_fr}</p>

                  <div className="flex gap-4 mb-3 text-sm">
                    <span className="text-[#888888]">
                      ID: <span className="text-[#e0e0e0]">{selectedCard.id}</span>
                    </span>
                    <span style={{ color: RARITY_COLORS[selectedCard.rarity] }}>
                      {selectedCard.rarity}
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
                      {t('collection.details.group')}: <span className="text-[#e0e0e0]">{selectedCard.group}</span>
                    </p>
                  )}

                  {selectedCard.keywords && selectedCard.keywords.length > 0 && (
                    <p className="text-xs text-[#888888] mb-3">
                      {t('collection.details.keywords')}: <span className="text-[#e0e0e0]">{selectedCard.keywords.join(', ')}</span>
                    </p>
                  )}

                  {/* Effects */}
                  {selectedCard.effects && selectedCard.effects.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {selectedCard.effects.map((effect, i) => {
                        const frDescriptions = effectDescriptionsFr[selectedCard.id];
                        const enDescriptions = effectDescriptionsEn[selectedCard.id];
                        const description = locale === 'fr'
                          ? (frDescriptions?.[i] ?? effect.description)
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
