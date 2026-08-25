'use client';

import { useState, useMemo, useCallback } from 'react';
import { compareBySetOrder } from '@/lib/cards/order';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations, useLocale } from 'next-intl';
import type { BoosterCard } from '@/lib/sealed/boosterGenerator';
import type { CharacterCard, MissionCard } from '@/lib/engine/types';
import { MIN_DECK_SIZE, MISSION_CARDS_PER_PLAYER } from '@/lib/engine/types';
import { normalizeImagePath, portraitImagePath } from '@/lib/utils/imagePath';
import { isLandscapeCard } from '@/lib/cards/orientation';
import { getCardName, getCardTitle, getCardGroup, getCardKeyword, getRarityLabel } from '@/lib/utils/cardLocale';
import { getCardEffectDescription } from '@/lib/data/effectDescriptions';
import { ChakraIcon, PowerIcon, CHAKRA_COLOR, POWER_COLOR } from '@/components/icons/GameIcons';
import { LandscapeBlocker } from '@/components/LandscapeBlocker';
import { SealedTimer } from './SealedTimer';
import { VariantHoloOverlay } from '@/components/cards/VariantHoloOverlay';
import { CardArtFallback } from '@/components/cards/CardArtFallback';
import { facetOptions, isFacetWorthShowing } from '@/lib/collection/facets';
import { useValidFacetSelection } from '@/lib/collection/useFacets';
import { RarityIcon } from '@/components/icons/RarityIcon';

interface SealedDeckBuilderProps {
  pool: BoosterCard[];
  isOnline: boolean;
  timerSeconds?: number;
  onDeckReady: (characters: CharacterCard[], missions: MissionCard[]) => void;
  onTimeUp?: () => void;
}

const RARITY_ORDER: readonly string[] = ['C', 'UC', 'R', 'RA', 'S', 'SV', 'M', 'MV', 'L', 'SP', 'SPV', 'POP', 'POPV', 'CHIBI', 'CHIBIV', 'SHINOBI', 'SHINOBIV', 'MMS'];

