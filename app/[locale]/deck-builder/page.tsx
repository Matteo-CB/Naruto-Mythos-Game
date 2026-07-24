"use client";

import { useState, useEffect, useMemo, useCallback, useRef, memo, useDeferredValue } from "react";
import { VirtualCardGrid } from "@/components/deckBuilder/VirtualCardGrid";
import { useTranslations, useLocale } from "next-intl";
import { useSession } from "next-auth/react";
import { Link } from "@/lib/i18n/navigation";
import type { CharacterCard, MissionCard } from "@/lib/engine/types";
import { validateDeck } from "@/lib/engine/rules/DeckValidation";
import { compareBySetOrder } from "@/lib/cards/order";
import { useDeckBuilderStore } from "@/stores/deckBuilderStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUnlockedVariants } from "@/lib/hooks/useUnlockedVariants";
import { isVariantCard, isLockedVariantCard, baseCardIdFor } from "@/lib/variants/isVariant";
import { holoIdFor, isHoloId, holoBaseId } from "@/lib/holo/holoId";
import { HoloFoilOverlay } from "@/components/cards/HoloFoilOverlay";
import { useTrackOnMount, trackUiHook } from "@/lib/hooks/useTrackUi";
import { useBannedCards } from "@/lib/hooks/useBannedCards";
import { normalizeImagePath } from "@/lib/utils/imagePath";
import {
  getCardName, getCardTitle, getCardGroup, getCardKeyword, getRarityLabel,
} from "@/lib/utils/cardLocale";
import { getCardEffectDescription } from "@/lib/data/effectDescriptions";
import { exportDeckAsImage } from "@/lib/utils/exportDeckImage";
import {
  PopupOverlay, PopupCornerFrame, PopupTitle, PopupActionButton,
  PopupDismissLink, SectionDivider, AngularButton,
} from "@/components/game/PopupPrimitives";
import { EvolvingCostMeter } from "@/components/deckBuilder/EvolvingCostMeter";
import { EvolvingBuilderHelper } from "@/components/deckBuilder/EvolvingBuilderHelper";
import { EvolvingDeckHolo } from "@/components/evolving/EvolvingDeckHolo";
import { EvolvingDeckBadge } from "@/components/evolving/EvolvingDeckBadge";
import { useRevealingStore } from "@/stores/revealingStore";

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

type EffectFunction = 'defeat' | 'hide' | 'draw' | 'move' | 'powerup' | 'chakra' | 'control' | 'play' | 'protect' | 'continuous' | 'score';

const EFFECT_FN_PATTERNS: Array<{ fn: EffectFunction; patterns: RegExp[] }> = [
  { fn: 'defeat', patterns: [/defeat/i, /destroy/i, /vainc/i] },
  { fn: 'hide', patterns: [/\bhide\b/i, /\bhidden\b/i, /cach[eé]/i] },
  { fn: 'draw', patterns: [/\bdraw\b/i, /\bpioch/i, /\btop card of.*deck/i] },
  { fn: 'move', patterns: [/\bmove\b/i, /\bdeplace/i] },
  { fn: 'powerup', patterns: [/powerup/i, /power token/i, /puissance/i] },
  { fn: 'chakra', patterns: [/chakra \+/i, /\bgain.*chakra/i, /\bsteal.*chakra/i, /\bchakra/i] },
  { fn: 'control', patterns: [/take control/i, /prendre le controle/i, /control of/i] },
  { fn: 'play', patterns: [/\bplay a\b/i, /\bplay.*from\b/i, /\breveal\b/i, /\bjouer\b/i, /\brevel/i] },
  { fn: 'protect', patterns: [/instead of/i, /cannot be/i, /\bprotect/i, /\bne peut pas/i, /au lieu/i] },
  { fn: 'continuous', patterns: [/\[⧗\]/] },
  { fn: 'score', patterns: [/\[↯\]/] },
];

function classifyCardEffects(card: { effects?: Array<{ description: string }> }): EffectFunction[] {
  if (!card.effects || card.effects.length === 0) return [];
  const fns = new Set<EffectFunction>();
  for (const eff of card.effects) {
    const desc = eff.description;
    for (const { fn, patterns } of EFFECT_FN_PATTERNS) {
      if (patterns.some((p) => p.test(desc))) fns.add(fn);
    }
  }
  return Array.from(fns);
}

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
  effectFunctions: Array<{ value: string; negated: boolean }>;
}

function emptyFilter(): SearchFilter {
  return {
    nameQueries: [], chakra: [], power: [], keywords: [], groups: [],
    rarities: [], sets: [], effects: [], effectText: [],
    effectMainText: [], effectMainInstantText: [], effectMainContinuousText: [],
    effectUpgradeText: [], effectAmbushText: [], effectScoreText: [], nameVersions: [],
    effectFunctions: [],
  };
}

function parseSearchQuery(raw: string): SearchFilter {
  const filter = emptyFilter();
  
  let normalized = raw.replace(/,\s*/g, ' ');
  
  normalized = normalized.replace(/(\w+):?\[([^\]]+)\](\+\S+)?/g, (_, key, content, suffix) => `${key}:"${content}${suffix ?? ''}"`);

  const tokenRegex = /(-)?(eup|emi|emc|em|ea|es|nv|[cpkgresf])(:|=|>=|<=|>|<)("([^"]+)"|(\S+))/gi;
  let remaining = normalized;

  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(normalized)) !== null) {
    const negated = match[1] === '-';
    const key = match[2].toLowerCase();
    const op = match[3] === ':' ? '=' : match[3];
    const value = match[5] ?? match[6];
    remaining = remaining.replace(match[0], '');

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
        case 'f': filter.effectFunctions.push({ value: normalizeStr(val), negated }); break;
      }
    }
  }

  const leftover = remaining.trim();
  if (leftover) {
    
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
  
  if (filter.nameQueries.length > 0) {
    const positives = filter.nameQueries.filter((q) => !q.negated);
    const negatives = filter.nameQueries.filter((q) => q.negated);
    const nameStr = normalizeStr(getCardName(card, locale as 'en' | 'fr'));
    const nameFr = normalizeStr(card.name_fr);
    const idStr = card.id.toLowerCase();
    const matchesAny = (q: string) => nameStr.includes(q) || nameFr.includes(q) || idStr.includes(q);
    
    if (positives.length > 0 && !positives.some((q) => matchesAny(q.text))) return false;
    
    for (const q of negatives) { if (matchesAny(q.text)) return false; }
  }
  
  for (const nv of filter.nameVersions) {
    const titleStr = normalizeStr(getCardTitle(card, locale as 'en' | 'fr'));
    const titleFr = normalizeStr(card.title_fr ?? '');
    const has = titleStr.includes(nv.value) || titleFr.includes(nv.value);
    if (nv.negated ? has : !has) return false;
  }
  
  const chakraPos = filter.chakra.filter((c) => !c.negated);
  const chakraNeg = filter.chakra.filter((c) => c.negated);
  if (chakraPos.length > 0 && !chakraPos.some((c) => compareOp(card.chakra ?? 0, c.op, c.val))) return false;
  for (const c of chakraNeg) { if (compareOp(card.chakra ?? 0, c.op, c.val)) return false; }
  
  const powerPos = filter.power.filter((p) => !p.negated);
  const powerNeg = filter.power.filter((p) => p.negated);
  if (powerPos.length > 0 && !powerPos.some((p) => compareOp(card.power ?? 0, p.op, p.val))) return false;
  for (const p of powerNeg) { if (compareOp(card.power ?? 0, p.op, p.val)) return false; }
  
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
  
  for (const s of filter.sets) {
    const has = card.id.toUpperCase().startsWith(s.value + '-');
    if (s.negated ? has : !has) return false;
  }
  
  const groupPos = filter.groups.filter((g) => !g.negated);
  const groupNeg = filter.groups.filter((g) => g.negated);
  if (groupPos.length > 0 && !groupPos.some((g) => card.group && normalizeStr(card.group).includes(g.value))) return false;
  for (const g of groupNeg) { if (card.group && normalizeStr(card.group).includes(g.value)) return false; }
  
  const rarPos = filter.rarities.filter((r) => !r.negated);
  const rarNeg = filter.rarities.filter((r) => r.negated);
  if (rarPos.length > 0 && !rarPos.some((r) => card.rarity === r.value)) return false;
  for (const r of rarNeg) { if (card.rarity === r.value) return false; }
  
  const effPos = filter.effects.filter((e) => !e.negated);
  const effNeg = filter.effects.filter((e) => e.negated);
  if (effPos.length > 0 && !card.effects?.some((e) => effPos.some((f) => f.value === e.type))) return false;
  for (const e of effNeg) { if (card.effects?.some((ef) => ef.type === e.value)) return false; }
  
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
  
  if (filter.effectFunctions.length > 0) {
    const cardFns = classifyCardEffects(card);
    const fnPos = filter.effectFunctions.filter((f) => !f.negated);
    const fnNeg = filter.effectFunctions.filter((f) => f.negated);
    if (fnPos.length > 0 && !fnPos.some((f) => cardFns.some((fn) => fn.includes(f.value)))) return false;
    for (const f of fnNeg) { if (cardFns.some((fn) => fn.includes(f.value))) return false; }
  }
  return true;
}

