"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useSession } from "next-auth/react";
import { Link } from "@/lib/i18n/navigation";
import { CloudBackground } from "@/components/CloudBackground";
import { DecorativeIcons } from "@/components/DecorativeIcons";
import { CardBackgroundDecor } from "@/components/CardBackgroundDecor";
import type { CharacterCard, MissionCard } from "@/lib/engine/types";
import { Footer } from "@/components/Footer";
import { validateDeck } from "@/lib/engine/rules/DeckValidation";
import { useDeckBuilderStore } from "@/stores/deckBuilderStore";
import { useBannedCards } from "@/lib/hooks/useBannedCards";
import { AnimatePresence, motion } from "framer-motion";
import { normalizeImagePath } from "@/lib/utils/imagePath";
import { getCardName, getCardTitle, getCardGroup, getCardKeyword, getRarityLabel } from "@/lib/utils/cardLocale";
import { effectDescriptionsEn } from "@/lib/data/effectDescriptionsEn";
import { effectDescriptionsFr } from "@/lib/data/effectTranslationsFr";

const RARITY_COLORS: Record<string, string> = {
  C: '#888888',
  UC: '#3e8b3e',
  R: '#4a7ab5',
  RA: '#4a7ab5',
  S: '#9b59b6',
  M: '#c4a35a',
  Legendary: '#c4a35a',
  Mission: '#888888',
};

