'use client';

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import type { BoosterCard } from '@/lib/draft/boosterGenerator';
import type { CharacterCard, MissionCard } from '@/lib/engine/types';
import { MIN_DECK_SIZE, MAX_COPIES_PER_VERSION, MISSION_CARDS_PER_PLAYER } from '@/lib/engine/types';
import { normalizeImagePath } from '@/lib/utils/imagePath';
import { LandscapeBlocker } from '@/components/LandscapeBlocker';
import { DraftTimer } from './DraftTimer';

interface DraftDeckBuilderProps {
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

export function DraftDeckBuilder({
  pool,
  isOnline,
  timerSeconds = 900,
  onDeckReady,
  onTimeUp,
}: DraftDeckBuilderProps) {
  const t = useTranslations('draft');

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

  // Filter catalog characters
  const filteredCatalog = useMemo(() => {
    return catalogChars.filter((c) => {
      if (filterRarity !== 'all' && c.rarity !== filterRarity) return false;
      if (filterGroup !== 'all' && c.group !== filterGroup) return false;
      if (searchText) {
        const search = searchText.toLowerCase();
        if (
          !c.name_fr.toLowerCase().includes(search) &&
          !(c.name_en ?? '').toLowerCase().includes(search) &&
          !c.id.toLowerCase().includes(search)
        ) {
          return false;
        }
      }
      return true;
    });
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
            <DraftTimer
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
                  <option key={g} value={g}>{g}</option>
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
                    onContextMenu={(e) => { e.preventDefault(); setPreviewCard(m); }}
                    className="relative cursor-pointer rounded overflow-hidden"
                    style={{
                      width: '140px',
                      aspectRatio: '3.5/2.5',
                      border: `2px solid ${inDeck ? '#e67e22' : '#333'}`,
                      opacity: !canAdd && !inDeck ? 0.4 : 1,
                    }}
                  >
                    {imgPath ? (
                      <img src={imgPath} alt={m.name_fr} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#1a1a1a' }}>
                        <span className="text-[9px] text-center px-1" style={{ color: '#888' }}>{m.name_fr}</span>
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
                      <span className="text-[8px] truncate" style={{ color: '#e0e0e0' }}>{m.name_fr}</span>
                    </div>
                    {inDeck && (
                      <div className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: '#e67e22' }}>
                        <span className="text-[10px] font-bold" style={{ color: '#0a0a0a' }}>+</span>
                      </div>
                    )}
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
                    onContextMenu={(e) => { e.preventDefault(); setPreviewCard(card); }}
                    className="relative cursor-pointer rounded overflow-hidden"
                    style={{
                      aspectRatio: '5/7',
                      border: `2px solid ${inDeck > 0 ? rarityColor : '#262626'}`,
                      opacity: !canAdd ? 0.3 : 1,
                    }}
                  >
                    {imgPath ? (
                      <img src={imgPath} alt={card.name_fr} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#1a1a1a' }}>
                        <span className="text-[9px] text-center px-1" style={{ color: '#888' }}>{card.name_fr}</span>
                      </div>
                    )}

                    {/* Card info overlay */}
                    <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
                      <div className="flex items-center justify-between">
                        <span className="text-[8px] truncate" style={{ color: '#e0e0e0' }}>{card.name_fr}</span>
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
                          HOLO
                        </span>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Deck summary */}
        <div className="w-full lg:w-64 flex flex-col overflow-hidden shrink-0 max-h-48 lg:max-h-none" style={{ backgroundColor: '#0d0d0d', borderTop: '1px solid #262626' }}>
          <div className="px-3 py-2 shrink-0" style={{ borderBottom: '1px solid #1a1a1a' }}>
            <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: '#c4a35a' }}>
              {t('yourDeck')}
            </h3>
          </div>

          {/* Validation status */}
          <div className="px-3 py-2 shrink-0" style={{ borderBottom: '1px solid #1a1a1a' }}>
            {errors.length > 0 ? (
              <div className="flex flex-col gap-1">
                {errors.map((err, i) => (
                  <span key={i} className="text-[10px]" style={{ color: '#b33e3e' }}>{err}</span>
                ))}
              </div>
            ) : (
              <span className="text-xs font-bold" style={{ color: '#3e8b3e' }}>
                {t('deckReady')}
              </span>
            )}
          </div>