export function SealedDeckBuilder({
  pool,
  isOnline,
  timerSeconds = 900,
  onDeckReady,
  onTimeUp,
}: SealedDeckBuilderProps) {
  const t = useTranslations('sealed');
  const locale = useLocale() as 'en' | 'fr';
  const tCardMeta = useTranslations('cardMeta');

  const [deckChars, setDeckChars] = useState<BoosterCard[]>([]);
  const [deckMissions, setDeckMissions] = useState<BoosterCard[]>([]);

  const [filterRarity, setFilterRarity] = useState<string>('all');
  const [filterGroup, setFilterGroup] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [previewCard, setPreviewCard] = useState<BoosterCard | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const { characters, missions, hasTemporaryVariants } = useMemo(() => {
    const chars: BoosterCard[] = [];
    const miss: BoosterCard[] = [];
    let anyVariant = false;
    for (const card of pool) {
      if (card.card_type === 'mission') miss.push(card);
      else chars.push(card);
      if (card.isTemporaryVariant) anyVariant = true;
    }
    return { characters: chars, missions: miss, hasTemporaryVariants: anyVariant };
  }, [pool]);

  const poolAvailability = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of characters) {
      counts.set(c.id, (counts.get(c.id) ?? 0) + 1);
    }
    return counts;
  }, [characters]);

  const catalogChars = useMemo(() => {
    const seen = new Map<string, BoosterCard>();
    for (const c of characters) {
      if (!seen.has(c.id)) seen.set(c.id, c);
    }
    return Array.from(seen.values());
  }, [characters]);

  const missionAvailability = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of missions) {
      counts.set(m.id, (counts.get(m.id) ?? 0) + 1);
    }
    return counts;
  }, [missions]);

  const catalogMissions = useMemo(() => {
    const seen = new Map<string, BoosterCard>();
    for (const m of missions) {
      if (!seen.has(m.id)) seen.set(m.id, m);
    }
    return Array.from(seen.values());
  }, [missions]);

  const matchesRarity = useCallback(
    (c: BoosterCard) => filterRarity === 'all' || c.rarity === filterRarity,
    [filterRarity],
  );

  const matchesGroup = useCallback(
    (c: BoosterCard) => filterGroup === 'all' || c.group === filterGroup,
    [filterGroup],
  );

  const matchesSearch = useCallback(
    (c: BoosterCard) => {
      if (!searchText) return true;
      const search = searchText.toLowerCase();
      return (
        getCardName(c, locale).toLowerCase().includes(search) ||
        (c.name_en ?? '').toLowerCase().includes(search) ||
        c.id.toLowerCase().includes(search)
      );
    },
    [searchText, locale],
  );

  const catalogPredicates = useMemo(
    () => ({ rarity: matchesRarity, group: matchesGroup, search: matchesSearch }),
    [matchesRarity, matchesGroup, matchesSearch],
  );

  const rarityOptions = useMemo(
    () =>
      facetOptions({
        cards: catalogChars,
        predicates: catalogPredicates,
        dimension: 'rarity',
        valueOf: (c) => c.rarity ?? null,
        order: RARITY_ORDER,
      }),
    [catalogChars, catalogPredicates],
  );

  const groupOptions = useMemo(
    () =>
      facetOptions({
        cards: catalogChars,
        predicates: catalogPredicates,
        dimension: 'group',
        valueOf: (c) => c.group ?? null,
      }),
    [catalogChars, catalogPredicates],
  );

  useValidFacetSelection(filterRarity, rarityOptions, 'all', setFilterRarity);
  useValidFacetSelection(filterGroup, groupOptions, 'all', setFilterGroup);

  const filteredCatalog = useMemo(() => {
    return catalogChars
      .filter((c) => matchesRarity(c) && matchesGroup(c) && matchesSearch(c))
      .sort((a, b) => {
        const costDiff = (a.chakra ?? 0) - (b.chakra ?? 0);
        if (costDiff !== 0) return costDiff;
        const parNom = getCardName(a, locale as 'en' | 'fr').localeCompare(getCardName(b, locale as 'en' | 'fr'));
        return parNom !== 0 ? parNom : compareBySetOrder(a, b);
      });
  }, [catalogChars, matchesRarity, matchesGroup, matchesSearch, locale]);

  const deckCardCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of deckChars) {
      counts.set(c.id, (counts.get(c.id) ?? 0) + 1);
    }
    return counts;
  }, [deckChars]);

  const deckMissionInstanceIds = useMemo(() => {
    return new Set(deckMissions.map((m) => m.sealedInstanceId));
  }, [deckMissions]);

  const deckMissionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of deckMissions) {
      counts.set(m.id, (counts.get(m.id) ?? 0) + 1);
    }
    return counts;
  }, [deckMissions]);

  const errors = useMemo(() => {
    const errs: string[] = [];
    if (deckChars.length < MIN_DECK_SIZE) {
      errs.push(t('validation.minChars', { count: deckChars.length, min: MIN_DECK_SIZE }));
    }
    if (deckMissions.length !== MISSION_CARDS_PER_PLAYER) {
      errs.push(t('validation.missions', { count: deckMissions.length, required: MISSION_CARDS_PER_PLAYER }));
    }

    return errs;
  }, [deckChars, deckMissions, t]);

  const isValid = errors.length === 0 && deckChars.length >= MIN_DECK_SIZE && deckMissions.length === MISSION_CARDS_PER_PLAYER;

  const canAddChar = useCallback(
    (card: BoosterCard) => {
      const inDeck = deckCardCounts.get(card.id) ?? 0;
      const inPool = poolAvailability.get(card.id) ?? 0;
      return inDeck < inPool;
    },
    [deckCardCounts, poolAvailability],
  );

  const canAddMission = useCallback(
    (card: BoosterCard) => {
      if (deckMissions.length >= MISSION_CARDS_PER_PLAYER) return false;
      const inDeck = deckMissionCounts.get(card.id) ?? 0;
      const inPool = missionAvailability.get(card.id) ?? 0;
      return inDeck < inPool;
    },
    [deckMissions.length, deckMissionCounts, missionAvailability],
  );

  const addChar = useCallback(
    (card: BoosterCard) => {
      if (!canAddChar(card)) return;
      setDeckChars((prev) => [...prev, card]);
    },
    [canAddChar],
  );

  const removeChar = useCallback((index: number) => {
    setDeckChars((prev) => {
      const next = [...prev];
      next.splice(index, 1);
      return next;
    });
  }, []);

  const addMission = useCallback(
    (card: BoosterCard) => {
      if (!canAddMission(card)) return;
      setDeckMissions((prev) => {
        const used = new Set(prev.map((m) => m.sealedInstanceId));
        const freeCopy = missions.find((m) => m.id === card.id && !used.has(m.sealedInstanceId));
        return freeCopy ? [...prev, freeCopy] : prev;
      });
    },
    [canAddMission, missions],
  );

  const removeMission = useCallback((index: number) => {
    setDeckMissions((prev) => {
      const next = [...prev];
      next.splice(index, 1);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setDeckChars([...characters]);
    setDeckMissions(missions.slice(0, MISSION_CARDS_PER_PLAYER));
  }, [characters, missions]);

  const clearAll = useCallback(() => {
    setDeckChars([]);
    setDeckMissions([]);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!isValid || submitted) return;
    setSubmitted(true);
    onDeckReady(
      deckChars as unknown as CharacterCard[],
      deckMissions as unknown as MissionCard[],
    );
  }, [isValid, submitted, deckChars, deckMissions, onDeckReady]);

  const handleTimeUp = useCallback(() => {
    if (isValid && !submitted) {
      setSubmitted(true);
      onDeckReady(
        deckChars as unknown as CharacterCard[],
        deckMissions as unknown as MissionCard[],
      );
    } else {
      onTimeUp?.();
    }
  }, [isValid, submitted, deckChars, deckMissions, onDeckReady, onTimeUp]);

  const rarityFilters = ['all', ...rarityOptions];

  const rarityColors: Record<string, string> = {
    C: 'var(--t-muted)',
    UC: '#2ecc71',
    R: '#3498db',
    RA: '#9b59b6',
    S: 'var(--t-accent)',
    SV: 'var(--t-accent)',
    M: '#ff4444',
    MV: '#ff4444',
    L: '#ffd700',
    MMS: '#e67e22',
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col" style={{ backgroundColor: 'var(--t-bg)' }}>
      
      <div
        className="flex flex-wrap items-center justify-between px-3 py-2 sm:px-4 sm:py-3 shrink-0 gap-2"
        style={{ backgroundColor: 'var(--t-surface)', borderBottom: '1px solid var(--t-border)' }}
      >
        <div className="flex items-center gap-2 sm:gap-4">
          <h2 className="text-sm sm:text-lg font-bold" style={{ color: 'var(--t-accent)' }}>
            {t('buildDeck')}
          </h2>
          <div className="flex items-center gap-1 sm:gap-2">
            <span className="text-[10px] sm:text-xs" style={{ color: deckChars.length >= MIN_DECK_SIZE ? 'var(--t-success)' : 'var(--t-danger)' }}>
              {deckChars.length}/{MIN_DECK_SIZE}+
            </span>
            <span className="text-[10px] sm:text-xs" style={{ color: 'var(--t-dim)' }}>|</span>
            <span className="text-[10px] sm:text-xs" style={{ color: deckMissions.length === MISSION_CARDS_PER_PLAYER ? 'var(--t-success)' : 'var(--t-danger)' }}>
              {deckMissions.length}/{MISSION_CARDS_PER_PLAYER} M
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {hasTemporaryVariants && (
            <span
              className="text-[9px] sm:text-[10px] tracking-wider uppercase truncate"
              style={{ color: 'var(--t-accent)', maxWidth: 320 }}
              title={t('temporaryVariantTooltip')}
            >
              {t('temporaryVariantsLegend')}
            </span>
          )}
          {isOnline && (
            <SealedTimer
              totalSeconds={timerSeconds}
              onTimeUp={handleTimeUp}
            />
          )}
          <button
            onClick={handleSubmit}
            disabled={!isValid || submitted}
            className="px-6 py-2 text-sm font-bold uppercase tracking-wider rounded cursor-pointer transition-opacity"
            style={{
              backgroundColor: isValid ? 'var(--t-accent)' : 'var(--t-border-strong)',
              color: isValid ? 'var(--t-bg)' : 'var(--t-dim)',
              opacity: submitted ? 0.5 : 1,
            }}
          >
            {submitted ? t('submitted') : t('startGame')}
          </button>
        </div>
      </div>

      <div
        className="shrink-0 px-3 py-1.5 flex items-center gap-3 overflow-x-auto"
        style={{ backgroundColor: 'var(--t-panel)', borderBottom: '1px solid var(--t-border)', minHeight: '36px' }}
      >
        
        {errors.length > 0 ? (
          <span className="text-[10px] shrink-0" style={{ color: 'var(--t-danger)' }}>
            {errors[0]}
          </span>
        ) : (
          <span className="text-[10px] font-bold shrink-0" style={{ color: 'var(--t-success)' }}>
            {t('deckReady')}
          </span>
        )}

        <div className="w-px h-5 shrink-0" style={{ backgroundColor: 'var(--t-border-strong)' }} />

        <span className="text-[9px] font-bold uppercase shrink-0" style={{ color: 'var(--t-accent)' }}>M:</span>
        {deckMissions.map((m, i) => (
          <span
            key={`deck-m-${m.id}-${i}`}
            className="flex items-center gap-1 px-2 py-0.5 rounded shrink-0 cursor-pointer"
            style={{ backgroundColor: 'var(--t-surface-2)', border: '1px solid #e67e2240' }}
          >
            <span className="text-[9px]" style={{ color: 'var(--t-text)' }} onClick={() => setPreviewCard(m)} data-gp="true" role="button" tabIndex={-1}>{getCardName(m, locale)}</span>
            <span className="text-[9px]" style={{ color: 'var(--t-danger)' }} onClick={() => removeMission(i)} data-gp="true" role="button" tabIndex={-1}>x</span>
          </span>
        ))}

        <div className="w-px h-5 shrink-0" style={{ backgroundColor: 'var(--t-border-strong)' }} />

        <span className="text-[9px] font-bold uppercase shrink-0" style={{ color: 'var(--t-muted)' }}>
          {t('characters')}: {deckChars.length}
        </span>
        {[...deckChars]
          .sort((a, b) => {
            const costDiff = a.chakra - b.chakra;
            if (costDiff !== 0) return costDiff;
            return getCardName(a, locale as 'en' | 'fr').localeCompare(getCardName(b, locale as 'en' | 'fr'));
          })
          .map((c, i) => {
            const originalIndex = deckChars.indexOf(c);
            return (
              <span
                key={`deck-c-${c.id}-${i}`}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded shrink-0 cursor-pointer"
                style={{ backgroundColor: 'var(--t-surface-2)', border: `1px solid ${(rarityColors[c.rarity] ?? '#888')}30` }}
              >
                <span className="inline-flex items-center gap-1 text-[9px]" style={{ color: CHAKRA_COLOR }}><ChakraIcon size={10} color={CHAKRA_COLOR} />{c.chakra}</span>
                <span className="text-[9px]" style={{ color: 'var(--t-text)' }} onClick={() => setPreviewCard(c)} data-gp="true" role="button" tabIndex={-1}>{getCardName(c, locale)}</span>
                <span className="text-[9px]" style={{ color: 'var(--t-danger)' }} onClick={() => removeChar(originalIndex)} data-gp="true" role="button" tabIndex={-1}>x</span>
              </span>
            );
          })}
      </div>

      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
        
        <div className="flex-1 overflow-y-auto" style={{ borderRight: '1px solid var(--t-border)', minHeight: 0 }}>
          
          <div className="px-3 py-2 flex flex-wrap items-center gap-2 sticky top-0 z-10" style={{ borderBottom: '1px solid var(--t-surface-2)', backgroundColor: 'var(--t-bg)' }}>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder={t('searchCards')}
              className="px-2 py-1 text-xs rounded w-40"
              style={{ backgroundColor: 'var(--t-surface-2)', border: '1px solid var(--t-border-strong)', color: 'var(--t-text)', outline: 'none' }}
            />
            {isFacetWorthShowing(rarityOptions) && (
              <div className="flex gap-1">
                {rarityFilters.map((r) => (
                  <button
                    key={r}
                    onClick={() => setFilterRarity(r)}
                    className="px-2 py-1 text-[10px] font-bold uppercase rounded cursor-pointer"
                    style={{
                      backgroundColor: filterRarity === r ? (rarityColors[r] ?? 'var(--t-accent)') : 'var(--t-surface-2)',
                      color: filterRarity === r ? '#0a0a0a' : (rarityColors[r] ?? '#888'),
                      border: `1px solid ${filterRarity === r ? 'transparent' : '#333'}`,
                    }}
                  >
                    {r === 'all' ? t('filterAll') : r}
                  </button>
                ))}
              </div>
            )}
            {isFacetWorthShowing(groupOptions) && (
              <select
                value={filterGroup}
                onChange={(e) => setFilterGroup(e.target.value)}
                className="px-2 py-1 text-xs rounded"
                style={{ backgroundColor: 'var(--t-surface-2)', border: '1px solid var(--t-border-strong)', color: 'var(--t-text)', outline: 'none' }}
              >
                <option value="all">{t('allGroups')}</option>
                {groupOptions.map((g) => (
                  <option key={g} value={g}>{getCardGroup(g, tCardMeta)}</option>
                ))}
              </select>
            )}
            <div className="flex gap-1 ml-auto">
              <button
                onClick={selectAll}
                className="px-2 py-1 text-[10px] uppercase rounded cursor-pointer"
                style={{ backgroundColor: 'var(--t-surface-2)', color: 'var(--t-accent)', border: '1px solid var(--t-border-strong)' }}
              >
                {t('selectAllBtn')}
              </button>
              <button
                onClick={clearAll}
                className="px-2 py-1 text-[10px] uppercase rounded cursor-pointer"
                style={{ backgroundColor: 'var(--t-surface-2)', color: 'var(--t-danger)', border: '1px solid var(--t-border-strong)' }}
              >
                {t('clearAllBtn')}
              </button>
            </div>
          </div>

          <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--t-surface-2)' }}>
            <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--t-accent)' }}>
              {t('missionsLabel')} ({deckMissions.length}/{MISSION_CARDS_PER_PLAYER})
            </h3>
            <div className="flex gap-2 flex-wrap">
              {catalogMissions.map((m) => {
                const copiesInDeck = deckMissionCounts.get(m.id) ?? 0;
                const copiesInPool = missionAvailability.get(m.id) ?? 0;
                const inDeck = copiesInDeck > 0;
                const canAdd = canAddMission(m);
                const imgPath = normalizeImagePath(m.image_file);
                return (
                  <motion.div
                    key={m.id}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => { if (canAdd) addMission(m); }}
                    data-gp="true"
                    role="button"
                    tabIndex={-1}
                    className="relative cursor-pointer rounded overflow-hidden"
                    style={{
                      width: '140px',
                      aspectRatio: '3.5/2.5',
                      border: `2px solid ${inDeck ? '#e67e22' : 'var(--t-border-strong)'}`,
                      opacity: !canAdd && !inDeck ? 0.4 : 1,
                    }}
                  >
                    {imgPath ? (
                      <img src={imgPath} alt={getCardName(m, locale)} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
                    ) : (
                      <CardArtFallback card={m} />
                    )}
                    <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
                      <span className="text-[8px] truncate" style={{ color: 'var(--t-text)' }}>{getCardName(m, locale)}</span>
                    </div>
                    <div className="absolute top-1 right-1 px-1 py-0.5 rounded" style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}>
                      <span className="text-[9px] font-bold" style={{ color: inDeck ? '#e67e22' : 'var(--t-dim)' }}>
                        {copiesInDeck}/{copiesInPool}
                      </span>
                    </div>
                    
                    <button
                      className="absolute top-1 left-1 px-1.5 py-0.5 rounded cursor-pointer"
                      style={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid var(--t-dim)' }}
                      onClick={(e) => { e.stopPropagation(); setPreviewCard(m); }}
                    >
                      <span className="text-[7px] font-bold uppercase" style={{ color: 'var(--t-text)' }}>{t('detailBtn')}</span>
                    </button>
                  </motion.div>
                );
              })}
            </div>
          </div>

          <div className="px-3 py-2">
            <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--t-muted)' }}>
              {t('characters')} ({filteredCatalog.length})
            </h3>
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))' }}>
              {filteredCatalog.map((card) => {
                const inDeck = deckCardCounts.get(card.id) ?? 0;
                const inPool = poolAvailability.get(card.id) ?? 0;
                const canAdd = canAddChar(card);
                const imgPath = portraitImagePath(card);
                const rarityColor = rarityColors[card.rarity] ?? '#888';

                return (
                  <motion.div
                    key={card.id}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => addChar(card)}
                    data-gp="true"
                    role="button"
                    tabIndex={-1}
                    className="relative cursor-pointer rounded overflow-hidden"
                    style={{
                      aspectRatio: '5/7',
                      border: `2px solid ${inDeck > 0 ? rarityColor : '#262626'}`,
                      opacity: !canAdd ? 0.3 : 1,
                    }}
                  >
                    {imgPath ? (
                      <img src={imgPath} alt={getCardName(card, locale)} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
                    ) : (
                      <CardArtFallback card={card} />
                    )}

                    <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
                      <div className="flex items-center justify-between">
                        <span className="text-[8px] truncate" style={{ color: 'var(--t-text)' }}>{getCardName(card, locale)}</span>
                        <RarityIcon rarity={card.rarity} size={11} />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="inline-flex items-center gap-0.5 text-[8px]" style={{ color: CHAKRA_COLOR }}><ChakraIcon size={9} color={CHAKRA_COLOR} />{card.chakra}</span>
                        <span className="inline-flex items-center gap-0.5 text-[8px]" style={{ color: POWER_COLOR }}><PowerIcon size={9} color={POWER_COLOR} />{card.power}</span>
                      </div>
                    </div>

                    <div className="absolute top-1 right-1 px-1 py-0.5 rounded" style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}>
                      <span className="text-[9px] font-bold" style={{ color: inDeck > 0 ? rarityColor : '#666' }}>
                        {inDeck}/{inPool}
                      </span>
                    </div>

                    {card.isHolo && !card.isTemporaryVariant && (
                      <div className="absolute top-1 left-1">
                        <span className="text-[7px] px-1 rounded font-bold" style={{ backgroundColor: 'rgba(196,163,90,0.8)', color: 'var(--t-bg)' }}>
                          {t('holo')}
                        </span>
                      </div>
                    )}

                    {card.isTemporaryVariant && (
                      <>
                        <VariantHoloOverlay intensity="subtle" imageUrl={imgPath} />
                        <div className="absolute top-1 left-1 z-10" title={t('temporaryVariantTooltip')}>
                          <span
                            className="font-display text-[9px] px-1 py-0.5 tracking-widest uppercase"
                            style={{
                              backgroundColor: 'rgba(196,163,90,0.85)',
                              color: 'var(--t-bg)',
                              letterSpacing: '0.1em',
                            }}
                          >
                            {t('temporaryVariantTag')}
                          </span>
                        </div>
                      </>
                    )}
                    
                    <button
                      className="absolute bottom-[28px] right-0.5 px-1.5 py-0.5 rounded cursor-pointer"
                      style={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid var(--t-dim)' }}
                      onClick={(e) => { e.stopPropagation(); setPreviewCard(card); }}
                    >
                      <span className="text-[7px] font-bold uppercase" style={{ color: 'var(--t-text)' }}>{t('detailBtn')}</span>
                    </button>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>

        <AnimatePresence>
          {previewCard && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="hidden lg:flex flex-col overflow-hidden shrink-0"
              style={{ backgroundColor: 'var(--t-bg)', borderLeft: '1px solid var(--t-border)' }}
            >
              <div className="flex-1 overflow-y-auto px-3 py-3">
                
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--t-accent)' }}>
                    {t('cardDetail')}
                  </span>
                  <button
                    onClick={() => setPreviewCard(null)}
                    className="w-5 h-5 flex items-center justify-center rounded cursor-pointer"
                    style={{ backgroundColor: 'var(--t-surface-2)', border: '1px solid var(--t-border-strong)' }}
                  >
                    <span className="text-[10px] font-bold" style={{ color: 'var(--t-muted)' }}>x</span>
                  </button>
                </div>

                <div
                  className="relative rounded overflow-hidden mb-3 mx-auto"
                  style={{
                    width: isLandscapeCard(previewCard) ? '100%' : '140px',
                    aspectRatio: isLandscapeCard(previewCard) ? '3.5/2.5' : '5/7',
                  }}
                >
                  {normalizeImagePath(previewCard.image_file) ? (
                    <img
                      src={normalizeImagePath(previewCard.image_file)!}
                      alt={getCardName(previewCard, locale)}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <CardArtFallback card={previewCard} />
                  )}
                </div>

                <div className="text-sm font-bold" style={{ color: 'var(--t-text)' }}>{getCardName(previewCard, locale)}</div>
                {(previewCard.title_fr || previewCard.title_en) && (
                  <div className="text-[11px]" style={{ color: 'var(--t-muted)' }}>{getCardTitle(previewCard, locale)}</div>
                )}

                <div className="flex gap-2 mt-1 flex-wrap">
                  {previewCard.card_type !== 'mission' && (
                    <>
                      <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: CHAKRA_COLOR }}><ChakraIcon size={13} color={CHAKRA_COLOR} />{t('chakra')}: {previewCard.chakra}</span>
                      <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: POWER_COLOR }}><PowerIcon size={13} color={POWER_COLOR} />{t('power')}: {previewCard.power}</span>
                    </>
                  )}
                  <span className="text-[11px] font-bold" style={{ color: rarityColors[previewCard.rarity] ?? '#888' }}>
                    {getRarityLabel(previewCard.rarity, tCardMeta)}
                  </span>
                  {previewCard.group && (
                    <span className="text-[11px]" style={{ color: '#6b8a6b' }}>{getCardGroup(previewCard.group, tCardMeta)}</span>
                  )}
                </div>

                {previewCard.keywords && previewCard.keywords.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {previewCard.keywords.map((kw: string, i: number) => (
                      <span
                        key={i}
                        className="text-[9px] px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: 'var(--t-surface-2)', color: 'var(--t-muted)', border: '1px solid #2a2a3e' }}
                      >
                        {getCardKeyword(kw, tCardMeta)}
                      </span>
                    ))}
                  </div>
                )}

                {previewCard.effects?.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1.5">
                    {previewCard.effects.map((eff: { type: string; description: string }, i: number) => {
                      const description = getCardEffectDescription(previewCard.id, i, locale, eff.description);
                      return (
                        <div key={i}>
                          <span className="text-[10px] font-bold" style={{ color: 'var(--t-accent)' }}>{eff.type}</span>
                          <div className="text-[10px] leading-snug" style={{ color: 'var(--t-text)' }}>{description}</div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {previewCard.card_type === 'mission' ? (
                  <button
                    onClick={() => {
                      if (deckMissionInstanceIds.has(previewCard.sealedInstanceId)) {
                        const idx = deckMissions.findIndex((m) => m.sealedInstanceId === previewCard.sealedInstanceId);
                        if (idx >= 0) removeMission(idx);
                      } else {
                        addMission(previewCard);
                      }
                    }}
                    className="mt-3 w-full py-1.5 text-xs font-bold uppercase rounded cursor-pointer"
                    style={{
                      backgroundColor: deckMissionInstanceIds.has(previewCard.sealedInstanceId) ? '#2a1a1a' : '#1a2a1a',
                      color: deckMissionInstanceIds.has(previewCard.sealedInstanceId) ? 'var(--t-danger)' : 'var(--t-success)',
                      border: `1px solid ${deckMissionInstanceIds.has(previewCard.sealedInstanceId) ? '#4a2a2a' : '#2a4a2a'}`,
                    }}
                  >
                    {deckMissionInstanceIds.has(previewCard.sealedInstanceId) ? t('removeFromDeck') : t('addToDeck')}
                  </button>
                ) : (
                  <button
                    onClick={() => addChar(previewCard)}
                    disabled={!canAddChar(previewCard)}
                    className="mt-3 w-full py-1.5 text-xs font-bold uppercase rounded cursor-pointer"
                    style={{
                      backgroundColor: canAddChar(previewCard) ? '#1a2a1a' : 'var(--t-surface-2)',
                      color: canAddChar(previewCard) ? 'var(--t-success)' : 'var(--t-dim)',
                      border: `1px solid ${canAddChar(previewCard) ? '#2a4a2a' : 'var(--t-border-strong)'}`,
                    }}
                  >
                    {t('addToDeck')}
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {previewCard && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.2 }}
            className="lg:hidden fixed bottom-0 left-0 right-0 z-50 overflow-y-auto"
            style={{ backgroundColor: 'var(--t-bg)', maxHeight: '60vh' }}
          >
            <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--t-accent)' }}>
                  {t('cardDetail')}
                </span>
                <button
                  onClick={() => setPreviewCard(null)}
                  className="px-3 py-1 rounded cursor-pointer"
                  style={{ backgroundColor: 'var(--t-surface-2)', border: '1px solid var(--t-border-strong)' }}
                >
                  <span className="text-xs font-bold" style={{ color: 'var(--t-muted)' }}>x</span>
                </button>
              </div>

              <div className="flex gap-3">
                
                <div
                  className="relative rounded overflow-hidden shrink-0"
                  style={{
                    width: isLandscapeCard(previewCard) ? '140px' : '90px',
                    aspectRatio: isLandscapeCard(previewCard) ? '3.5/2.5' : '5/7',
                  }}
                >
                  {normalizeImagePath(previewCard.image_file) ? (
                    <img
                      src={normalizeImagePath(previewCard.image_file)!}
                      alt={getCardName(previewCard, locale)}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <CardArtFallback card={previewCard} />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold" style={{ color: 'var(--t-text)' }}>{getCardName(previewCard, locale)}</div>
                  {(previewCard.title_fr || previewCard.title_en) && (
                    <div className="text-[11px]" style={{ color: 'var(--t-muted)' }}>{getCardTitle(previewCard, locale)}</div>
                  )}
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {previewCard.card_type !== 'mission' && (
                      <>
                        <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: CHAKRA_COLOR }}><ChakraIcon size={13} color={CHAKRA_COLOR} />{t('chakra')}: {previewCard.chakra}</span>
                        <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: POWER_COLOR }}><PowerIcon size={13} color={POWER_COLOR} />{t('power')}: {previewCard.power}</span>
                      </>
                    )}
                    <span className="text-[11px] font-bold" style={{ color: rarityColors[previewCard.rarity] ?? '#888' }}>
                      {getRarityLabel(previewCard.rarity, tCardMeta)}
                    </span>
                    {previewCard.group && (
                      <span className="text-[11px]" style={{ color: '#6b8a6b' }}>{getCardGroup(previewCard.group, tCardMeta)}</span>
                    )}
                  </div>
                  {previewCard.keywords && previewCard.keywords.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {previewCard.keywords.map((kw: string, i: number) => (
                        <span key={i} className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--t-surface-2)', color: 'var(--t-muted)', border: '1px solid #2a2a3e' }}>
                          {getCardKeyword(kw, tCardMeta)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {previewCard.effects?.length > 0 && (
                <div className="mt-2 flex flex-col gap-1.5">
                  {previewCard.effects.map((eff: { type: string; description: string }, i: number) => {
                    const description = getCardEffectDescription(previewCard.id, i, locale, eff.description);
                    return (
                      <div key={i}>
                        <span className="text-[10px] font-bold" style={{ color: 'var(--t-accent)' }}>{eff.type}</span>
                        <div className="text-[10px] leading-snug" style={{ color: 'var(--t-text)' }}>{description}</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {previewCard.card_type === 'mission' ? (
                <button
                  onClick={() => {
                    if (deckMissionInstanceIds.has(previewCard.sealedInstanceId)) {
                      const idx = deckMissions.findIndex((m) => m.sealedInstanceId === previewCard.sealedInstanceId);
                      if (idx >= 0) removeMission(idx);
                    } else {
                      addMission(previewCard);
                    }
                  }}
                  className="mt-2 w-full py-1.5 text-xs font-bold uppercase rounded cursor-pointer"
                  style={{
                    backgroundColor: deckMissionInstanceIds.has(previewCard.sealedInstanceId) ? '#2a1a1a' : '#1a2a1a',
                    color: deckMissionInstanceIds.has(previewCard.sealedInstanceId) ? 'var(--t-danger)' : 'var(--t-success)',
                    border: `1px solid ${deckMissionInstanceIds.has(previewCard.sealedInstanceId) ? '#4a2a2a' : '#2a4a2a'}`,
                  }}
                >
                  {deckMissionInstanceIds.has(previewCard.sealedInstanceId) ? t('removeFromDeck') : t('addToDeck')}
                </button>
              ) : (
                <button
                  onClick={() => addChar(previewCard)}
                  disabled={!canAddChar(previewCard)}
                  className="mt-2 w-full py-1.5 text-xs font-bold uppercase rounded cursor-pointer"
                  style={{
                    backgroundColor: canAddChar(previewCard) ? '#1a2a1a' : 'var(--t-surface-2)',
                    color: canAddChar(previewCard) ? 'var(--t-success)' : 'var(--t-dim)',
                    border: `1px solid ${canAddChar(previewCard) ? '#2a4a2a' : 'var(--t-border-strong)'}`,
                  }}
                >
                  {t('addToDeck')}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <LandscapeBlocker />
    </div>
  );
}
