"use client";

import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useSession } from "next-auth/react";
import { Link } from "@/lib/i18n/navigation";
import { CloudBackground } from "@/components/CloudBackground";
import { DecorativeIcons } from "@/components/DecorativeIcons";
import type { CharacterCard, MissionCard } from "@/lib/engine/types";
import { validateDeck } from "@/lib/engine/rules/DeckValidation";
import { useDeckBuilderStore } from "@/stores/deckBuilderStore";
import { useBannedCards } from "@/lib/hooks/useBannedCards";
import { normalizeImagePath } from "@/lib/utils/imagePath";
import {
  getCardName, getCardTitle, getCardGroup, getCardKeyword, getRarityLabel,
} from "@/lib/utils/cardLocale";
import { effectDescriptionsEn } from "@/lib/data/effectDescriptionsEn";
import { effectDescriptionsFr } from "@/lib/data/effectTranslationsFr";
import { exportDeckAsImage } from "@/lib/utils/exportDeckImage";
import {
  PopupOverlay, PopupCornerFrame, PopupTitle, PopupActionButton,
  PopupDismissLink, SectionDivider, AngularButton,
} from "@/components/game/PopupPrimitives";

// ───────────────────── CONSTANTS ─────────────────────

const RARITY_COLORS: Record<string, string> = {
  C: '#888888', UC: '#3e8b3e', R: '#c4a35a', RA: '#c4a35a',
  S: '#b33e3e', M: '#6a6abb', Legendary: '#c4a35a', Mission: '#c4a35a',
};
const RARITY_ORDER: Record<string, number> = { C: 0, UC: 1, R: 2, RA: 3, S: 4, M: 5, Legendary: 6 };
const EFFECT_TYPE_COLORS: Record<string, string> = {
  MAIN: '#c4a35a', UPGRADE: '#3e8b3e', AMBUSH: '#b33e3e', SCORE: '#6a6abb',
};
type SortField = 'number' | 'name' | 'chakra' | 'power' | 'rarity';
const normalizeStr = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// ───────────────────── ADVANCED SEARCH PARSER ─────────────────────

interface SearchFilter {
  nameQuery: string;
  chakra: Array<{ op: '=' | '>' | '>=' | '<' | '<='; val: number }>;
  power: Array<{ op: '=' | '>' | '>=' | '<' | '<='; val: number }>;
  keywords: string[];
  groups: string[];
  rarities: string[];
  effects: string[]; // effect types: MAIN, UPGRADE, AMBUSH, SCORE
  effectText: string[]; // search in any effect text: e:move
  effectMainText: string[]; // em:hide — search in MAIN effect text
  effectUpgradeText: string[]; // eup:move — search in UPGRADE effect text
  effectAmbushText: string[]; // ea:defeat — search in AMBUSH effect text
  effectScoreText: string[]; // es:draw — search in SCORE effect text
}

function parseSearchQuery(raw: string): SearchFilter {
  const filter: SearchFilter = {
    nameQuery: '', chakra: [], power: [], keywords: [], groups: [],
    rarities: [], effects: [], effectText: [],
    effectMainText: [], effectUpgradeText: [], effectAmbushText: [], effectScoreText: [],
  };
  // Match typed effect tokens: em:, eup:, ea:, es:, e:
  // Match other tokens: c, p, k, g, r
  const tokenRegex = /(eup|em|ea|es|[cpkgre])(:|=|>=|<=|>|<)("([^"]+)"|(\S+))/gi;
  let remaining = raw;

  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(raw)) !== null) {
    const key = match[1].toLowerCase();
    const op = match[2] === ':' ? '=' : match[2];
    const value = match[4] ?? match[5];
    remaining = remaining.replace(match[0], '');

    switch (key) {
      case 'c': {
        const num = parseInt(value, 10);
        if (!isNaN(num)) filter.chakra.push({ op: op as '=' | '>' | '>=' | '<' | '<=', val: num });
        break;
      }
      case 'p': {
        const num = parseInt(value, 10);
        if (!isNaN(num)) filter.power.push({ op: op as '=' | '>' | '>=' | '<' | '<=', val: num });
        break;
      }
      case 'k': filter.keywords.push(normalizeStr(value)); break;
      case 'g': filter.groups.push(normalizeStr(value)); break;
      case 'r': filter.rarities.push(value.toUpperCase()); break;
      case 'e': {
        const upper = value.toUpperCase();
        if (['MAIN', 'UPGRADE', 'AMBUSH', 'SCORE'].includes(upper)) {
          filter.effects.push(upper);
        } else {
          filter.effectText.push(normalizeStr(value));
        }
        break;
      }
      case 'em': filter.effectMainText.push(normalizeStr(value)); break;
      case 'eup': filter.effectUpgradeText.push(normalizeStr(value)); break;
      case 'ea': filter.effectAmbushText.push(normalizeStr(value)); break;
      case 'es': filter.effectScoreText.push(normalizeStr(value)); break;
    }
  }

  filter.nameQuery = normalizeStr(remaining.trim());
  return filter;
}

function compareOp(actual: number, op: string, target: number): boolean {
  switch (op) {
    case '=': return actual === target;
    case '>': return actual > target;
    case '>=': return actual >= target;
    case '<': return actual < target;
    case '<=': return actual <= target;
    default: return true;
  }
}

function matchesSearchFilter(card: CharacterCard, filter: SearchFilter, locale: string): boolean {
  // Name / title / ID
  if (filter.nameQuery) {
    const q = filter.nameQuery;
    const matchesName = normalizeStr(getCardName(card, locale as 'en' | 'fr')).includes(q) ||
      normalizeStr(getCardTitle(card, locale as 'en' | 'fr')).includes(q) ||
      normalizeStr(card.name_fr).includes(q) ||
      card.id.toLowerCase().includes(q);
    if (!matchesName) return false;
  }
  // Chakra
  for (const c of filter.chakra) {
    if (!compareOp(card.chakra ?? 0, c.op, c.val)) return false;
  }
  // Power
  for (const p of filter.power) {
    if (!compareOp(card.power ?? 0, p.op, p.val)) return false;
  }
  // Keywords
  for (const k of filter.keywords) {
    if (!card.keywords?.some((kw) => normalizeStr(kw).includes(k))) return false;
  }
  // Group
  for (const g of filter.groups) {
    if (!card.group || !normalizeStr(card.group).includes(g)) return false;
  }
  // Rarity
  if (filter.rarities.length > 0) {
    if (!filter.rarities.includes(card.rarity)) return false;
  }
  // Effect type
  if (filter.effects.length > 0) {
    if (!card.effects?.some((e) => filter.effects.includes(e.type))) return false;
  }
  // Effect text search (any effect)
  for (const t of filter.effectText) {
    if (!card.effects?.some((e) => normalizeStr(e.description).includes(t))) return false;
  }
  // Typed effect text: em: (MAIN), eup: (UPGRADE), ea: (AMBUSH), es: (SCORE)
  for (const t of filter.effectMainText) {
    if (!card.effects?.some((e) => e.type === 'MAIN' && normalizeStr(e.description).includes(t))) return false;
  }
  for (const t of filter.effectUpgradeText) {
    if (!card.effects?.some((e) => e.type === 'UPGRADE' && normalizeStr(e.description).includes(t))) return false;
  }
  for (const t of filter.effectAmbushText) {
    if (!card.effects?.some((e) => e.type === 'AMBUSH' && normalizeStr(e.description).includes(t))) return false;
  }
  for (const t of filter.effectScoreText) {
    if (!card.effects?.some((e) => e.type === 'SCORE' && normalizeStr(e.description).includes(t))) return false;
  }
  return true;
}