const GridThumb = memo(function GridThumb({ src }: { src: string }) {
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      className="absolute inset-0 w-full h-full object-cover"
    />
  );
});

const CatalogCard = memo(function CatalogCard({
  card, allowed, inDeckCount, isBanned, onAdd, onHover,
}: {
  card: CharacterCard;
  allowed: boolean;
  inDeckCount: number;
  isBanned: boolean;
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
        <GridThumb src={imgPath} />
      ) : (
        <div className="w-full h-full" style={{ backgroundColor: '#111' }} />
      )}
      {inDeckCount > 0 && (
        <div className="absolute top-0 right-0 px-1 text-[7px] font-bold"
          style={{ backgroundColor: inDeckCount >= 2 ? 'rgba(179,62,62,0.9)' : 'rgba(62,139,62,0.9)', color: '#fff' }}>
          x{inDeckCount}
        </div>
      )}
      {isBanned && (
        <span aria-hidden className="absolute top-0 left-0 font-display font-bold uppercase pointer-events-none"
          style={{ padding: '1px 5px', fontSize: 8, letterSpacing: '0.18em', color: '#fff', backgroundColor: 'rgba(179, 62, 62, 0.95)', boxShadow: '0 2px 6px rgba(0,0,0,0.45)' }}>
          BAN
        </span>
      )}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 flex items-center justify-center pointer-events-none"
        style={{ backgroundColor: allowed ? 'rgba(62,139,62,0.35)' : 'rgba(179,62,62,0.35)', transition: 'opacity 80ms' }}>
        <span className="text-lg font-bold" style={{ color: '#fff' }}>{allowed ? '+' : ''}</span>
      </div>
    </button>
  );
});

const CatalogMission = memo(function CatalogMission({
  card, allowed, isBanned, onAdd, onHover,
}: {
  card: MissionCard;
  allowed: boolean;
  isBanned: boolean;
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
        <GridThumb src={imgPath} />
      ) : (
        <div className="w-full h-full" style={{ backgroundColor: '#111' }} />
      )}
      {isBanned && (
        <span aria-hidden className="absolute top-0 left-0 font-display font-bold uppercase pointer-events-none"
          style={{ padding: '1px 5px', fontSize: 8, letterSpacing: '0.18em', color: '#fff', backgroundColor: 'rgba(179, 62, 62, 0.95)', boxShadow: '0 2px 6px rgba(0,0,0,0.45)' }}>
          BAN
        </span>
      )}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 flex items-center justify-center pointer-events-none"
        style={{ backgroundColor: allowed ? 'rgba(62,139,62,0.35)' : 'rgba(179,62,62,0.35)', transition: 'opacity 80ms' }}>
        <span className="text-lg font-bold" style={{ color: '#fff' }}>{allowed ? '+' : ''}</span>
      </div>
    </button>
  );
});

const DeckCard = memo(function DeckCard({
  card, idx, onRemove, onHover, onToggleHolo, holoAvailable, holoLabel,
}: {
  card: CharacterCard;
  idx: number;
  onRemove: (idx: number) => void;
  onHover: (card: CharacterCard | MissionCard) => void;
  onToggleHolo?: (idx: number) => void;
  holoAvailable?: boolean;
  holoLabel?: string;
}) {
  const imgPath = normalizeImagePath(card.image_file);
  const showHoloButton = !!onToggleHolo && (holoAvailable || card.isHolo);
  return (
    <div
      onClick={() => onRemove(idx)}
      onMouseEnter={() => onHover(card)}
      data-gp="true"
      role="button"
      tabIndex={-1}
      className="relative overflow-hidden group cursor-pointer w-full"
      style={{
        aspectRatio: '5/7',
        backgroundColor: '#0e0e0e',
      }}
    >
      {imgPath ? (
        <GridThumb src={imgPath} />
      ) : (
        <div className="w-full h-full" style={{ backgroundColor: '#111' }} />
      )}
      {card.isHolo && imgPath && <HoloFoilOverlay />}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 flex items-center justify-center pointer-events-none"
        style={{ backgroundColor: 'rgba(179,62,62,0.4)', transition: 'opacity 80ms' }}>
        <span className="text-sm font-bold" style={{ color: '#fff' }}>x</span>
      </div>
      {showHoloButton && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleHolo!(idx); }}
          aria-label={holoLabel}
          aria-pressed={!!card.isHolo}
          title={holoLabel}
          className="absolute top-0 right-0 z-10 flex items-center justify-center font-bold uppercase"
          style={{
            width: '16px',
            height: '16px',
            fontSize: '9px',
            letterSpacing: '0.02em',
            backgroundColor: card.isHolo ? 'rgba(196,163,90,0.92)' : 'rgba(10,10,10,0.8)',
            color: card.isHolo ? '#0a0a0a' : '#c4a35a',
            boxShadow: card.isHolo ? '0 0 8px rgba(196,163,90,0.5)' : 'none',
          }}
        >
          H
        </button>
      )}
    </div>
  );
});

