"use client";

import { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useSession } from "next-auth/react";
import { Link } from "@/lib/i18n/navigation";
import { CloudBackground } from "@/components/CloudBackground";
import { DecorativeIcons } from "@/components/DecorativeIcons";
import type { CharacterCard, MissionCard } from "@/lib/engine/types";
import { validateDeck } from "@/lib/engine/rules/DeckValidation";
import { useDeckBuilderStore } from "@/stores/deckBuilderStore";
import type { AddCheckResult } from "@/stores/deckBuilderStore";
import { useBannedCards } from "@/lib/hooks/useBannedCards";
import { AnimatePresence, motion } from "framer-motion";
import { normalizeImagePath } from "@/lib/utils/imagePath";
import { getCardName, getCardTitle, getCardGroup, getCardKeyword, getRarityLabel } from "@/lib/utils/cardLocale";
import { effectDescriptionsEn } from "@/lib/data/effectDescriptionsEn";
import { effectDescriptionsFr } from "@/lib/data/effectTranslationsFr";
import { exportDeckAsImage } from "@/lib/utils/exportDeckImage";
import type { EffectType } from "@/lib/engine/types";
import {
  PopupOverlay,
  PopupCornerFrame,
  PopupTitle,
  PopupActionButton,
  PopupDismissLink,
  SectionDivider,
  AngularButton,
} from "@/components/game/PopupPrimitives";

const RARITY_COLORS: Record<string, string> = {
  C: '#888888',
  UC: '#3e8b3e',
  R: '#c4a35a',
  RA: '#c4a35a',
  S: '#b33e3e',
  M: '#6a6abb',
  Legendary: '#c4a35a',
  Mission: '#c4a35a',
};

const RARITY_ORDER: Record<string, number> = { C: 0, UC: 1, R: 2, RA: 3, S: 4, M: 5, Legendary: 6 };
const EFFECT_TYPE_COLORS: Record<string, string> = {
  MAIN: '#c4a35a',
  UPGRADE: '#3e8b3e',
  AMBUSH: '#b33e3e',
  SCORE: '#6a6abb',
};

type SortField = 'number' | 'name' | 'chakra' | 'power' | 'rarity';