// ───────────────────── CATALOG CHARACTER CARD ─────────────────────

const CatalogCard = memo(function CatalogCard({
  card, allowed, inDeckCount, onAdd, onHover,
}: {
  card: CharacterCard;
  allowed: boolean;
  inDeckCount: number;
  onAdd: (card: CharacterCard) => void;
  onHover: (card: CharacterCard | MissionCard) => void;
}) {
  const imgPath = normalizeImagePath(card.image_file);
  return (
    <button
      onClick={() => { onAdd(card); onHover(card); }}
      onMouseEnter={() => onHover(card)}
      className="relative w-full overflow-hidden group cursor-pointer"
      style={{
        aspectRatio: '5/7',
        backgroundColor: '#0e0e0e',
        borderBottom: `2px solid ${RARITY_COLORS[card.rarity] ?? '#888'}`,
        opacity: allowed ? 1 : 0.35,
      }}
    >
      {imgPath ? (
        <img src={imgPath} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
      ) : (
        <div className="w-full h-full" style={{ backgroundColor: '#111' }} />
      )}
      <div className="absolute top-0 left-0 px-1 text-[7px] font-bold leading-tight"
        style={{ backgroundColor: 'rgba(196,163,90,0.9)', color: '#0a0a0a' }}>{card.chakra}</div>
      {inDeckCount > 0 && (
        <div className="absolute top-0 right-0 px-1 text-[7px] font-bold"
          style={{ backgroundColor: inDeckCount >= 2 ? 'rgba(179,62,62,0.9)' : 'rgba(62,139,62,0.9)', color: '#fff' }}>
          x{inDeckCount}
        </div>
      )}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 flex items-center justify-center pointer-events-none"
        style={{ backgroundColor: allowed ? 'rgba(62,139,62,0.35)' : 'rgba(179,62,62,0.35)', transition: 'opacity 80ms' }}>
        <span className="text-lg font-bold" style={{ color: '#fff' }}>{allowed ? '+' : ''}</span>
      </div>
    </button>
  );
});

// ───────────────────── CATALOG MISSION CARD ─────────────────────

const CatalogMission = memo(function CatalogMission({
  card, allowed, onAdd, onHover,
}: {
  card: MissionCard;
  allowed: boolean;
  onAdd: (card: MissionCard) => void;
  onHover: (card: CharacterCard | MissionCard) => void;
}) {
  const imgPath = normalizeImagePath(card.image_file);
  return (
    <button
      onClick={() => { onAdd(card); onHover(card); }}
      onMouseEnter={() => onHover(card)}
      className="relative w-full overflow-hidden group cursor-pointer"
      style={{
        aspectRatio: '7/5',
        backgroundColor: '#0e0e0e',
        borderBottom: '2px solid rgba(196,163,90,0.4)',
        opacity: allowed ? 1 : 0.35,
      }}
    >
      {imgPath ? (
        <img src={imgPath} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
      ) : (
        <div className="w-full h-full" style={{ backgroundColor: '#111' }} />
      )}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 flex items-center justify-center pointer-events-none"
        style={{ backgroundColor: allowed ? 'rgba(62,139,62,0.35)' : 'rgba(179,62,62,0.35)', transition: 'opacity 80ms' }}>
        <span className="text-lg font-bold" style={{ color: '#fff' }}>{allowed ? '+' : ''}</span>
      </div>
    </button>
  );
});

// ───────────────────── DECK CHARACTER CARD ─────────────────────

