"use client";

import { useState, useEffect, useMemo, useCallback, memo, useDeferredValue } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useSession } from "next-auth/react";
import { Link } from "@/lib/i18n/navigation";
import type { CharacterCard, MissionCard } from "@/lib/engine/types";
import { validateDeck } from "@/lib/engine/rules/DeckValidation";
import { useDeckBuilderStore } from "@/stores/deckBuilderStore";
// Ban list enforced server-side in ranked/tournament only — deck builder allows all cards
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

interface KeywordFilter {
  terms: string[];  // all must match (AND)
  exclusive: boolean; // true = card must have ONLY these keywords
  negated: boolean;
}

interface NumFilter { op: '=' | '>' | '>=' | '<' | '<='; val: number; negated: boolean }

interface SearchFilter {
  nameQueries: Array<{ text: string; negated: boolean }>; // OR segments via /
  chakra: NumFilter[];
  power: NumFilter[];
  keywords: KeywordFilter[];
  groups: Array<{ value: string; negated: boolean }>;
  rarities: Array<{ value: string; negated: boolean }>;
  sets: Array<{ value: string; negated: boolean }>;
  effects: Array<{ value: string; negated: boolean }>;
  effectText: Array<{ value: string; negated: boolean }>;
  effectMainText: Array<{ value: string; negated: boolean }>;
  effectMainInstantText: Array<{ value: string; negated: boolean }>;
  effectMainContinuousText: Array<{ value: string; negated: boolean }>;
  effectUpgradeText: Array<{ value: string; negated: boolean }>;
  effectAmbushText: Array<{ value: string; negated: boolean }>;
  effectScoreText: Array<{ value: string; negated: boolean }>;
  nameVersions: Array<{ value: string; negated: boolean }>;
}

function emptyFilter(): SearchFilter {
  return {
    nameQueries: [], chakra: [], power: [], keywords: [], groups: [],
    rarities: [], sets: [], effects: [], effectText: [],
    effectMainText: [], effectMainInstantText: [], effectMainContinuousText: [],
    effectUpgradeText: [], effectAmbushText: [], effectScoreText: [], nameVersions: [],
  };
}