export default function DeckBuilderPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { data: session } = useSession();
  const [availableChars, setAvailableChars] = useState<CharacterCard[]>([]);
  const [availableMissions, setAvailableMissions] = useState<MissionCard[]>([]);
  const [allChars, setAllChars] = useState<CharacterCard[]>([]);
  const [allMissions, setAllMissions] = useState<MissionCard[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
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

  // Auto-clear add error after 3 seconds
  useEffect(() => {
    if (addError) {
      const timer = setTimeout(() => clearAddError(), 3000);
      return () => clearTimeout(timer);
    }
  }, [addError, clearAddError]);

  const filteredChars = useMemo(() => {
    const chars = availableChars.filter((c) => !bannedIds.has(c.id));
    if (!searchQuery) return chars;
    const q = searchQuery.toLowerCase();
    return chars.filter(
      (c) =>
        getCardName(c, locale as "en" | "fr")
          .toLowerCase()
          .includes(q) ||
        getCardTitle(c, locale as "en" | "fr")
          .toLowerCase()
          .includes(q) ||
        c.name_fr.toLowerCase().includes(q) ||
        c.id.includes(q),
    );
  }, [availableChars, searchQuery, bannedIds, locale]);

  // Reset page when search changes
  useEffect(() => {
    setCharPage(1);
  }, [searchQuery]);

  const totalCharPages = Math.max(1, Math.ceil(filteredChars.length / CHARS_PER_PAGE));
  const paginatedChars = useMemo(() => {
    const start = (charPage - 1) * CHARS_PER_PAGE;
    return filteredChars.slice(start, start + CHARS_PER_PAGE);
  }, [filteredChars, charPage]);

  const validation = useMemo(() => {
    return validateDeck(deckChars, deckMissions);
  }, [deckChars, deckMissions]);

  const handleSave = useCallback(async () => {
    setSaveError(null);
    const trimmedName = (deckName || '').trim() || 'Untitled Deck';
    // Check if another saved deck (not the one we're editing) has the same name
    const conflict = savedDecks.find(
      (d) => d.name.toLowerCase() === trimmedName.toLowerCase() && d.id !== loadedDeckId
    );
    if (conflict) {
      setOverwriteConflict({ id: conflict.id, name: conflict.name });
      return;
    }
    try {
      await saveDeck();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : t("deckBuilder.failedToSave");
      setSaveError(message);
    }
  }, [saveDeck, t, deckName, savedDecks, loadedDeckId]);

  const handleOverwriteConfirm = useCallback(async () => {
    if (!overwriteConflict) return;
    setSaveError(null);
    try {
      await deleteDeck(overwriteConflict.id);
      await saveDeck();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : t("deckBuilder.failedToSave");
      setSaveError(message);
    } finally {
      setOverwriteConflict(null);
    }
  }, [overwriteConflict, deleteDeck, saveDeck, t]);

  const handleLoadDeck = useCallback(
    async (deckId: string) => {
      setSaveError(null);
      try {
        await loadDeck(deckId, availableChars, availableMissions);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : t("deckBuilder.failedToLoad");
        setSaveError(message);
      }
    },
    [loadDeck, availableChars, availableMissions, t],
  );

  const handleDeleteDeck = useCallback(
    async (deckId: string) => {
      setSaveError(null);
      try {
        await deleteDeck(deckId);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : t("deckBuilder.failedToDelete");
        setSaveError(message);
      }
    },
    [deleteDeck, t],
  );

  const getImagePath = (card: CharacterCard | MissionCard): string | null =>
    normalizeImagePath(card.image_file);

  const handleImport = useCallback(() => {
    const code = importCode.trim();
    if (!code) return;

    const parts = code.split("|");
    if (parts.length < 2) {
      setImportMessage({ type: "error", text: t("deckBuilder.importError") });
      return;
    }

    // Last part is the deck name (underscores = spaces) — only if it doesn't contain '--'
    const lastPart = parts[parts.length - 1];
    const hasDeckName = !lastPart.includes("--");
    const deckNameFromCode = hasDeckName ? lastPart.replace(/_/g, " ") : "";
    const cardParts = hasDeckName ? parts.slice(0, -1) : parts;

    // Build lookup maps by cardId — use ALL cards (not just playable) so imports
    // work for cards without visuals and banned cards too
    const charByCardId = new Map(allChars.map((c) => [c.cardId, c]));
    const missionByCardId = new Map(allMissions.map((m) => [m.cardId, m]));

    const chars: CharacterCard[] = [];
    const missions: MissionCard[] = [];
    const notFound: string[] = [];

    for (const part of cardParts) {
      const match = part.match(/^(.+)--(\d+)$/);
      if (!match) {
        setImportMessage({ type: "error", text: t("deckBuilder.importError") });
        return;
      }

      const cardId = match[1];
      const qty = parseInt(match[2], 10);

      // Check missions first (MMS rarity)
      const mission = missionByCardId.get(cardId);
      if (mission) {
        for (let i = 0; i < qty; i++) missions.push(mission);
        continue;
      }

      const char = charByCardId.get(cardId);
      if (char) {
        for (let i = 0; i < qty; i++) chars.push(char);
        continue;
      }

      notFound.push(cardId);
    }

    // Apply the imported deck
    clearDeck();
    if (deckNameFromCode) setDeckName(deckNameFromCode);
    for (const c of chars) addChar(c);
    for (const m of missions) addMission(m);

    if (notFound.length > 0) {
      setImportMessage({
        type: "error",
        text: t("deckBuilder.importNotFound", {
          count: notFound.length,
          ids: notFound.join(", "),
        }),
      });
    } else {
      setImportMessage({
        type: "success",
        text: t("deckBuilder.importSuccess", {
          name: deckNameFromCode || "Deck",
          chars: chars.length,
          missions: missions.length,
        }),
      });
    }

    setImportCode("");
  }, [
    importCode,
    allChars,
    allMissions,
    clearDeck,
    setDeckName,
    addChar,
    addMission,
    t,
  ]);

  if (!session?.user) {
    return (
      <main
        id="main-content"
        className="flex min-h-screen relative flex-col"
        style={{ backgroundColor: "#0a0a0a" }}
      >
        <CloudBackground />
        <DecorativeIcons />
        <CardBackgroundDecor variant="deck" />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="flex flex-col items-center gap-6 max-w-md w-full text-center relative z-10">
            <h1
              className="text-2xl font-bold tracking-wider uppercase"
              style={{ color: "#c4a35a" }}
            >
              {t("deckBuilder.title")}
            </h1>
            <p className="text-sm" style={{ color: "#888888" }}>
              {t("online.signInRequired")}
            </p>
            <div className="flex gap-3">
              <Link
                href="/login"
                className="px-6 py-2.5 text-sm font-bold uppercase tracking-wider"
                style={{ backgroundColor: "#c4a35a", color: "#0a0a0a" }}
              >
                {t("common.signIn")}
              </Link>
              <Link
                href="/"
                className="px-6 py-2.5 text-sm"
                style={{
                  backgroundColor: "#141414",
                  border: "1px solid #262626",
                  color: "#888888",
                }}
              >
                {t("common.back")}
              </Link>
            </div>
          </div>
        </div>
        <Footer />
      </main>
    );
  }

  return (
    <main
      id="main-content"
      className="min-h-screen relative bg-[#0a0a0a] flex flex-col"
    >
      <CloudBackground />
      <DecorativeIcons />
      <CardBackgroundDecor variant="deck" />

      <div className="flex-1 flex flex-col relative z-10">
        {/* Top bar: back + name + save/clear */}
        <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-2 border-b border-[#262626]">
          <Link
            href="/"
            className="px-3 py-1.5 bg-[#141414] border border-[#262626] text-[#888888] text-xs hover:bg-[#1a1a1a] transition-colors"
          >
            {t("common.back")}
          </Link>
          <input
            type="text"
            placeholder={t("deckBuilder.deckName")}
            value={deckName}
            onChange={(e) => setDeckName(e.target.value)}
            className="flex-1 min-w-[120px] max-w-xs px-3 py-1.5 bg-[#141414] border border-[#262626] text-[#e0e0e0] text-sm placeholder-[#555] focus:outline-none focus:border-[#444]"
          />
          <button
            onClick={handleSave}
            disabled={isSaving || !validation.valid}
            className="px-3 py-1.5 bg-[#1a2a1a] border border-[#3e8b3e]/30 text-[#3e8b3e] text-xs hover:bg-[#1f3a1f] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSaving ? t("common.loading") : loadedDeckId ? t("deckBuilder.updateDeck") : t("deckBuilder.saveDeck")}
          </button>
          <button
            onClick={clearDeck}
            className="px-3 py-1.5 bg-[#141414] border border-[#262626] text-[#888888] text-xs hover:bg-[#1a1a1a] transition-colors"
          >
            {t("deckBuilder.clearDeck")}
          </button>
          <button
            onClick={() => setShowSavedDecks(!showSavedDecks)}
            className="px-3 py-1.5 bg-[#141414] border border-[#262626] text-[#888888] text-xs hover:bg-[#1a1a1a] transition-colors"
          >
            {t("deckBuilder.loadDeck")}
          </button>
          <Link
            href="/deck-builder/manage"
            className="px-3 py-1.5 bg-[#141414] border border-[#c4a35a]/30 text-[#c4a35a] text-xs hover:bg-[#1a1a1a] transition-colors"
          >
            {t("deckManager.manageButton")}
          </Link>
        </div>

        {/* Rules panel */}
        <div className="px-4 py-2 border-b border-[#262626] flex items-center gap-4 flex-wrap">
          <span
            className={`text-xs ${deckChars.length >= 30 ? "text-[#3e8b3e]" : "text-[#b33e3e]"}`}
          >
            {t("deckBuilder.characters", { count: deckChars.length })} / 30 min
          </span>
          <span
            className={`text-xs ${deckMissions.length === 3 ? "text-[#3e8b3e]" : "text-[#b33e3e]"}`}
          >
            {t("deckBuilder.missions", { count: deckMissions.length })} / 3
          </span>
          <span className="text-xs text-[#555]">
            {t("deckBuilder.maxCopiesRule")}
          </span>
          {saveError && (
            <span className="text-xs text-[#b33e3e]">{saveError}</span>
          )}
          {addError && (
            <span className="text-xs text-[#b33e3e] animate-pulse">
              {addErrorKey ? t(addErrorKey, addErrorParams ?? {}) : addError}
            </span>
          )}
          {validation.valid && (
            <span className="text-xs text-[#3e8b3e]">
              {t("deckBuilder.validation.valid")}
            </span>
          )}
        </div>

        {/* Saved decks panel (collapsible) */}
        {showSavedDecks && (
          <div className="px-4 py-3 border-b border-[#262626] bg-[#0e0e0e]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#888]">
                {t("deckBuilder.myDecks")}
              </span>
              <button
                onClick={() => { clearDeck(); setShowSavedDecks(false); }}
                className="px-3 py-1 bg-[#1a2a1a] border border-[#3e8b3e]/30 text-[#3e8b3e] text-[10px] hover:bg-[#1f3a1f] transition-colors"
              >
                + {t("deckBuilder.newDeck")}
              </button>
            </div>

            {isLoading && (
              <p className="text-xs text-[#555] italic">
                {t("common.loading")}
              </p>
            )}
            {!isLoading && savedDecks.length === 0 && (
              <p className="text-xs text-[#555] italic">
                {t("deckBuilder.noSavedDecks")}
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              {savedDecks.map((deck) => {
                const isActive = loadedDeckId === deck.id;
                const isConfirming = confirmDeleteId === deck.id;
                return (
                  <div
                    key={deck.id}
                    className={`flex items-center gap-3 px-3 py-2 bg-[#141414] border transition-colors ${
                      isActive
                        ? "border-[#3e8b3e]/50"
                        : "border-[#262626]"
                    }`}
                  >
                    {/* Deck info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[#e0e0e0] font-medium truncate">
                          {deck.name}
                        </span>
                        {isActive && (
                          <span className="text-[9px] px-1.5 py-0.5 bg-[#3e8b3e]/15 text-[#3e8b3e] border border-[#3e8b3e]/25 shrink-0">
                            {t("deckBuilder.currentlyEditing")}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-[#555]">
                        {t("deckBuilder.savedDeckInfo", {
                          cards: deck.cardIds.length,
                          missions: deck.missionIds.length,
                        })}
                      </span>
                    </div>

                    {/* Actions */}
                    {isConfirming ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] text-[#b33e3e]">
                          {t("deckBuilder.confirmDelete", { name: deck.name })}
                        </span>
                        <button
                          onClick={() => { handleDeleteDeck(deck.id); setConfirmDeleteId(null); }}
                          className="px-2 py-0.5 bg-[#2a1a1a] border border-[#b33e3e]/40 text-[#b33e3e] text-[10px] hover:bg-[#3a1a1a] transition-colors"
                        >
                          {t("common.confirm")}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-0.5 bg-[#141414] border border-[#262626] text-[#888] text-[10px] hover:bg-[#1a1a1a] transition-colors"
                        >
                          {t("common.cancel")}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleLoadDeck(deck.id)}
                          className={`px-2.5 py-1 border text-[10px] transition-colors ${
                            isActive
                              ? "bg-[#1a2a1a] border-[#3e8b3e]/30 text-[#3e8b3e]"
                              : "bg-[#141414] border-[#262626] text-[#888] hover:text-[#e0e0e0] hover:border-[#444]"
                          }`}
                        >
                          {t("deckBuilder.editDeck")}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(deck.id)}
                          className="px-2.5 py-1 bg-[#141414] border border-[#262626] text-[#b33e3e] text-[10px] hover:bg-[#1a1414] hover:border-[#b33e3e]/30 transition-colors"
                        >
                          {t("deckBuilder.deleteDeck")}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Deck strip (missions + characters) */}
        <div className="px-4 py-2 border-b border-[#262626] bg-[#0e0e0e]">
          <div className="flex items-start gap-3 overflow-x-auto">
            {/* Missions */}
            <div className="flex gap-1 flex-shrink-0">
              {[0, 1, 2].map((i) => {
                const m = deckMissions[i];
                const mImg = m ? getImagePath(m) : null;
                return (
                  <div
                    key={i}
                    className="w-14 h-20 bg-[#141414] border border-[#262626] overflow-hidden relative flex-shrink-0"
                  >
                    {m ? (
                      <>
                        {mImg && (
                          <img
                            src={mImg}
                            alt={getCardName(m, locale as "en" | "fr")}
                            className="w-full h-full object-cover cursor-pointer"
                            onClick={() => setPreviewCard(m)}
                          />
                        )}
                        <button
                          onClick={() => removeMission(i)}
                          className="absolute top-0 right-0 w-4 h-4 bg-black/70 text-[#b33e3e] text-[8px] flex items-center justify-center hover:bg-black z-10"
                        >
                          X
                        </button>
                        <div className="absolute inset-x-0 bottom-0 bg-black/75 px-0.5 cursor-pointer" onClick={() => setPreviewCard(m)}>
                          <span className="text-[7px] text-[#e0e0e0] leading-tight block truncate">
                            {getCardName(m, locale as "en" | "fr")}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-[8px] text-[#555]">M{i + 1}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="w-px h-16 bg-[#262626] flex-shrink-0 self-center" />

            {/* Characters */}
            <div className="flex gap-1 overflow-x-auto flex-1 min-w-0">
              {deckChars.map((card, i) => {
                const img = getImagePath(card);
                return (
                  <div
                    key={`${card.id}-${i}`}
                    className="w-10 h-14 bg-[#141414] border border-[#262626] overflow-hidden relative flex-shrink-0 group cursor-pointer"
                    onClick={() => setPreviewCard(card)}
                  >
                    {img ? (
                      <img
                        src={img}
                        alt={getCardName(card, locale as "en" | "fr")}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-[6px] text-[#555]">
                          {card.chakra}/{card.power}
                        </span>
                      </div>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); removeChar(i); }}
                      className="absolute inset-0 bg-black/60 text-[#b33e3e] text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      X
                    </button>
                  </div>
                );
              })}
              {deckChars.length === 0 && (
                <p className="text-xs text-[#555] italic self-center">
                  {t("deckBuilder.clickToAdd")}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Available cards */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {/* Import section — prominent */}
          <div className="mb-5 border border-[#262626] bg-[#0e0e0e]">
            <div className="px-4 py-3">
              <h2 className="text-sm font-bold text-[#e0e0e0] mb-1">
                {t("deckBuilder.importTitle")}
              </h2>
              <p className="text-xs text-[#888888] mb-3">
                {t("deckBuilder.importDesc")}
              </p>

              <div className="flex items-center gap-2 mb-3">
                <a
                  href="https://shinobuilder.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-[#1a1a2a] border border-[#4a7ab5]/40 text-[#4a7ab5] text-xs hover:bg-[#1f1f3a] transition-colors"
                >
                  {t("deckBuilder.importVisit")}
                </a>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder={t("deckBuilder.importPlaceholder")}
                  value={importCode}
                  onChange={(e) => setImportCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleImport();
                  }}
                  className="flex-1 px-3 py-1.5 bg-[#141414] border border-[#262626] text-[#e0e0e0] text-sm placeholder-[#555] focus:outline-none focus:border-[#444] font-mono"
                />
                <button
                  onClick={handleImport}
                  disabled={!importCode.trim()}
                  className="px-4 py-1.5 bg-[#1a2a1a] border border-[#3e8b3e]/30 text-[#3e8b3e] text-xs hover:bg-[#1f3a1f] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t("deckBuilder.importButton")}
                </button>
              </div>

              {/* Import feedback */}
              {importMessage && (
                <div
                  className={`mt-2 text-xs ${
                    importMessage.type === "success"
                      ? "text-[#3e8b3e]"
                      : "text-[#b33e3e]"
                  }`}
                >
                  {importMessage.text}
                </div>
              )}
            </div>
          </div>

          {/* Separator */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-[#262626]" />
            <span className="text-xs text-[#555] uppercase tracking-wider">
              {t("deckBuilder.orBuildManually")}
            </span>
            <div className="flex-1 h-px bg-[#262626]" />
          </div>

          {/* Search bar */}
          <div className="mb-3">
            <input
              type="text"
              placeholder={t("collection.search")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full max-w-md px-3 py-1.5 bg-[#141414] border border-[#262626] text-[#e0e0e0] text-sm placeholder-[#555] focus:outline-none focus:border-[#444]"
            />
          </div>
          {/* Missions */}
          <p className="text-xs text-[#888888] uppercase tracking-wider mb-2">
            {t("deckBuilder.missions", { count: availableMissions.length })}
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 mb-4">
            {availableMissions
              .filter((m) => !bannedIds.has(m.id))
              .map((m) => {
                const mImgPath = getImagePath(m);
                const check = canAddMission(m);
                return (
                  <button
                    key={m.id}
                    onClick={() => addMission(m)}
                    className="relative w-full mission-aspect bg-[#141414] border border-[#262626] overflow-hidden hover:border-[#444] transition-colors group"
                    title={getCardName(m, locale as "en" | "fr")}
                  >
                    {mImgPath ? (
                      <img
                        src={mImgPath}
                        alt={getCardName(m, locale as "en" | "fr")}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                        style={{ opacity: check.allowed ? 1 : 0.3 }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-[9px] text-[#555]">
                          {getCardName(m, locale as "en" | "fr")}
                        </span>
                      </div>
                    )}
                    {/* Detail button */}
                    <button
                      className="absolute top-1 left-1 px-1.5 py-0.5 rounded cursor-pointer z-10"
                      style={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid #666' }}
                      onClick={(e) => { e.stopPropagation(); setPreviewCard(m); }}
                    >
                      <span className="text-[7px] font-bold uppercase" style={{ color: '#e0e0e0' }}>{t("deckBuilder.detailBtn")}</span>
                    </button>
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      {check.allowed ? (
                        <span className="text-[#3e8b3e] text-xl font-bold">
                          +
                        </span>
                      ) : (
                        <span className="text-[10px] text-[#b33e3e] text-center px-1">
                          {check.reason}
                        </span>
                      )}
                    </div>
                    <div
                      className="absolute inset-x-0 bottom-0 px-1 py-0.5"
                      style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
                    >
                      <span className="text-[9px] text-[#e0e0e0] leading-tight block truncate">
                        {getCardName(m, locale as "en" | "fr")}
                      </span>
                    </div>
                  </button>
                );
              })}
          </div>

          {/* Characters */}
          <p className="text-xs text-[#888888] uppercase tracking-wider mb-2">
            {t("deckBuilder.characters", { count: filteredChars.length })}
          </p>
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {paginatedChars.map((card) => {
              const imgPath = getImagePath(card);
              const check = canAddChar(card);
              return (
                <button
                  key={card.id}
                  onClick={() => addChar(card)}
                  className="relative w-full card-aspect bg-[#141414] border border-[#262626] overflow-hidden hover:border-[#444] transition-colors group"
                  title={`${getCardName(card, locale as "en" | "fr")} - ${getCardTitle(card, locale as "en" | "fr")} (${card.chakra}/${card.power})`}
                >
                  {imgPath ? (
                    <img
                      src={imgPath}
                      alt={getCardName(card, locale as "en" | "fr")}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-[9px] text-[#555]">
                        {getCardName(card, locale as "en" | "fr")}
                      </span>
                    </div>
                  )}
                  {/* Detail button */}
                  <button
                    className="absolute top-1 left-1 px-1.5 py-0.5 rounded cursor-pointer z-10"
                    style={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid #666' }}
                    onClick={(e) => { e.stopPropagation(); setPreviewCard(card); }}
                  >
                    <span className="text-[7px] font-bold uppercase" style={{ color: '#e0e0e0' }}>{t("deckBuilder.detailBtn")}</span>
                  </button>
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                    {check.allowed ? (
                      <>
                        <span className="text-[#3e8b3e] text-xl font-bold leading-none">
                          +
                        </span>
                        <span className="text-[10px] text-[#e0e0e0]">
                          {card.chakra}/{card.power}
                        </span>
                      </>
                    ) : (
                      <span className="text-[9px] text-[#b33e3e] text-center px-1 leading-tight">
                        {check.reason}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Pagination */}
          {totalCharPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-3">
              <button
                onClick={() => setCharPage((p) => Math.max(1, p - 1))}
                disabled={charPage <= 1}
                className="px-2 py-1 text-[10px] transition-colors disabled:opacity-30"
                style={{ backgroundColor: '#141414', border: '1px solid #262626', color: '#888888' }}
              >
                {t('common.previous')}
              </button>
              <span className="text-[10px]" style={{ color: '#888888' }}>
                {charPage} / {totalCharPages}
              </span>
              <button
                onClick={() => setCharPage((p) => Math.min(totalCharPages, p + 1))}
                disabled={charPage >= totalCharPages}
                className="px-2 py-1 text-[10px] transition-colors disabled:opacity-30"
                style={{ backgroundColor: '#141414', border: '1px solid #262626', color: '#888888' }}
              >
                {t('common.next')}
              </button>
            </div>
          )}
        </div>

        <Footer />
      </div>

      {/* Desktop card detail panel (fixed right sidebar) */}
      <AnimatePresence>
        {previewCard && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="hidden lg:flex flex-col overflow-hidden shrink-0 fixed top-0 right-0 h-full z-30"
            style={{ backgroundColor: '#0d0d0d', borderLeft: '1px solid #262626' }}
          >
            <div className="flex-1 overflow-y-auto px-3 py-3">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#c4a35a' }}>
                  {t("deckBuilder.detailBtn")}
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
                    alt={getCardName(previewCard, locale as "en" | "fr")}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#1a1a1a' }}>
                    <span className="text-xs" style={{ color: '#888' }}>{getCardName(previewCard, locale as "en" | "fr")}</span>
                  </div>
                )}
              </div>

              {/* Card info */}
              <div className="text-sm font-bold" style={{ color: '#e0e0e0' }}>{getCardName(previewCard, locale as "en" | "fr")}</div>
              {(previewCard.card_type !== 'mission') && (
                <div className="text-[11px]" style={{ color: '#888' }}>{getCardTitle(previewCard as CharacterCard, locale as "en" | "fr")}</div>
              )}

              {/* Stats row */}
              <div className="flex gap-2 mt-1 flex-wrap">
                {previewCard.card_type !== 'mission' && (
                  <>
                    <span className="text-[11px]" style={{ color: '#5865F2' }}>{t("deckBuilder.chakra")}: {(previewCard as CharacterCard).chakra}</span>
                    <span className="text-[11px]" style={{ color: '#b33e3e' }}>{t("deckBuilder.power")}: {(previewCard as CharacterCard).power}</span>
                  </>
                )}
                <span className="text-[11px] font-bold" style={{ color: RARITY_COLORS[previewCard.rarity] ?? '#888' }}>
                  {getRarityLabel(previewCard.rarity, locale as "en" | "fr")}
                </span>
                {previewCard.card_type !== 'mission' && (previewCard as CharacterCard).group && (
                  <span className="text-[11px]" style={{ color: '#6b8a6b' }}>{getCardGroup((previewCard as CharacterCard).group!, locale as "en" | "fr")}</span>
                )}
              </div>

              {/* Keywords */}
              {previewCard.card_type !== 'mission' && (previewCard as CharacterCard).keywords && (previewCard as CharacterCard).keywords!.length > 0 && (
                <div className="flex gap-1 mt-1 flex-wrap">
                  {(previewCard as CharacterCard).keywords!.map((kw, i) => (
                    <span
                      key={i}
                      className="text-[9px] px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: '#1a1a2e', color: '#9999bb', border: '1px solid #2a2a3e' }}
                    >
                      {getCardKeyword(kw, locale as "en" | "fr")}
                    </span>
                  ))}
                </div>
              )}

              {/* Effects */}
              {previewCard.effects && previewCard.effects.length > 0 && (
                <div className="mt-2 flex flex-col gap-1.5">
                  {previewCard.effects.map((eff, i) => {
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

              {/* Add button */}
              {previewCard.card_type === 'mission' ? (
                <button
                  onClick={() => addMission(previewCard as MissionCard)}
                  disabled={!canAddMission(previewCard as MissionCard).allowed}
                  className="mt-3 w-full py-1.5 text-xs font-bold uppercase rounded cursor-pointer"
                  style={{
                    backgroundColor: canAddMission(previewCard as MissionCard).allowed ? '#1a2a1a' : '#1a1a1a',
                    color: canAddMission(previewCard as MissionCard).allowed ? '#3e8b3e' : '#555',
                    border: `1px solid ${canAddMission(previewCard as MissionCard).allowed ? '#2a4a2a' : '#333'}`,
                  }}
                >
                  {t("deckBuilder.addToDeck")}
                </button>
              ) : (
                <button
                  onClick={() => addChar(previewCard as CharacterCard)}
                  disabled={!canAddChar(previewCard as CharacterCard).allowed}
                  className="mt-3 w-full py-1.5 text-xs font-bold uppercase rounded cursor-pointer"
                  style={{
                    backgroundColor: canAddChar(previewCard as CharacterCard).allowed ? '#1a2a1a' : '#1a1a1a',
                    color: canAddChar(previewCard as CharacterCard).allowed ? '#3e8b3e' : '#555',
                    border: `1px solid ${canAddChar(previewCard as CharacterCard).allowed ? '#2a4a2a' : '#333'}`,
                  }}
                >
                  {t("deckBuilder.addToDeck")}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile card detail drawer */}
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
                  {t("deckBuilder.detailBtn")}
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
                      alt={getCardName(previewCard, locale as "en" | "fr")}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#1a1a1a' }}>
                      <span className="text-xs" style={{ color: '#888' }}>{getCardName(previewCard, locale as "en" | "fr")}</span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold" style={{ color: '#e0e0e0' }}>{getCardName(previewCard, locale as "en" | "fr")}</div>
                  {previewCard.card_type !== 'mission' && (
                    <div className="text-[11px]" style={{ color: '#888' }}>{getCardTitle(previewCard as CharacterCard, locale as "en" | "fr")}</div>
                  )}
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {previewCard.card_type !== 'mission' && (
                      <>
                        <span className="text-[11px]" style={{ color: '#5865F2' }}>{t("deckBuilder.chakra")}: {(previewCard as CharacterCard).chakra}</span>
                        <span className="text-[11px]" style={{ color: '#b33e3e' }}>{t("deckBuilder.power")}: {(previewCard as CharacterCard).power}</span>
                      </>
                    )}
                    <span className="text-[11px] font-bold" style={{ color: RARITY_COLORS[previewCard.rarity] ?? '#888' }}>
                      {getRarityLabel(previewCard.rarity, locale as "en" | "fr")}
                    </span>
                    {previewCard.card_type !== 'mission' && (previewCard as CharacterCard).group && (
                      <span className="text-[11px]" style={{ color: '#6b8a6b' }}>{getCardGroup((previewCard as CharacterCard).group!, locale as "en" | "fr")}</span>
                    )}
                  </div>
                  {previewCard.card_type !== 'mission' && (previewCard as CharacterCard).keywords && (previewCard as CharacterCard).keywords!.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {(previewCard as CharacterCard).keywords!.map((kw, i) => (
                        <span key={i} className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: '#1a1a2e', color: '#9999bb', border: '1px solid #2a2a3e' }}>
                          {getCardKeyword(kw, locale as "en" | "fr")}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Effects */}
              {previewCard.effects && previewCard.effects.length > 0 && (
                <div className="mt-2 flex flex-col gap-1.5">
                  {previewCard.effects.map((eff, i) => {
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

              {/* Add button */}
              {previewCard.card_type === 'mission' ? (
                <button
                  onClick={() => addMission(previewCard as MissionCard)}
                  disabled={!canAddMission(previewCard as MissionCard).allowed}
                  className="mt-2 w-full py-1.5 text-xs font-bold uppercase rounded cursor-pointer"
                  style={{
                    backgroundColor: canAddMission(previewCard as MissionCard).allowed ? '#1a2a1a' : '#1a1a1a',
                    color: canAddMission(previewCard as MissionCard).allowed ? '#3e8b3e' : '#555',
                    border: `1px solid ${canAddMission(previewCard as MissionCard).allowed ? '#2a4a2a' : '#333'}`,
                  }}
                >
                  {t("deckBuilder.addToDeck")}
                </button>
              ) : (
                <button
                  onClick={() => addChar(previewCard as CharacterCard)}
                  disabled={!canAddChar(previewCard as CharacterCard).allowed}
                  className="mt-2 w-full py-1.5 text-xs font-bold uppercase rounded cursor-pointer"
                  style={{
                    backgroundColor: canAddChar(previewCard as CharacterCard).allowed ? '#1a2a1a' : '#1a1a1a',
                    color: canAddChar(previewCard as CharacterCard).allowed ? '#3e8b3e' : '#555',
                    border: `1px solid ${canAddChar(previewCard as CharacterCard).allowed ? '#2a4a2a' : '#333'}`,
                  }}
                >
                  {t("deckBuilder.addToDeck")}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overwrite confirmation modal */}
      <AnimatePresence>
        {overwriteConflict && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-200 flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(4px)' }}
            onClick={() => setOverwriteConflict(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#141414] border border-[#333] p-6 max-w-sm w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-[#e0e0e0] text-sm mb-1 font-medium">
                {t('deckBuilder.overwriteTitle')}
              </p>
              <p className="text-[#888] text-xs mb-5">
                {t('deckBuilder.overwriteDesc', { name: overwriteConflict.name })}
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setOverwriteConflict(null)}
                  className="px-3 py-1.5 bg-[#1a1a1a] border border-[#333] text-[#888] text-xs hover:bg-[#222] transition-colors"
                >
                  {t('deckBuilder.overwriteCancel')}
                </button>
                <button
                  onClick={handleOverwriteConfirm}
                  className="px-3 py-1.5 bg-[#2a1a1a] border border-[#b33e3e]/30 text-[#b33e3e] text-xs hover:bg-[#3a1a1a] transition-colors"
                >
                  {t('deckBuilder.overwriteConfirm')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