const DeckCard = memo(function DeckCard({
  card, idx, onRemove, onHover,
}: {
  card: CharacterCard;
  idx: number;
  onRemove: (idx: number) => void;
  onHover: (card: CharacterCard | MissionCard) => void;
}) {
  const imgPath = normalizeImagePath(card.image_file);
  return (
    <div
      onClick={() => onRemove(idx)}
      onMouseEnter={() => onHover(card)}
      className="relative overflow-hidden group cursor-pointer w-full"
      style={{
        aspectRatio: '5/7',
        backgroundColor: '#0e0e0e',
        borderBottom: `2px solid ${RARITY_COLORS[card.rarity] ?? '#888'}`,
      }}
    >
      {imgPath ? (
        <img src={imgPath} alt="" className="w-full h-full object-cover" draggable={false} />
      ) : (
        <div className="w-full h-full" style={{ backgroundColor: '#111' }} />
      )}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 flex items-center justify-center pointer-events-none"
        style={{ backgroundColor: 'rgba(179,62,62,0.4)', transition: 'opacity 80ms' }}>
        <span className="text-sm font-bold" style={{ color: '#fff' }}>x</span>
      </div>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function DeckBuilderPage() {
  const t = useTranslations();
  const locale = useLocale();
  const loc = locale as "en" | "fr";
  const { data: session } = useSession();

  // ───── DATA STATE ─────
  const [availableChars, setAvailableChars] = useState<CharacterCard[]>([]);
  const [availableMissions, setAvailableMissions] = useState<MissionCard[]>([]);
  const [allChars, setAllChars] = useState<CharacterCard[]>([]);
  const [allMissions, setAllMissions] = useState<MissionCard[]>([]);

  // ───── UI STATE ─────
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortField>('number');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [previewCard, setPreviewCard] = useState<CharacterCard | MissionCard | null>(null);
  const [mobileView, setMobileView] = useState<'catalog' | 'deck'>('catalog');
  const [mobileInfoOpen, setMobileInfoOpen] = useState(false);

  // ───── MODAL STATE ─────
  const [showSavedDecks, setShowSavedDecks] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [overwriteConflict, setOverwriteConflict] = useState<{ id: string; name: string } | null>(null);
  const [importCode, setImportCode] = useState("");
  const [importMessage, setImportMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [exportCopied, setExportCopied] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // ───── STORE ─────
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
  const sortCharsByCost = useDeckBuilderStore((s) => s.sortCharsByCost);
  const { bannedIds } = useBannedCards();

  // ───── DATA LOADING ─────
  useEffect(() => {
    import("@/lib/data/cardLoader").then((mod) => {
      setAvailableChars(mod.getPlayableCharacters());
      setAvailableMissions(mod.getPlayableMissions());
      setAllChars(mod.getAllCharacters());
      setAllMissions(mod.getAllMissions());
    });
  }, []);

  useEffect(() => { loadSavedDecks(); }, [loadSavedDecks]);

  // Auto-load from manage page
  useEffect(() => {
    try {
      const pendingId = sessionStorage.getItem('loadDeckId');
      if (pendingId && availableChars.length > 0 && availableMissions.length > 0) {
        sessionStorage.removeItem('loadDeckId');
        loadDeck(pendingId, availableChars, availableMissions);
      }
    } catch { /* SSR / privacy */ }
  }, [availableChars, availableMissions, loadDeck]);

  // Auto-clear add error
  useEffect(() => {
    if (addError) {
      const timer = setTimeout(() => clearAddError(), 3000);
      return () => clearTimeout(timer);
    }
  }, [addError, clearAddError]);

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);


  // ───── FILTERED DATA ─────
  const parsedSearch = useMemo(() => parseSearchQuery(searchQuery), [searchQuery]);

  const filteredChars = useMemo(() => {
    let chars = availableChars.filter((c) => !bannedIds.has(c.id));
    if (searchQuery) {
      chars = chars.filter((c) => matchesSearchFilter(c, parsedSearch, loc));
    }
    return [...chars].sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'number': cmp = a.number - b.number; break;
        case 'name': cmp = getCardName(a, loc).localeCompare(getCardName(b, loc)); break;
        case 'chakra': cmp = (a.chakra ?? 0) - (b.chakra ?? 0); break;
        case 'power': cmp = (a.power ?? 0) - (b.power ?? 0); break;
        case 'rarity': cmp = (RARITY_ORDER[a.rarity] ?? 99) - (RARITY_ORDER[b.rarity] ?? 99); break;
      }
      return sortOrder === 'desc' ? -cmp : cmp;
    });
  }, [availableChars, searchQuery, parsedSearch, bannedIds, loc, sortBy, sortOrder]);

  const filteredMissions = useMemo(() => availableMissions.filter((m) => !bannedIds.has(m.id)), [availableMissions, bannedIds]);

  // ───── DECK COMPUTATIONS ─────
  const validation = useMemo(() => validateDeck(deckChars, deckMissions), [deckChars, deckMissions]);

  const deckCardCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of deckChars) counts.set(c.id, (counts.get(c.id) || 0) + 1);
    return counts;
  }, [deckChars]);

  // Pre-compute allowed state for all catalog cards (avoids per-card store calls during render)
  const allowedMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const c of filteredChars) map.set(c.id, canAddChar(c).allowed);
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredChars, deckChars]);

  const missionAllowedMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const m of filteredMissions) map.set(m.id, canAddMission(m).allowed);
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredMissions, deckMissions]);

  const deckCharsByCost = useMemo(() => {
    const groups = new Map<number, { card: CharacterCard; idx: number }[]>();
    deckChars.forEach((card, i) => {
      const cost = card.chakra ?? 0;
      const arr = groups.get(cost) || [];
      arr.push({ card, idx: i });
      groups.set(cost, arr);
    });
    return Array.from(groups.entries()).sort((a, b) => a[0] - b[0]);
  }, [deckChars]);

  // Info panel data for the currently previewed card
  const previewAddCheck = useMemo(() => {
    if (!previewCard) return null;
    return previewCard.card_type !== 'mission'
      ? canAddChar(previewCard as CharacterCard)
      : canAddMission(previewCard as MissionCard);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewCard, deckChars, deckMissions]);

  // ───── STABLE CALLBACKS (for memo'd children) ─────
  const handleAddChar = useCallback((card: CharacterCard) => addChar(card), [addChar]);
  const handleAddMission = useCallback((card: MissionCard) => addMission(card), [addMission]);
  const handleRemoveChar = useCallback((idx: number) => removeChar(idx), [removeChar]);
  const handlePreview = useCallback((card: CharacterCard | MissionCard) => setPreviewCard(card), []);
  // ───── SAVE / LOAD / DELETE ─────
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

  // ───── IMPORT ─────
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
    // Resolve variant formats: "133|2", "133_2", "KS-133|2" → { number, variantIdx }
    const parseVariantFormat = (raw: string): { num: number; variantIdx: number } | null => {
      const m = raw.trim().match(/^(?:KS-)?(\d+)[|_](\d+)$/);
      if (!m) return null;
      return { num: parseInt(m[1], 10), variantIdx: parseInt(m[2], 10) };
    };
    const chars: CharacterCard[] = []; const missions: MissionCard[] = []; const notFound: string[] = [];
    for (const part of cardParts) {
      const match = part.match(/^(.+)--(\d+)$/);
      if (!match) { setImportMessage({ type: "error", text: t("deckBuilder.importError") }); return; }
      const rawCardId = match[1]; const qty = parseInt(match[2], 10);

      // Try variant format first (133|2, 133_2)
      const variantParsed = parseVariantFormat(rawCardId);
      if (variantParsed) {
        const candidates = charByNumber.get(variantParsed.num);
        const mByNum = missionByNumber.get(variantParsed.num);
        if (candidates && candidates.length > 0) {
          // variantIdx 1 = first variant, 2 = second, etc.
          const idx = Math.max(0, variantParsed.variantIdx - 1);
          const pick = idx < candidates.length ? candidates[idx] : candidates[0];
          for (let i = 0; i < qty; i++) chars.push(pick);
          continue;
        }
        if (mByNum) { for (let i = 0; i < qty; i++) missions.push(mByNum); continue; }
        notFound.push(rawCardId);
        continue;
      }

      const cardId = normalizeCardId(rawCardId);
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

  // ───── EXPORT ─────
  const exportCode = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of deckChars) { const id = c.cardId || c.id; counts.set(id, (counts.get(id) || 0) + 1); }
    for (const m of deckMissions) { const id = m.cardId || m.id; counts.set(id, (counts.get(id) || 0) + 1); }
    const p: string[] = [];
    for (const [id, qty] of counts) p.push(`${id}--${qty}`);
    p.push((deckName || 'Deck').replace(/\s+/g, '_'));
    return p.join('|');
  }, [deckChars, deckMissions, deckName]);

  const handleCopyExportCode = useCallback(() => {
    navigator.clipboard.writeText(exportCode).then(() => {
      setExportCopied(true);
      setTimeout(() => setExportCopied(false), 2000);
    });
  }, [exportCode]);

  // ═════════════════════════════════════════════════════
  //  UNAUTHENTICATED
  // ═════════════════════════════════════════════════════

  if (!session?.user) {
    return (
      <main id="main-content" className="flex min-h-screen relative flex-col" style={{ backgroundColor: "#0a0a0a" }}>
        <CloudBackground /><DecorativeIcons />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="flex flex-col items-center gap-6 max-w-md w-full text-center relative z-10">
            <h1 className="text-2xl font-bold tracking-wider uppercase" style={{ color: "#c4a35a" }}>{t("deckBuilder.title")}</h1>
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

  // ═════════════════════════════════════════════════════
  //  CARD INFO PANEL (re-used desktop + mobile)
  // ═════════════════════════════════════════════════════

  const renderInfoContent = () => {
    if (!previewCard || !previewAddCheck) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center px-4 gap-3">
          <div className="relative overflow-hidden mx-auto" style={{
            width: '160px', aspectRatio: '5/7', backgroundColor: '#0a0a0c',
          }}>
            <img src="/images/card-back.webp" alt="" className="w-full h-full object-cover" style={{ opacity: 0.6 }} />
          </div>
          <p className="text-[11px] text-center" style={{ color: '#444' }}>{t("deckBuilder.hoverToPreview")}</p>
        </div>
      );
    }
    const card = previewCard;
    const isChar = card.card_type !== 'mission';
    const charCard = card as CharacterCard;
    const imgPath = normalizeImagePath(card.image_file);
    const rarColor = RARITY_COLORS[card.rarity] ?? '#888';

    return (
      <div className="flex-1 overflow-y-auto px-3 py-3" style={{ minHeight: 0 }}>
        {/* Image */}
        <div className="relative overflow-hidden mx-auto mb-3" style={{
          width: '100%',
          maxWidth: isChar ? '180px' : '100%',
          aspectRatio: isChar ? '5/7' : '7/5',
          backgroundColor: '#0a0a0c',
        }}>
          {imgPath ? (
            <img src={imgPath} alt={getCardName(card, loc)} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#111' }}>
              <span className="text-[10px]" style={{ color: '#555' }}>{getCardName(card, loc)}</span>
            </div>
          )}
        </div>

        {/* Type + Rarity badges */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5" style={{
            backgroundColor: isChar ? 'rgba(255,255,255,0.04)' : 'rgba(196,163,90,0.12)',
            borderLeft: `2px solid ${isChar ? 'rgba(255,255,255,0.15)' : '#c4a35a'}`,
            color: isChar ? '#999' : '#c4a35a',
          }}>{isChar ? t("deckBuilder.characterCards") : t("deckBuilder.missionCards")}</span>
          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5" style={{
            backgroundColor: `${rarColor}12`, borderLeft: `2px solid ${rarColor}`, color: rarColor,
          }}>{getRarityLabel(card.rarity, loc)}</span>
        </div>

        {/* Name + Title */}
        <div className="text-sm font-bold" style={{ color: '#e0e0e0' }}>{getCardName(card, loc)}</div>
        {isChar && <div className="text-[11px] mb-2" style={{ color: '#777' }}>{getCardTitle(charCard, loc)}</div>}

        {/* Stats */}
        {isChar && (
          <div className="flex items-center gap-0 my-2 py-2" style={{
            backgroundColor: 'rgba(255,255,255,0.02)', borderLeft: '3px solid rgba(196, 163, 90, 0.3)',
          }}>
            <div className="flex-1 flex flex-col items-center">
              <span className="text-[9px] uppercase" style={{ color: '#777', letterSpacing: '0.08em' }}>{t("deckBuilder.chakra")}</span>
              <span className="text-lg font-bold tabular-nums" style={{ color: '#c4a35a' }}>{charCard.chakra}</span>
            </div>
            <div style={{ width: '1px', height: '24px', backgroundColor: 'rgba(255,255,255,0.08)' }} />
            <div className="flex-1 flex flex-col items-center">
              <span className="text-[9px] uppercase" style={{ color: '#777', letterSpacing: '0.08em' }}>{t("deckBuilder.power")}</span>
              <span className="text-lg font-bold tabular-nums" style={{ color: '#e0e0e0' }}>{charCard.power}</span>
            </div>
          </div>
        )}

        {/* Group */}
        {isChar && charCard.group && (
          <div className="text-[10px] mb-1" style={{ color: '#6b8a6b' }}>{getCardGroup(charCard.group, loc)}</div>
        )}

        {/* Keywords */}
        {isChar && charCard.keywords && charCard.keywords.length > 0 && (
          <div className="flex gap-1 mt-1 mb-2 flex-wrap">
            {charCard.keywords.map((kw, i) => (
              <span key={i} className="text-[9px] px-1.5 py-0.5" style={{
                backgroundColor: 'rgba(255,255,255,0.04)', borderLeft: '2px solid rgba(255,255,255,0.08)', color: '#999',
              }}>{getCardKeyword(kw, loc)}</span>
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
                <div key={i} className="py-1.5 px-2" style={{ borderLeft: `3px solid ${effColor}`, backgroundColor: `${effColor}08` }}>
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
            variant={previewAddCheck.allowed ? 'primary' : 'muted'}
            disabled={!previewAddCheck.allowed}
            size="sm"
          >{t("deckBuilder.addToDeck")}</AngularButton>
          {!previewAddCheck.allowed && previewAddCheck.reason && (
            <div className="text-[9px] mt-1" style={{ color: '#b33e3e' }}>{previewAddCheck.reason}</div>
          )}
        </div>
      </div>
    );
  };

  // ═════════════════════════════════════════════════════
  //  FILTER CHIPS (re-used desktop + mobile)
  // ═════════════════════════════════════════════════════

  // ═════════════════════════════════════════════════════
  //  SEARCH HELP POPUP
  // ═════════════════════════════════════════════════════
  const [showSearchHelp, setShowSearchHelp] = useState(false);

  const searchFilters = [
    { key: 'c', label: t('deckBuilder.search.chakraLabel'), desc: t('deckBuilder.search.chakraDesc'), ops: [':', '=', '>', '>=', '<', '<='], examples: ['c:4', 'c>3', 'c<=5'] },
    { key: 'p', label: t('deckBuilder.search.powerLabel'), desc: t('deckBuilder.search.powerDesc'), ops: [':', '=', '>', '>=', '<', '<='], examples: ['p:5', 'p>=3', 'p<2'] },
    { key: 'k', label: t('deckBuilder.search.keywordLabel'), desc: t('deckBuilder.search.keywordDesc'), ops: [':'], examples: ['k:Jutsu', 'k:Sannin'] },
    { key: 'g', label: t('deckBuilder.search.groupLabel'), desc: t('deckBuilder.search.groupDesc'), ops: [':'], examples: ['g:Leaf', 'g:Akatsuki'] },
    { key: 'r', label: t('deckBuilder.search.rarityLabel'), desc: t('deckBuilder.search.rarityDesc'), ops: [':'], examples: ['r:S', 'r:UC', 'r:M'] },
    { key: 'e', label: t('deckBuilder.search.effectTypeLabel'), desc: t('deckBuilder.search.effectTypeDesc'), ops: [':'], examples: ['e:AMBUSH', 'e:SCORE'] },
    { key: 'e', label: t('deckBuilder.search.effectTextLabel'), desc: t('deckBuilder.search.effectTextDesc'), ops: [':'], examples: ['e:move', 'e:hide', 'e:defeat'] },
    { key: 'em', label: t('deckBuilder.search.emLabel'), desc: t('deckBuilder.search.emDesc'), ops: [':'], examples: ['em:hide', 'em:defeat'] },
    { key: 'eup', label: t('deckBuilder.search.eupLabel'), desc: t('deckBuilder.search.eupDesc'), ops: [':'], examples: ['eup:move', 'eup:play'] },
    { key: 'ea', label: t('deckBuilder.search.eaLabel'), desc: t('deckBuilder.search.eaDesc'), ops: [':'], examples: ['ea:move', 'ea:look'] },
    { key: 'es', label: t('deckBuilder.search.esLabel'), desc: t('deckBuilder.search.esDesc'), ops: [':'], examples: ['es:draw', 'es:chakra'] },
  ];

  const tryExample = (q: string) => { setSearchQuery(q); setShowSearchHelp(false); };

  const renderSearchHelp = () => showSearchHelp ? (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-6 pb-6 px-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)' }}
      onClick={() => setShowSearchHelp(false)}
    >
      <div
        className="w-full overflow-y-auto"
        style={{
          maxWidth: '720px',
          maxHeight: 'calc(100vh - 48px)',
          backgroundColor: '#0c0c10',
          border: '1px solid rgba(255, 255, 255, 0.06)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <span className="font-body text-sm font-semibold tracking-wide" style={{ color: '#e0e0e0' }}>
            {t('deckBuilder.search.helpTitle')}
          </span>
          <button onClick={() => setShowSearchHelp(false)} className="font-body text-xs cursor-pointer px-2 py-1" style={{ color: '#666' }}>
            ESC
          </button>
        </div>

        <div className="px-6 py-5">
          <p className="font-body text-[13px] leading-relaxed mb-6" style={{ color: '#888' }}>
            {t('deckBuilder.search.helpIntro')}
          </p>

          {/* Name / ID row */}
          <div className="flex items-start gap-4 mb-5 pb-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <div className="shrink-0 w-20">
              <span className="font-body text-[11px] font-medium uppercase tracking-wider" style={{ color: '#555' }}>
                {t('deckBuilder.search.nameLabel')}
              </span>
            </div>
            <div className="flex-1">
              <p className="font-body text-[12px] mb-2" style={{ color: '#aaa' }}>{t('deckBuilder.search.nameDesc')}</p>
              <div className="flex flex-wrap gap-1.5">
                {['naruto', 'KS-133', 'sakura', 'orochimaru'].map((ex) => (
                  <button key={ex} onClick={() => tryExample(ex)}
                    className="font-body text-[11px] px-3 py-1 cursor-pointer"
                    style={{ backgroundColor: 'rgba(255,255,255,0.03)', color: '#ccc', border: '1px solid rgba(255,255,255,0.08)' }}>
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Filter rows */}
          {searchFilters.map(({ key, label, desc, examples }, i) => (
            <div key={`${key}-${i}`} className="flex items-start gap-4 mb-1 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
              <div className="shrink-0 w-20 pt-0.5">
                <span
                  className="font-body text-[13px] font-semibold inline-block px-2 py-0.5"
                  style={{ color: '#c4a35a', backgroundColor: 'rgba(196,163,90,0.06)' }}
                >
                  {key}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-body text-[12px] font-medium" style={{ color: '#ccc' }}>{label}</span>
                <span className="font-body text-[11px] ml-2" style={{ color: '#555' }}>{desc}</span>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {examples.map((ex) => (
                    <button key={ex} onClick={() => tryExample(ex)}
                      className="font-body text-[11px] px-2.5 py-0.5 cursor-pointer"
                      style={{ backgroundColor: 'rgba(255,255,255,0.03)', color: '#c4a35a', border: '1px solid rgba(196,163,90,0.1)' }}>
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}

          {/* Combine examples */}
          <div className="mt-6 pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="font-body text-[12px] font-semibold block mb-1" style={{ color: '#e0e0e0' }}>
              {t('deckBuilder.search.combineTitle')}
            </span>
            <p className="font-body text-[11px] mb-4" style={{ color: '#666' }}>
              {t('deckBuilder.search.combineDesc')}
            </p>
            <div className="flex flex-col gap-2.5">
              {[
                { query: 'naruto c>=3 k:Jutsu', desc: t('deckBuilder.search.example1') },
                { query: 'g:Leaf p>4 e:AMBUSH', desc: t('deckBuilder.search.example2') },
                { query: 'eup:move g:Leaf', desc: t('deckBuilder.search.example4') },
                { query: 'c<=2 r:UC', desc: t('deckBuilder.search.example3') },
              ].map(({ query, desc }) => (
                <div key={query} className="flex items-center gap-4">
                  <button onClick={() => tryExample(query)}
                    className="font-body text-[12px] px-4 py-1.5 cursor-pointer shrink-0"
                    style={{ backgroundColor: 'rgba(196,163,90,0.05)', color: '#c4a35a', borderLeft: '3px solid rgba(196,163,90,0.4)' }}>
                    {query}
                  </button>
                  <span className="font-body text-[11px]" style={{ color: '#666' }}>{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  // ═════════════════════════════════════════════════════
  //  DECK VIEW CONTENT (re-used desktop + mobile)
  // ═════════════════════════════════════════════════════

  const renderDeckContent = () => (
    <>
      {/* Missions row */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[9px] uppercase font-bold" style={{ color: '#777', letterSpacing: '0.1em' }}>{t("deckBuilder.missionCards")}</span>
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => {
            const m = deckMissions[i];
            const mImg = m ? normalizeImagePath(m.image_file) : null;
            return (
              <div key={i} className="relative overflow-hidden cursor-pointer group"
                style={{
                  width: '90px', height: '64px',
                  backgroundColor: '#0e0e0e',
                  border: m ? '1px solid rgba(196,163,90,0.2)' : '1px dashed rgba(255,255,255,0.08)',
                }}
                onClick={() => m && removeMission(i)}
                onMouseEnter={() => m && setPreviewCard(m)}
              >
                {m ? (
                  <>
                    {mImg && <img src={mImg} alt="" className="w-full h-full object-cover" />}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 flex items-center justify-center pointer-events-none"
                      style={{ backgroundColor: 'rgba(179,62,62,0.4)', transition: 'opacity 80ms' }}>
                      <span className="text-sm font-bold" style={{ color: '#fff' }}>x</span>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-[9px]" style={{ color: '#333' }}>M{i + 1}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <SectionDivider width={100} />

      {/* Sort button */}
      {deckChars.length > 1 && (
        <div className="flex items-center gap-2 mb-2">
          <button onClick={sortCharsByCost}
            className="px-2 py-0.5 text-[9px] uppercase font-bold cursor-pointer"
            style={{ backgroundColor: 'rgba(196,163,90,0.08)', borderLeft: '2px solid rgba(196,163,90,0.4)', color: '#c4a35a' }}>
            {t("deckBuilder.sortByCost")}
          </button>
        </div>
      )}

      {/* Character grid */}
      {deckChars.length === 0 ? (
        <p className="text-[11px] italic mt-4" style={{ color: '#444' }}>{t("deckBuilder.clickToAdd")}</p>
      ) : (
        <div className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(10, 1fr)' }}>
          {deckChars.map((card, idx) => (
            <DeckCard
              key={`${card.id}-${idx}`}
              card={card}
              idx={idx}
              onRemove={handleRemoveChar}
              onHover={handlePreview}
            />
          ))}
        </div>
      )}
    </>
  );

  // ═══════════════════════════════════════════════════════════════
  //  MAIN LAYOUT
  // ═══════════════════════════════════════════════════════════════

  return (
    <main id="main-content" className="relative" style={{ backgroundColor: '#0a0a0a', height: '100vh', overflow: 'hidden' }}>
      <CloudBackground /><DecorativeIcons />

      {/* ═══════ DESKTOP 3-PANEL ═══════ */}
      <div className="hidden lg:flex relative z-10" style={{ height: '100vh' }}>

        {/* ── LEFT: Card Info Panel (always visible) ── */}
        <div className="flex flex-col flex-shrink-0" style={{
          width: '250px',
          backgroundColor: 'rgba(8, 8, 12, 0.95)',
          borderRight: '1px solid rgba(196, 163, 90, 0.12)',
        }}>
          <div className="px-3 pt-2 pb-1 flex-shrink-0 flex items-center gap-2">
            <Link href="/" className="text-[10px] uppercase" style={{ color: '#555' }}>{t("common.back")}</Link>
            <h1 className="text-xs font-bold uppercase" style={{ color: '#c4a35a', letterSpacing: '0.1em' }}>
              {t("deckBuilder.title")}
            </h1>
          </div>
          {renderInfoContent()}
        </div>

        {/* ── CENTER: Deck View ── */}
        <div className="flex-1 flex flex-col overflow-hidden" style={{ minWidth: 0 }}>
          {/* Header bar */}
          <div className="flex items-center gap-3 px-4 py-2 flex-shrink-0" style={{
            backgroundColor: 'rgba(8, 8, 12, 0.9)',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
          }}>
            <input
              type="text"
              placeholder={t("deckBuilder.deckName")}
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              className="flex-1 min-w-[120px] max-w-[280px] px-2 py-1 text-xs focus:outline-none"
              style={{
                backgroundColor: '#0e0e0e', border: '1px solid rgba(255,255,255,0.06)',
                borderLeft: '3px solid rgba(196, 163, 90, 0.3)', color: '#e0e0e0',
              }}
            />
            <div className="flex items-center gap-2 text-[10px] flex-shrink-0">
              <span style={{ color: deckChars.length >= 30 ? '#3e8b3e' : '#b33e3e' }}>
                {t("deckBuilder.characters", { count: deckChars.length })}
              </span>
              <span style={{ color: deckMissions.length === 3 ? '#3e8b3e' : '#b33e3e' }}>
                {t("deckBuilder.missions", { count: deckMissions.length })}
              </span>
              {validation.valid && <span style={{ color: '#3e8b3e' }}>{t("deckBuilder.validation.valid")}</span>}
              {loadedDeckId && (
                <span className="text-[8px] uppercase px-1.5 py-0.5" style={{
                  backgroundColor: 'rgba(62, 139, 62, 0.15)', borderLeft: '2px solid #3e8b3e', color: '#3e8b3e',
                }}>{t("deckBuilder.currentlyEditing")}</span>
              )}
            </div>
          </div>

          {/* Error bar */}
          {(saveError || addError) && (
            <div className="px-4 py-1 flex-shrink-0">
              <div className="text-[10px] py-1 px-2" style={{
                borderLeft: '3px solid #b33e3e', backgroundColor: 'rgba(179,62,62,0.08)', color: '#b33e3e',
              }}>{addError ? (addErrorKey ? t(addErrorKey, addErrorParams ?? {}) : addError) : saveError}</div>
            </div>
          )}

          {/* Deck content area */}
          <div className="flex-1 overflow-y-auto px-4 py-3" style={{ minHeight: 0 }}>
            {renderDeckContent()}
          </div>

          {/* Action bar */}
          <div className="flex items-center gap-2 px-4 py-2 flex-shrink-0 flex-wrap" style={{
            borderTop: '1px solid rgba(255,255,255,0.04)', backgroundColor: 'rgba(8, 8, 12, 0.9)',
          }}>
            <AngularButton onClick={handleSave} accentColor="#3e8b3e" variant={validation.valid && !isSaving ? 'primary' : 'muted'} disabled={isSaving || !validation.valid} size="sm">
              {isSaving ? t("common.loading") : loadedDeckId ? t("deckBuilder.updateDeck") : t("deckBuilder.saveDeck")}
            </AngularButton>
            <AngularButton onClick={() => setShowSavedDecks(true)} variant="secondary" size="sm">{t("deckBuilder.loadDeck")}</AngularButton>
            <AngularButton onClick={() => setShowImportModal(true)} variant="secondary" size="sm">{t("deckBuilder.importButton")}</AngularButton>
            <AngularButton onClick={() => setShowExportModal(true)} variant="muted" disabled={deckChars.length === 0} size="sm">{t("deckBuilder.exportButton")}</AngularButton>
            <Link href="/deck-builder/manage" className="text-center text-[10px] uppercase font-bold py-1.5 px-3 no-select inline-block"
              style={{
                backgroundColor: 'rgba(196,163,90,0.08)', borderLeft: '3px solid rgba(196,163,90,0.5)',
                color: '#c4a35a', letterSpacing: '0.1em', transform: 'skewX(-3deg)',
              }}>
              <span style={{ display: 'inline-block', transform: 'skewX(3deg)' }}>{t("deckManager.manageButton")}</span>
            </Link>
            <div className="flex-1" />
            <AngularButton onClick={clearDeck} variant="danger" size="sm">{t("deckBuilder.clearDeck")}</AngularButton>
          </div>
        </div>

        {/* ── RIGHT: Card Catalog ── */}
        <div className="flex flex-col flex-shrink-0 overflow-hidden" style={{
          width: '400px',
          backgroundColor: 'rgba(8, 8, 12, 0.95)',
          borderLeft: '1px solid rgba(255,255,255,0.06)',
        }}>
          {/* Search + Sort */}
          <div className="px-3 pt-3 pb-2 flex-shrink-0">
            <div className="flex items-center gap-1.5 mb-2">
              <input
                type="text"
                placeholder={t("collection.search")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 min-w-0 px-2 py-1 text-[11px] focus:outline-none"
                style={{
                  backgroundColor: '#0e0e0e', border: '1px solid rgba(255,255,255,0.06)',
                  borderLeft: '3px solid rgba(196, 163, 90, 0.25)', color: '#e0e0e0',
                }}
              />
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortField)}
                className="px-1.5 py-1 text-[9px] focus:outline-none cursor-pointer"
                style={{ backgroundColor: '#0e0e0e', border: '1px solid rgba(255,255,255,0.06)', color: '#999' }}>
                <option value="number">{t("deckBuilder.sort.byNumber")}</option>
                <option value="name">{t("deckBuilder.sort.byName")}</option>
                <option value="chakra">{t("deckBuilder.sort.byChakra")}</option>
                <option value="power">{t("deckBuilder.sort.byPower")}</option>
                <option value="rarity">{t("deckBuilder.sort.byRarity")}</option>
              </select>
              <button onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="px-1.5 py-1 text-[9px] cursor-pointer"
                style={{ backgroundColor: '#0e0e0e', border: '1px solid rgba(255,255,255,0.06)', color: '#888' }}>
                {sortOrder === 'asc' ? '1-9' : '9-1'}
              </button>
            </div>

                        <button
              onClick={() => setShowSearchHelp(true)}
              className="text-[10px] font-bold px-3 py-1.5 cursor-pointer"
              style={{
                backgroundColor: 'rgba(196, 163, 90, 0.08)',
                border: '1px solid rgba(196, 163, 90, 0.3)',
                color: '#c4a35a',
              }}
            >
              {t('deckBuilder.search.helpButton')}
            </button>

            <div className="text-[8px] mt-1" style={{ color: '#444' }}>
              {t("deckBuilder.filters.resultsCount", { count: filteredChars.length })}
            </div>
          </div>

          {/* Scrollable card grid */}
          <div className="flex-1 overflow-y-auto px-3 pb-3" style={{ minHeight: 0 }}>
            {/* Missions section */}
            <div className="mb-2">
              <span className="text-[8px] uppercase font-bold block mb-1" style={{ color: '#777' }}>{t("deckBuilder.missionCards")}</span>
              <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                {filteredMissions.map((m) => (
                  <CatalogMission
                    key={m.id}
                    card={m}
                    allowed={missionAllowedMap.get(m.id) ?? true}
                    onAdd={handleAddMission}
                    onHover={handlePreview}
                  />
                ))}
              </div>
            </div>

            <div className="h-px my-2" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }} />

            {/* Characters section */}
            <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(62px, 1fr))' }}>
              {filteredChars.map((card) => (
                <CatalogCard
                  key={card.id}
                  card={card}
                  allowed={allowedMap.get(card.id) ?? true}
                  inDeckCount={deckCardCounts.get(card.id) || 0}
                  onAdd={handleAddChar}
                  onHover={handlePreview}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════ MOBILE LAYOUT ═══════ */}
      <div className="lg:hidden flex flex-col relative z-10" style={{ height: '100vh' }}>
        {/* Top bar */}
        <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0" style={{
          backgroundColor: 'rgba(8, 8, 12, 0.95)',
          borderBottom: '1px solid rgba(196, 163, 90, 0.12)',
        }}>
          <Link href="/" className="text-[10px] uppercase flex-shrink-0" style={{ color: '#555' }}>{t("common.back")}</Link>
          <div className="flex gap-0 flex-shrink-0">
            <button onClick={() => setMobileView('catalog')}
              className="px-2 py-1 text-[10px] font-bold uppercase cursor-pointer"
              style={{
                backgroundColor: mobileView === 'catalog' ? 'rgba(196,163,90,0.15)' : 'transparent',
                borderBottom: mobileView === 'catalog' ? '2px solid #c4a35a' : '2px solid transparent',
                color: mobileView === 'catalog' ? '#c4a35a' : '#555',
              }}>{t("deckBuilder.availableCards")}</button>
            <button onClick={() => setMobileView('deck')}
              className="px-2 py-1 text-[10px] font-bold uppercase cursor-pointer"
              style={{
                backgroundColor: mobileView === 'deck' ? 'rgba(196,163,90,0.15)' : 'transparent',
                borderBottom: mobileView === 'deck' ? '2px solid #c4a35a' : '2px solid transparent',
                color: mobileView === 'deck' ? '#c4a35a' : '#555',
              }}>{t("deckBuilder.currentDeck")}</button>
          </div>
          <div className="flex-1" />
          <span className="text-[10px] tabular-nums flex-shrink-0" style={{ color: deckChars.length >= 30 ? '#3e8b3e' : '#b33e3e' }}>
            {deckChars.length}/30
          </span>
          <span className="text-[10px] tabular-nums flex-shrink-0" style={{ color: deckMissions.length === 3 ? '#3e8b3e' : '#b33e3e' }}>
            M:{deckMissions.length}/3
          </span>
          <AngularButton onClick={handleSave} accentColor="#3e8b3e" variant={validation.valid ? 'primary' : 'muted'} disabled={isSaving || !validation.valid} size="sm">
            {isSaving ? '...' : loadedDeckId ? t("deckBuilder.updateDeck") : t("deckBuilder.saveDeck")}
          </AngularButton>
        </div>

        {/* Error bar */}
        {(saveError || addError) && (
          <div className="px-3 py-1 flex-shrink-0">
            <div className="text-[10px] py-1 px-2" style={{
              borderLeft: '3px solid #b33e3e', backgroundColor: 'rgba(179,62,62,0.08)', color: '#b33e3e',
            }}>{addError ? (addErrorKey ? t(addErrorKey, addErrorParams ?? {}) : addError) : saveError}</div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
          {mobileView === 'catalog' ? (
            <div className="px-3 py-2">
              {/* Search */}
              <input type="text" placeholder={t("collection.search")} value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-2 py-1.5 text-xs mb-2 focus:outline-none"
                style={{ backgroundColor: '#0e0e0e', border: '1px solid rgba(255,255,255,0.06)', borderLeft: '3px solid rgba(196,163,90,0.25)', color: '#e0e0e0' }}
              />

                            <button
                onClick={() => setShowSearchHelp(true)}
                className="text-[10px] font-bold px-3 py-1.5 cursor-pointer"
                style={{
                  backgroundColor: 'rgba(196, 163, 90, 0.08)',
                  border: '1px solid rgba(196, 163, 90, 0.3)',
                  color: '#c4a35a',
                }}
              >
                {t('deckBuilder.search.helpButton')}
              </button>

              <div className="text-[8px] mt-1 mb-2" style={{ color: '#444' }}>
                {t("deckBuilder.filters.resultsCount", { count: filteredChars.length })}
              </div>

              {/* Missions */}
              <span className="text-[9px] uppercase font-bold block mb-1" style={{ color: '#777' }}>{t("deckBuilder.missionCards")}</span>
              <div className="grid grid-cols-3 gap-1.5 mb-3">
                {filteredMissions.map((m) => (
                  <CatalogMission key={m.id} card={m} allowed={missionAllowedMap.get(m.id) ?? true}
                    onAdd={handleAddMission} onHover={handlePreview} />
                ))}
              </div>

              <div className="h-px my-2" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }} />

              {/* Characters */}
              <span className="text-[9px] uppercase font-bold block mb-1" style={{ color: '#777' }}>
                {t("deckBuilder.characters", { count: filteredChars.length })}
              </span>
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
                {filteredChars.map((card) => (
                  <CatalogCard key={card.id} card={card} allowed={allowedMap.get(card.id) ?? true}
                    inDeckCount={deckCardCounts.get(card.id) || 0}
                    onAdd={handleAddChar} onHover={handlePreview} />
                ))}
              </div>
            </div>
          ) : (
            <div className="px-3 py-2">
              {/* Deck name */}
              <input type="text" placeholder={t("deckBuilder.deckName")} value={deckName}
                onChange={(e) => setDeckName(e.target.value)}
                className="w-full px-2 py-1.5 text-xs mb-2 focus:outline-none"
                style={{ backgroundColor: '#0e0e0e', border: '1px solid rgba(255,255,255,0.06)', borderLeft: '3px solid rgba(196,163,90,0.3)', color: '#e0e0e0' }}
              />

              {renderDeckContent()}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-1.5 mt-4 mb-2">
                <AngularButton onClick={() => setShowSavedDecks(true)} variant="secondary" size="sm">{t("deckBuilder.loadDeck")}</AngularButton>
                <AngularButton onClick={() => setShowImportModal(true)} variant="secondary" size="sm">{t("deckBuilder.importButton")}</AngularButton>
                <AngularButton onClick={() => setShowExportModal(true)} variant="muted" disabled={deckChars.length === 0} size="sm">{t("deckBuilder.exportButton")}</AngularButton>
                <Link href="/deck-builder/manage" className="text-center text-[10px] uppercase font-bold py-1.5 px-3 no-select inline-block"
                  style={{
                    backgroundColor: 'rgba(196,163,90,0.08)', borderLeft: '3px solid rgba(196,163,90,0.5)',
                    color: '#c4a35a', letterSpacing: '0.1em', transform: 'skewX(-3deg)',
                  }}>
                  <span style={{ display: 'inline-block', transform: 'skewX(3deg)' }}>{t("deckManager.manageButton")}</span>
                </Link>
                <AngularButton onClick={clearDeck} variant="danger" size="sm">{t("deckBuilder.clearDeck")}</AngularButton>
              </div>
            </div>
          )}
        </div>

        {/* Mobile info strip */}
        {previewCard && (
          <div className="flex-shrink-0 cursor-pointer" style={{
            backgroundColor: 'rgba(8, 8, 12, 0.98)',
            borderTop: '1px solid rgba(196,163,90,0.15)',
          }} onClick={() => setMobileInfoOpen(!mobileInfoOpen)}>
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="flex-shrink-0 overflow-hidden" style={{
                width: previewCard.card_type === 'mission' ? '50px' : '35px',
                height: previewCard.card_type === 'mission' ? '36px' : '49px',
                backgroundColor: '#111',
              }}>
                {normalizeImagePath(previewCard.image_file) && (
                  <img src={normalizeImagePath(previewCard.image_file)!} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-bold truncate" style={{ color: '#e0e0e0' }}>{getCardName(previewCard, loc)}</div>
                {previewCard.card_type !== 'mission' && (
                  <div className="text-[9px]" style={{ color: '#777' }}>
                    {t("deckBuilder.chakra")}:{(previewCard as CharacterCard).chakra} {t("deckBuilder.power")}:{(previewCard as CharacterCard).power}
                  </div>
                )}
              </div>
              <span className="text-[10px] flex-shrink-0" style={{ color: '#555' }}>{mobileInfoOpen ? 'v' : '^'}</span>
            </div>
            {mobileInfoOpen && (
              <div className="overflow-y-auto px-3 pb-3" style={{ maxHeight: '50vh', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                {renderInfoContent()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══════ MODALS ═══════ */}

      {/* Search Help */}
      {renderSearchHelp()}

      {/* Saved Decks */}
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
                          <span className="text-[8px] uppercase px-1 py-0.5 flex-shrink-0" style={{
                            backgroundColor: 'rgba(62,139,62,0.15)', borderLeft: '2px solid #3e8b3e', color: '#3e8b3e',
                          }}>{t("deckBuilder.currentlyEditing")}</span>
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

      {/* Import Modal */}
      {showImportModal && (
        <PopupOverlay>
          <PopupCornerFrame accentColor="rgba(74, 122, 181, 0.35)" maxWidth="480px">
            <PopupTitle accentColor="#4a7ab5" size="lg">{t("deckBuilder.importTitle")}</PopupTitle>
            <p className="text-xs mb-3" style={{ color: '#888', borderLeft: '3px solid rgba(74,122,181,0.3)', paddingLeft: '8px' }}>
              {t("deckBuilder.importDesc")}
            </p>
            <div className="mb-3">
              <a href="https://shinobuilder.com" target="_blank" rel="noopener noreferrer"
                className="inline-block text-[10px] uppercase font-bold px-3 py-1.5"
                style={{ backgroundColor: 'rgba(74,122,181,0.12)', borderLeft: '3px solid #4a7ab5', color: '#4a7ab5', letterSpacing: '0.08em' }}>
                {t("deckBuilder.importVisit")}
              </a>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <input type="text" placeholder={t("deckBuilder.importPlaceholder")} value={importCode}
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
              }}>{importMessage.text}</div>
            )}
            <PopupDismissLink onClick={() => { setShowImportModal(false); setImportMessage(null); }}>{t("common.close")}</PopupDismissLink>
          </PopupCornerFrame>
        </PopupOverlay>
      )}

      {/* Export Modal */}
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
              <input type="text" readOnly value={exportCode}
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

      {/* Overwrite Confirm Modal */}
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
    </main>
  );
}