// ===== NORMALIZE HELPER (hoisted, not recreated per render) =====
const normalizeStr = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// ===== MEMOIZED CARD GRID ITEM =====
const CatalogCardItem = memo(function CatalogCardItem({
  card, addCheck, inDeckCount, locale, onAdd, onClick,
}: {
  card: CharacterCard;
  addCheck: AddCheckResult;
  inDeckCount: number;
  locale: string;
  onAdd: () => void;
  onClick: () => void;
}) {
  const imgPath = normalizeImagePath(card.image_file);
  const rarColor = RARITY_COLORS[card.rarity] ?? '#888';
  return (
    <button
      onClick={onAdd}
      className="relative w-full card-aspect overflow-hidden group cursor-pointer"
      style={{
        backgroundColor: '#0e0e0e',
        border: '1px solid rgba(255,255,255,0.06)',
        borderLeft: `3px solid ${rarColor}`,
      }}
      title={`${getCardName(card, locale as "en" | "fr")} - ${getCardTitle(card, locale as "en" | "fr")} (${card.chakra}/${card.power})`}
    >
      {imgPath ? (
        <img src={imgPath} alt={getCardName(card, locale as "en" | "fr")} className="w-full h-full object-cover" loading="lazy" decoding="async" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <span className="text-[8px]" style={{ color: '#555' }}>{getCardName(card, locale as "en" | "fr")}</span>
        </div>
      )}
      {/* Chakra badge */}
      <div className="absolute top-1 left-1 w-4 h-4 flex items-center justify-center text-[8px] font-bold" style={{
        backgroundColor: 'rgba(196,163,90,0.9)', color: '#0a0a0a',
      }}>{card.chakra}</div>
      {/* In-deck count badge */}
      {inDeckCount > 0 && (
        <div className="absolute top-1 right-1 px-1 py-0.5 text-[8px] font-bold" style={{
          backgroundColor: inDeckCount >= 2 ? 'rgba(179,62,62,0.9)' : 'rgba(62,139,62,0.9)', color: '#fff',
        }}>x{inDeckCount}</div>
      )}
      {/* Bottom info */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between px-1 py-0.5" style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}>
        <span className="text-[7px] truncate" style={{ color: '#e0e0e0', maxWidth: '70%' }}>{getCardName(card, locale as "en" | "fr")}</span>
        <span className="text-[8px] font-bold tabular-nums" style={{ color: '#e0e0e0' }}>{card.power}</span>
      </div>
      {/* Hover overlay */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-0.5" style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}>
        {addCheck.allowed ? (
          <>
            <span className="text-xl font-bold leading-none" style={{ color: '#3e8b3e' }}>+</span>
            <span className="text-[10px]" style={{ color: '#e0e0e0' }}>{card.chakra}/{card.power}</span>
          </>
        ) : (
          <span className="text-[8px] text-center px-1 leading-tight" style={{ color: '#b33e3e' }}>{addCheck.reason}</span>
        )}
      </div>
      {/* Detail button — hover only */}
      <div
        className="absolute top-0.5 right-0.5 px-1 py-0.5 text-[7px] font-bold uppercase opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10"
        style={{ backgroundColor: 'rgba(0,0,0,0.85)', color: '#c4a35a', borderLeft: '2px solid rgba(196,163,90,0.4)' }}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
      >Detail</div>
    </button>
  );
});

// ===== MEMOIZED DECK CHARACTER ROW =====
const DeckCharRow = memo(function DeckCharRow({
  card, originalIndex, locale, onRemove, onClick,
}: {
  card: CharacterCard;
  originalIndex: number;
  locale: string;
  onRemove: () => void;
  onClick: () => void;
}) {
  const img = normalizeImagePath(card.image_file);
  const rarColor = RARITY_COLORS[card.rarity] ?? '#888';
  return (
    <div
      className="flex items-center gap-1.5 py-0.5 px-1 mb-0.5 group cursor-pointer deck-char-row"
      style={{ borderLeft: `2px solid ${rarColor}`, backgroundColor: 'rgba(255,255,255,0.01)' }}
      onClick={onClick}
    >
      <div className="w-5 h-7 overflow-hidden flex-shrink-0" style={{ backgroundColor: '#111' }}>
        {img ? <img src={img} alt="" className="w-full h-full object-cover" loading="lazy" /> : <div className="w-full h-full" />}
      </div>
      <span className="text-[9px] truncate flex-1 min-w-0" style={{ color: '#ccc' }}>{getCardName(card, locale as "en" | "fr")}</span>
      <span className="text-[9px] font-bold tabular-nums flex-shrink-0" style={{ color: '#888' }}>{card.power}</span>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="w-4 h-4 flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer flex-shrink-0"
        style={{ color: '#b33e3e' }}
      >X</button>
    </div>
  );
});

export default function DeckBuilderPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { data: session } = useSession();
  const [availableChars, setAvailableChars] = useState<CharacterCard[]>([]);
  const [availableMissions, setAvailableMissions] = useState<MissionCard[]>([]);
  const [allChars, setAllChars] = useState<CharacterCard[]>([]);
  const [allMissions, setAllMissions] = useState<MissionCard[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [charPage, setCharPage] = useState(1);
  const CHARS_PER_PAGE = 40;
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showSavedDecks, setShowSavedDecks] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [importCode, setImportCode] = useState("");
  const [importMessage, setImportMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [previewCard, setPreviewCard] = useState<CharacterCard | MissionCard | null>(null);
  const [overwriteConflict, setOverwriteConflict] = useState<{ id: string; name: string } | null>(null);

  // New state for redesigned layout
  const [showDeckDrawer, setShowDeckDrawer] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportCopied, setExportCopied] = useState(false);

  // Filter & sort state
  const [sortBy, setSortBy] = useState<SortField>('number');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [filterRarity, setFilterRarity] = useState<string[]>([]);
  const [filterGroup, setFilterGroup] = useState<string[]>([]);
  const [filterKeywords, setFilterKeywords] = useState<string[]>([]);
  const [filterEffectType, setFilterEffectType] = useState<EffectType[]>([]);
  const [filterChakraMin, setFilterChakraMin] = useState(0);
  const [filterChakraMax, setFilterChakraMax] = useState(10);
  const [filterPowerMin, setFilterPowerMin] = useState(0);
  const [filterPowerMax, setFilterPowerMax] = useState(10);
  const [showFilters, setShowFilters] = useState(false);

  // Zustand store
  const deckName = useDeckBuilderStore((s) => s.deckName);
  const deckChars = useDeckBuilderStore((s) => s.deckChars);
  const deckMissions = useDeckBuilderStore((s) => s.deckMissions);
  const savedDecks = useDeckBuilderStore((s) => s.savedDecks);
  const isLoading = useDeckBuilderStore((s) => s.isLoading);
  const isSaving = useDeckBuilderStore((s) => s.isSaving);
  const loadedDeckId = useDeckBuilderStore((s) => s.loadedDeckId);
  const addError = useDeckBuilderStore((s) => s.addError);
  const addErrorKey = useDeckBuilderStore((s) => s.addErrorKey);
  const addErrorParams = useDeckBuilderStore((s) => s.addErrorParams);

  const setDeckName = useDeckBuilderStore((s) => s.setDeckName);
  const addChar = useDeckBuilderStore((s) => s.addChar);
  const removeChar = useDeckBuilderStore((s) => s.removeChar);
  const addMission = useDeckBuilderStore((s) => s.addMission);
  const removeMission = useDeckBuilderStore((s) => s.removeMission);
  const clearDeck = useDeckBuilderStore((s) => s.clearDeck);
  const saveDeck = useDeckBuilderStore((s) => s.saveDeck);
  const loadSavedDecks = useDeckBuilderStore((s) => s.loadSavedDecks);
  const loadDeck = useDeckBuilderStore((s) => s.loadDeck);
  const deleteDeck = useDeckBuilderStore((s) => s.deleteDeck);
  const canAddChar = useDeckBuilderStore((s) => s.canAddChar);
  const canAddMission = useDeckBuilderStore((s) => s.canAddMission);
  const clearAddError = useDeckBuilderStore((s) => s.clearAddError);
  const { bannedIds } = useBannedCards();

  useEffect(() => {
    import("@/lib/data/cardLoader").then((mod) => {
      setAvailableChars(mod.getPlayableCharacters());
      setAvailableMissions(mod.getPlayableMissions());
      setAllChars(mod.getAllCharacters());
      setAllMissions(mod.getAllMissions());
    });
  }, []);

  useEffect(() => {
    loadSavedDecks();
  }, [loadSavedDecks]);

  // Auto-load deck from manage page (sessionStorage)
  useEffect(() => {
    try {
      const pendingId = sessionStorage.getItem('loadDeckId');
      if (pendingId && availableChars.length > 0 && availableMissions.length > 0) {
        sessionStorage.removeItem('loadDeckId');
        loadDeck(pendingId, availableChars, availableMissions);
      }
    } catch { /* SSR / privacy */ }
  }, [availableChars, availableMissions, loadDeck]);

  // Debounce search query (250ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Auto-clear add error after 3 seconds
  useEffect(() => {
    if (addError) {
      const timer = setTimeout(() => clearAddError(), 3000);
      return () => clearTimeout(timer);
    }
  }, [addError, clearAddError]);

  // Lock scroll on mount (full-viewport layout)
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Derive available filter options from card data
  const filterOptions = useMemo(() => {
    const chars = availableChars.filter((c) => !bannedIds.has(c.id));
    const rarities = new Set<string>();
    const groups = new Set<string>();
    const keywords = new Set<string>();
    let maxChakra = 0;
    let maxPower = 0;
    for (const c of chars) {
      rarities.add(c.rarity);
      if (c.group) groups.add(c.group);
      for (const kw of c.keywords ?? []) keywords.add(kw);
      if (c.chakra > maxChakra) maxChakra = c.chakra;
      if (c.power > maxPower) maxPower = c.power;
    }
    const sortedRarities = Array.from(rarities).sort((a, b) => (RARITY_ORDER[a] ?? 99) - (RARITY_ORDER[b] ?? 99));
    return {
      rarities: sortedRarities,
      groups: Array.from(groups).sort(),
      keywords: Array.from(keywords).sort(),
      maxChakra,
      maxPower,
    };
  }, [availableChars, bannedIds]);

  const hasActiveFilters = filterRarity.length > 0 || filterGroup.length > 0 || filterKeywords.length > 0 || filterEffectType.length > 0 || filterChakraMin > 0 || filterChakraMax < filterOptions.maxChakra || filterPowerMin > 0 || filterPowerMax < filterOptions.maxPower;

  const activeFilterCount = filterRarity.length + filterGroup.length + filterKeywords.length + filterEffectType.length + (filterChakraMin > 0 || filterChakraMax < filterOptions.maxChakra ? 1 : 0) + (filterPowerMin > 0 || filterPowerMax < filterOptions.maxPower ? 1 : 0);

  const clearAllFilters = useCallback(() => {
    setSearchQuery('');
    setFilterRarity([]);
    setFilterGroup([]);
    setFilterKeywords([]);
    setFilterEffectType([]);
    setFilterChakraMin(0);
    setFilterChakraMax(filterOptions.maxChakra);
    setFilterPowerMin(0);
    setFilterPowerMax(filterOptions.maxPower);
  }, [filterOptions.maxChakra, filterOptions.maxPower]);

  const toggleArrayFilter = useCallback(<T extends string>(arr: T[], val: T, setter: (v: T[]) => void) => {
    setter(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);
  }, []);

  const filteredChars = useMemo(() => {
    let chars = availableChars.filter((c) => !bannedIds.has(c.id));
    if (debouncedSearch) {
      const q = normalizeStr(debouncedSearch);
      chars = chars.filter(
        (c) =>
          normalizeStr(getCardName(c, locale as "en" | "fr")).includes(q) ||
          normalizeStr(getCardTitle(c, locale as "en" | "fr")).includes(q) ||
          normalizeStr(c.name_fr).includes(q) ||
          c.id.toLowerCase().includes(q),
      );
    }
    if (filterRarity.length > 0) chars = chars.filter((c) => filterRarity.includes(c.rarity));
    if (filterGroup.length > 0) chars = chars.filter((c) => c.group && filterGroup.includes(c.group));
    if (filterKeywords.length > 0) chars = chars.filter((c) => c.keywords?.some((kw) => filterKeywords.includes(kw)));
    if (filterEffectType.length > 0) chars = chars.filter((c) => c.effects?.some((e) => filterEffectType.includes(e.type)));
    if (filterChakraMin > 0 || filterChakraMax < filterOptions.maxChakra) chars = chars.filter((c) => c.chakra >= filterChakraMin && c.chakra <= filterChakraMax);
    if (filterPowerMin > 0 || filterPowerMax < filterOptions.maxPower) chars = chars.filter((c) => c.power >= filterPowerMin && c.power <= filterPowerMax);
    chars = [...chars].sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'number': cmp = a.number - b.number; break;
        case 'name': cmp = getCardName(a, locale as "en" | "fr").localeCompare(getCardName(b, locale as "en" | "fr")); break;
        case 'chakra': cmp = (a.chakra ?? 0) - (b.chakra ?? 0); break;
        case 'power': cmp = (a.power ?? 0) - (b.power ?? 0); break;
        case 'rarity': cmp = (RARITY_ORDER[a.rarity] ?? 99) - (RARITY_ORDER[b.rarity] ?? 99); break;
      }
      return sortOrder === 'desc' ? -cmp : cmp;
    });
    return chars;
  }, [availableChars, debouncedSearch, bannedIds, locale, filterRarity, filterGroup, filterKeywords, filterEffectType, filterChakraMin, filterChakraMax, filterPowerMin, filterPowerMax, sortBy, sortOrder, filterOptions.maxChakra, filterOptions.maxPower]);

  useEffect(() => { setCharPage(1); }, [debouncedSearch, filterRarity, filterGroup, filterKeywords, filterEffectType, filterChakraMin, filterChakraMax, filterPowerMin, filterPowerMax, sortBy, sortOrder]);

  const totalCharPages = Math.max(1, Math.ceil(filteredChars.length / CHARS_PER_PAGE));
  const paginatedChars = useMemo(() => {
    const start = (charPage - 1) * CHARS_PER_PAGE;
    return filteredChars.slice(start, start + CHARS_PER_PAGE);
  }, [filteredChars, charPage]);

  const validation = useMemo(() => validateDeck(deckChars, deckMissions), [deckChars, deckMissions]);

  const handleSave = useCallback(async () => {
    setSaveError(null);
    const trimmedName = (deckName || '').trim() || 'Untitled Deck';
    const conflict = savedDecks.find(
      (d) => d.name.toLowerCase() === trimmedName.toLowerCase() && d.id !== loadedDeckId
    );
    if (conflict) { setOverwriteConflict({ id: conflict.id, name: conflict.name }); return; }
    try { await saveDeck(); } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : t("deckBuilder.failedToSave"));
    }
  }, [saveDeck, t, deckName, savedDecks, loadedDeckId]);

  const handleOverwriteConfirm = useCallback(async () => {
    if (!overwriteConflict) return;
    setSaveError(null);
    try { await deleteDeck(overwriteConflict.id); await saveDeck(); } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : t("deckBuilder.failedToSave"));
    } finally { setOverwriteConflict(null); }
  }, [overwriteConflict, deleteDeck, saveDeck, t]);

  const handleLoadDeck = useCallback(async (deckId: string) => {
    setSaveError(null);
    try { await loadDeck(deckId, availableChars, availableMissions); } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : t("deckBuilder.failedToLoad"));
    }
  }, [loadDeck, availableChars, availableMissions, t]);

  const handleDeleteDeck = useCallback(async (deckId: string) => {
    setSaveError(null);
    try { await deleteDeck(deckId); } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : t("deckBuilder.failedToDelete"));
    }
  }, [deleteDeck, t]);

  const getImagePath = (card: CharacterCard | MissionCard): string | null => normalizeImagePath(card.image_file);

  const handleImport = useCallback(() => {
    const code = importCode.trim();
    if (!code) return;
    const parts = code.split("|");
    if (parts.length < 2) { setImportMessage({ type: "error", text: t("deckBuilder.importError") }); return; }
    const lastPart = parts[parts.length - 1];
    const hasDeckName = !lastPart.includes("--");
    const deckNameFromCode = hasDeckName ? lastPart.replace(/_/g, " ") : "";
    const cardParts = hasDeckName ? parts.slice(0, -1) : parts;
    const charByCardId = new Map(allChars.map((c) => [c.cardId, c]));
    const missionByCardId = new Map(allMissions.map((m) => [m.cardId, m]));
    const charByNumber = new Map<number, CharacterCard[]>();
    for (const c of allChars) { const arr = charByNumber.get(c.number) || []; arr.push(c); charByNumber.set(c.number, arr); }
    const missionByNumber = new Map<number, MissionCard>();
    for (const m of allMissions) { missionByNumber.set(m.number, m); }
    const normalizeCardId = (raw: string): string => {
      let id = raw.trim();
      id = id.replace(/-R ART$/, '-RA'); id = id.replace(/-SECRET$/, '-S');
      id = id.replace(/-SV$/, '-S'); id = id.replace(/-MYTHOS$/, '-M');
      return id;
    };
    const chars: CharacterCard[] = []; const missions: MissionCard[] = []; const notFound: string[] = [];
    for (const part of cardParts) {
      const match = part.match(/^(.+)--(\d+)$/);
      if (!match) { setImportMessage({ type: "error", text: t("deckBuilder.importError") }); return; }
      const rawCardId = match[1]; const qty = parseInt(match[2], 10); const cardId = normalizeCardId(rawCardId);
      const mission = missionByCardId.get(cardId);
      if (mission) { for (let i = 0; i < qty; i++) missions.push(mission); continue; }
      const char = charByCardId.get(cardId);
      if (char) { for (let i = 0; i < qty; i++) chars.push(char); continue; }
      const numMatch = cardId.match(/^KS-(\d+)/);
      if (numMatch) {
        const num = parseInt(numMatch[1], 10);
        const mByNum = missionByNumber.get(num);
        if (mByNum) { for (let i = 0; i < qty; i++) missions.push(mByNum); continue; }
        const candidates = charByNumber.get(num);
        if (candidates && candidates.length > 0) {
          const rarityMatch = cardId.match(/^KS-\d+-(.*)/);
          const wantRarity = rarityMatch ? rarityMatch[1] : '';
          const exact = candidates.find((c) => c.cardId === cardId);
          const byRarity = candidates.find((c) => c.rarity === wantRarity);
          const pick = exact || byRarity || candidates[0];
          for (let i = 0; i < qty; i++) chars.push(pick);
          continue;
        }
      }
      notFound.push(rawCardId);
    }
    clearDeck();
    if (deckNameFromCode) setDeckName(deckNameFromCode);
    for (const c of chars) addChar(c);
    for (const m of missions) addMission(m);
    if (notFound.length > 0) {
      setImportMessage({ type: "error", text: t("deckBuilder.importNotFound", { count: notFound.length, ids: notFound.join(", ") }) });
    } else {
      setImportMessage({ type: "success", text: t("deckBuilder.importSuccess", { name: deckNameFromCode || "Deck", chars: chars.length, missions: missions.length }) });
    }
    setImportCode("");
  }, [importCode, allChars, allMissions, clearDeck, setDeckName, addChar, addMission, t]);

  // Generate export code in ShinobiBuilder-compatible format: CARD_ID--QTY|...|DECK_NAME
  const exportCode = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of deckChars) {
      const id = c.cardId || c.id;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    for (const m of deckMissions) {
      const id = m.cardId || m.id;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    const parts: string[] = [];
    for (const [id, qty] of counts) {
      parts.push(`${id}--${qty}`);
    }
    const safeName = (deckName || 'Deck').replace(/\s+/g, '_');
    parts.push(safeName);
    return parts.join('|');
  }, [deckChars, deckMissions, deckName]);

  const handleCopyExportCode = useCallback(() => {
    navigator.clipboard.writeText(exportCode).then(() => {
      setExportCopied(true);
      setTimeout(() => setExportCopied(false), 2000);
    });
  }, [exportCode]);

  // Group deck characters by chakra cost for the deck panel
  const deckCharsByCost = useMemo(() => {
    const groups = new Map<number, { card: CharacterCard; originalIndex: number }[]>();
    deckChars.forEach((card, i) => {
      const cost = card.chakra ?? 0;
      const arr = groups.get(cost) || [];
      arr.push({ card, originalIndex: i });
      groups.set(cost, arr);
    });
    return Array.from(groups.entries()).sort((a, b) => a[0] - b[0]);
  }, [deckChars]);

  // Count how many of each card is in the deck (for badges on catalog cards)
  const deckCardCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of deckChars) {
      counts.set(c.id, (counts.get(c.id) || 0) + 1);
    }
    return counts;
  }, [deckChars]);

  // Pre-compute addCheck for all paginated cards (avoids 40x linear scans per render)
  const addCheckMap = useMemo(() => {
    const map = new Map<string, AddCheckResult>();
    for (const c of paginatedChars) {
      map.set(c.id, canAddChar(c));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paginatedChars, deckChars]);

  // Stable callbacks for memoized card items
  const handleAddChar = useCallback((card: CharacterCard) => addChar(card), [addChar]);
  const handlePreviewCard = useCallback((card: CharacterCard | MissionCard) => setPreviewCard(card), []);

  // ===== UNAUTHENTICATED =====
  if (!session?.user) {
    return (
      <main id="main-content" className="flex min-h-screen relative flex-col" style={{ backgroundColor: "#0a0a0a" }}>
        <CloudBackground />
        <DecorativeIcons />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="flex flex-col items-center gap-6 max-w-md w-full text-center relative z-10">
            <h1 className="text-2xl font-bold tracking-wider uppercase" style={{ color: "#c4a35a" }}>
              {t("deckBuilder.title")}
            </h1>
            <div className="w-16 h-px mx-auto" style={{ backgroundColor: 'rgba(196, 163, 90, 0.3)' }} />
            <p className="text-sm" style={{ color: "#888888" }}>{t("online.signInRequired")}</p>
            <div className="flex gap-3">
              <Link href="/login" className="px-6 py-2.5 text-sm font-bold uppercase tracking-wider" style={{ backgroundColor: "#c4a35a", color: "#0a0a0a", borderLeft: '3px solid #a88a3a' }}>{t("common.signIn")}</Link>
              <Link href="/" className="px-6 py-2.5 text-sm" style={{ backgroundColor: "#141414", border: "1px solid #262626", borderLeft: '3px solid rgba(255,255,255,0.1)', color: "#888888" }}>{t("common.back")}</Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ===== CARD DETAIL CONTENT (reused desktop + mobile) =====
  const renderCardDetail = (card: CharacterCard | MissionCard, isMobile = false) => {
    const isChar = card.card_type !== 'mission';
    const charCard = card as CharacterCard;
    const imgPath = normalizeImagePath(card.image_file);
    const rarColor = RARITY_COLORS[card.rarity] ?? '#888';
    const addCheck = isChar ? canAddChar(charCard) : canAddMission(card as MissionCard);

    return (
      <>
        {/* Card image */}
        <div className="relative overflow-hidden mx-auto mb-3" style={{
          width: isMobile ? (isChar ? '90px' : '140px') : (isChar ? '160px' : '100%'),
          aspectRatio: isChar ? '5/7' : '3.5/2.5',
          backgroundColor: '#0a0a0c',
          flexShrink: 0,
        }}>
          {imgPath ? (
            <img src={imgPath} alt={getCardName(card, locale as "en" | "fr")} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#111' }}>
              <span className="text-[10px]" style={{ color: '#555' }}>{getCardName(card, locale as "en" | "fr")}</span>
            </div>
          )}
        </div>

        {/* Type + Rarity badges */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5" style={{
            backgroundColor: isChar ? 'rgba(255,255,255,0.04)' : 'rgba(196,163,90,0.12)',
            borderLeft: `2px solid ${isChar ? 'rgba(255,255,255,0.15)' : '#c4a35a'}`,
            color: isChar ? '#999' : '#c4a35a',
          }}>
            {isChar ? t("game.board.character") : 'Mission'}
          </span>
          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5" style={{
            backgroundColor: `${rarColor}12`,
            borderLeft: `2px solid ${rarColor}`,
            color: rarColor,
          }}>
            {getRarityLabel(card.rarity, locale as "en" | "fr")}
          </span>
        </div>

        {/* Name + Title */}
        <div className="text-sm font-bold" style={{ color: '#e0e0e0' }}>
          {getCardName(card, locale as "en" | "fr")}
        </div>
        {isChar && (
          <div className="text-[11px] mb-2" style={{ color: '#777' }}>
            {getCardTitle(charCard, locale as "en" | "fr")}
          </div>
        )}

        {/* Stats panel */}
        {isChar && (
          <div className="flex items-center gap-0 my-2 py-2" style={{
            backgroundColor: 'rgba(255,255,255,0.02)',
            borderLeft: '3px solid rgba(196, 163, 90, 0.3)',
          }}>
            <div className="flex-1 flex flex-col items-center">
              <span className="text-[9px] uppercase" style={{ color: '#777', letterSpacing: '0.08em' }}>
                {t("deckBuilder.chakra")}
              </span>
              <span className="text-lg font-bold tabular-nums" style={{ color: '#c4a35a' }}>
                {charCard.chakra}
              </span>
            </div>
            <div style={{ width: '1px', height: '24px', backgroundColor: 'rgba(255,255,255,0.08)' }} />
            <div className="flex-1 flex flex-col items-center">
              <span className="text-[9px] uppercase" style={{ color: '#777', letterSpacing: '0.08em' }}>
                {t("deckBuilder.power")}
              </span>
              <span className="text-lg font-bold tabular-nums" style={{ color: '#e0e0e0' }}>
                {charCard.power}
              </span>
            </div>
          </div>
        )}

        {/* Group */}
        {isChar && charCard.group && (
          <div className="text-[10px] mb-1" style={{ color: '#6b8a6b' }}>
            {getCardGroup(charCard.group, locale as "en" | "fr")}
          </div>
        )}

        {/* Keywords */}
        {isChar && charCard.keywords && charCard.keywords.length > 0 && (
          <div className="flex gap-1 mt-1 mb-2 flex-wrap">
            {charCard.keywords.map((kw, i) => (
              <span key={i} className="text-[9px] px-1.5 py-0.5" style={{
                backgroundColor: 'rgba(255,255,255,0.04)',
                borderLeft: '2px solid rgba(255,255,255,0.08)',
                color: '#999',
              }}>
                {getCardKeyword(kw, locale as "en" | "fr")}
              </span>
            ))}
          </div>
        )}

        {/* Effects */}
        {card.effects && card.effects.length > 0 && (
          <div className="flex flex-col gap-1.5 mt-2">
            {card.effects.map((eff, i) => {
              const raFallbackId = card.id.endsWith('-RA') ? card.id.replace('-RA', '-R') : undefined;
              const frDescs = effectDescriptionsFr[card.id] ?? (raFallbackId ? effectDescriptionsFr[raFallbackId] : undefined);
              const enDescs = effectDescriptionsEn[card.id] ?? (raFallbackId ? effectDescriptionsEn[raFallbackId] : undefined);
              const description = locale === 'fr' ? (frDescs?.[i] ?? eff.description) : (enDescs?.[i] ?? eff.description);
              const effColor = EFFECT_TYPE_COLORS[eff.type] ?? '#888';
              return (
                <div key={i} className="py-1.5 px-2" style={{
                  borderLeft: `3px solid ${effColor}`,
                  backgroundColor: `${effColor}08`,
                }}>
                  <span className="text-[10px] font-bold uppercase" style={{ color: effColor, letterSpacing: '0.06em' }}>{eff.type}</span>
                  <div className="text-[10px] leading-snug mt-0.5" style={{ color: '#bbb' }}>{description}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add to deck button */}
        <div className="mt-3">
          <AngularButton
            onClick={() => isChar ? addChar(charCard) : addMission(card as MissionCard)}
            accentColor="#3e8b3e"
            variant={addCheck.allowed ? 'primary' : 'muted'}
            disabled={!addCheck.allowed}
            size="sm"
          >
            {t("deckBuilder.addToDeck")}
          </AngularButton>
        </div>
      </>
    );
  };

  // ===== MAIN LAYOUT =====
  return (
    <main id="main-content" className="relative" style={{ backgroundColor: '#0a0a0a', height: '100vh', overflow: 'hidden' }}>
      <CloudBackground />
      <DecorativeIcons />

      <div className="flex relative z-10" style={{ height: '100vh' }}>

        {/* ===== LEFT: DECK PANEL (desktop) ===== */}
        <div
          className="hidden lg:flex flex-col flex-shrink-0 overflow-hidden"
          style={{
            width: '240px',
            backgroundColor: 'rgba(8, 8, 12, 0.95)',
            borderRight: '1px solid rgba(196, 163, 90, 0.12)',
          }}
        >
          {/* Header */}
          <div className="px-3 pt-3 pb-1 flex-shrink-0">
            <div className="flex items-center justify-between mb-1">
              <Link href="/" className="text-[10px] uppercase" style={{ color: '#555', letterSpacing: '0.08em' }}>
                {t("common.back")}
              </Link>
              {loadedDeckId && (
                <span className="text-[8px] uppercase px-1.5 py-0.5" style={{
                  backgroundColor: 'rgba(62, 139, 62, 0.15)',
                  borderLeft: '2px solid #3e8b3e',
                  color: '#3e8b3e',
                  letterSpacing: '0.06em',
                }}>
                  {t("deckBuilder.currentlyEditing")}
                </span>
              )}
            </div>
            <h1 className="text-sm font-bold uppercase" style={{ color: '#c4a35a', letterSpacing: '0.12em' }}>
              {t("deckBuilder.title")}
            </h1>
            <SectionDivider width={80} showDiamond />
          </div>

          {/* Deck name */}
          <div className="px-3 mb-2 flex-shrink-0">
            <input
              type="text"
              placeholder={t("deckBuilder.deckName")}
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              className="w-full px-2 py-1.5 text-xs focus:outline-none"
              style={{
                backgroundColor: '#0e0e0e',
                border: '1px solid rgba(255,255,255,0.06)',
                borderLeft: '3px solid rgba(196, 163, 90, 0.3)',
                color: '#e0e0e0',
              }}
            />
          </div>

          {/* Validation */}
          <div className="px-3 mb-2 flex flex-col gap-1 flex-shrink-0">
            <div className="flex items-center gap-2 text-[10px]" style={{
              borderLeft: `3px solid ${deckChars.length >= 30 ? '#3e8b3e' : '#b33e3e'}`,
              paddingLeft: '6px',
            }}>
              <span style={{ color: deckChars.length >= 30 ? '#3e8b3e' : '#b33e3e' }}>
                {t("deckBuilder.characters", { count: deckChars.length })} / 30
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px]" style={{
              borderLeft: `3px solid ${deckMissions.length === 3 ? '#3e8b3e' : '#b33e3e'}`,
              paddingLeft: '6px',
            }}>
              <span style={{ color: deckMissions.length === 3 ? '#3e8b3e' : '#b33e3e' }}>
                {t("deckBuilder.missions", { count: deckMissions.length })} / 3
              </span>
            </div>
            {validation.valid && (
              <div className="text-[10px]" style={{ borderLeft: '3px solid #3e8b3e', paddingLeft: '6px', color: '#3e8b3e' }}>
                {t("deckBuilder.validation.valid")}
              </div>
            )}
          </div>

          {/* Error messages */}
          {(saveError || addError) && (
            <div className="px-3 mb-2 flex-shrink-0">
              <div className="text-[10px] py-1 px-2" style={{ borderLeft: '3px solid #b33e3e', backgroundColor: 'rgba(179,62,62,0.08)', color: '#b33e3e' }}>
                {addError ? (addErrorKey ? t(addErrorKey, addErrorParams ?? {}) : addError) : saveError}
              </div>
            </div>
          )}

          <SectionDivider width={60} />

          {/* Mission slots */}
          <div className="px-3 mb-1 flex-shrink-0">
            <span className="text-[9px] uppercase font-bold" style={{ color: '#777', letterSpacing: '0.1em' }}>Missions</span>
            <div className="flex gap-1.5 mt-1">
              {[0, 1, 2].map((i) => {
                const m = deckMissions[i];
                const mImg = m ? getImagePath(m) : null;
                return (
                  <div key={i} className="relative overflow-hidden flex-1" style={{
                    aspectRatio: '3.5/2.5',
                    backgroundColor: '#0e0e0e',
                    border: m ? '1px solid rgba(196,163,90,0.2)' : '1px dashed rgba(255,255,255,0.08)',
                  }}>
                    {m ? (
                      <>
                        {mImg && (
                          <img src={mImg} alt={getCardName(m, locale as "en" | "fr")} className="w-full h-full object-cover cursor-pointer" onClick={() => setPreviewCard(m)} />
                        )}
                        <button
                          onClick={() => removeMission(i)}
                          className="absolute top-0 right-0 w-4 h-4 flex items-center justify-center text-[8px] font-bold cursor-pointer"
                          style={{ backgroundColor: 'rgba(0,0,0,0.8)', color: '#b33e3e' }}
                        >X</button>
                        <div className="absolute inset-x-0 bottom-0 px-0.5 cursor-pointer" style={{ backgroundColor: 'rgba(0,0,0,0.75)' }} onClick={() => setPreviewCard(m)}>
                          <span className="text-[7px] leading-tight block truncate" style={{ color: '#e0e0e0' }}>
                            {getCardName(m, locale as "en" | "fr")}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-[8px]" style={{ color: '#333' }}>M{i + 1}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <SectionDivider width={60} />

          {/* Character list grouped by cost */}
          <div className="px-3 mb-1 flex-shrink-0">
            <span className="text-[9px] uppercase font-bold" style={{ color: '#777', letterSpacing: '0.1em' }}>
              {t("deckBuilder.characters", { count: deckChars.length })}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-2" style={{ minHeight: 0 }}>
            {deckCharsByCost.length === 0 ? (
              <p className="text-[10px] italic mt-2" style={{ color: '#444' }}>{t("deckBuilder.clickToAdd")}</p>
            ) : (
              deckCharsByCost.map(([cost, cards]) => (
                <div key={cost} className="mb-2">
                  {/* Cost header */}
                  <div className="flex items-center gap-1.5 mb-1">
                    <div style={{ width: '5px', height: '5px', backgroundColor: '#c4a35a', transform: 'rotate(45deg)' }} />
                    <span className="text-[9px] uppercase font-bold" style={{ color: '#c4a35a', letterSpacing: '0.08em' }}>
                      {t("deckBuilder.chakra")} {cost}
                    </span>
                    <span className="text-[9px]" style={{ color: '#555' }}>({cards.length})</span>
                  </div>
                  {/* Card rows */}
                  {cards.map(({ card, originalIndex }) => (
                    <DeckCharRow
                      key={`${card.id}-${originalIndex}`}
                      card={card}
                      originalIndex={originalIndex}
                      locale={locale}
                      onRemove={() => removeChar(originalIndex)}
                      onClick={() => setPreviewCard(card)}
                    />
                  ))}
                </div>
              ))
            )}
          </div>

          {/* Action buttons */}
          <div className="px-3 py-2 flex flex-col gap-1.5 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            <AngularButton onClick={handleSave} accentColor="#3e8b3e" variant={validation.valid && !isSaving ? 'primary' : 'muted'} disabled={isSaving || !validation.valid} size="sm">
              {isSaving ? t("common.loading") : loadedDeckId ? t("deckBuilder.updateDeck") : t("deckBuilder.saveDeck")}
            </AngularButton>
            <div className="flex gap-1.5">
              <div className="flex-1">
                <AngularButton onClick={() => setShowSavedDecks(true)} variant="secondary" size="sm">
                  {t("deckBuilder.loadDeck")}
                </AngularButton>
              </div>
              <div className="flex-1">
                <AngularButton onClick={() => setShowImportModal(true)} variant="secondary" size="sm">
                  {t("deckBuilder.importButton")}
                </AngularButton>
              </div>
            </div>
            <div className="flex gap-1.5">
              <div className="flex-1">
                <Link href="/deck-builder/manage" className="block text-center text-[10px] uppercase font-bold py-1.5 no-select" style={{
                  backgroundColor: 'rgba(196,163,90,0.08)',
                  borderLeft: '3px solid rgba(196,163,90,0.5)',
                  color: '#c4a35a',
                  letterSpacing: '0.1em',
                  transform: 'skewX(-3deg)',
                }}>
                  <span style={{ display: 'inline-block', transform: 'skewX(3deg)' }}>{t("deckManager.manageButton")}</span>
                </Link>
              </div>
              <div className="flex-1">
                <AngularButton onClick={() => setShowExportModal(true)} variant="muted" disabled={deckChars.length === 0} size="sm">
                  {t("deckBuilder.exportButton")}
                </AngularButton>
              </div>
            </div>
            <AngularButton onClick={clearDeck} variant="danger" size="sm">
              {t("deckBuilder.clearDeck")}
            </AngularButton>
          </div>
        </div>

        {/* ===== MOBILE: Deck summary bar (sm/md only) ===== */}
        <div
          className="lg:hidden fixed top-0 left-0 right-0 z-40 flex items-center gap-2 px-3 py-2"
          style={{
            backgroundColor: 'rgba(8, 8, 12, 0.95)',
            borderBottom: '1px solid rgba(196, 163, 90, 0.12)',
          }}
        >
          <Link href="/" className="text-[10px] uppercase flex-shrink-0" style={{ color: '#555' }}>{t("common.back")}</Link>
          <button
            onClick={() => setShowDeckDrawer(true)}
            className="flex items-center gap-2 px-2 py-1 cursor-pointer"
            style={{ borderLeft: '3px solid rgba(196,163,90,0.4)', backgroundColor: 'rgba(255,255,255,0.02)' }}
          >
            <span className="text-[10px] font-bold uppercase" style={{ color: '#c4a35a', letterSpacing: '0.08em' }}>
              {t("deckBuilder.title")}
            </span>
            <span className="text-[10px] tabular-nums" style={{ color: deckChars.length >= 30 ? '#3e8b3e' : '#b33e3e' }}>
              {deckChars.length}/30
            </span>
            <span className="text-[10px] tabular-nums" style={{ color: deckMissions.length === 3 ? '#3e8b3e' : '#b33e3e' }}>
              M:{deckMissions.length}/3
            </span>
          </button>
          <div className="flex-1" />
          <AngularButton onClick={handleSave} accentColor="#3e8b3e" variant={validation.valid ? 'primary' : 'muted'} disabled={isSaving || !validation.valid} size="sm">
            {isSaving ? '...' : loadedDeckId ? t("deckBuilder.updateDeck") : t("deckBuilder.saveDeck")}
          </AngularButton>
        </div>

        {/* ===== CENTER: CARD CATALOG ===== */}
        <div className="flex-1 flex flex-col overflow-hidden" style={{ minWidth: 0 }}>
          {/* Sticky header */}
          <div className="flex-shrink-0 px-4 pt-3 lg:pt-3 pb-2" style={{
            backgroundColor: 'rgba(8, 8, 12, 0.9)',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            paddingTop: 'env(safe-area-inset-top)',
          }}>
            {/* Mobile top spacer */}
            <div className="lg:hidden h-8" />

            {/* Row 1: Search + Sort */}
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                placeholder={t("collection.search")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 min-w-[120px] max-w-md px-3 py-1.5 text-xs focus:outline-none"
                style={{
                  backgroundColor: '#0e0e0e',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderLeft: '3px solid rgba(196, 163, 90, 0.25)',
                  color: '#e0e0e0',
                }}
              />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortField)}
                className="px-2 py-1.5 text-[10px] focus:outline-none cursor-pointer"
                style={{ backgroundColor: '#0e0e0e', border: '1px solid rgba(255,255,255,0.06)', color: '#999' }}
              >
                <option value="number">{t("deckBuilder.sort.byNumber")}</option>
                <option value="name">{t("deckBuilder.sort.byName")}</option>
                <option value="chakra">{t("deckBuilder.sort.byChakra")}</option>
                <option value="power">{t("deckBuilder.sort.byPower")}</option>
                <option value="rarity">{t("deckBuilder.sort.byRarity")}</option>
              </select>
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="px-2 py-1.5 text-[10px] cursor-pointer"
                style={{ backgroundColor: '#0e0e0e', border: '1px solid rgba(255,255,255,0.06)', color: '#888' }}
              >
                {sortOrder === 'asc' ? '1-9' : '9-1'}
              </button>
              <span className="text-[10px] flex-shrink-0 hidden sm:inline" style={{ color: '#555' }}>
                {t("deckBuilder.filters.resultsCount", { count: filteredChars.length })}
              </span>
            </div>

            {/* Row 2: Filter chips */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar">
              {/* Rarity chips */}
              {filterOptions.rarities.map((r) => {
                const active = filterRarity.includes(r);
                const color = RARITY_COLORS[r] ?? '#888';
                return (
                  <button
                    key={`r-${r}`}
                    onClick={() => toggleArrayFilter(filterRarity, r, setFilterRarity)}
                    className="flex-shrink-0 text-[9px] font-bold uppercase px-2 py-1 cursor-pointer"
                    style={{
                      backgroundColor: active ? `${color}18` : 'rgba(255,255,255,0.02)',
                      borderLeft: active ? `2px solid ${color}` : '2px solid transparent',
                      color: active ? color : '#555',
                      transform: 'skewX(-2deg)',
                      letterSpacing: '0.06em',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{ display: 'inline-block', transform: 'skewX(2deg)' }}>
                      {getRarityLabel(r, locale as "en" | "fr")}
                    </span>
                  </button>
                );
              })}

              {/* Separator */}
              <div className="w-px h-4 flex-shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />

              {/* Effect type chips */}
              {(['MAIN', 'UPGRADE', 'AMBUSH', 'SCORE'] as EffectType[]).map((et) => {
                const active = filterEffectType.includes(et);
                const color = EFFECT_TYPE_COLORS[et];
                return (
                  <button
                    key={`e-${et}`}
                    onClick={() => toggleArrayFilter(filterEffectType, et, setFilterEffectType)}
                    className="flex-shrink-0 text-[9px] font-bold uppercase px-2 py-1 cursor-pointer"
                    style={{
                      backgroundColor: active ? `${color}18` : 'rgba(255,255,255,0.02)',
                      borderLeft: active ? `2px solid ${color}` : '2px solid transparent',
                      color: active ? color : '#555',
                      transform: 'skewX(-2deg)',
                      letterSpacing: '0.06em',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{ display: 'inline-block', transform: 'skewX(2deg)' }}>{et}</span>
                  </button>
                );
              })}

              {/* Separator */}
              <div className="w-px h-4 flex-shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />

              {/* Group chips */}
              {filterOptions.groups.map((g) => {
                const active = filterGroup.includes(g);
                return (
                  <button
                    key={`g-${g}`}
                    onClick={() => toggleArrayFilter(filterGroup, g, setFilterGroup)}
                    className="flex-shrink-0 text-[9px] px-2 py-1 cursor-pointer"
                    style={{
                      backgroundColor: active ? 'rgba(62,139,62,0.12)' : 'rgba(255,255,255,0.02)',
                      borderLeft: active ? '2px solid #3e8b3e' : '2px solid transparent',
                      color: active ? '#6b8a6b' : '#555',
                      transform: 'skewX(-2deg)',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{ display: 'inline-block', transform: 'skewX(2deg)' }}>
                      {getCardGroup(g, locale as "en" | "fr")}
                    </span>
                  </button>
                );
              })}

              {/* Advanced filters toggle */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex-shrink-0 text-[9px] px-2 py-1 cursor-pointer"
                style={{
                  backgroundColor: showFilters ? 'rgba(74,122,181,0.12)' : 'rgba(255,255,255,0.02)',
                  borderLeft: showFilters ? '2px solid #4a7ab5' : '2px solid transparent',
                  color: showFilters ? '#4a7ab5' : '#555',
                  transform: 'skewX(-2deg)',
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ display: 'inline-block', transform: 'skewX(2deg)' }}>
                  +{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                </span>
              </button>

              {/* Clear all */}
              {hasActiveFilters && (
                <button
                  onClick={clearAllFilters}
                  className="flex-shrink-0 text-[9px] px-2 py-1 cursor-pointer"
                  style={{
                    backgroundColor: 'rgba(179,62,62,0.1)',
                    borderLeft: '2px solid #b33e3e',
                    color: '#b33e3e',
                    transform: 'skewX(-2deg)',
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{ display: 'inline-block', transform: 'skewX(2deg)' }}>{t("deckBuilder.filters.clear")}</span>
                </button>
              )}
            </div>

            {/* Row 3: Advanced filters (expandable) */}
            <AnimatePresence>
              {showFilters && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden"
                >
                  <div className="pt-2 flex flex-col gap-2">
                    {/* Keywords */}
                    <div>
                      <span className="text-[9px] uppercase font-bold block mb-1" style={{ color: '#666', letterSpacing: '0.08em' }}>
                        {t("deckBuilder.filters.keywords")}
                      </span>
                      <div className="flex gap-1 flex-wrap max-h-[60px] overflow-y-auto">
                        {filterOptions.keywords.map((kw) => {
                          const active = filterKeywords.includes(kw);
                          return (
                            <button
                              key={kw}
                              onClick={() => toggleArrayFilter(filterKeywords, kw, setFilterKeywords)}
                              className="px-1.5 py-0.5 text-[8px] cursor-pointer"
                              style={{
                                backgroundColor: active ? 'rgba(153,153,187,0.12)' : 'rgba(255,255,255,0.02)',
                                borderLeft: active ? '2px solid #9999bb' : '2px solid transparent',
                                color: active ? '#9999bb' : '#444',
                                transition: 'all 0.15s',
                              }}
                            >
                              {getCardKeyword(kw, locale as "en" | "fr")}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Chakra + Power ranges */}
                    <div className="flex gap-4">
                      <div>
                        <span className="text-[9px] uppercase font-bold block mb-1" style={{ color: '#666', letterSpacing: '0.08em' }}>
                          {t("deckBuilder.filters.chakraCost")}
                        </span>
                        <div className="flex items-center gap-1">
                          <input type="number" min={0} max={filterOptions.maxChakra} value={filterChakraMin}
                            onChange={(e) => setFilterChakraMin(Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-10 px-1 py-0.5 text-[10px] text-center focus:outline-none"
                            style={{ backgroundColor: '#0e0e0e', border: '1px solid rgba(255,255,255,0.06)', color: '#e0e0e0' }}
                          />
                          <span className="text-[10px]" style={{ color: '#444' }}>-</span>
                          <input type="number" min={0} max={filterOptions.maxChakra} value={filterChakraMax}
                            onChange={(e) => setFilterChakraMax(Math.min(filterOptions.maxChakra, parseInt(e.target.value) || 0))}
                            className="w-10 px-1 py-0.5 text-[10px] text-center focus:outline-none"
                            style={{ backgroundColor: '#0e0e0e', border: '1px solid rgba(255,255,255,0.06)', color: '#e0e0e0' }}
                          />
                        </div>
                      </div>
                      <div>
                        <span className="text-[9px] uppercase font-bold block mb-1" style={{ color: '#666', letterSpacing: '0.08em' }}>
                          {t("deckBuilder.filters.power")}
                        </span>
                        <div className="flex items-center gap-1">
                          <input type="number" min={0} max={filterOptions.maxPower} value={filterPowerMin}
                            onChange={(e) => setFilterPowerMin(Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-10 px-1 py-0.5 text-[10px] text-center focus:outline-none"
                            style={{ backgroundColor: '#0e0e0e', border: '1px solid rgba(255,255,255,0.06)', color: '#e0e0e0' }}
                          />
                          <span className="text-[10px]" style={{ color: '#444' }}>-</span>
                          <input type="number" min={0} max={filterOptions.maxPower} value={filterPowerMax}
                            onChange={(e) => setFilterPowerMax(Math.min(filterOptions.maxPower, parseInt(e.target.value) || 0))}
                            className="w-10 px-1 py-0.5 text-[10px] text-center focus:outline-none"
                            style={{ backgroundColor: '#0e0e0e', border: '1px solid rgba(255,255,255,0.06)', color: '#e0e0e0' }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Scrollable card grid area */}
          <div className="flex-1 overflow-y-auto px-4 py-3" style={{ minHeight: 0 }}>
            {/* Missions section */}
            <div className="flex items-center gap-2 mb-2">
              <div style={{ width: '5px', height: '5px', backgroundColor: '#c4a35a', transform: 'rotate(45deg)' }} />
              <span className="text-[10px] uppercase font-bold" style={{ color: '#c4a35a', letterSpacing: '0.1em' }}>
                Missions
              </span>
              <span className="text-[10px]" style={{ color: '#555' }}>({availableMissions.filter(m => !bannedIds.has(m.id)).length})</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 mb-4">
              {availableMissions.filter((m) => !bannedIds.has(m.id)).map((m) => {
                const mImgPath = getImagePath(m);
                const check = canAddMission(m);
                return (
                  <button
                    key={m.id}
                    onClick={() => addMission(m)}
                    className="relative w-full mission-aspect overflow-hidden group cursor-pointer"
                    style={{
                      backgroundColor: '#0e0e0e',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderBottom: '3px solid rgba(196,163,90,0.25)',
                      opacity: check.allowed ? 1 : 0.5,
                    }}
                    title={getCardName(m, locale as "en" | "fr")}
                  >
                    {mImgPath ? (
                      <img src={mImgPath} alt={getCardName(m, locale as "en" | "fr")} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-[9px]" style={{ color: '#555' }}>{getCardName(m, locale as "en" | "fr")}</span>
                      </div>
                    )}
                    {/* Hover overlay */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}>
                      {check.allowed ? (
                        <span className="text-xl font-bold" style={{ color: '#3e8b3e' }}>+</span>
                      ) : (
                        <span className="text-[9px] text-center px-1" style={{ color: '#b33e3e' }}>{check.reason}</span>
                      )}
                    </div>
                    {/* Name label */}
                    <div className="absolute inset-x-0 bottom-0 px-1 py-0.5" style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}>
                      <span className="text-[8px] leading-tight block truncate" style={{ color: '#e0e0e0' }}>
                        {getCardName(m, locale as "en" | "fr")}
                      </span>
                    </div>
                    {/* Detail button */}
                    <button
                      className="absolute top-0.5 right-0.5 px-1 py-0.5 text-[7px] font-bold uppercase opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10"
                      style={{ backgroundColor: 'rgba(0,0,0,0.85)', color: '#c4a35a', borderLeft: '2px solid rgba(196,163,90,0.4)' }}
                      onClick={(e) => { e.stopPropagation(); setPreviewCard(m); }}
                    >
                      {t("deckBuilder.detailBtn")}
                    </button>
                  </button>
                );
              })}
            </div>

            {/* Divider */}
            <div className="flex items-center gap-2 mb-2 mt-1">
              <div className="flex-1 h-px" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }} />
              <div style={{ width: '4px', height: '4px', backgroundColor: 'rgba(196,163,90,0.3)', transform: 'rotate(45deg)' }} />
              <div className="flex-1 h-px" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }} />
            </div>

            {/* Characters section */}
            <div className="flex items-center gap-2 mb-2">
              <div style={{ width: '5px', height: '5px', backgroundColor: '#888', transform: 'rotate(45deg)' }} />
              <span className="text-[10px] uppercase font-bold" style={{ color: '#999', letterSpacing: '0.1em' }}>
                {t("deckBuilder.characters", { count: filteredChars.length })}
              </span>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 gap-2">
              {paginatedChars.map((card) => (
                <CatalogCardItem
                  key={card.id}
                  card={card}
                  addCheck={addCheckMap.get(card.id) ?? { allowed: true }}
                  inDeckCount={deckCardCounts.get(card.id) || 0}
                  locale={locale}
                  onAdd={() => handleAddChar(card)}
                  onClick={() => handlePreviewCard(card)}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalCharPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4 mb-2">
                <button
                  onClick={() => setCharPage((p) => Math.max(1, p - 1))}
                  disabled={charPage <= 1}
                  className="px-2.5 py-1 text-[10px] uppercase font-bold cursor-pointer disabled:opacity-30 disabled:cursor-default"
                  style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderLeft: '2px solid rgba(255,255,255,0.1)', color: '#888' }}
                >
                  {t('common.previous')}
                </button>
                {/* Page numbers */}
                {Array.from({ length: Math.min(5, totalCharPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalCharPages <= 5) {
                    pageNum = i + 1;
                  } else if (charPage <= 3) {
                    pageNum = i + 1;
                  } else if (charPage >= totalCharPages - 2) {
                    pageNum = totalCharPages - 4 + i;
                  } else {
                    pageNum = charPage - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCharPage(pageNum)}
                      className="w-7 h-7 text-[10px] font-bold tabular-nums cursor-pointer"
                      style={{
                        backgroundColor: charPage === pageNum ? 'rgba(196,163,90,0.15)' : 'rgba(255,255,255,0.02)',
                        borderLeft: charPage === pageNum ? '2px solid #c4a35a' : '2px solid transparent',
                        color: charPage === pageNum ? '#c4a35a' : '#555',
                      }}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  onClick={() => setCharPage((p) => Math.min(totalCharPages, p + 1))}
                  disabled={charPage >= totalCharPages}
                  className="px-2.5 py-1 text-[10px] uppercase font-bold cursor-pointer disabled:opacity-30 disabled:cursor-default"
                  style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderLeft: '2px solid rgba(255,255,255,0.1)', color: '#888' }}
                >
                  {t('common.next')}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ===== RIGHT: CARD DETAIL PANEL (desktop) ===== */}
        <AnimatePresence>
          {previewCard && (
            <motion.div
              key="detail-panel"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 280, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="hidden lg:flex flex-col overflow-hidden flex-shrink-0"
              style={{
                backgroundColor: 'rgba(8, 8, 12, 0.95)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderLeft: '3px solid rgba(196, 163, 90, 0.25)',
              }}
            >
              <div className="flex-1 overflow-y-auto px-3 py-3" style={{ minHeight: 0 }}>
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] uppercase font-bold" style={{ color: '#c4a35a', letterSpacing: '0.1em' }}>
                    {t("deckBuilder.detailBtn")}
                  </span>
                  <button
                    onClick={() => setPreviewCard(null)}
                    className="w-5 h-5 flex items-center justify-center cursor-pointer"
                    style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderLeft: '2px solid rgba(255,255,255,0.1)', color: '#888', fontSize: '10px', fontWeight: 700 }}
                  >x</button>
                </div>
                {renderCardDetail(previewCard)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ===== MOBILE: Deck drawer ===== */}
      <AnimatePresence>
        {showDeckDrawer && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 z-50"
              style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
              onClick={() => setShowDeckDrawer(false)}
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="lg:hidden fixed top-0 left-0 bottom-0 z-50 flex flex-col overflow-hidden"
              style={{
                width: '280px',
                maxWidth: '85vw',
                backgroundColor: 'rgba(8, 8, 12, 0.98)',
                borderRight: '1px solid rgba(196,163,90,0.15)',
              }}
            >
              {/* Close */}
              <div className="flex items-center justify-between px-3 pt-3 pb-1 flex-shrink-0">
                <h1 className="text-sm font-bold uppercase" style={{ color: '#c4a35a', letterSpacing: '0.12em' }}>
                  {t("deckBuilder.title")}
                </h1>
                <button onClick={() => setShowDeckDrawer(false)} className="text-[10px] font-bold cursor-pointer" style={{ color: '#888' }}>X</button>
              </div>

              <SectionDivider width={80} showDiamond />

              {/* Deck name */}
              <div className="px-3 mb-2 flex-shrink-0">
                <input
                  type="text"
                  placeholder={t("deckBuilder.deckName")}
                  value={deckName}
                  onChange={(e) => setDeckName(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs focus:outline-none"
                  style={{ backgroundColor: '#0e0e0e', border: '1px solid rgba(255,255,255,0.06)', borderLeft: '3px solid rgba(196, 163, 90, 0.3)', color: '#e0e0e0' }}
                />
              </div>

              {/* Validation */}
              <div className="px-3 mb-2 flex flex-col gap-1 flex-shrink-0">
                <div className="text-[10px]" style={{ borderLeft: `3px solid ${deckChars.length >= 30 ? '#3e8b3e' : '#b33e3e'}`, paddingLeft: '6px', color: deckChars.length >= 30 ? '#3e8b3e' : '#b33e3e' }}>
                  {t("deckBuilder.characters", { count: deckChars.length })} / 30
                </div>
                <div className="text-[10px]" style={{ borderLeft: `3px solid ${deckMissions.length === 3 ? '#3e8b3e' : '#b33e3e'}`, paddingLeft: '6px', color: deckMissions.length === 3 ? '#3e8b3e' : '#b33e3e' }}>
                  {t("deckBuilder.missions", { count: deckMissions.length })} / 3
                </div>
              </div>

              <SectionDivider width={60} />

              {/* Missions */}
              <div className="px-3 mb-1 flex-shrink-0">
                <span className="text-[9px] uppercase font-bold" style={{ color: '#777', letterSpacing: '0.1em' }}>Missions</span>
                <div className="flex gap-1.5 mt-1">
                  {[0, 1, 2].map((i) => {
                    const m = deckMissions[i];
                    const mImg = m ? getImagePath(m) : null;
                    return (
                      <div key={i} className="relative overflow-hidden flex-1" style={{
                        aspectRatio: '3.5/2.5',
                        backgroundColor: '#0e0e0e',
                        border: m ? '1px solid rgba(196,163,90,0.2)' : '1px dashed rgba(255,255,255,0.08)',
                      }}>
                        {m ? (
                          <>
                            {mImg && <img src={mImg} alt={getCardName(m, locale as "en" | "fr")} className="w-full h-full object-cover" />}
                            <button onClick={() => removeMission(i)} className="absolute top-0 right-0 w-4 h-4 flex items-center justify-center text-[8px] font-bold cursor-pointer" style={{ backgroundColor: 'rgba(0,0,0,0.8)', color: '#b33e3e' }}>X</button>
                          </>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center"><span className="text-[8px]" style={{ color: '#333' }}>M{i + 1}</span></div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <SectionDivider width={60} />

              {/* Character list */}
              <div className="px-3 mb-1 flex-shrink-0">
                <span className="text-[9px] uppercase font-bold" style={{ color: '#777', letterSpacing: '0.1em' }}>
                  {t("deckBuilder.characters", { count: deckChars.length })}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto px-3 pb-2" style={{ minHeight: 0 }}>
                {deckCharsByCost.length === 0 ? (
                  <p className="text-[10px] italic mt-2" style={{ color: '#444' }}>{t("deckBuilder.clickToAdd")}</p>
                ) : (
                  deckCharsByCost.map(([cost, cards]) => (
                    <div key={cost} className="mb-2">
                      <div className="flex items-center gap-1.5 mb-1">
                        <div style={{ width: '5px', height: '5px', backgroundColor: '#c4a35a', transform: 'rotate(45deg)' }} />
                        <span className="text-[9px] uppercase font-bold" style={{ color: '#c4a35a', letterSpacing: '0.08em' }}>{t("deckBuilder.chakra")} {cost}</span>
                        <span className="text-[9px]" style={{ color: '#555' }}>({cards.length})</span>
                      </div>
                      {cards.map(({ card, originalIndex }) => (
                        <DeckCharRow
                          key={`${card.id}-${originalIndex}`}
                          card={card}
                          originalIndex={originalIndex}
                          locale={locale}
                          onRemove={() => removeChar(originalIndex)}
                          onClick={() => setPreviewCard(card)}
                        />
                      ))}
                    </div>
                  ))
                )}
              </div>

              {/* Actions */}
              <div className="px-3 py-2 flex flex-col gap-1.5 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <AngularButton onClick={handleSave} accentColor="#3e8b3e" variant={validation.valid ? 'primary' : 'muted'} disabled={isSaving || !validation.valid} size="sm">
                  {isSaving ? t("common.loading") : loadedDeckId ? t("deckBuilder.updateDeck") : t("deckBuilder.saveDeck")}
                </AngularButton>
                <div className="flex gap-1.5">
                  <div className="flex-1"><AngularButton onClick={() => { setShowDeckDrawer(false); setShowSavedDecks(true); }} variant="secondary" size="sm">{t("deckBuilder.loadDeck")}</AngularButton></div>
                  <div className="flex-1"><AngularButton onClick={() => { setShowDeckDrawer(false); setShowImportModal(true); }} variant="secondary" size="sm">{t("deckBuilder.importButton")}</AngularButton></div>
                </div>
                <AngularButton onClick={() => { setShowDeckDrawer(false); setShowExportModal(true); }} variant="muted" disabled={deckChars.length === 0} size="sm">{t("deckBuilder.exportButton")}</AngularButton>
                <AngularButton onClick={clearDeck} variant="danger" size="sm">{t("deckBuilder.clearDeck")}</AngularButton>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ===== MOBILE: Card detail bottom sheet ===== */}
      <AnimatePresence>
        {previewCard && (
          <motion.div
            key="mobile-detail"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 32 }}
            className="lg:hidden fixed bottom-0 left-0 right-0 z-40 overflow-y-auto"
            style={{
              backgroundColor: 'rgba(8, 8, 12, 0.98)',
              borderTop: '2px solid rgba(196, 163, 90, 0.25)',
              maxHeight: '70vh',
            }}
          >
            <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase font-bold" style={{ color: '#c4a35a', letterSpacing: '0.1em' }}>
                  {t("deckBuilder.detailBtn")}
                </span>
                <button
                  onClick={() => setPreviewCard(null)}
                  className="px-2 py-1 text-[10px] font-bold cursor-pointer"
                  style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderLeft: '2px solid rgba(255,255,255,0.1)', color: '#888' }}
                >X</button>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0">
                  {renderCardDetail(previewCard, true)}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== MODAL: Saved Decks ===== */}
      <AnimatePresence>
        {showSavedDecks && (
          <PopupOverlay>
            <PopupCornerFrame accentColor="rgba(196, 163, 90, 0.35)" maxWidth="480px">
              <PopupTitle accentColor="#c4a35a" size="lg">{t("deckBuilder.myDecks")}</PopupTitle>

              {isLoading && <p className="text-xs italic text-center" style={{ color: '#555' }}>{t("common.loading")}</p>}
              {!isLoading && savedDecks.length === 0 && <p className="text-xs italic text-center" style={{ color: '#555' }}>{t("deckBuilder.noSavedDecks")}</p>}

              <div className="flex flex-col gap-2 my-4 max-h-[50vh] overflow-y-auto">
                {savedDecks.map((deck) => {
                  const isActive = loadedDeckId === deck.id;
                  const isConfirming = confirmDeleteId === deck.id;
                  return (
                    <div key={deck.id} className="flex items-center gap-3 px-3 py-2" style={{
                      backgroundColor: 'rgba(255,255,255,0.02)',
                      borderLeft: `3px solid ${isActive ? '#3e8b3e' : 'rgba(196,163,90,0.2)'}`,
                    }}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium truncate" style={{ color: '#e0e0e0' }}>{deck.name}</span>
                          {isActive && (
                            <span className="text-[8px] uppercase px-1 py-0.5 flex-shrink-0" style={{ backgroundColor: 'rgba(62,139,62,0.15)', borderLeft: '2px solid #3e8b3e', color: '#3e8b3e' }}>
                              {t("deckBuilder.currentlyEditing")}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px]" style={{ color: '#555' }}>
                          {t("deckBuilder.savedDeckInfo", { cards: deck.cardIds.length, missions: deck.missionIds.length })}
                        </span>
                      </div>
                      {isConfirming ? (
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="text-[10px]" style={{ color: '#b33e3e' }}>{t("deckBuilder.confirmDelete", { name: deck.name })}</span>
                          <PopupActionButton accentColor="#b33e3e" onClick={() => { handleDeleteDeck(deck.id); setConfirmDeleteId(null); }}>
                            {t("common.confirm")}
                          </PopupActionButton>
                          <PopupDismissLink onClick={() => setConfirmDeleteId(null)}>{t("common.cancel")}</PopupDismissLink>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <AngularButton onClick={() => { handleLoadDeck(deck.id); setShowSavedDecks(false); }} variant={isActive ? 'primary' : 'secondary'} accentColor="#3e8b3e" size="sm">
                            {t("deckBuilder.editDeck")}
                          </AngularButton>
                          <AngularButton onClick={() => setConfirmDeleteId(deck.id)} variant="danger" size="sm">
                            {t("deckBuilder.deleteDeck")}
                          </AngularButton>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between">
                <AngularButton onClick={() => { clearDeck(); setShowSavedDecks(false); }} accentColor="#3e8b3e" variant="primary" size="sm">
                  + {t("deckBuilder.newDeck")}
                </AngularButton>
                <PopupDismissLink onClick={() => setShowSavedDecks(false)}>{t("common.close")}</PopupDismissLink>
              </div>
            </PopupCornerFrame>
          </PopupOverlay>
        )}
      </AnimatePresence>

      {/* ===== MODAL: Import ===== */}
      <AnimatePresence>
        {showImportModal && (
          <PopupOverlay>
            <PopupCornerFrame accentColor="rgba(74, 122, 181, 0.35)" maxWidth="480px">
              <PopupTitle accentColor="#4a7ab5" size="lg">{t("deckBuilder.importTitle")}</PopupTitle>

              <p className="text-xs mb-3" style={{ color: '#888', borderLeft: '3px solid rgba(74,122,181,0.3)', paddingLeft: '8px' }}>
                {t("deckBuilder.importDesc")}
              </p>

              <div className="mb-3">
                <a
                  href="https://shinobuilder.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-[10px] uppercase font-bold px-3 py-1.5"
                  style={{ backgroundColor: 'rgba(74,122,181,0.12)', borderLeft: '3px solid #4a7ab5', color: '#4a7ab5', letterSpacing: '0.08em' }}
                >
                  {t("deckBuilder.importVisit")}
                </a>
              </div>

              <div className="flex items-center gap-2 mb-3">
                <input
                  type="text"
                  placeholder={t("deckBuilder.importPlaceholder")}
                  value={importCode}
                  onChange={(e) => setImportCode(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleImport(); }}
                  className="flex-1 px-3 py-1.5 text-xs font-mono focus:outline-none"
                  style={{ backgroundColor: '#0e0e0e', border: '1px solid rgba(255,255,255,0.06)', borderLeft: '3px solid rgba(74,122,181,0.3)', color: '#e0e0e0' }}
                />
                <PopupActionButton accentColor="#3e8b3e" onClick={handleImport} disabled={!importCode.trim()}>
                  {t("deckBuilder.importButton")}
                </PopupActionButton>
              </div>

              {importMessage && (
                <div className="text-xs mb-3 py-1 px-2" style={{
                  borderLeft: `3px solid ${importMessage.type === 'success' ? '#3e8b3e' : '#b33e3e'}`,
                  backgroundColor: importMessage.type === 'success' ? 'rgba(62,139,62,0.08)' : 'rgba(179,62,62,0.08)',
                  color: importMessage.type === 'success' ? '#3e8b3e' : '#b33e3e',
                }}>
                  {importMessage.text}
                </div>
              )}

              <PopupDismissLink onClick={() => { setShowImportModal(false); setImportMessage(null); }}>{t("common.close")}</PopupDismissLink>
            </PopupCornerFrame>
          </PopupOverlay>
        )}
      </AnimatePresence>

      {/* ===== MODAL: Export ===== */}
      <AnimatePresence>
        {showExportModal && (
          <PopupOverlay>
            <PopupCornerFrame accentColor="rgba(196, 163, 90, 0.35)" maxWidth="480px">
              <PopupTitle accentColor="#c4a35a" size="lg">{t("deckBuilder.exportTitle")}</PopupTitle>

              <div className="flex gap-2 mb-4">
                <PopupActionButton accentColor="#c4a35a" onClick={() => { exportDeckAsImage(deckName, deckChars, deckMissions); setShowExportModal(false); }}>
                  {t("deckBuilder.exportAsImage")}
                </PopupActionButton>
              </div>

              <p className="text-xs mb-2" style={{ color: '#888', borderLeft: '3px solid rgba(196,163,90,0.3)', paddingLeft: '8px' }}>
                {t("deckBuilder.exportTextDesc")}
              </p>

              <div className="flex items-center gap-2 mb-3">
                <input
                  type="text"
                  readOnly
                  value={exportCode}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  className="flex-1 px-3 py-1.5 text-xs font-mono focus:outline-none"
                  style={{ backgroundColor: '#0e0e0e', border: '1px solid rgba(255,255,255,0.06)', borderLeft: '3px solid rgba(196,163,90,0.3)', color: '#e0e0e0' }}
                />
                <PopupActionButton accentColor={exportCopied ? '#3e8b3e' : '#c4a35a'} onClick={handleCopyExportCode}>
                  {exportCopied ? t("deckBuilder.exportCopied") : t("deckBuilder.exportCopy")}
                </PopupActionButton>
              </div>

              <PopupDismissLink onClick={() => { setShowExportModal(false); setExportCopied(false); }}>{t("common.close")}</PopupDismissLink>
            </PopupCornerFrame>
          </PopupOverlay>
        )}
      </AnimatePresence>

      {/* ===== MODAL: Overwrite Confirm ===== */}
      <AnimatePresence>
        {overwriteConflict && (
          <PopupOverlay>
            <PopupCornerFrame accentColor="rgba(179, 62, 62, 0.35)" maxWidth="400px">
              <PopupTitle accentColor="#b33e3e" size="md">{t('deckBuilder.overwriteTitle')}</PopupTitle>
              <p className="text-xs mb-4" style={{ color: '#888' }}>
                {t('deckBuilder.overwriteDesc', { name: overwriteConflict.name })}
              </p>
              <div className="flex gap-2 justify-end">
                <PopupDismissLink onClick={() => setOverwriteConflict(null)}>{t('deckBuilder.overwriteCancel')}</PopupDismissLink>
                <PopupActionButton accentColor="#b33e3e" onClick={handleOverwriteConfirm}>
                  {t('deckBuilder.overwriteConfirm')}
                </PopupActionButton>
              </div>
            </PopupCornerFrame>
          </PopupOverlay>
        )}
      </AnimatePresence>
    </main>
  );
}