export default function DeckBuilderPage() {
  const t = useTranslations();
  const locale = useLocale();
  const loc = locale as "en" | "fr";
  const tCardMeta = useTranslations('cardMeta');
  const { data: session, status } = useSession();

  const [availableChars, setAvailableChars] = useState<CharacterCard[]>([]);
  const [availableMissions, setAvailableMissions] = useState<MissionCard[]>([]);
  const [allChars, setAllChars] = useState<CharacterCard[]>([]);
  const [allMissions, setAllMissions] = useState<MissionCard[]>([]);

  const revealingVersion = useRevealingStore((s) => s.version);
  const revealingPrivileged = useRevealingStore((s) => s.privileged);
  const unrevealedIds = useRevealingStore((s) => s.unrevealedIds);
  const [showUnrevealed, setShowUnrevealed] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearch = useDeferredValue(searchQuery);
  const [sortBy, setSortBy] = useState<SortField>('number');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [previewCard, setPreviewCard] = useState<CharacterCard | MissionCard | null>(null);
  const [mobileView, setMobileView] = useState<'catalog' | 'deck'>('catalog');
  const mobileScrollRef = useRef<HTMLDivElement | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [showSavedDecks, setShowSavedDecks] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [overwriteConflict, setOverwriteConflict] = useState<{ id: string; name: string } | null>(null);
  const [importCode, setImportCode] = useState("");
  const [importMessage, setImportMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [exportCopied, setExportCopied] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const deckName = useDeckBuilderStore((s) => s.deckName);
  const deckChars = useDeckBuilderStore((s) => s.deckChars);
  const deckMissions = useDeckBuilderStore((s) => s.deckMissions);
  const savedDecks = useDeckBuilderStore((s) => s.savedDecks);
  const isLoading = useDeckBuilderStore((s) => s.isLoading);
  const isSaving = useDeckBuilderStore((s) => s.isSaving);
  const loadedDeckId = useDeckBuilderStore((s) => s.loadedDeckId);
  const addError = useDeckBuilderStore((s) => s.addError);
  const evolvingMode = useDeckBuilderStore((s) => s.evolvingMode);
  const addErrorKey = useDeckBuilderStore((s) => s.addErrorKey);
  const addErrorParams = useDeckBuilderStore((s) => s.addErrorParams);
  const setDeckName = useDeckBuilderStore((s) => s.setDeckName);
  const addChar = useDeckBuilderStore((s) => s.addChar);
  const removeChar = useDeckBuilderStore((s) => s.removeChar);
  const toggleCharHolo = useDeckBuilderStore((s) => s.toggleCharHolo);
  const canUseHolo = useDeckBuilderStore((s) => s.canUseHolo);
  const removeLockedVariants = useDeckBuilderStore((s) => s.removeLockedVariants);
  const addMission = useDeckBuilderStore((s) => s.addMission);
  const removeMission = useDeckBuilderStore((s) => s.removeMission);
  const clearDeck = useDeckBuilderStore((s) => s.clearDeck);
  const saveDeck = useDeckBuilderStore((s) => s.saveDeck);
  const isDirty = useDeckBuilderStore((s) => s.isDirty);
  const loadSavedDecks = useDeckBuilderStore((s) => s.loadSavedDecks);
  const loadDeck = useDeckBuilderStore((s) => s.loadDeck);
  const duplicateDeck = useDeckBuilderStore((s) => s.duplicateDeck);
  const deleteDeck = useDeckBuilderStore((s) => s.deleteDeck);
  const canAddChar = useDeckBuilderStore((s) => s.canAddChar);
  const canAddMission = useDeckBuilderStore((s) => s.canAddMission);
  const clearAddError = useDeckBuilderStore((s) => s.clearAddError);
  const sortCharsByCost = useDeckBuilderStore((s) => s.sortCharsByCost);
  const sortCharsByName = useDeckBuilderStore((s) => s.sortCharsByName);
  const setUnlockedVariantIds = useDeckBuilderStore((s) => s.setUnlockedVariantIds);
  const { bannedIds } = useBannedCards();
  const { unlockedIds: unlockedVariantIds, loading: variantsLoading } = useUnlockedVariants();
  useTrackOnMount('ui.deck_builder.opened');

  useEffect(() => {
    setUnlockedVariantIds(unlockedVariantIds);
  }, [unlockedVariantIds, setUnlockedVariantIds]);
  const hideVariants = useSettingsStore((s) => s.hideDeckBuilderVariants);
  const setHideVariants = useSettingsStore((s) => s.setHideDeckBuilderVariants);
  const settingsLoaded = useSettingsStore((s) => s.isLoaded);
  const fetchSettings = useSettingsStore((s) => s.fetchFromServer);
  useEffect(() => { if (!settingsLoaded) fetchSettings(); }, [settingsLoaded, fetchSettings]);
  const showAltArt = !hideVariants;
  type DeckViewMode = 'grid' | 'rows';
  type DeckGroupBy = 'chakra' | 'group' | 'rarity' | 'power' | 'keyword' | 'effect';
  const [deckViewMode, setDeckViewMode] = useState<DeckViewMode>('grid');
  const [deckGroupBy, setDeckGroupBy] = useState<DeckGroupBy>('chakra');

  useEffect(() => {
    import("@/lib/data/cardLoader").then((mod) => {
      setAvailableChars(mod.getPlayableCharacters());
      setAvailableMissions(mod.getPlayableMissions());
      setAllChars(mod.getAllCharacters());
      setAllMissions(mod.getAllMissions());
    });
  }, [revealingVersion]);

  useEffect(() => { loadSavedDecks(); }, [loadSavedDecks]);

  useEffect(() => {
    try {
      const pendingId = sessionStorage.getItem('loadDeckId');
      if (pendingId && availableChars.length > 0 && availableMissions.length > 0) {
        sessionStorage.removeItem('loadDeckId');
        loadDeck(pendingId, availableChars, availableMissions);
      }
    } catch { /* SSR / privacy */ }
  }, [availableChars, availableMissions, loadDeck]);

  useEffect(() => {
    if (addError) {
      const timer = setTimeout(() => clearAddError(), 3000);
      return () => clearTimeout(timer);
    }
  }, [addError, clearAddError]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const parsedSearch = useMemo(() => parseSearchQuery(deferredSearch), [deferredSearch]);

  const filteredChars = useMemo(() => {
    let chars = [...availableChars];
    if (!showAltArt) chars = chars.filter((c) => !['RA', 'MV', 'SV', 'L'].includes(c.rarity));
    if (!showUnrevealed) chars = chars.filter((c) => !unrevealedIds.has(c.id));
    if (deferredSearch) {
      chars = chars.filter((c) => matchesSearchFilter(c, parsedSearch, loc));
    }
    return chars.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'number': cmp = compareBySetOrder(a, b); break;
        case 'name': cmp = getCardName(a, loc).localeCompare(getCardName(b, loc)); break;
        case 'chakra': cmp = (a.chakra ?? 0) - (b.chakra ?? 0); break;
        case 'power': cmp = (a.power ?? 0) - (b.power ?? 0); break;
        case 'rarity': cmp = (RARITY_ORDER[a.rarity] ?? 99) - (RARITY_ORDER[b.rarity] ?? 99); break;
      }
      if (cmp === 0) cmp = compareBySetOrder(a, b);
      return sortOrder === 'desc' ? -cmp : cmp;
    });
  }, [availableChars, deferredSearch, parsedSearch, loc, sortBy, sortOrder, showAltArt, showUnrevealed, unrevealedIds]);

  const filteredMissions = useMemo(
    () => (showUnrevealed ? [...availableMissions] : availableMissions.filter((m) => !unrevealedIds.has(m.id))),
    [availableMissions, showUnrevealed, unrevealedIds],
  );

  const deckHasUnrevealed = useMemo(
    () => deckChars.some((c) => unrevealedIds.has(c.id)) || deckMissions.some((m) => unrevealedIds.has(m.id)),
    [deckChars, deckMissions, unrevealedIds],
  );

  const validation = useMemo(() => validateDeck(deckChars, deckMissions), [deckChars, deckMissions]);

  const lockedVariantsInDeck = useMemo(() => {
    if (variantsLoading) return [];
    const seen = new Set<string>();
    const result: CharacterCard[] = [];
    for (const c of deckChars) {
      if (isLockedVariantCard(c) && !unlockedVariantIds.has(c.id) && !seen.has(c.id)) {
        seen.add(c.id);
        result.push(c);
        continue;
      }
      if (c.isHolo && !unlockedVariantIds.has(holoIdFor(c.id)) && !seen.has(holoIdFor(c.id))) {
        seen.add(holoIdFor(c.id));
        result.push(c);
      }
    }
    return result;
  }, [deckChars, unlockedVariantIds, variantsLoading]);

  const handleRepairLockedVariants = useCallback(() => {
    removeLockedVariants();
  }, [removeLockedVariants]);

  const deckCardCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of deckChars) counts.set(c.id, (counts.get(c.id) || 0) + 1);
    return counts;
  }, [deckChars]);

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

  const deckGroupedRows = useMemo(() => {
    const groups = new Map<string, { card: CharacterCard; idx: number }[]>();
    deckChars.forEach((card, i) => {
      if (deckGroupBy === 'effect') {
        
        const fns = classifyCardEffects(card);
        if (fns.length === 0) {
          const arr = groups.get('-') || [];
          arr.push({ card, idx: i });
          groups.set('-', arr);
        } else {
          for (const fn of fns) {
            const arr = groups.get(fn) || [];
            arr.push({ card, idx: i });
            groups.set(fn, arr);
          }
        }
      } else if (deckGroupBy === 'keyword') {
        
        const kws = card.keywords ?? [];
        if (kws.length === 0) {
          const arr = groups.get('-') || [];
          arr.push({ card, idx: i });
          groups.set('-', arr);
        } else {
          for (const kw of kws) {
            const arr = groups.get(kw) || [];
            arr.push({ card, idx: i });
            groups.set(kw, arr);
          }
        }
      } else {
        let key: string;
        switch (deckGroupBy) {
          case 'chakra': key = String(card.chakra ?? 0); break;
          case 'power': key = String(card.power ?? 0); break;
          case 'group': key = card.group || 'Independent'; break;
          case 'rarity': key = card.rarity; break;
        }
        const arr = groups.get(key!) || [];
        arr.push({ card, idx: i });
        groups.set(key!, arr);
      }
    });
    return Array.from(groups.entries()).sort((a, b) => {
      if (deckGroupBy === 'chakra' || deckGroupBy === 'power') return Number(a[0]) - Number(b[0]);
      if (deckGroupBy === 'rarity') return (RARITY_ORDER[a[0] as keyof typeof RARITY_ORDER] ?? 99) - (RARITY_ORDER[b[0] as keyof typeof RARITY_ORDER] ?? 99);
      return a[0].localeCompare(b[0]);
    });
  }, [deckChars, deckGroupBy]);

  const previewAddCheck = useMemo(() => {
    if (!previewCard) return null;
    return previewCard.card_type !== 'mission'
      ? canAddChar(previewCard as CharacterCard)
      : canAddMission(previewCard as MissionCard);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewCard, deckChars, deckMissions]);

  const handleAddChar = useCallback((card: CharacterCard) => addChar(card), [addChar]);
  const handleAddMission = useCallback((card: MissionCard) => addMission(card), [addMission]);
  const handleRemoveChar = useCallback((idx: number) => removeChar(idx), [removeChar]);
  const handlePreview = useCallback((card: CharacterCard | MissionCard) => setPreviewCard(card), []);
  
  const localizeApiError = useCallback((err: unknown, fallbackKey: string): string => {
    if (err instanceof Error) {
      const errorKey = (err as Error & { errorKey?: string }).errorKey;
      if (typeof errorKey === 'string') {
        try { return t(errorKey); } catch { /* unknown key, fall through */ }
      }
      return err.message || t(fallbackKey);
    }
    return t(fallbackKey);
  }, [t]);

  const handleSave = useCallback(async () => {
    setSaveError(null);
    const trimmedName = (deckName || '').trim() || 'Untitled Deck';
    const conflict = savedDecks.find(
      (d) => d.name.toLowerCase() === trimmedName.toLowerCase() && d.id !== loadedDeckId
    );
    if (conflict) { setOverwriteConflict({ id: conflict.id, name: conflict.name }); return; }
    try { await saveDeck(); } catch (err: unknown) {
      setSaveError(localizeApiError(err, "deckBuilder.failedToSave"));
    }
  }, [saveDeck, localizeApiError, deckName, savedDecks, loadedDeckId]);

  const handleOverwriteConfirm = useCallback(async () => {
    if (!overwriteConflict) return;
    setSaveError(null);
    try { await deleteDeck(overwriteConflict.id); await saveDeck(); } catch (err: unknown) {
      setSaveError(localizeApiError(err, "deckBuilder.failedToSave"));
    } finally { setOverwriteConflict(null); }
  }, [overwriteConflict, deleteDeck, saveDeck, localizeApiError]);

  const handleLoadDeck = useCallback(async (deckId: string) => {
    setSaveError(null);
    try { await loadDeck(deckId, availableChars, availableMissions); } catch (err: unknown) {
      setSaveError(localizeApiError(err, "deckBuilder.failedToLoad"));
    }
  }, [loadDeck, availableChars, availableMissions, localizeApiError]);

  const handleDuplicateDeck = useCallback(async (deckId: string) => {
    setSaveError(null);
    try { await duplicateDeck(deckId, availableChars, availableMissions, t("deckBuilder.copySuffix")); } catch (err: unknown) {
      setSaveError(localizeApiError(err, "deckBuilder.failedToLoad"));
    }
  }, [duplicateDeck, availableChars, availableMissions, localizeApiError, t]);

  const handleDeleteDeck = useCallback(async (deckId: string) => {
    setSaveError(null);
    try { await deleteDeck(deckId); } catch (err: unknown) {
      setSaveError(localizeApiError(err, "deckBuilder.failedToDelete"));
    }
  }, [deleteDeck, localizeApiError]);

  const handleImport = useCallback((codeArg?: string) => {
    const code = (codeArg ?? importCode).trim();
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
    
    const parseVariantFormat = (raw: string): { num: number; variantIdx: number } | null => {
      const m = raw.trim().match(/^(?:KS-)?(\d+)[|_](\d+)$/);
      if (!m) return null;
      return { num: parseInt(m[1], 10), variantIdx: parseInt(m[2], 10) };
    };
    const chars: CharacterCard[] = []; const missions: MissionCard[] = []; const notFound: string[] = [];
    const withHolo = (pick: CharacterCard, wantHolo: boolean): CharacterCard =>
      wantHolo && canUseHolo(pick) ? { ...pick, isHolo: true } : pick;
    for (const part of cardParts) {
      const match = part.match(/^(.+)--(\d+)$/);
      if (!match) { setImportMessage({ type: "error", text: t("deckBuilder.importError") }); return; }
      const wantHolo = isHoloId(match[1]);
      const rawCardId = holoBaseId(match[1]); const qty = parseInt(match[2], 10);

      const variantParsed = parseVariantFormat(rawCardId);
      if (variantParsed) {
        const candidates = charByNumber.get(variantParsed.num);
        const mByNum = missionByNumber.get(variantParsed.num);
        if (candidates && candidates.length > 0) {

          const idx = Math.max(0, variantParsed.variantIdx - 1);
          const pick = idx < candidates.length ? candidates[idx] : candidates[0];
          for (let i = 0; i < qty; i++) chars.push(withHolo(pick, wantHolo));
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
      if (char) { for (let i = 0; i < qty; i++) chars.push(withHolo(char, wantHolo)); continue; }
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
          for (let i = 0; i < qty; i++) chars.push(withHolo(pick, wantHolo));
          continue;
        }
      }
      notFound.push(rawCardId);
    }
    clearDeck();
    if (deckNameFromCode) setDeckName(deckNameFromCode);
    const substituteBase = (card: CharacterCard): CharacterCard => {
      if (isLockedVariantCard(card) && !unlockedVariantIds.has(card.id)) {
        const base = charByCardId.get(baseCardIdFor(card.cardId || card.id));
        if (base) return base;
      }
      return card;
    };
    for (const c of chars) addChar(substituteBase(c));
    for (const m of missions) addMission(m);
    if (notFound.length > 0) {
      setImportMessage({ type: "error", text: t("deckBuilder.importNotFound", { count: notFound.length, ids: notFound.join(", ") }) });
    } else {
      setImportMessage({ type: "success", text: t("deckBuilder.importSuccess", { name: deckNameFromCode || "Deck", chars: chars.length, missions: missions.length }) });
    }
    setImportCode("");
  }, [importCode, allChars, allMissions, clearDeck, setDeckName, addChar, addMission, canUseHolo, t, unlockedVariantIds]);

  const importedFromSessionRef = useRef(false);
  useEffect(() => {
    if (importedFromSessionRef.current) return;
    if (allChars.length === 0 || allMissions.length === 0) return;
    try {
      const code = sessionStorage.getItem('importDeckCode');
      if (code) {
        sessionStorage.removeItem('importDeckCode');
        importedFromSessionRef.current = true;
        handleImport(code);
      }
    } catch { /* SSR / privacy */ }
  }, [allChars, allMissions, handleImport]);

  const exportCode = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of deckChars) { const id = (c.isHolo ? holoIdFor(c.cardId || c.id) : (c.cardId || c.id)); counts.set(id, (counts.get(id) || 0) + 1); }
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
      trackUiHook('deck.exported');
    });
  }, [exportCode]);

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
              <Link href="/login" className="px-6 py-2.5 text-sm font-bold uppercase tracking-wider" style={{ backgroundColor: "#c4a35a", color: "#0a0a0a", }}>{t("common.signIn")}</Link>
              <Link href="/" className="px-6 py-2.5 text-sm" style={{ backgroundColor: "#141414", border: "1px solid #262626", color: "#888888" }}>{t("common.back")}</Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

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

        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5" style={{
            backgroundColor: isChar ? 'rgba(255,255,255,0.04)' : 'rgba(196,163,90,0.12)',
            color: isChar ? '#999' : '#c4a35a',
          }}>{isChar ? t("deckBuilder.characterCards") : t("deckBuilder.missionCards")}</span>
          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5" style={{
            backgroundColor: `${rarColor}12`, color: rarColor,
          }}>{getRarityLabel(card.rarity, tCardMeta)}</span>
        </div>

        <div className="text-sm font-bold" style={{ color: '#e0e0e0' }}>{getCardName(card, loc)}</div>
        {isChar && <div className="text-[11px] mb-2" style={{ color: '#777' }}>{getCardTitle(charCard, loc)}</div>}

        {isChar && (
          <div className="flex items-center gap-0 my-2 py-2" style={{
            backgroundColor: 'rgba(255,255,255,0.02)', }}>
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

        {isChar && charCard.group && (
          <div className="text-[10px] mb-1" style={{ color: '#6b8a6b' }}>{getCardGroup(charCard.group, tCardMeta)}</div>
        )}

        {isChar && charCard.keywords && charCard.keywords.length > 0 && (
          <div className="flex gap-1 mt-1 mb-2 flex-wrap">
            {charCard.keywords.map((kw, i) => (
              <span key={i} className="text-[9px] px-1.5 py-0.5" style={{
                backgroundColor: 'rgba(255,255,255,0.04)', color: '#999',
              }}>{getCardKeyword(kw, tCardMeta)}</span>
            ))}
          </div>
        )}

        {card.effects && card.effects.length > 0 && (
          <div className="flex flex-col gap-1.5 mt-2">
            {card.effects.map((eff, i) => {
              const description = getCardEffectDescription(card.id, i, locale, eff.description);
              const effColor = EFFECT_TYPE_COLORS[eff.type] ?? '#888';
              return (
                <div key={i} className="py-1.5 px-2" style={{ backgroundColor: `${effColor}08` }}>
                  <span className="text-[10px] font-bold uppercase" style={{ color: effColor, letterSpacing: '0.06em' }}>{eff.type}</span>
                  <div className="text-[10px] leading-snug mt-0.5" style={{ color: '#bbb' }}>{description}</div>
                </div>
              );
            })}
          </div>
        )}

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

  const [showSearchHelp, setShowSearchHelp] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  const searchFilters = [
    
    { key: 'c', label: t('deckBuilder.search.chakraLabel'), desc: t('deckBuilder.search.chakraDesc'), ops: [':', '=', '>', '>=', '<', '<='], examples: ['c:4', 'c>3', 'c<=5'] },
    { key: 'p', label: t('deckBuilder.search.powerLabel'), desc: t('deckBuilder.search.powerDesc'), ops: [':', '=', '>', '>=', '<', '<='], examples: ['p:5', 'p>=3', 'p<2'] },
    
    { key: 'k', label: t('deckBuilder.search.keywordLabel'), desc: t('deckBuilder.search.keywordDesc'), ops: [':'], examples: ['k:Jutsu', 'k:Sannin'] },
    { key: 'k', label: t('deckBuilder.search.keywordAndLabel'), desc: t('deckBuilder.search.keywordAndDesc'), ops: [':'], examples: ['k:Jutsu+Team 7'] },
    { key: 'k', label: t('deckBuilder.search.keywordOnlyLabel'), desc: t('deckBuilder.search.keywordOnlyDesc'), ops: [':'], examples: ['k:!Jutsu', 'k:!Summon'] },
    { key: 'g', label: t('deckBuilder.search.groupLabel'), desc: t('deckBuilder.search.groupDesc'), ops: [':'], examples: ['g:Leaf', 'g:Akatsuki'] },
    { key: 'r', label: t('deckBuilder.search.rarityLabel'), desc: t('deckBuilder.search.rarityDesc'), ops: [':'], examples: ['r:S', 'r:UC', 'r:M', 'r:SV', 'r:MV'] },
    { key: 's', label: t('deckBuilder.search.setLabel'), desc: t('deckBuilder.search.setDesc'), ops: [':'], examples: ['s:KS'] },
    { key: 'nv', label: t('deckBuilder.search.nvLabel'), desc: t('deckBuilder.search.nvDesc'), ops: [':'], examples: ['nv:Hokage', 'nv:Rasengan'] },
    
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
            style={{ backgroundColor: '#111111', color, }}>
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
          boxShadow: '0 0 80px rgba(0,0,0,0.6)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        
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

        <div className="flex-1 overflow-y-auto py-5">
          <div className="max-w-4xl mx-auto px-5 sm:px-8">

            <div className="mb-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <p className="font-body text-[11px] mb-2" style={{ color: '#888' }}>{t('deckBuilder.search.nameDesc')}</p>
              <div className="flex flex-wrap gap-1.5">
                {['naruto', 'KS-133', 'sakura', 'orochimaru'].map((ex) => (
                  <button key={ex} onClick={() => tryExample(ex)}
                    className="font-body text-[11px] px-3 py-1.5 cursor-pointer"
                    style={{ backgroundColor: '#111111', color: '#bbb', }}>
                    {ex}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">

              <div>
                <span className="text-sm tracking-wider block mb-3" style={{ color: '#c4a35a', fontFamily: "'NJNaruto', sans-serif", opacity: 0.7 }}>
                  {t('deckBuilder.search.statsHeader')}
                </span>
                {statsFilters.map((f, i) => renderFilterRow(f, i, '#c4a35a'))}
              </div>

              <div>
                <span className="text-sm tracking-wider block mb-3" style={{ color: '#3e8b3e', fontFamily: "'NJNaruto', sans-serif", opacity: 0.7 }}>
                  {t('deckBuilder.search.propertiesHeader')}
                </span>
                {cardFilters.map((f, i) => renderFilterRow(f, i, '#3e8b3e'))}
              </div>

              <div>
                <span className="text-sm tracking-wider block mb-3" style={{ color: '#b33e3e', fontFamily: "'NJNaruto', sans-serif", opacity: 0.7 }}>
                  {t('deckBuilder.search.effectsHeader')}
                </span>
                {effectFilters.map((f, i) => {
                  const keyColors: Record<string, string> = { e: '#c4a35a', em: '#c4a35a', emi: '#c4a35a', emc: '#888', eup: '#3e8b3e', ea: '#b33e3e', es: '#6a6abb' };
                  return renderFilterRow(f, i, keyColors[f.key] ?? '#b33e3e');
                })}
              </div>
            </div>

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
                    style={{ backgroundColor: '#0e0e0e', }}>
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

  const renderDeckContent = () => (
    <>
      
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
                data-gp={m ? 'true' : undefined}
                role="button"
                tabIndex={-1}
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

      <div className="flex items-center gap-2 mb-2 flex-wrap">
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
        <button onClick={deckChars.length > 1 ? sortCharsByName : undefined}
          className="px-2 py-0.5 text-[9px] uppercase font-bold"
          style={{
            backgroundColor: deckChars.length > 1 ? 'rgba(196,163,90,0.08)' : 'rgba(255,255,255,0.02)',
            borderLeft: deckChars.length > 1 ? '2px solid rgba(196,163,90,0.4)' : '2px solid rgba(255,255,255,0.06)',
            color: deckChars.length > 1 ? '#c4a35a' : '#333',
            cursor: deckChars.length > 1 ? 'pointer' : 'default',
          }}>
          {t("deckBuilder.sortByName")}
        </button>
        <div className="h-3 w-px" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />
        
        {(['grid', 'rows'] as DeckViewMode[]).map((m) => (
          <button key={m} onClick={() => setDeckViewMode(m)}
            className="px-2 py-0.5 text-[9px] uppercase font-bold"
            style={{
              backgroundColor: deckViewMode === m ? 'rgba(196,163,90,0.12)' : 'rgba(255,255,255,0.02)',
              borderBottom: deckViewMode === m ? '2px solid #c4a35a' : '2px solid transparent',
              color: deckViewMode === m ? '#c4a35a' : '#555',
            }}>
            {t(`deckBuilder.view.${m}`)}
          </button>
        ))}
        
        {deckViewMode === 'rows' && (
          <>
            <div className="h-3 w-px" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />
            {(['chakra', 'group', 'rarity', 'power', 'keyword', 'effect'] as DeckGroupBy[]).map((g) => (
              <button key={g} onClick={() => setDeckGroupBy(g)}
                className="px-1.5 py-0.5 text-[8px] uppercase font-bold"
                style={{
                  backgroundColor: deckGroupBy === g ? 'rgba(196,163,90,0.1)' : 'transparent',
                  color: deckGroupBy === g ? '#c4a35a' : '#444',
                  borderBottom: deckGroupBy === g ? '1px solid #c4a35a' : '1px solid transparent',
                }}>
                {t(`deckBuilder.groupBy.${g}`)}
              </button>
            ))}
          </>
        )}
      </div>

      {deckViewMode === 'grid' ? (
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
                  onToggleHolo={toggleCharHolo}
                  holoAvailable={canUseHolo(card)}
                  holoLabel={t('deckBuilder.holoToggle')}
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
      ) : (
        <div className="flex flex-col gap-3">
          {deckGroupedRows.length === 0 ? (
            <div className="text-[10px] text-center py-4" style={{ color: '#444' }}>{t("deckBuilder.emptyDeck")}</div>
          ) : deckGroupedRows.map(([groupKey, cards]) => {
            const label = deckGroupBy === 'chakra' ? `${t("deckBuilder.groupBy.chakra")} ${groupKey}`
              : deckGroupBy === 'power' ? `${t("deckBuilder.groupBy.power")} ${groupKey}`
              : deckGroupBy === 'rarity' ? getRarityLabel(groupKey, tCardMeta)
              : deckGroupBy === 'group' ? getCardGroup(groupKey, tCardMeta)
              : deckGroupBy === 'effect' ? (groupKey === '-' ? t("deckBuilder.noEffect") : t(`deckBuilder.effectFn.${groupKey}`))
              : groupKey === '-' ? t("deckBuilder.noKeyword") : getCardKeyword(groupKey, tCardMeta);
            return (
              <div key={groupKey}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] uppercase font-bold" style={{ color: '#c4a35a', letterSpacing: '0.08em' }}>{label}</span>
                  <span className="text-[8px]" style={{ color: '#555' }}>({cards.length})</span>
                  <div className="flex-1 h-px" style={{ backgroundColor: 'rgba(196,163,90,0.15)' }} />
                </div>
                <div className="flex gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#333 transparent' }}>
                  {cards.map(({ card, idx }) => (
                    <div key={`${card.id}-${idx}`} className="flex-shrink-0" style={{ width: '60px' }}>
                      <DeckCard
                        card={card}
                        idx={idx}
                        onRemove={handleRemoveChar}
                        onHover={handlePreview}
                        onToggleHolo={toggleCharHolo}
                        holoAvailable={canUseHolo(card)}
                        holoLabel={t('deckBuilder.holoToggle')}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  return (
    <main id="main-content" className="relative" style={{ backgroundColor: '#0a0a0a', height: '100vh', overflow: 'hidden' }}>

      <div className="hidden lg:flex relative z-10" style={{ height: '100vh' }}>

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

        <div className="flex-1 flex flex-col overflow-hidden" style={{ minWidth: 0 }}>
          
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
                color: '#e0e0e0',
              }}
            />
            <div className="flex items-center gap-2 text-[10px] flex-shrink-0">
              <span style={{ color: deckChars.length >= 30 ? '#3e8b3e' : '#b33e3e' }}>
                {t("deckBuilder.characters", { count: deckChars.length })}
              </span>
              <span style={{ color: deckMissions.length === 3 ? '#3e8b3e' : '#b33e3e' }}>
                {t("deckBuilder.missions", { count: deckMissions.length })}
              </span>
              <EvolvingCostMeter compact />
              {validation.valid && <span style={{ color: '#3e8b3e' }}>{t("deckBuilder.validation.valid")}</span>}
              {loadedDeckId && (
                <span className="text-[8px] uppercase px-1.5 py-0.5" style={{
                  backgroundColor: 'rgba(62, 139, 62, 0.15)', color: '#3e8b3e',
                }}>{t("deckBuilder.currentlyEditing")}</span>
              )}
              {deckHasUnrevealed && (
                <span className="text-[8px] uppercase px-1.5 py-0.5" style={{
                  backgroundColor: 'rgba(196,163,90,0.15)', color: '#c4a35a',
                }}>{t("deckBuilder.containsUnrevealed")}</span>
              )}
            </div>
          </div>

          {(saveError || addError) && (
            <div className="px-4 py-1 flex-shrink-0">
              <div className="text-[10px] py-1 px-2" style={{
                backgroundColor: 'rgba(179,62,62,0.08)', color: '#b33e3e',
              }}>{addError ? (addErrorKey ? t(addErrorKey, addErrorParams ?? {}) : addError) : saveError}</div>
            </div>
          )}

          {lockedVariantsInDeck.length > 0 && (
            <div className="px-4 py-1 flex-shrink-0">
              <div className="flex items-center gap-3 text-[10px] py-1.5 px-2.5" style={{
                backgroundColor: 'rgba(196,163,90,0.1)', color: '#c4a35a',
              }}>
                <span className="flex-1">
                  {t("deckBuilder.lockedVariantsWarning", { count: lockedVariantsInDeck.length })}
                </span>
                <button onClick={handleRepairLockedVariants}
                  className="uppercase font-bold py-1 px-2.5 no-select flex-shrink-0"
                  style={{ backgroundColor: 'rgba(196,163,90,0.2)', color: '#c4a35a', letterSpacing: '0.08em' }}>
                  {t("deckBuilder.repairDeck")}
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-4 py-3" style={{ minHeight: 0 }}>
            {evolvingMode && (
              <div className="mb-3">
                <EvolvingBuilderHelper />
              </div>
            )}
            {renderDeckContent()}
          </div>

          <div className="flex items-center gap-2 px-4 py-2 flex-shrink-0 flex-wrap" style={{
            borderTop: '1px solid rgba(255,255,255,0.04)', backgroundColor: 'rgba(10, 10, 10, 0.9)',
          }}>
            <AngularButton onClick={handleSave} accentColor={loadedDeckId && isDirty ? '#c47a1a' : '#3e8b3e'} variant={validation.valid && !isSaving ? 'primary' : 'muted'} disabled={isSaving || !validation.valid} size="sm">
              {isSaving ? t("common.loading") : loadedDeckId ? t("deckBuilder.updateDeck") : t("deckBuilder.saveDeck")}
            </AngularButton>
            <AngularButton onClick={() => setShowSavedDecks(true)} variant="secondary" size="sm">{t("deckBuilder.loadDeck")}</AngularButton>
            <AngularButton onClick={() => setShowImportModal(true)} variant="secondary" size="sm">{t("deckBuilder.importButton")}</AngularButton>
            <AngularButton onClick={() => setShowExportModal(true)} variant="muted" disabled={deckChars.length === 0} size="sm">{t("deckBuilder.exportButton")}</AngularButton>
            {loadedDeckId && (
              <Link href={`/feed?deck=${loadedDeckId}` as '/'} className="text-center text-[10px] uppercase font-bold py-1.5 px-3 no-select inline-block"
                style={{ backgroundColor: 'rgba(196,163,90,0.14)', color: '#c4a35a', letterSpacing: '0.1em', transform: 'skewX(-3deg)' }}>
                {t("feed.postToFeed")}
              </Link>
            )}
            <Link href="/deck-builder/manage" className="text-center text-[10px] uppercase font-bold py-1.5 px-3 no-select inline-block"
              style={{
                backgroundColor: 'rgba(196,163,90,0.08)', color: '#c4a35a', letterSpacing: '0.1em', transform: 'skewX(-3deg)',
              }}>
              <span style={{ display: 'inline-block', transform: 'skewX(3deg)' }}>{t("deckManager.manageButton")}</span>
            </Link>
            <div className="flex-1" />
            <AngularButton onClick={clearDeck} variant="danger" size="sm">{t("deckBuilder.clearDeck")}</AngularButton>
          </div>
        </div>

        <div className="flex flex-col flex-shrink-0 overflow-hidden" style={{
          width: '540px',
          backgroundColor: 'rgba(10, 10, 10, 0.95)',
          borderLeft: '1px solid rgba(255,255,255,0.06)',
        }}>
          
          <div className="px-3 pt-3 pb-1 flex-shrink-0">
            <span className="text-[8px] uppercase font-bold block mb-1" style={{ color: '#777' }}>{t("deckBuilder.missionCards")}</span>
            <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
              {filteredMissions.map((m) => (
                <CatalogMission
                  key={m.id}
                  card={m}
                  allowed={missionAllowedMap.get(m.id) ?? true}
                  isBanned={bannedIds.has(m.id)}
                  onAdd={handleAddMission}
                  onHover={handlePreview}
                />
              ))}
            </div>
          </div>

          <div className="h-px mx-3" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }} />

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
                  color: '#e0e0e0',
                }}
              />
              <button
                onClick={() => setShowSearchHelp(true)}
                className="font-body text-[10px] font-bold px-3 py-1.5 cursor-pointer shrink-0 whitespace-nowrap"
                style={{ backgroundColor: 'rgba(196, 163, 90, 0.08)', color: '#c4a35a' }}
              >
                ?
              </button>
              
              <div className="relative">
                <button
                  onClick={() => setShowSortDropdown((v) => !v)}
                  className="font-body text-[10px] font-bold px-3 py-1.5 cursor-pointer shrink-0 whitespace-nowrap"
                  style={{ backgroundColor: 'rgba(196, 163, 90, 0.08)', color: '#c4a35a' }}
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

          <div className="px-3 pb-1 flex-shrink-0 flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setHideVariants(!hideVariants)}
              className="text-[9px] uppercase font-bold px-2 py-1"
              style={{
                backgroundColor: showAltArt ? 'rgba(196,163,90,0.1)' : 'rgba(136,136,136,0.08)',
                color: showAltArt ? '#c4a35a' : '#555',
              }}
            >
              {showAltArt ? t("deckBuilder.hideAlt") : t("deckBuilder.showAlt")}
            </button>
            {revealingPrivileged && (
              <button
                onClick={() => setShowUnrevealed((v) => !v)}
                className="text-[9px] uppercase font-bold px-2 py-1"
                style={{
                  backgroundColor: showUnrevealed ? 'rgba(196,163,90,0.1)' : 'rgba(136,136,136,0.08)',
                  color: showUnrevealed ? '#c4a35a' : '#555',
                }}
              >
                {t("deckBuilder.showUnrevealed")}
              </button>
            )}
          </div>

          <VirtualCardGrid
            items={filteredChars}
            getItemKey={(c) => c.id}
            minColWidth={72}
            gap={6}
            cellAspectRatio={7 / 5}
            paddingX={12}
            paddingBottom={12}
            className="flex-1"
            style={{ minHeight: 0 }}
            renderItem={(card) => (
              <CatalogCard
                card={card}
                allowed={allowedMap.get(card.id) ?? true}
                inDeckCount={deckCardCounts.get(card.id) || 0}
                isBanned={bannedIds.has(card.id)}
                onAdd={handleAddChar}
                onHover={handlePreview}
              />
            )}
          />
        </div>
      </div>

      <div className="lg:hidden flex flex-col relative z-10" style={{ height: '100dvh' }}>

        <div className="flex items-center gap-2 px-2 flex-shrink-0" style={{
          height: 44,
          backgroundColor: 'rgba(10, 10, 10, 0.96)',
          borderBottom: '1px solid rgba(196, 163, 90, 0.18)',
        }}>
          <Link href="/" className="flex items-center justify-center flex-shrink-0" style={{
            width: 32, height: 32,
            backgroundColor: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
            color: '#888', fontSize: 16, lineHeight: 1,
          }}>{'\u2190'}</Link>
          <input type="text" placeholder={t("deckBuilder.deckName")} value={deckName}
            onChange={(e) => setDeckName(e.target.value)}
            className="flex-1 min-w-0 px-2 py-2 text-xs focus:outline-none"
            style={{ backgroundColor: '#0e0e0e', border: '1px solid rgba(255,255,255,0.06)', color: '#e0e0e0' }}
          />
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="flex items-center justify-center flex-shrink-0 cursor-pointer"
            style={{
              width: 32, height: 32,
              backgroundColor: 'rgba(196,163,90,0.08)',
              color: '#c4a35a', fontSize: 18, lineHeight: 1,
            }}
            aria-label={t("common.menu")}
          >{'\u22EE'}</button>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1.5 flex-shrink-0" style={{
          backgroundColor: 'rgba(10, 10, 10, 0.9)',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}>
          <span className="text-[10px] tabular-nums font-bold px-1.5 py-0.5 flex-shrink-0" style={{
            backgroundColor: deckChars.length >= 30 ? 'rgba(62,139,62,0.12)' : 'rgba(179,62,62,0.1)',
            color: deckChars.length >= 30 ? '#3e8b3e' : '#b33e3e',
          }}>{deckChars.length}/30</span>
          <span className="text-[10px] tabular-nums font-bold px-1.5 py-0.5 flex-shrink-0" style={{
            backgroundColor: deckMissions.length === 3 ? 'rgba(62,139,62,0.12)' : 'rgba(179,62,62,0.1)',
            color: deckMissions.length === 3 ? '#3e8b3e' : '#b33e3e',
          }}>{deckMissions.length}/3 M</span>
          {validation.valid && (
            <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 flex-shrink-0" style={{
              backgroundColor: 'rgba(62,139,62,0.12)', color: '#3e8b3e',
            }}>{t("deckBuilder.validation.valid")}</span>
          )}
          {loadedDeckId && (
            <span className="text-[8px] uppercase font-bold px-1.5 py-0.5 flex-shrink-0 truncate" style={{
              backgroundColor: 'rgba(196,163,90,0.1)', color: '#c4a35a',
              maxWidth: '110px',
            }}>{t("deckBuilder.currentlyEditing")}</span>
          )}
          <div className="flex-shrink-0">
            <EvolvingCostMeter compact />
          </div>
          <div className="flex-1 min-w-0" />
        </div>

        <div className="flex flex-shrink-0" style={{
          backgroundColor: 'rgba(10, 10, 10, 0.88)',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}>
          {(['catalog', 'deck'] as const).map((view) => {
            const active = mobileView === view;
            const label = view === 'catalog' ? t("deckBuilder.availableCards") : `${t("deckBuilder.currentDeck")} (${deckChars.length})`;
            return (
              <button
                key={view}
                onClick={() => setMobileView(view)}
                className="flex-1 text-center py-2.5 text-[11px] font-bold uppercase cursor-pointer"
                style={{
                  backgroundColor: active ? 'rgba(196,163,90,0.12)' : 'transparent',
                  borderBottom: active ? '3px solid #c4a35a' : '3px solid transparent',
                  color: active ? '#c4a35a' : '#777',
                  letterSpacing: '0.08em',
                }}
              >{label}</button>
            );
          })}
        </div>

        {(saveError || addError) && (
          <div className="px-3 py-1.5 flex-shrink-0">
            <div className="text-[10px] py-1.5 px-2" style={{
              backgroundColor: 'rgba(179,62,62,0.08)', color: '#b33e3e',
            }}>{addError ? (addErrorKey ? t(addErrorKey, addErrorParams ?? {}) : addError) : saveError}</div>
          </div>
        )}

        <div ref={mobileScrollRef} className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
          {evolvingMode && (
            <div className="px-3 py-2">
              <EvolvingBuilderHelper />
            </div>
          )}
          {mobileView === 'catalog' ? (
            <div className="px-3 py-2">

              <div className="sticky top-0 z-20 -mx-3 px-3 pt-1 pb-2" style={{ backgroundColor: '#0a0a0a' }}>
                <div className="flex items-center gap-1.5">
                  <input type="text" placeholder={t("collection.search")} value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 min-w-0 px-2.5 py-2 text-xs focus:outline-none"
                    style={{ backgroundColor: '#0e0e0e', border: '1px solid rgba(255,255,255,0.06)', color: '#e0e0e0' }}
                  />
                  <button
                    onClick={() => setShowSearchHelp(true)}
                    className="font-body text-[11px] font-bold cursor-pointer shrink-0"
                    style={{ width: 34, height: 34, backgroundColor: 'rgba(196,163,90,0.08)', color: '#c4a35a' }}
                  >?</button>
                  <div className="relative">
                    <button
                      onClick={() => setShowSortDropdown((v) => !v)}
                      className="font-body text-[12px] font-bold cursor-pointer shrink-0"
                      style={{ width: 34, height: 34, backgroundColor: 'rgba(196,163,90,0.08)', color: '#c4a35a' }}
                    >{'\u21C5'}</button>
                    {showSortDropdown && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setShowSortDropdown(false)} />
                        <div className="absolute right-0 top-full mt-1 z-40 flex flex-col rounded overflow-hidden"
                          style={{ backgroundColor: '#1a1a1a', border: '1px solid #333', minWidth: '140px' }}>
                          {([
                            { key: 'number' as SortField, label: '#' },
                            { key: 'name' as SortField, label: t("deckBuilder.sortName") },
                            { key: 'chakra' as SortField, label: t("deckBuilder.chakra") },
                            { key: 'power' as SortField, label: t("deckBuilder.power") },
                            { key: 'rarity' as SortField, label: t("deckBuilder.sortRarity") },
                          ]).map((opt) => (
                            <button key={opt.key}
                              onClick={() => {
                                if (sortBy === opt.key) setSortOrder((o) => o === 'asc' ? 'desc' : 'asc');
                                else { setSortBy(opt.key); setSortOrder('asc'); }
                                setShowSortDropdown(false);
                              }}
                              className="px-3 py-2 text-[11px] text-left hover:bg-[#262626] transition-colors flex items-center justify-between"
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
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[9px]" style={{ color: '#666' }}>
                    {t("deckBuilder.filters.resultsCount", { count: filteredChars.length })}
                  </span>
                  <button
                    onClick={() => setHideVariants(!hideVariants)}
                    className="text-[9px] uppercase font-bold px-2 py-0.5"
                    style={{
                      backgroundColor: showAltArt ? 'rgba(196,163,90,0.1)' : 'rgba(136,136,136,0.06)',
                      color: showAltArt ? '#c4a35a' : '#666',
                    }}
                  >{showAltArt ? t("deckBuilder.hideAlt") : t("deckBuilder.showAlt")}</button>
                </div>
              </div>

              <span className="text-[10px] uppercase font-bold block mb-1.5 mt-1" style={{ color: '#888', letterSpacing: '0.08em' }}>{t("deckBuilder.missionCards")}</span>
              <div className="grid grid-cols-5 gap-1.5 mb-3">
                {filteredMissions.map((m) => (
                  <CatalogMission key={m.id} card={m} allowed={missionAllowedMap.get(m.id) ?? true}
                    isBanned={bannedIds.has(m.id)}
                    onAdd={handleAddMission} onHover={handlePreview} />
                ))}
              </div>

              <div className="h-px my-2" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />

              <span className="text-[10px] uppercase font-bold block mb-1.5" style={{ color: '#888', letterSpacing: '0.08em' }}>
                {t("deckBuilder.characters", { count: filteredChars.length })}
              </span>
              <VirtualCardGrid
                items={filteredChars}
                getItemKey={(c) => c.id}
                minColWidth={80}
                gap={6}
                cellAspectRatio={7 / 5}
                scrollElementRef={mobileScrollRef}
                renderItem={(card) => (
                  <CatalogCard
                    card={card}
                    allowed={allowedMap.get(card.id) ?? true}
                    inDeckCount={deckCardCounts.get(card.id) || 0}
                    isBanned={bannedIds.has(card.id)}
                    onAdd={handleAddChar}
                    onHover={handlePreview}
                  />
                )}
              />
            </div>
          ) : (
            <div className="px-3 py-2 pb-4">
              {lockedVariantsInDeck.length > 0 && (
                <div className="flex items-center gap-3 text-[10px] py-1.5 px-2.5 mb-2" style={{
                  backgroundColor: 'rgba(196,163,90,0.1)', color: '#c4a35a',
                }}>
                  <span className="flex-1">
                    {t("deckBuilder.lockedVariantsWarning", { count: lockedVariantsInDeck.length })}
                  </span>
                  <button onClick={handleRepairLockedVariants}
                    className="uppercase font-bold py-1 px-2.5 no-select flex-shrink-0"
                    style={{ backgroundColor: 'rgba(196,163,90,0.2)', color: '#c4a35a', letterSpacing: '0.08em' }}>
                    {t("deckBuilder.repairDeck")}
                  </button>
                </div>
              )}
              {renderDeckContent()}
            </div>
          )}
        </div>

        <div className="flex-shrink-0 px-3 py-2 flex items-center gap-2" style={{
          backgroundColor: 'rgba(10, 10, 10, 0.96)',
          borderTop: '1px solid rgba(196,163,90,0.18)',
        }}>
          <button
            onClick={handleSave}
            disabled={isSaving || !validation.valid}
            className="flex-1 text-center text-[12px] uppercase font-bold py-2.5 cursor-pointer disabled:cursor-not-allowed"
            style={{
              backgroundColor: !validation.valid
                ? 'rgba(255,255,255,0.04)'
                : (loadedDeckId && isDirty ? 'rgba(196,122,26,0.18)' : 'rgba(62,139,62,0.18)'),
              border: !validation.valid
                ? '1px solid rgba(255,255,255,0.06)'
                : `1px solid ${loadedDeckId && isDirty ? '#c47a1a' : '#3e8b3e'}`,
              borderLeft: !validation.valid
                ? '3px solid rgba(255,255,255,0.06)'
                : `3px solid ${loadedDeckId && isDirty ? '#c47a1a' : '#3e8b3e'}`,
              color: !validation.valid
                ? '#555'
                : (loadedDeckId && isDirty ? '#c47a1a' : '#3e8b3e'),
              letterSpacing: '0.1em',
              opacity: isSaving ? 0.6 : 1,
            }}
          >
            {isSaving ? t("common.loading") : loadedDeckId ? t("deckBuilder.updateDeck") : t("deckBuilder.saveDeck")}
          </button>
          {previewCard && mobileView === 'catalog' && (
            <button
              onClick={() => setMobileDetailOpen(true)}
              className="flex items-center justify-center flex-shrink-0 cursor-pointer"
              style={{
                width: 44, height: 44,
                backgroundColor: 'rgba(196,163,90,0.08)',
                color: '#c4a35a', fontSize: 14, lineHeight: 1,
                fontWeight: 'bold',
              }}
              aria-label={t("deckBuilder.detail") || 'Detail'}
            >{'\u2139'}</button>
          )}
        </div>

        {mobileDetailOpen && previewCard && (
          <div
            className="fixed inset-0 z-50 flex items-end"
            style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
            onClick={() => setMobileDetailOpen(false)}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="w-full flex flex-col"
              style={{
                maxHeight: '92dvh',
                backgroundColor: '#0a0a0a',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0" style={{
                backgroundColor: 'rgba(10,10,10,0.95)',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
              }}>
                <span className="text-[11px] uppercase font-bold flex-1 truncate" style={{ color: '#c4a35a', letterSpacing: '0.08em' }}>
                  {t("deckBuilder.cardDetail") || getCardName(previewCard, loc)}
                </span>
                <button
                  onClick={() => setMobileDetailOpen(false)}
                  className="flex items-center justify-center cursor-pointer"
                  style={{ width: 30, height: 30, color: '#888', fontSize: 18, lineHeight: 1 }}
                  aria-label={t("common.close")}
                >{'\u2715'}</button>
              </div>
              <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
                {renderInfoContent()}
              </div>
            </div>
          </div>
        )}

        {mobileMenuOpen && (
          <div
            className="fixed inset-0 z-50 flex items-end"
            style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
            onClick={() => setMobileMenuOpen(false)}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="w-full flex flex-col gap-2 px-4 py-4"
              style={{
                backgroundColor: '#0a0a0a',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-[10px] uppercase font-bold mb-1" style={{ color: '#888', letterSpacing: '0.1em' }}>
                {t("deckBuilder.actions") || 'Actions'}
              </span>
              <button
                onClick={() => { setShowSavedDecks(true); setMobileMenuOpen(false); }}
                className="text-left text-[12px] uppercase font-bold py-3 px-3 cursor-pointer"
                style={{ backgroundColor: 'rgba(255,255,255,0.03)', color: '#c4a35a', letterSpacing: '0.08em' }}
              >{t("deckBuilder.loadDeck")}</button>
              <button
                onClick={() => { setShowImportModal(true); setMobileMenuOpen(false); }}
                className="text-left text-[12px] uppercase font-bold py-3 px-3 cursor-pointer"
                style={{ backgroundColor: 'rgba(255,255,255,0.03)', color: '#4a7ab5', letterSpacing: '0.08em' }}
              >{t("deckBuilder.importButton")}</button>
              <button
                onClick={() => { setShowExportModal(true); setMobileMenuOpen(false); }}
                disabled={deckChars.length === 0}
                className="text-left text-[12px] uppercase font-bold py-3 px-3 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                style={{ backgroundColor: 'rgba(255,255,255,0.03)', color: '#c4a35a', letterSpacing: '0.08em' }}
              >{t("deckBuilder.exportButton")}</button>
              <Link
                href="/deck-builder/manage"
                onClick={() => setMobileMenuOpen(false)}
                className="text-left text-[12px] uppercase font-bold py-3 px-3 cursor-pointer"
                style={{ backgroundColor: 'rgba(255,255,255,0.03)', color: '#c4a35a', letterSpacing: '0.08em', display: 'block' }}
              >{t("deckManager.manageButton")}</Link>
              <button
                onClick={() => { clearDeck(); setMobileMenuOpen(false); }}
                className="text-left text-[12px] uppercase font-bold py-3 px-3 cursor-pointer mt-1"
                style={{ backgroundColor: 'rgba(179,62,62,0.08)', color: '#b33e3e', letterSpacing: '0.08em' }}
              >{t("deckBuilder.clearDeck")}</button>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="text-center text-[11px] uppercase font-bold py-2 mt-2 cursor-pointer"
                style={{ color: '#666', letterSpacing: '0.08em' }}
              >{t("common.cancel")}</button>
            </div>
          </div>
        )}
      </div>

      {renderSearchHelp()}

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
                  <EvolvingDeckHolo key={deck.id} points={deck.evolvingPoints ?? 0} enabled={deck.evolvingCompatible === true} intensity="subtle">
                  <div className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:gap-3" style={{
                    backgroundColor: 'rgba(255,255,255,0.02)',
                  }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium truncate" style={{ color: '#e0e0e0' }}>{deck.name}</span>
                        {deck.evolvingCompatible === true && <EvolvingDeckBadge points={deck.evolvingPoints ?? 0} />}
                        {isActive && (
                          <span className="text-[8px] uppercase px-1 py-0.5 flex-shrink-0" style={{
                            backgroundColor: 'rgba(62,139,62,0.15)', color: '#3e8b3e',
                          }}>{t("deckBuilder.currentlyEditing")}</span>
                        )}
                      </div>
                      <span className="text-[10px]" style={{ color: '#555' }}>
                        {t("deckBuilder.savedDeckInfo", { cards: deck.cardIds.length, missions: deck.missionIds.length })}
                      </span>
                    </div>
                    {isConfirming ? (
                      <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0">
                        <span className="text-[10px]" style={{ color: '#b33e3e' }}>{t("deckBuilder.confirmDelete", { name: deck.name })}</span>
                        <PopupActionButton accentColor="#b33e3e" onClick={() => { handleDeleteDeck(deck.id); setConfirmDeleteId(null); }}>
                          {t("common.confirm")}
                        </PopupActionButton>
                        <PopupDismissLink onClick={() => setConfirmDeleteId(null)}>{t("common.cancel")}</PopupDismissLink>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0">
                        <AngularButton onClick={() => { handleLoadDeck(deck.id); setShowSavedDecks(false); }} variant={isActive ? 'primary' : 'secondary'} accentColor="#3e8b3e" size="sm">
                          {t("deckBuilder.editDeck")}
                        </AngularButton>
                        <AngularButton onClick={() => { handleDuplicateDeck(deck.id); setShowSavedDecks(false); }} variant="secondary" accentColor="#c4a35a" size="sm">
                          {t("deckBuilder.duplicateDeck")}
                        </AngularButton>
                        <AngularButton onClick={() => setConfirmDeleteId(deck.id)} variant="danger" size="sm">
                          {t("deckBuilder.deleteDeck")}
                        </AngularButton>
                      </div>
                    )}
                  </div>
                  </EvolvingDeckHolo>
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

      {showImportModal && (
        <PopupOverlay>
          <PopupCornerFrame accentColor="rgba(74, 122, 181, 0.35)" maxWidth="480px">
            <PopupTitle accentColor="#4a7ab5" size="lg">{t("deckBuilder.importTitle")}</PopupTitle>
            <p className="text-xs mb-3" style={{ color: '#888', paddingLeft: '8px' }}>
              {t("deckBuilder.importDesc")}
            </p>
            <div className="mb-3">
              <a href="https://exburst.dev/naruto/deckbuilder" target="_blank" rel="noopener noreferrer"
                className="inline-block text-[10px] uppercase font-bold px-3 py-1.5"
                style={{ backgroundColor: 'rgba(74,122,181,0.12)', color: '#4a7ab5', letterSpacing: '0.08em' }}>
                {t("deckBuilder.importVisit")}
              </a>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <input type="text" placeholder={t("deckBuilder.importPlaceholder")} value={importCode}
                onChange={(e) => setImportCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleImport(); }}
                className="flex-1 px-3 py-1.5 text-xs font-mono focus:outline-none"
                style={{ backgroundColor: '#0e0e0e', border: '1px solid rgba(255,255,255,0.06)', color: '#e0e0e0' }}
              />
              <PopupActionButton accentColor="#3e8b3e" onClick={() => handleImport()} disabled={!importCode.trim()}>
                {t("deckBuilder.importButton")}
              </PopupActionButton>
            </div>
            {importMessage && (
              <div className="text-xs mb-3 py-1 px-2" style={{
                backgroundColor: importMessage.type === 'success' ? 'rgba(62,139,62,0.08)' : 'rgba(179,62,62,0.08)',
                color: importMessage.type === 'success' ? '#3e8b3e' : '#b33e3e',
              }}>{importMessage.text}</div>
            )}
            <PopupDismissLink onClick={() => { setShowImportModal(false); setImportMessage(null); }}>{t("common.close")}</PopupDismissLink>
          </PopupCornerFrame>
        </PopupOverlay>
      )}

      {showExportModal && (
        <PopupOverlay>
          <PopupCornerFrame accentColor="rgba(196, 163, 90, 0.35)" maxWidth="480px">
            <PopupTitle accentColor="#c4a35a" size="lg">{t("deckBuilder.exportTitle")}</PopupTitle>
            <div className="flex gap-2 mb-4">
              <PopupActionButton accentColor="#c4a35a" onClick={() => { exportDeckAsImage(deckName, deckChars, deckMissions); trackUiHook('deck.exported'); setShowExportModal(false); }}>
                {t("deckBuilder.exportAsImage")}
              </PopupActionButton>
            </div>
            <p className="text-xs mb-2" style={{ color: '#888', paddingLeft: '8px' }}>
              {t("deckBuilder.exportTextDesc")}
            </p>
            <div className="flex items-center gap-2 mb-3">
              <input type="text" readOnly value={exportCode}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                className="flex-1 px-3 py-1.5 text-xs font-mono focus:outline-none"
                style={{ backgroundColor: '#0e0e0e', border: '1px solid rgba(255,255,255,0.06)', color: '#e0e0e0' }}
              />
              <PopupActionButton accentColor={exportCopied ? '#3e8b3e' : '#c4a35a'} onClick={handleCopyExportCode}>
                {exportCopied ? t("deckBuilder.exportCopied") : t("deckBuilder.exportCopy")}
              </PopupActionButton>
            </div>
            <PopupDismissLink onClick={() => { setShowExportModal(false); setExportCopied(false); }}>{t("common.close")}</PopupDismissLink>
          </PopupCornerFrame>
        </PopupOverlay>
      )}

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