function parseSearchQuery(raw: string): SearchFilter {
  const filter = emptyFilter();
  // Normalize commas to spaces so "c:4, k:Jutsu" works like "c:4 k:Jutsu"
  let normalized = raw.replace(/,\s*/g, ' ');
  // Pre-process bracket syntax: e:[discard pile] → e:"discard pile", k:[Team 7]+Jutsu → k:"Team 7+Jutsu"
  normalized = normalized.replace(/(\w+):?\[([^\]]+)\](\+\S+)?/g, (_, key, content, suffix) => `${key}:"${content}${suffix ?? ''}"`);

  // Match tokens: optional - prefix, key, operator, value (quoted, bracketed, or word)
  const tokenRegex = /(-)?(eup|emi|emc|em|ea|es|nv|[cpkgres])(:|=|>=|<=|>|<)("([^"]+)"|(\S+))/gi;
  let remaining = normalized;

  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(normalized)) !== null) {
    const negated = match[1] === '-';
    const key = match[2].toLowerCase();
    const op = match[3] === ':' ? '=' : match[3];
    const value = match[5] ?? match[6];
    remaining = remaining.replace(match[0], '');

    // Handle / (OR) within value — split into multiple entries
    const values = value.split('/').map((v) => v.trim()).filter(Boolean);

    for (const val of values) {
      switch (key) {
        case 'c': {
          const num = parseInt(val, 10);
          if (!isNaN(num)) filter.chakra.push({ op: op as NumFilter['op'], val: num, negated });
          break;
        }
        case 'p': {
          const num = parseInt(val, 10);
          if (!isNaN(num)) filter.power.push({ op: op as NumFilter['op'], val: num, negated });
          break;
        }
        case 'k': {
          const exclusive = val.startsWith('!');
          const cleanVal = exclusive ? val.slice(1) : val;
          const terms = cleanVal.split('+').map((t) => normalizeStr(t.trim())).filter(Boolean);
          if (terms.length > 0) filter.keywords.push({ terms, exclusive, negated });
          break;
        }
        case 'g': filter.groups.push({ value: normalizeStr(val), negated }); break;
        case 'r': filter.rarities.push({ value: val.toUpperCase(), negated }); break;
        case 's': filter.sets.push({ value: val.toUpperCase(), negated }); break;
        case 'nv': filter.nameVersions.push({ value: normalizeStr(val), negated }); break;
        case 'e': {
          const upper = val.toUpperCase();
          if (['MAIN', 'UPGRADE', 'AMBUSH', 'SCORE'].includes(upper)) {
            filter.effects.push({ value: upper, negated });
          } else {
            filter.effectText.push({ value: normalizeStr(val), negated });
          }
          break;
        }
        case 'em': filter.effectMainText.push({ value: normalizeStr(val), negated }); break;
        case 'emi': filter.effectMainInstantText.push({ value: normalizeStr(val), negated }); break;
        case 'emc': filter.effectMainContinuousText.push({ value: normalizeStr(val), negated }); break;
        case 'eup': filter.effectUpgradeText.push({ value: normalizeStr(val), negated }); break;
        case 'ea': filter.effectAmbushText.push({ value: normalizeStr(val), negated }); break;
        case 'es': filter.effectScoreText.push({ value: normalizeStr(val), negated }); break;
      }
    }
  }

  // Parse remaining text for name queries — support / (OR) and - (negate)
  const leftover = remaining.trim();
  if (leftover) {
    // Split by / for OR segments
    const segments = leftover.split(/\s*\/\s*/);
    for (const seg of segments) {
      const trimmed = seg.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('-') && trimmed.length > 1) {
        filter.nameQueries.push({ text: normalizeStr(trimmed.slice(1)), negated: true });
      } else {
        filter.nameQueries.push({ text: normalizeStr(trimmed), negated: false });
      }
    }
  }
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
  // Name / ID (NOT title — title is via nv: only)
  if (filter.nameQueries.length > 0) {
    const positives = filter.nameQueries.filter((q) => !q.negated);
    const negatives = filter.nameQueries.filter((q) => q.negated);
    const nameStr = normalizeStr(getCardName(card, locale as 'en' | 'fr'));
    const nameFr = normalizeStr(card.name_fr);
    const idStr = card.id.toLowerCase();
    const matchesAny = (q: string) => nameStr.includes(q) || nameFr.includes(q) || idStr.includes(q);
    // Positives: at least one must match (OR via /)
    if (positives.length > 0 && !positives.some((q) => matchesAny(q.text))) return false;
    // Negatives: none must match
    for (const q of negatives) { if (matchesAny(q.text)) return false; }
  }
  // Name version (nv:)
  for (const nv of filter.nameVersions) {
    const titleStr = normalizeStr(getCardTitle(card, locale as 'en' | 'fr'));
    const titleFr = normalizeStr(card.title_fr ?? '');
    const has = titleStr.includes(nv.value) || titleFr.includes(nv.value);
    if (nv.negated ? has : !has) return false;
  }
  // Chakra — OR within same / group, AND between groups
  const chakraPos = filter.chakra.filter((c) => !c.negated);
  const chakraNeg = filter.chakra.filter((c) => c.negated);
  if (chakraPos.length > 0 && !chakraPos.some((c) => compareOp(card.chakra ?? 0, c.op, c.val))) return false;
  for (const c of chakraNeg) { if (compareOp(card.chakra ?? 0, c.op, c.val)) return false; }
  // Power
  const powerPos = filter.power.filter((p) => !p.negated);
  const powerNeg = filter.power.filter((p) => p.negated);
  if (powerPos.length > 0 && !powerPos.some((p) => compareOp(card.power ?? 0, p.op, p.val))) return false;
  for (const p of powerNeg) { if (compareOp(card.power ?? 0, p.op, p.val)) return false; }
  // Keywords — OR for positives (from / split), AND for negatives
  const kwPos = filter.keywords.filter((kf) => !kf.negated);
  const kwNeg = filter.keywords.filter((kf) => kf.negated);
  if (kwPos.length > 0) {
    const cardKws = (card.keywords ?? []).map((kw) => normalizeStr(kw));
    const anyMatch = kwPos.some((kf) => {
      const allTerms = kf.terms.every((term) => cardKws.some((kw) => kw.includes(term)));
      if (kf.exclusive) return cardKws.length === kf.terms.length && cardKws.every((kw) => kf.terms.some((t) => kw.includes(t)));
      return allTerms;
    });
    if (!anyMatch) return false;
  }
  for (const kf of kwNeg) {
    const cardKws = (card.keywords ?? []).map((kw) => normalizeStr(kw));
    const allMatch = kf.terms.every((term) => cardKws.some((kw) => kw.includes(term)));
    const matches = kf.exclusive
      ? cardKws.length === kf.terms.length && cardKws.every((kw) => kf.terms.some((t) => kw.includes(t)))
      : allMatch;
    if (matches) return false;
  }
  // Set
  for (const s of filter.sets) {
    const has = card.id.toUpperCase().startsWith(s.value + '-');
    if (s.negated ? has : !has) return false;
  }
  // Group — OR for positives, AND for negatives
  const groupPos = filter.groups.filter((g) => !g.negated);
  const groupNeg = filter.groups.filter((g) => g.negated);
  if (groupPos.length > 0 && !groupPos.some((g) => card.group && normalizeStr(card.group).includes(g.value))) return false;
  for (const g of groupNeg) { if (card.group && normalizeStr(card.group).includes(g.value)) return false; }
  // Rarity — OR within positives
  const rarPos = filter.rarities.filter((r) => !r.negated);
  const rarNeg = filter.rarities.filter((r) => r.negated);
  if (rarPos.length > 0 && !rarPos.some((r) => card.rarity === r.value)) return false;
  for (const r of rarNeg) { if (card.rarity === r.value) return false; }
  // Effect type — OR within positives
  const effPos = filter.effects.filter((e) => !e.negated);
  const effNeg = filter.effects.filter((e) => e.negated);
  if (effPos.length > 0 && !card.effects?.some((e) => effPos.some((f) => f.value === e.type))) return false;
  for (const e of effNeg) { if (card.effects?.some((ef) => ef.type === e.value)) return false; }
  // Effect text search — OR for positives, AND for negatives (applies to all effect text filters)
  const matchEffText = (entries: typeof filter.effectText, predicate: (e: { type: string; description: string }) => boolean) => {
    const pos = entries.filter((t) => !t.negated);
    const neg = entries.filter((t) => t.negated);
    if (pos.length > 0 && !pos.some((t) => card.effects?.some((e) => predicate(e) && normalizeStr(e.description).includes(t.value)))) return false;
    for (const t of neg) { if (card.effects?.some((e) => predicate(e) && normalizeStr(e.description).includes(t.value))) return false; }
    return true;
  };
  if (!matchEffText(filter.effectText, () => true)) return false;
  if (!matchEffText(filter.effectMainText, (e) => e.type === 'MAIN')) return false;
  if (!matchEffText(filter.effectMainInstantText, (e) => e.type === 'MAIN' && !e.description.includes('[⧗]'))) return false;
  if (!matchEffText(filter.effectMainContinuousText, (e) => e.type === 'MAIN' && e.description.includes('[⧗]'))) return false;
  if (!matchEffText(filter.effectUpgradeText, (e) => e.type === 'UPGRADE')) return false;
  if (!matchEffText(filter.effectAmbushText, (e) => e.type === 'AMBUSH')) return false;
  if (!matchEffText(filter.effectScoreText, (e) => e.type === 'SCORE')) return false;
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
        opacity: allowed ? 1 : 0.35,
      }}
    >
      {imgPath ? (
        <img src={imgPath} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
      ) : (
        <div className="w-full h-full" style={{ backgroundColor: '#111' }} />
      )}
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
  const { data: session, status } = useSession();

  // ───── DATA STATE ─────
  const [availableChars, setAvailableChars] = useState<CharacterCard[]>([]);
  const [availableMissions, setAvailableMissions] = useState<MissionCard[]>([]);
  const [allChars, setAllChars] = useState<CharacterCard[]>([]);
  const [allMissions, setAllMissions] = useState<MissionCard[]>([]);

  // ───── UI STATE ─────
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearch = useDeferredValue(searchQuery);
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
  const isDirty = useDeckBuilderStore((s) => s.isDirty);
  const loadSavedDecks = useDeckBuilderStore((s) => s.loadSavedDecks);
  const loadDeck = useDeckBuilderStore((s) => s.loadDeck);
  const deleteDeck = useDeckBuilderStore((s) => s.deleteDeck);
  const canAddChar = useDeckBuilderStore((s) => s.canAddChar);
  const canAddMission = useDeckBuilderStore((s) => s.canAddMission);
  const clearAddError = useDeckBuilderStore((s) => s.clearAddError);
  const sortCharsByCost = useDeckBuilderStore((s) => s.sortCharsByCost);
  // Ban list not enforced in deck builder — only in ranked/tournament server-side

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
  const parsedSearch = useMemo(() => parseSearchQuery(deferredSearch), [deferredSearch]);

  const filteredChars = useMemo(() => {
    let chars = [...availableChars];
    if (deferredSearch) {
      chars = chars.filter((c) => matchesSearchFilter(c, parsedSearch, loc));
    }
    return chars.sort((a, b) => {
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
  }, [availableChars, deferredSearch, parsedSearch, loc, sortBy, sortOrder]);

  const filteredMissions = useMemo(() => [...availableMissions], [availableMissions]);

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

  if (status === 'loading') {
    return (
      <main id="main-content" className="flex min-h-screen items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
        <span className="text-sm" style={{ color: '#555' }}>...</span>
      </main>
    );
  }

  if (!session?.user) {
    return (
      <main id="main-content" className="flex min-h-screen relative flex-col" style={{ backgroundColor: "#0a0a0a" }}>
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
            width: '160px', aspectRatio: '5/7', backgroundColor: '#0a0a0a',
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
          backgroundColor: '#0a0a0a',
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
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  const searchFilters = [
    // Stats (0-1)
    { key: 'c', label: t('deckBuilder.search.chakraLabel'), desc: t('deckBuilder.search.chakraDesc'), ops: [':', '=', '>', '>=', '<', '<='], examples: ['c:4', 'c>3', 'c<=5'] },
    { key: 'p', label: t('deckBuilder.search.powerLabel'), desc: t('deckBuilder.search.powerDesc'), ops: [':', '=', '>', '>=', '<', '<='], examples: ['p:5', 'p>=3', 'p<2'] },
    // Card Properties (2-8)
    { key: 'k', label: t('deckBuilder.search.keywordLabel'), desc: t('deckBuilder.search.keywordDesc'), ops: [':'], examples: ['k:Jutsu', 'k:Sannin'] },
    { key: 'k', label: t('deckBuilder.search.keywordAndLabel'), desc: t('deckBuilder.search.keywordAndDesc'), ops: [':'], examples: ['k:Jutsu+Team 7'] },
    { key: 'k', label: t('deckBuilder.search.keywordOnlyLabel'), desc: t('deckBuilder.search.keywordOnlyDesc'), ops: [':'], examples: ['k:!Jutsu', 'k:!Summon'] },
    { key: 'g', label: t('deckBuilder.search.groupLabel'), desc: t('deckBuilder.search.groupDesc'), ops: [':'], examples: ['g:Leaf', 'g:Akatsuki'] },
    { key: 'r', label: t('deckBuilder.search.rarityLabel'), desc: t('deckBuilder.search.rarityDesc'), ops: [':'], examples: ['r:S', 'r:UC', 'r:M', 'r:SV', 'r:MV'] },
    { key: 's', label: t('deckBuilder.search.setLabel'), desc: t('deckBuilder.search.setDesc'), ops: [':'], examples: ['s:KS'] },
    { key: 'nv', label: t('deckBuilder.search.nvLabel'), desc: t('deckBuilder.search.nvDesc'), ops: [':'], examples: ['nv:Hokage', 'nv:Rasengan'] },
    // Effects (9+)
    { key: 'e', label: t('deckBuilder.search.effectTypeLabel'), desc: t('deckBuilder.search.effectTypeDesc'), ops: [':'], examples: ['e:AMBUSH', 'e:SCORE'] },
    { key: 'e', label: t('deckBuilder.search.effectTextLabel'), desc: t('deckBuilder.search.effectTextDesc'), ops: [':'], examples: ['e:move', 'e:[discard pile]'] },
    { key: 'em', label: t('deckBuilder.search.emLabel'), desc: t('deckBuilder.search.emDesc'), ops: [':'], examples: ['em:hide', 'em:defeat'] },
    { key: 'emi', label: t('deckBuilder.search.emiLabel'), desc: t('deckBuilder.search.emiDesc'), ops: [':'], examples: ['emi:hide', 'emi:defeat'] },
    { key: 'emc', label: t('deckBuilder.search.emcLabel'), desc: t('deckBuilder.search.emcDesc'), ops: [':'], examples: ['emc:power', 'emc:chakra'] },
    { key: 'eup', label: t('deckBuilder.search.eupLabel'), desc: t('deckBuilder.search.eupDesc'), ops: [':'], examples: ['eup:move', 'eup:play'] },
    { key: 'ea', label: t('deckBuilder.search.eaLabel'), desc: t('deckBuilder.search.eaDesc'), ops: [':'], examples: ['ea:move', 'ea:look'] },
    { key: 'es', label: t('deckBuilder.search.esLabel'), desc: t('deckBuilder.search.esDesc'), ops: [':'], examples: ['es:draw', 'es:chakra'] },
  ];

  const tryExample = (q: string) => { setSearchQuery(q); setShowSearchHelp(false); };

  const heroCards = ['/images/cards/KS/secret/KS-133-S.webp', '/images/cards/KS/mythos/KS-143-M.webp', '/images/cards/KS/secret/KS-136-S.webp', '/images/cards/KS/secret/KS-137-S.webp', '/images/cards/KS/mythos/KS-144-M.webp'];

  // Group filters for display: Stats | Card Properties | Effects
  const statsFilters = searchFilters.slice(0, 2);   // c, p
  const cardFilters = searchFilters.slice(2, 9);     // k, k+, k!, g, r, s, nv
  const effectFilters = searchFilters.slice(9);       // e, e text, em, emi, emc, eup, ea, es

  const renderFilterRow = ({ key, label, desc, examples }: typeof searchFilters[0], i: number, color = '#c4a35a') => (
    <div key={`${key}-${i}`} className="mb-2.5">
      <div className="flex items-baseline gap-2 mb-1">
        <span className="font-body text-[13px] font-bold" style={{ color }}>{key}</span>
        <span className="font-body text-[11px] font-medium" style={{ color: '#aaa' }}>{label}</span>
        <span className="font-body text-[10px]" style={{ color: '#444' }}>{desc}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {examples.map((ex) => (
          <button key={ex} onClick={() => tryExample(ex)}
            className="font-body text-[11px] px-3 py-1 cursor-pointer"
            style={{ backgroundColor: '#111111', color, borderBottom: `2px solid ${color}25` }}>
            {ex}
          </button>
        ))}
      </div>
    </div>
  );

  const renderSearchHelp = () => showSearchHelp ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.92)' }}
      onClick={() => setShowSearchHelp(false)}
    >
      <div
        className="w-full overflow-hidden flex flex-col"
        style={{
          maxWidth: '1050px',
          maxHeight: 'calc(100vh - 24px)',
          backgroundColor: '#0a0a0a',
          border: '1px solid rgba(196, 163, 90, 0.08)',
          boxShadow: '0 0 80px rgba(0,0,0,0.6)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hero header */}
        <div className="relative shrink-0 overflow-hidden" style={{ height: '110px' }}>
          <div className="absolute inset-0 flex justify-center gap-2" style={{ opacity: 0.2, filter: 'blur(1px)' }}>
            {heroCards.map((src, i) => (
              <img key={i} src={src} alt="" className="h-full object-cover" style={{ width: '210px' }} draggable={false} />
            ))}
          </div>
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(10,10,10,0.2), rgba(10,10,10,1))' }} />
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-3">
            <span className="text-2xl tracking-widest" style={{ color: '#c4a35a', fontFamily: "'NJNaruto', sans-serif" }}>
              {t('deckBuilder.search.helpTitle')}
            </span>
            <p className="font-body text-[11px] mt-1 max-w-lg text-center px-4" style={{ color: '#666' }}>
              {t('deckBuilder.search.helpIntro')}
            </p>
          </div>
          <button onClick={() => setShowSearchHelp(false)}
            className="absolute top-3 right-4 font-body text-[11px] cursor-pointer px-2 py-1"
            style={{ color: '#555', backgroundColor: 'rgba(0,0,0,0.5)' }}>
            ESC
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto py-5">
          <div className="max-w-4xl mx-auto px-5 sm:px-8">

            {/* Name search */}
            <div className="mb-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <p className="font-body text-[11px] mb-2" style={{ color: '#888' }}>{t('deckBuilder.search.nameDesc')}</p>
              <div className="flex flex-wrap gap-1.5">
                {['naruto', 'KS-133', 'sakura', 'orochimaru'].map((ex) => (
                  <button key={ex} onClick={() => tryExample(ex)}
                    className="font-body text-[11px] px-3 py-1.5 cursor-pointer"
                    style={{ backgroundColor: '#111111', color: '#bbb', borderBottom: '2px solid rgba(255,255,255,0.06)' }}>
                    {ex}
                  </button>
                ))}
              </div>
            </div>

            {/* Three-column grid centered */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">

              {/* Col 1 — Stats */}
              <div>
                <span className="text-sm tracking-wider block mb-3" style={{ color: '#c4a35a', fontFamily: "'NJNaruto', sans-serif", opacity: 0.7 }}>
                  Stats
                </span>
                {statsFilters.map((f, i) => renderFilterRow(f, i, '#c4a35a'))}
              </div>

              {/* Col 2 — Card Properties */}
              <div>
                <span className="text-sm tracking-wider block mb-3" style={{ color: '#3e8b3e', fontFamily: "'NJNaruto', sans-serif", opacity: 0.7 }}>
                  Properties
                </span>
                {cardFilters.map((f, i) => renderFilterRow(f, i, '#3e8b3e'))}
              </div>

              {/* Col 3 — Effects */}
              <div>
                <span className="text-sm tracking-wider block mb-3" style={{ color: '#b33e3e', fontFamily: "'NJNaruto', sans-serif", opacity: 0.7 }}>
                  Effects
                </span>
                {effectFilters.map((f, i) => {
                  const keyColors: Record<string, string> = { e: '#c4a35a', em: '#c4a35a', emi: '#c4a35a', emc: '#888', eup: '#3e8b3e', ea: '#b33e3e', es: '#6a6abb' };
                  return renderFilterRow(f, i, keyColors[f.key] ?? '#b33e3e');
                })}
              </div>
            </div>

            {/* Combine examples */}
            <div className="pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <span className="text-sm tracking-wider block mb-1" style={{ color: '#6a6abb', fontFamily: "'NJNaruto', sans-serif", opacity: 0.7 }}>
                {t('deckBuilder.search.combineTitle')}
              </span>
              <p className="font-body text-[10px] mb-3" style={{ color: '#444' }}>
                {t('deckBuilder.search.combineDesc')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {[
                  { query: 'naruto / sasuke', desc: t('deckBuilder.search.exampleOr') },
                  { query: 'c<=4, -g:Leaf', desc: t('deckBuilder.search.exampleNegate') },
                  { query: 'c:2/5 k:Jutsu', desc: t('deckBuilder.search.exampleOrCost') },
                  { query: 'nv:Hokage', desc: t('deckBuilder.search.exampleNv') },
                  { query: 'emi:defeat', desc: t('deckBuilder.search.exampleEmi') },
                  { query: 'e:[discard pile]', desc: t('deckBuilder.search.exampleBracket') },
                  { query: 'k:Jutsu+Team 7', desc: t('deckBuilder.search.example5') },
                  { query: 'eup:move g:Leaf', desc: t('deckBuilder.search.example4') },
                  { query: 'k:!Summon', desc: t('deckBuilder.search.example6') },
                ].map(({ query, desc }) => (
                  <button key={query} onClick={() => tryExample(query)}
                    className="flex flex-col items-start text-left px-4 py-2 cursor-pointer"
                    style={{ backgroundColor: '#0e0e0e', borderLeft: '3px solid rgba(106,106,187,0.3)' }}>
                    <span className="font-body text-[11px] font-medium" style={{ color: '#c4a35a' }}>{query}</span>
                    <span className="font-body text-[10px] mt-0.5" style={{ color: '#555' }}>{desc}</span>
                  </button>
                ))}
              </div>
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
                  backgroundColor: '#0a0a0a',
                  border: m ? '1px solid rgba(196,163,90,0.2)' : '1px solid rgba(255,255,255,0.04)',
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
                  <div className="w-full h-full" style={{
                    opacity: 0.25,
                    backgroundImage: 'url(/images/card-back.webp)',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    transform: 'rotate(90deg)',
                    width: '64px',
                    height: '90px',
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    marginTop: '-45px',
                    marginLeft: '-32px',
                  }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <SectionDivider width={100} />

      {/* Sort button — always visible, greyed out when deck empty */}
      <div className="flex items-center gap-2 mb-2">
        <button onClick={deckChars.length > 1 ? sortCharsByCost : undefined}
          className="px-2 py-0.5 text-[9px] uppercase font-bold"
          style={{
            backgroundColor: deckChars.length > 1 ? 'rgba(196,163,90,0.08)' : 'rgba(255,255,255,0.02)',
            borderLeft: deckChars.length > 1 ? '2px solid rgba(196,163,90,0.4)' : '2px solid rgba(255,255,255,0.06)',
            color: deckChars.length > 1 ? '#c4a35a' : '#333',
            cursor: deckChars.length > 1 ? 'pointer' : 'default',
          }}>
          {t("deckBuilder.sortByCost")}
        </button>
      </div>

      {/* Character grid — always shows 30 slots minimum */}
      <div className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(10, 1fr)' }}>
        {Array.from({ length: Math.max(30, deckChars.length) }).map((_, i) => {
          const card = deckChars[i];
          if (card) {
            return (
              <DeckCard
                key={`${card.id}-${i}`}
                card={card}
                idx={i}
                onRemove={handleRemoveChar}
                onHover={handlePreview}
              />
            );
          }
          return (
            <div key={`empty-${i}`} className="relative overflow-hidden" style={{ aspectRatio: '5/7', backgroundColor: '#0a0a0a' }}>
              <img src="/images/card-back.webp" alt="" className="w-full h-full object-cover" style={{ opacity: 0.12 }} draggable={false} />
            </div>
          );
        })}
      </div>
    </>
  );

  // ═══════════════════════════════════════════════════════════════
  //  MAIN LAYOUT
  // ═══════════════════════════════════════════════════════════════

  return (
    <main id="main-content" className="relative" style={{ backgroundColor: '#0a0a0a', height: '100vh', overflow: 'hidden' }}>

      {/* ═══════ DESKTOP 3-PANEL ═══════ */}
      <div className="hidden lg:flex relative z-10" style={{ height: '100vh' }}>

        {/* ── LEFT: Card Info Panel (always visible) ── */}
        <div className="flex flex-col flex-shrink-0" style={{
          width: '250px',
          backgroundColor: 'rgba(10, 10, 10, 0.95)',
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
            backgroundColor: 'rgba(10, 10, 10, 0.9)',
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
            borderTop: '1px solid rgba(255,255,255,0.04)', backgroundColor: 'rgba(10, 10, 10, 0.9)',
          }}>
            <AngularButton onClick={handleSave} accentColor={loadedDeckId && isDirty ? '#c47a1a' : '#3e8b3e'} variant={validation.valid && !isSaving ? 'primary' : 'muted'} disabled={isSaving || !validation.valid} size="sm">
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
          width: '540px',
          backgroundColor: 'rgba(10, 10, 10, 0.95)',
          borderLeft: '1px solid rgba(255,255,255,0.06)',
        }}>
          {/* Missions section (above search) */}
          <div className="px-3 pt-3 pb-1 flex-shrink-0">
            <span className="text-[8px] uppercase font-bold block mb-1" style={{ color: '#777' }}>{t("deckBuilder.missionCards")}</span>
            <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
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

          <div className="h-px mx-3" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }} />

          {/* Search (below missions) */}
          <div className="px-3 pt-2 pb-2 flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                placeholder={t("collection.search")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 min-w-0 px-2.5 py-1.5 text-xs focus:outline-none"
                style={{
                  backgroundColor: '#0e0e0e', border: '1px solid rgba(255,255,255,0.06)',
                  borderLeft: '3px solid rgba(196, 163, 90, 0.25)', color: '#e0e0e0',
                }}
              />
              <button
                onClick={() => setShowSearchHelp(true)}
                className="font-body text-[10px] font-bold px-3 py-1.5 cursor-pointer shrink-0 whitespace-nowrap"
                style={{ backgroundColor: 'rgba(196, 163, 90, 0.08)', border: '1px solid rgba(196, 163, 90, 0.3)', color: '#c4a35a' }}
              >
                ?
              </button>
              {/* Sort dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowSortDropdown((v) => !v)}
                  className="font-body text-[10px] font-bold px-3 py-1.5 cursor-pointer shrink-0 whitespace-nowrap"
                  style={{ backgroundColor: 'rgba(196, 163, 90, 0.08)', border: '1px solid rgba(196, 163, 90, 0.3)', color: '#c4a35a' }}
                >
                  {'\u21C5'}
                </button>
                {showSortDropdown && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setShowSortDropdown(false)} />
                    <div className="absolute right-0 top-full mt-1 z-40 flex flex-col rounded overflow-hidden"
                      style={{ backgroundColor: '#1a1a1a', border: '1px solid #333', minWidth: '130px' }}>
                      {([
                        { key: 'number' as SortField, label: '#' },
                        { key: 'name' as SortField, label: 'Name' },
                        { key: 'chakra' as SortField, label: 'Chakra' },
                        { key: 'power' as SortField, label: 'Power' },
                        { key: 'rarity' as SortField, label: 'Rarity' },
                      ]).map((opt) => (
                        <button
                          key={opt.key}
                          onClick={() => {
                            if (sortBy === opt.key) setSortOrder((o) => o === 'asc' ? 'desc' : 'asc');
                            else { setSortBy(opt.key); setSortOrder('asc'); }
                            setShowSortDropdown(false);
                          }}
                          className="px-3 py-1.5 text-[10px] text-left hover:bg-[#262626] transition-colors flex items-center justify-between"
                          style={{ color: sortBy === opt.key ? '#c4a35a' : '#ccc' }}
                        >
                          <span>{opt.label}</span>
                          {sortBy === opt.key && <span>{sortOrder === 'asc' ? '\u2191' : '\u2193'}</span>}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="text-[8px] mt-1" style={{ color: '#444' }}>
              {t("deckBuilder.filters.resultsCount", { count: filteredChars.length })}
            </div>
          </div>

          {/* Scrollable card grid */}
          <div className="flex-1 overflow-y-auto px-3 pb-3" style={{ minHeight: 0 }}>

            {/* Characters section */}
            <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))' }}>
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
          backgroundColor: 'rgba(10, 10, 10, 0.95)',
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
          <AngularButton onClick={handleSave} accentColor={loadedDeckId && isDirty ? '#c47a1a' : '#3e8b3e'} variant={validation.valid ? 'primary' : 'muted'} disabled={isSaving || !validation.valid} size="sm">
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
              <div className="flex items-center gap-1.5 mb-1">
                <input type="text" placeholder={t("collection.search")} value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 min-w-0 px-2.5 py-1.5 text-xs focus:outline-none"
                  style={{ backgroundColor: '#0e0e0e', border: '1px solid rgba(255,255,255,0.06)', borderLeft: '3px solid rgba(196,163,90,0.25)', color: '#e0e0e0' }}
                />
                <button
                  onClick={() => setShowSearchHelp(true)}
                  className="font-body text-[10px] font-bold px-2.5 py-1.5 cursor-pointer shrink-0"
                  style={{ backgroundColor: 'rgba(196, 163, 90, 0.08)', border: '1px solid rgba(196, 163, 90, 0.3)', color: '#c4a35a' }}
                >
                  ?
                </button>
                <div className="relative">
                  <button
                    onClick={() => setShowSortDropdown((v) => !v)}
                    className="font-body text-[10px] font-bold px-2.5 py-1.5 cursor-pointer shrink-0"
                    style={{ backgroundColor: 'rgba(196, 163, 90, 0.08)', border: '1px solid rgba(196, 163, 90, 0.3)', color: '#c4a35a' }}
                  >{'\u21C5'}</button>
                  {showSortDropdown && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setShowSortDropdown(false)} />
                      <div className="absolute right-0 top-full mt-1 z-40 flex flex-col rounded overflow-hidden"
                        style={{ backgroundColor: '#1a1a1a', border: '1px solid #333', minWidth: '120px' }}>
                        {([
                          { key: 'number' as SortField, label: '#' },
                          { key: 'name' as SortField, label: 'Name' },
                          { key: 'chakra' as SortField, label: 'Chakra' },
                          { key: 'power' as SortField, label: 'Power' },
                          { key: 'rarity' as SortField, label: 'Rarity' },
                        ]).map((opt) => (
                          <button key={opt.key}
                            onClick={() => {
                              if (sortBy === opt.key) setSortOrder((o) => o === 'asc' ? 'desc' : 'asc');
                              else { setSortBy(opt.key); setSortOrder('asc'); }
                              setShowSortDropdown(false);
                            }}
                            className="px-3 py-1.5 text-[10px] text-left hover:bg-[#262626] transition-colors flex items-center justify-between"
                            style={{ color: sortBy === opt.key ? '#c4a35a' : '#ccc' }}>
                            <span>{opt.label}</span>
                            {sortBy === opt.key && <span>{sortOrder === 'asc' ? '\u2191' : '\u2193'}</span>}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="text-[8px] mb-2" style={{ color: '#444' }}>
                {t("deckBuilder.filters.resultsCount", { count: filteredChars.length })}
              </div>

              {/* Missions */}
              <span className="text-[9px] uppercase font-bold block mb-1" style={{ color: '#777' }}>{t("deckBuilder.missionCards")}</span>
              <div className="grid grid-cols-5 gap-1 mb-3">
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
            backgroundColor: 'rgba(10, 10, 10, 0.98)',
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
              <a href="https://exburst.dev/naruto/deckbuilder" target="_blank" rel="noopener noreferrer"
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