          {/* Selected missions */}
          {deckMissions.length > 0 && (
            <div className="px-3 py-2 shrink-0" style={{ borderBottom: '1px solid #1a1a1a' }}>
              <h4 className="text-[10px] font-bold uppercase mb-1" style={{ color: '#e67e22' }}>{t('missionsLabel')}</h4>
              {deckMissions.map((m, i) => (
                <div
                  key={`${m.id}-${i}`}
                  className="flex items-center justify-between py-0.5 cursor-pointer"
                  onClick={() => removeMission(i)}
                >
                  <span className="text-[10px] truncate" style={{ color: '#e0e0e0' }}>{m.name_fr}</span>
                  <span className="text-[10px]" style={{ color: '#b33e3e' }}>x</span>
                </div>
              ))}
            </div>
          )}

          {/* Selected characters list */}
          <div className="flex-1 overflow-y-auto px-3 py-2">
            <h4 className="text-[10px] font-bold uppercase mb-1" style={{ color: '#888' }}>
              {t('characters')} ({deckChars.length})
            </h4>
            {[...deckChars]
              .sort((a, b) => a.chakra - b.chakra)
              .map((c, i) => {
                // Find the original index in unsorted deckChars
                const originalIndex = deckChars.indexOf(c);
                return (
                  <div
                    key={`${c.id}-${i}`}
                    className="flex items-center justify-between py-0.5 cursor-pointer"
                    onClick={() => removeChar(originalIndex)}
                  >
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-[10px] shrink-0" style={{ color: '#5865F2' }}>{c.chakra}</span>
                      <span className="text-[10px] truncate" style={{ color: '#e0e0e0' }}>{c.name_fr}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[10px]" style={{ color: rarityColors[c.rarity] ?? '#888' }}>{c.rarity}</span>
                      <span className="text-[10px]" style={{ color: '#b33e3e' }}>x</span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* Card preview modal */}
      <AnimatePresence>
        {previewCard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center cursor-pointer"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)' }}
            onClick={() => setPreviewCard(null)}
          >
            <motion.div
              initial={{ scale: 0.5 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.5 }}
              className="relative rounded-lg overflow-hidden"
              style={{
                width: previewCard.card_type === 'mission' ? '392px' : '280px',
                height: previewCard.card_type === 'mission' ? '280px' : '392px',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {normalizeImagePath(previewCard.image_file) ? (
                <img
                  src={normalizeImagePath(previewCard.image_file)!}
                  alt={previewCard.name_fr}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#1a1a1a' }}>
                  <span className="text-sm" style={{ color: '#888' }}>{previewCard.name_fr}</span>
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 p-3" style={{ backgroundColor: 'rgba(0,0,0,0.9)' }}>
                <div className="text-sm font-bold" style={{ color: '#e0e0e0' }}>{previewCard.name_fr}</div>
                <div className="text-xs" style={{ color: '#888' }}>{previewCard.title_fr}</div>
                <div className="flex gap-2 mt-1">
                  {previewCard.card_type !== 'mission' && (
                    <>
                      <span className="text-xs" style={{ color: '#5865F2' }}>Chakra: {previewCard.chakra}</span>
                      <span className="text-xs" style={{ color: '#b33e3e' }}>Power: {previewCard.power}</span>
                    </>
                  )}
                  <span className="text-xs" style={{ color: rarityColors[previewCard.rarity] ?? '#888' }}>{previewCard.rarity}</span>
                </div>
                {previewCard.effects?.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1">
                    {previewCard.effects.map((eff: { type: string; description: string }, i: number) => (
                      <div key={i} className="text-[10px]" style={{ color: '#ccc' }}>
                        <span className="font-bold" style={{ color: '#c4a35a' }}>{eff.type}: </span>
                        {eff.description}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <LandscapeBlocker />
    </div>
  );
}
