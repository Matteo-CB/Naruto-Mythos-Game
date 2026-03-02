'use client';

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations, useLocale } from 'next-intl';
import type { BoosterCard } from '@/lib/sealed/boosterGenerator';
import type { CharacterCard, MissionCard } from '@/lib/engine/types';
import { MIN_DECK_SIZE, MAX_COPIES_PER_VERSION, MISSION_CARDS_PER_PLAYER } from '@/lib/engine/types';
import { normalizeImagePath } from '@/lib/utils/imagePath';
import { getCardName, getCardTitle, getCardGroup, getCardKeyword, getRarityLabel } from '@/lib/utils/cardLocale';
import { effectDescriptionsEn } from '@/lib/data/effectDescriptionsEn';
import { effectDescriptionsFr } from '@/lib/data/effectTranslationsFr';
import { LandscapeBlocker } from '@/components/LandscapeBlocker';
import { SealedTimer } from './SealedTimer';

interface SealedDeckBuilderProps {
  pool: BoosterCard[];
  isOnline: boolean;
  timerSeconds?: number;
  onDeckReady: (characters: CharacterCard[], missions: MissionCard[]) => void;
  onTimeUp?: () => void;
}

type FilterRarity = 'all' | 'C' | 'UC' | 'R' | 'RA' | 'S' | 'M' | 'MMS';

/** Normalize card ID for version comparison (RA variants = same version) */
function getVersionKey(card: BoosterCard): string {
  return card.id.replace(/\s*A$/, '').trim();
}

export function SealedDeckBuilder({
  pool,
  isOnline,
  timerSeconds = 900,
  onDeckReady,
  onTimeUp,
}: SealedDeckBuilderProps) {
  const t = useTranslations('sealed');
  const locale = useLocale() as 'en' | 'fr';

  // Deck state — arrays, like the site's deck builder
  const [deckChars, setDeckChars] = useState<BoosterCard[]>([]);
  const [deckMissions, setDeckMissions] = useState<BoosterCard[]>([]);

  // UI state
  const [filterRarity, setFilterRarity] = useState<FilterRarity>('all');
  const [filterGroup, setFilterGroup] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [previewCard, setPreviewCard] = useState<BoosterCard | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Separate pool into characters and missions
  const { characters, missions } = useMemo(() => {
    const chars: BoosterCard[] = [];
    const miss: BoosterCard[] = [];
    for (const card of pool) {
      if (card.card_type === 'mission') miss.push(card);
      else chars.push(card);
    }
    return { characters: chars, missions: miss };
  }, [pool]);

  // Pool availability: how many copies of each version are available
  const poolAvailability = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of characters) {
      const key = getVersionKey(c);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [characters]);

  // Deduplicated catalog: one representative card per version
  const catalogChars = useMemo(() => {
    const seen = new Map<string, BoosterCard>();
    for (const c of characters) {
      const key = getVersionKey(c);
      if (!seen.has(key)) seen.set(key, c);
    }
    return Array.from(seen.values());
  }, [characters]);

  // Mission availability: how many of each mission in pool
  const missionAvailability = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of missions) {
      counts.set(m.id, (counts.get(m.id) ?? 0) + 1);
    }
    return counts;
  }, [missions]);

  // Deduplicated missions catalog
  const catalogMissions = useMemo(() => {
    const seen = new Map<string, BoosterCard>();
    for (const m of missions) {
      if (!seen.has(m.id)) seen.set(m.id, m);
    }
    return Array.from(seen.values());
  }, [missions]);

  // Groups from pool
  const availableGroups = useMemo(() => {
    const groups = new Set<string>();
    for (const c of catalogChars) {
      if (c.group) groups.add(c.group);
    }
    return Array.from(groups).sort();
  }, [catalogChars]);

  // Filter catalog characters and sort by chakra cost
  const filteredCatalog = useMemo(() => {
    return catalogChars
      .filter((c) => {
        if (filterRarity !== 'all' && c.rarity !== filterRarity) return false;
        if (filterGroup !== 'all' && c.group !== filterGroup) return false;
        if (searchText) {
          const search = searchText.toLowerCase();
          if (
            !getCardName(c, locale).toLowerCase().includes(search) &&
            !(c.name_en ?? '').toLowerCase().includes(search) &&
            !c.id.toLowerCase().includes(search)
          ) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => (a.chakra ?? 0) - (b.chakra ?? 0));
  }, [catalogChars, filterRarity, filterGroup, searchText]);

  // Count characters in deck by version key
  const deckVersionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of deckChars) {
      const key = getVersionKey(c);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [deckChars]);

  // Count missions in deck by ID
  const deckMissionIds = useMemo(() => {
    return new Set(deckMissions.map((m) => m.id));
  }, [deckMissions]);

  // Validation
  const errors = useMemo(() => {
    const errs: string[] = [];
    if (deckChars.length < MIN_DECK_SIZE) {
      errs.push(t('validation.minChars', { count: deckChars.length, min: MIN_DECK_SIZE }));
    }
    if (deckMissions.length !== MISSION_CARDS_PER_PLAYER) {
      errs.push(t('validation.missions', { count: deckMissions.length, required: MISSION_CARDS_PER_PLAYER }));
    }
    for (const [version, count] of deckVersionCounts) {
      if (count > MAX_COPIES_PER_VERSION) {
        errs.push(t('validation.maxCopies', { version, count, max: MAX_COPIES_PER_VERSION }));
      }
    }
    return errs;
  }, [deckChars, deckMissions, deckVersionCounts, t]);

  const isValid = errors.length === 0 && deckChars.length >= MIN_DECK_SIZE && deckMissions.length === MISSION_CARDS_PER_PLAYER;

  // Can add this character to the deck?
  const canAddChar = useCallback(
    (card: BoosterCard) => {
      const key = getVersionKey(card);
      const inDeck = deckVersionCounts.get(key) ?? 0;
      const inPool = poolAvailability.get(key) ?? 0;
      return inDeck < MAX_COPIES_PER_VERSION && inDeck < inPool;
    },
    [deckVersionCounts, poolAvailability],
  );

  // Can add this mission to the deck?
  const canAddMission = useCallback(
    (card: BoosterCard) => {
      if (deckMissions.length >= MISSION_CARDS_PER_PLAYER) return false;
      return !deckMissionIds.has(card.id);
    },
    [deckMissions.length, deckMissionIds],
  );

  // Add character to deck
  const addChar = useCallback(
    (card: BoosterCard) => {
      if (!canAddChar(card)) return;
      setDeckChars((prev) => [...prev, card]);
    },
    [canAddChar],
  );

  // Remove character from deck by index
  const removeChar = useCallback((index: number) => {
    setDeckChars((prev) => {
      const next = [...prev];
      next.splice(index, 1);
      return next;
    });
  }, []);

  // Add mission to deck
  const addMission = useCallback(
    (card: BoosterCard) => {
      if (!canAddMission(card)) return;
      setDeckMissions((prev) => [...prev, card]);
    },
    [canAddMission],
  );

  // Remove mission from deck by index
  const removeMission = useCallback((index: number) => {
    setDeckMissions((prev) => {
      const next = [...prev];
      next.splice(index, 1);
      return next;
    });
  }, []);

  // Select all (respecting limits)
  const selectAll = useCallback(() => {
    const chars: BoosterCard[] = [];
    const counts = new Map<string, number>();
    for (const c of characters) {
      const key = getVersionKey(c);
      const count = counts.get(key) ?? 0;
      if (count < MAX_COPIES_PER_VERSION) {
        chars.push(c);
        counts.set(key, count + 1);
      }
    }
    setDeckChars(chars);

    // Select first 3 unique missions
    const miss: BoosterCard[] = [];
    const mIds = new Set<string>();
    for (const m of missions) {
      if (miss.length >= MISSION_CARDS_PER_PLAYER) break;
      if (!mIds.has(m.id)) {
        miss.push(m);
        mIds.add(m.id);
      }
    }
    setDeckMissions(miss);
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

  const rarityFilters: FilterRarity[] = ['all', 'C', 'UC', 'R', 'RA', 'S', 'M', 'MMS'];

  const rarityColors: Record<string, string> = {
    C: '#888888',
    UC: '#2ecc71',
    R: '#3498db',
    RA: '#9b59b6',
    S: '#c4a35a',
    SV: '#c4a35a',
    M: '#ff4444',
    MV: '#ff4444',
    L: '#ffd700',
    MMS: '#e67e22',
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col" style={{ backgroundColor: '#0a0a0a' }}>
      {/* Header */}
      <div
        className="flex flex-wrap items-center justify-between px-3 py-2 sm:px-4 sm:py-3 shrink-0 gap-2"
        style={{ backgroundColor: '#141414', borderBottom: '1px solid #262626' }}
      >
        <div className="flex items-center gap-2 sm:gap-4">
          <h2 className="text-sm sm:text-lg font-bold" style={{ color: '#c4a35a' }}>
            {t('buildDeck')}
          </h2>
          <div className="flex items-center gap-1 sm:gap-2">
            <span className="text-[10px] sm:text-xs" style={{ color: deckChars.length >= MIN_DECK_SIZE ? '#3e8b3e' : '#b33e3e' }}>
              {deckChars.length}/{MIN_DECK_SIZE}+
            </span>
            <span className="text-[10px] sm:text-xs" style={{ color: '#555' }}>|</span>
            <span className="text-[10px] sm:text-xs" style={{ color: deckMissions.length === MISSION_CARDS_PER_PLAYER ? '#3e8b3e' : '#b33e3e' }}>
              {deckMissions.length}/{MISSION_CARDS_PER_PLAYER} M
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
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
              backgroundColor: isValid ? '#c4a35a' : '#333333',
              color: isValid ? '#0a0a0a' : '#666666',
              opacity: submitted ? 0.5 : 1,
            }}
          >
            {submitted ? t('submitted') : t('startGame')}
          </button>
        </div>
      </div>

      {/* Deck selection bar — always visible above the pool */}
      <div
        className="shrink-0 px-3 py-1.5 flex items-center gap-3 overflow-x-auto"
        style={{ backgroundColor: '#111', borderBottom: '1px solid #262626', minHeight: '36px' }}
      >
        {/* Validation */}
        {errors.length > 0 ? (
          <span className="text-[10px] shrink-0" style={{ color: '#b33e3e' }}>
            {errors[0]}
          </span>
        ) : (
          <span className="text-[10px] font-bold shrink-0" style={{ color: '#3e8b3e' }}>
            {t('deckReady')}
          </span>
        )}

        <div className="w-px h-5 shrink-0" style={{ backgroundColor: '#333' }} />

        {/* Mission chips */}
        <span className="text-[9px] font-bold uppercase shrink-0" style={{ color: '#e67e22' }}>M:</span>
        {deckMissions.map((m, i) => (
          <span
            key={`deck-m-${m.id}-${i}`}
            className="flex items-center gap-1 px-2 py-0.5 rounded shrink-0 cursor-pointer"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #e67e2240' }}
          >
            <span className="text-[9px]" style={{ color: '#e0e0e0' }} onClick={() => setPreviewCard(m)}>{getCardName(m, locale)}</span>
            <span className="text-[9px]" style={{ color: '#b33e3e' }} onClick={() => removeMission(i)}>x</span>
          </span>
        ))}

        <div className="w-px h-5 shrink-0" style={{ backgroundColor: '#333' }} />

        {/* Character chips */}
        <span className="text-[9px] font-bold uppercase shrink-0" style={{ color: '#888' }}>
          {t('characters')}: {deckChars.length}
        </span>
        {[...deckChars]
          .sort((a, b) => a.chakra - b.chakra)
          .map((c, i) => {
            const originalIndex = deckChars.indexOf(c);
            return (
              <span
                key={`deck-c-${c.id}-${i}`}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded shrink-0 cursor-pointer"
                style={{ backgroundColor: '#1a1a1a', border: `1px solid ${(rarityColors[c.rarity] ?? '#888')}30` }}
              >
                <span className="text-[9px]" style={{ color: '#5865F2' }}>{c.chakra}</span>
                <span className="text-[9px]" style={{ color: '#e0e0e0' }} onClick={() => setPreviewCard(c)}>{getCardName(c, locale)}</span>
                <span className="text-[9px]" style={{ color: '#b33e3e' }} onClick={() => removeChar(originalIndex)}>x</span>
              </span>
            );
          })}
      </div>

      {/* Main content */}
      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
        {/* Left: Pool catalog — single scroll area */}
        <div className="flex-1 overflow-y-auto" style={{ borderRight: '1px solid #262626', minHeight: 0 }}>
          {/* Filters */}
          <div className="px-3 py-2 flex flex-wrap items-center gap-2 sticky top-0 z-10" style={{ borderBottom: '1px solid #1a1a1a', backgroundColor: '#0a0a0a' }}>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder={t('searchCards')}
              className="px-2 py-1 text-xs rounded w-40"
              style={{ backgroundColor: '#1a1a1a', border: '1px solid #333', color: '#e0e0e0', outline: 'none' }}
            />
            <div className="flex gap-1">
              {rarityFilters.map((r) => (
                <button
                  key={r}
                  onClick={() => setFilterRarity(r)}
                  className="px-2 py-1 text-[10px] font-bold uppercase rounded cursor-pointer"
                  style={{
                    backgroundColor: filterRarity === r ? (rarityColors[r] ?? '#c4a35a') : '#1a1a1a',
                    color: filterRarity === r ? '#0a0a0a' : (rarityColors[r] ?? '#888'),
                    border: `1px solid ${filterRarity === r ? 'transparent' : '#333'}`,
                  }}
                >
                  {r === 'all' ? t('filterAll') : r}
                </button>
              ))}
            </div>
            {availableGroups.length > 1 && (
              <select
                value={filterGroup}
                onChange={(e) => setFilterGroup(e.target.value)}
                className="px-2 py-1 text-xs rounded"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #333', color: '#e0e0e0', outline: 'none' }}
              >
                <option value="all">{t('allGroups')}</option>
                {availableGroups.map((g) => (
                  <option key={g} value={g}>{getCardGroup(g, locale)}</option>
                ))}
              </select>
            )}
            <div className="flex gap-1 ml-auto">
              <button
                onClick={selectAll}
                className="px-2 py-1 text-[10px] uppercase rounded cursor-pointer"
                style={{ backgroundColor: '#1a1a2e', color: '#c4a35a', border: '1px solid #333' }}
              >
                {t('selectAllBtn')}
              </button>
              <button
                onClick={clearAll}
                className="px-2 py-1 text-[10px] uppercase rounded cursor-pointer"
                style={{ backgroundColor: '#1a1a1a', color: '#b33e3e', border: '1px solid #333' }}
              >
                {t('clearAllBtn')}
              </button>
            </div>
          </div>

          {/* Missions section */}
          <div className="px-3 py-2" style={{ borderBottom: '1px solid #1a1a1a' }}>
            <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#e67e22' }}>
              {t('missionsLabel')} ({deckMissions.length}/{MISSION_CARDS_PER_PLAYER})
            </h3>
            <div className="flex gap-2 flex-wrap">
              {catalogMissions.map((m) => {
                const inDeck = deckMissionIds.has(m.id);
                const canAdd = canAddMission(m);
                const imgPath = normalizeImagePath(m.image_file);
                return (
                  <motion.div
                    key={m.id}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => { if (canAdd) addMission(m); }}
                    className="relative cursor-pointer rounded overflow-hidden"
                    style={{
                      width: '140px',
                      aspectRatio: '3.5/2.5',
                      border: `2px solid ${inDeck ? '#e67e22' : '#333'}`,
                      opacity: !canAdd && !inDeck ? 0.4 : 1,
                    }}
                  >
                    {imgPath ? (
                      <img src={imgPath} alt={getCardName(m, locale)} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#1a1a1a' }}>
                        <span className="text-[9px] text-center px-1" style={{ color: '#888' }}>{getCardName(m, locale)}</span>
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
                      <span className="text-[8px] truncate" style={{ color: '#e0e0e0' }}>{getCardName(m, locale)}</span>
                    </div>
                    {inDeck && (
                      <div className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: '#e67e22' }}>
                        <span className="text-[10px] font-bold" style={{ color: '#0a0a0a' }}>+</span>
                      </div>
                    )}
                    {/* Detail button */}
                    <button
                      className="absolute top-1 left-1 px-1.5 py-0.5 rounded cursor-pointer"
                      style={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid #666' }}
                      onClick={(e) => { e.stopPropagation(); setPreviewCard(m); }}
                    >
                      <span className="text-[7px] font-bold uppercase" style={{ color: '#e0e0e0' }}>{t('detailBtn')}</span>
                    </button>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Character cards grid (deduplicated catalog) */}
          <div className="px-3 py-2">
            <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#888' }}>
              {t('characters')} ({filteredCatalog.length})
            </h3>
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))' }}>
              {filteredCatalog.map((card) => {
                const key = getVersionKey(card);
                const inDeck = deckVersionCounts.get(key) ?? 0;
                const inPool = poolAvailability.get(key) ?? 0;
                const canAdd = canAddChar(card);
                const imgPath = normalizeImagePath(card.image_file);
                const rarityColor = rarityColors[card.rarity] ?? '#888';

                return (
                  <motion.div
                    key={key}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => addChar(card)}
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
                      <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#1a1a1a' }}>
                        <span className="text-[9px] text-center px-1" style={{ color: '#888' }}>{getCardName(card, locale)}</span>
                      </div>
                    )}

                    {/* Card info overlay */}
                    <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
                      <div className="flex items-center justify-between">
                        <span className="text-[8px] truncate" style={{ color: '#e0e0e0' }}>{getCardName(card, locale)}</span>
                        <span className="text-[8px] font-bold" style={{ color: rarityColor }}>{card.rarity}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[8px]" style={{ color: '#5865F2' }}>C{card.chakra}</span>
                        <span className="text-[8px]" style={{ color: '#b33e3e' }}>P{card.power}</span>
                      </div>
                    </div>

                    {/* Count badge: inDeck / available */}
                    <div className="absolute top-1 right-1 px-1 py-0.5 rounded" style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}>
                      <span className="text-[9px] font-bold" style={{ color: inDeck > 0 ? rarityColor : '#666' }}>
                        {inDeck}/{inPool}
                      </span>
                    </div>

                    {/* Holo badge */}
                    {card.isHolo && (
                      <div className="absolute top-1 left-1">
                        <span className="text-[7px] px-1 rounded font-bold" style={{ backgroundColor: 'rgba(196,163,90,0.8)', color: '#0a0a0a' }}>
                          {t('holo')}
                        </span>
                      </div>
                    )}
                    {/* Detail button */}
                    <button
                      className="absolute bottom-[28px] right-0.5 px-1.5 py-0.5 rounded cursor-pointer"
                      style={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid #666' }}
                      onClick={(e) => { e.stopPropagation(); setPreviewCard(card); }}
                    >
                      <span className="text-[7px] font-bold uppercase" style={{ color: '#e0e0e0' }}>{t('detailBtn')}</span>
                    </button>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Card detail panel only */}
        <AnimatePresence>
          {previewCard && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="hidden lg:flex flex-col overflow-hidden shrink-0"
              style={{ backgroundColor: '#0d0d0d', borderLeft: '1px solid #262626' }}
            >
              <div className="flex-1 overflow-y-auto px-3 py-3">
                {/* Header with close button */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#c4a35a' }}>
                    {t('cardDetail')}
                  </span>
                  <button
                    onClick={() => setPreviewCard(null)}
                    className="w-5 h-5 flex items-center justify-center rounded cursor-pointer"
                    style={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                  >
                    <span className="text-[10px] font-bold" style={{ color: '#888' }}>x</span>
                  </button>
                </div>

                {/* Card image */}
                <div
                  className="relative rounded overflow-hidden mb-3 mx-auto"
                  style={{
                    width: previewCard.card_type === 'mission' ? '100%' : '140px',
                    aspectRatio: previewCard.card_type === 'mission' ? '3.5/2.5' : '5/7',
                  }}
                >
                  {normalizeImagePath(previewCard.image_file) ? (
                    <img
                      src={normalizeImagePath(previewCard.image_file)!}
                      alt={getCardName(previewCard, locale)}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#1a1a1a' }}>
                      <span className="text-xs" style={{ color: '#888' }}>{getCardName(previewCard, locale)}</span>
                    </div>
                  )}
                </div>

                {/* Card info */}
                <div className="text-sm font-bold" style={{ color: '#e0e0e0' }}>{getCardName(previewCard, locale)}</div>
                {(previewCard.title_fr || previewCard.title_en) && (
                  <div className="text-[11px]" style={{ color: '#888' }}>{getCardTitle(previewCard, locale)}</div>
                )}

                {/* Stats row */}
                <div className="flex gap-2 mt-1 flex-wrap">
                  {previewCard.card_type !== 'mission' && (
                    <>
                      <span className="text-[11px]" style={{ color: '#5865F2' }}>{t('chakra')}: {previewCard.chakra}</span>
                      <span className="text-[11px]" style={{ color: '#b33e3e' }}>{t('power')}: {previewCard.power}</span>
                    </>
                  )}
                  <span className="text-[11px] font-bold" style={{ color: rarityColors[previewCard.rarity] ?? '#888' }}>
                    {getRarityLabel(previewCard.rarity, locale)}
                  </span>
                  {previewCard.group && (
                    <span className="text-[11px]" style={{ color: '#6b8a6b' }}>{getCardGroup(previewCard.group, locale)}</span>
                  )}
                </div>

                {/* Keywords */}
                {previewCard.keywords && previewCard.keywords.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {previewCard.keywords.map((kw: string, i: number) => (
                      <span
                        key={i}
                        className="text-[9px] px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: '#1a1a2e', color: '#9999bb', border: '1px solid #2a2a3e' }}
                      >
                        {getCardKeyword(kw, locale)}
                      </span>
                    ))}
                  </div>
                )}

                {/* Effects */}
                {previewCard.effects?.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1.5">
                    {previewCard.effects.map((eff: { type: string; description: string }, i: number) => {
                      const raFallbackId = previewCard.id.endsWith('-RA') ? previewCard.id.replace('-RA', '-R') : undefined;
                      const frDescs = effectDescriptionsFr[previewCard.id] ?? (raFallbackId ? effectDescriptionsFr[raFallbackId] : undefined);
                      const enDescs = effectDescriptionsEn[previewCard.id] ?? (raFallbackId ? effectDescriptionsEn[raFallbackId] : undefined);
                      const description = locale === 'fr'
                        ? (frDescs?.[i] ?? eff.description)
                        : (enDescs?.[i] ?? eff.description);
                      return (
                        <div key={i}>
                          <span className="text-[10px] font-bold" style={{ color: '#c4a35a' }}>{eff.type}</span>
                          <div className="text-[10px] leading-snug" style={{ color: '#ccc' }}>{description}</div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Add/Remove button */}
                {previewCard.card_type === 'mission' ? (
                  <button
                    onClick={() => {
                      if (deckMissionIds.has(previewCard.id)) {
                        const idx = deckMissions.findIndex((m) => m.id === previewCard.id);
                        if (idx >= 0) removeMission(idx);
                      } else {
                        addMission(previewCard);
                      }
                    }}
                    className="mt-3 w-full py-1.5 text-xs font-bold uppercase rounded cursor-pointer"
                    style={{
                      backgroundColor: deckMissionIds.has(previewCard.id) ? '#2a1a1a' : '#1a2a1a',
                      color: deckMissionIds.has(previewCard.id) ? '#b33e3e' : '#3e8b3e',
                      border: `1px solid ${deckMissionIds.has(previewCard.id) ? '#4a2a2a' : '#2a4a2a'}`,
                    }}
                  >
                    {deckMissionIds.has(previewCard.id) ? t('removeFromDeck') : t('addToDeck')}
                  </button>
                ) : (
                  <button
                    onClick={() => addChar(previewCard)}
                    disabled={!canAddChar(previewCard)}
                    className="mt-3 w-full py-1.5 text-xs font-bold uppercase rounded cursor-pointer"
                    style={{
                      backgroundColor: canAddChar(previewCard) ? '#1a2a1a' : '#1a1a1a',
                      color: canAddChar(previewCard) ? '#3e8b3e' : '#555',
                      border: `1px solid ${canAddChar(previewCard) ? '#2a4a2a' : '#333'}`,
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

      {/* Mobile detail drawer */}
      <AnimatePresence>
        {previewCard && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.2 }}
            className="lg:hidden fixed bottom-0 left-0 right-0 z-50 overflow-y-auto"
            style={{ backgroundColor: '#0d0d0d', borderTop: '2px solid #c4a35a', maxHeight: '60vh' }}
          >
            <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#c4a35a' }}>
                  {t('cardDetail')}
                </span>
                <button
                  onClick={() => setPreviewCard(null)}
                  className="px-3 py-1 rounded cursor-pointer"
                  style={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                >
                  <span className="text-xs font-bold" style={{ color: '#888' }}>x</span>
                </button>
              </div>

              <div className="flex gap-3">
                {/* Image */}
                <div
                  className="relative rounded overflow-hidden shrink-0"
                  style={{
                    width: previewCard.card_type === 'mission' ? '140px' : '90px',
                    aspectRatio: previewCard.card_type === 'mission' ? '3.5/2.5' : '5/7',
                  }}
                >
                  {normalizeImagePath(previewCard.image_file) ? (
                    <img
                      src={normalizeImagePath(previewCard.image_file)!}
                      alt={getCardName(previewCard, locale)}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#1a1a1a' }}>
                      <span className="text-xs" style={{ color: '#888' }}>{getCardName(previewCard, locale)}</span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold" style={{ color: '#e0e0e0' }}>{getCardName(previewCard, locale)}</div>
                  {(previewCard.title_fr || previewCard.title_en) && (
                    <div className="text-[11px]" style={{ color: '#888' }}>{getCardTitle(previewCard, locale)}</div>
                  )}
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {previewCard.card_type !== 'mission' && (
                      <>
                        <span className="text-[11px]" style={{ color: '#5865F2' }}>{t('chakra')}: {previewCard.chakra}</span>
                        <span className="text-[11px]" style={{ color: '#b33e3e' }}>{t('power')}: {previewCard.power}</span>
                      </>
                    )}
                    <span className="text-[11px] font-bold" style={{ color: rarityColors[previewCard.rarity] ?? '#888' }}>
                      {getRarityLabel(previewCard.rarity, locale)}
                    </span>
                    {previewCard.group && (
                      <span className="text-[11px]" style={{ color: '#6b8a6b' }}>{getCardGroup(previewCard.group, locale)}</span>
                    )}
                  </div>
                  {previewCard.keywords && previewCard.keywords.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {previewCard.keywords.map((kw: string, i: number) => (
                        <span key={i} className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: '#1a1a2e', color: '#9999bb', border: '1px solid #2a2a3e' }}>
                          {getCardKeyword(kw, locale)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Effects */}
              {previewCard.effects?.length > 0 && (
                <div className="mt-2 flex flex-col gap-1.5">
                  {previewCard.effects.map((eff: { type: string; description: string }, i: number) => {
                    const raFallbackId = previewCard.id.endsWith('-RA') ? previewCard.id.replace('-RA', '-R') : undefined;
                    const frDescs = effectDescriptionsFr[previewCard.id] ?? (raFallbackId ? effectDescriptionsFr[raFallbackId] : undefined);
                    const enDescs = effectDescriptionsEn[previewCard.id] ?? (raFallbackId ? effectDescriptionsEn[raFallbackId] : undefined);
                    const description = locale === 'fr'
                      ? (frDescs?.[i] ?? eff.description)
                      : (enDescs?.[i] ?? eff.description);
                    return (
                      <div key={i}>
                        <span className="text-[10px] font-bold" style={{ color: '#c4a35a' }}>{eff.type}</span>
                        <div className="text-[10px] leading-snug" style={{ color: '#ccc' }}>{description}</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add/Remove */}
              {previewCard.card_type === 'mission' ? (
                <button
                  onClick={() => {
                    if (deckMissionIds.has(previewCard.id)) {
                      const idx = deckMissions.findIndex((m) => m.id === previewCard.id);
                      if (idx >= 0) removeMission(idx);
                    } else {
                      addMission(previewCard);
                    }
                  }}
                  className="mt-2 w-full py-1.5 text-xs font-bold uppercase rounded cursor-pointer"
                  style={{
                    backgroundColor: deckMissionIds.has(previewCard.id) ? '#2a1a1a' : '#1a2a1a',
                    color: deckMissionIds.has(previewCard.id) ? '#b33e3e' : '#3e8b3e',
                    border: `1px solid ${deckMissionIds.has(previewCard.id) ? '#4a2a2a' : '#2a4a2a'}`,
                  }}
                >
                  {deckMissionIds.has(previewCard.id) ? t('removeFromDeck') : t('addToDeck')}
                </button>
              ) : (
                <button
                  onClick={() => addChar(previewCard)}
                  disabled={!canAddChar(previewCard)}
                  className="mt-2 w-full py-1.5 text-xs font-bold uppercase rounded cursor-pointer"
                  style={{
                    backgroundColor: canAddChar(previewCard) ? '#1a2a1a' : '#1a1a1a',
                    color: canAddChar(previewCard) ? '#3e8b3e' : '#555',
                    border: `1px solid ${canAddChar(previewCard) ? '#2a4a2a' : '#333'}`,
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
