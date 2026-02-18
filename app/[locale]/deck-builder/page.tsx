'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { DecorativeIcons } from '@/components/DecorativeIcons';
import { CardBackgroundDecor } from '@/components/CardBackgroundDecor';
import type { CharacterCard, MissionCard } from '@/lib/engine/types';
import { Footer } from '@/components/Footer';
import { validateDeck } from '@/lib/engine/rules/DeckValidation';
import { useDeckBuilderStore } from '@/stores/deckBuilderStore';
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  DragEndEvent,
  DragStartEvent,
} from '@dnd-kit/core';

interface DragData {
  card: CharacterCard | MissionCard;
  type: 'character' | 'mission';
}

function DraggableCard({
  id,
  children,
  data,
}: {
  id: string;
  children: React.ReactNode;
  data: DragData;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id,
    data,
  });
  const style: React.CSSProperties | undefined = transform
    ? {
        transform: `translate(${transform.x}px, ${transform.y}px)`,
        opacity: 0.5,
        zIndex: 50,
      }
    : undefined;
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      {children}
    </div>
  );
}

function DroppableDeck({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'deck-drop-zone' });
  return (
    <div
      ref={setNodeRef}
      className={
        isOver
          ? 'ring-2 ring-[#c4a35a]/50 transition-shadow'
          : 'transition-shadow'
      }
    >
      {children}
    </div>
  );
}

export default function DeckBuilderPage() {
  const t = useTranslations();
  const [availableChars, setAvailableChars] = useState<CharacterCard[]>([]);
  const [availableMissions, setAvailableMissions] = useState<MissionCard[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeDragCard, setActiveDragCard] = useState<
    CharacterCard | MissionCard | null
  >(null);
  const [activeDragType, setActiveDragType] = useState<
    'character' | 'mission' | null
  >(null);

  // Zustand store
  const deckName = useDeckBuilderStore((s) => s.deckName);
  const deckChars = useDeckBuilderStore((s) => s.deckChars);
  const deckMissions = useDeckBuilderStore((s) => s.deckMissions);
  const savedDecks = useDeckBuilderStore((s) => s.savedDecks);
  const isLoading = useDeckBuilderStore((s) => s.isLoading);
  const isSaving = useDeckBuilderStore((s) => s.isSaving);
  const loadedDeckId = useDeckBuilderStore((s) => s.loadedDeckId);

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

  useEffect(() => {
    import('@/lib/data/cardLoader').then((mod) => {
      setAvailableChars(mod.getPlayableCharacters());
      setAvailableMissions(mod.getPlayableMissions());
    });
  }, []);

  // Load saved decks on mount
  useEffect(() => {
    loadSavedDecks();
  }, [loadSavedDecks]);

  const filteredChars = useMemo(() => {
    if (!searchQuery) return availableChars;
    const q = searchQuery.toLowerCase();
    return availableChars.filter(
      (c) =>
        c.name_fr.toLowerCase().includes(q) ||
        c.title_fr.toLowerCase().includes(q) ||
        c.id.includes(q),
    );
  }, [availableChars, searchQuery]);

  const validation = useMemo(() => {
    return validateDeck(deckChars, deckMissions);
  }, [deckChars, deckMissions]);

  const handleSave = useCallback(async () => {
    setSaveError(null);
    try {
      await saveDeck();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : t('deckBuilder.failedToSave');
      setSaveError(message);
    }
  }, [saveDeck, t]);

  const handleLoadDeck = useCallback(
    async (deckId: string) => {
      setSaveError(null);
      try {
        await loadDeck(deckId, availableChars, availableMissions);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : t('deckBuilder.failedToLoad');
        setSaveError(message);
      }
    },
    [loadDeck, availableChars, availableMissions],
  );

  const handleDeleteDeck = useCallback(
    async (deckId: string) => {
      setSaveError(null);
      try {
        await deleteDeck(deckId);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : t('deckBuilder.failedToDelete');
        setSaveError(message);
      }
    },
    [deleteDeck],
  );

  const getImagePath = (card: CharacterCard | MissionCard): string | null => {
    if (!card.image_file) return null;
    return card.image_file.startsWith('/')
      ? card.image_file
      : '/' + card.image_file.replace(/\\/g, '/');
  };

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as DragData | undefined;
    if (data) {
      setActiveDragCard(data.card);
      setActiveDragType(data.type);
    }
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragCard(null);
      setActiveDragType(null);
      if (event.over?.id === 'deck-drop-zone') {
        const data = event.active.data.current as DragData | undefined;
        if (data?.type === 'character') {
          addChar(data.card as CharacterCard);
        } else if (data?.type === 'mission') {
          addMission(data.card as MissionCard);
        }
      }
    },
    [addChar, addMission],
  );

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="min-h-screen relative bg-[#0a0a0a] flex flex-col">
      <div className="flex flex-1 relative">
        <CloudBackground />
        <DecorativeIcons />
        <CardBackgroundDecor variant="deck" />
        {/* Left panel: Available cards */}
        <div className="flex-1 p-4 overflow-y-auto border-r border-[#262626] relative z-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[#e0e0e0]">
              {t('deckBuilder.availableCards')}
            </h2>
            <Link
              href="/"
              className="px-3 py-1 bg-[#141414] border border-[#262626] text-[#888888] text-xs hover:bg-[#1a1a1a] transition-colors"
            >
              {t('common.back')}
            </Link>
          </div>

          <input
            type="text"
            placeholder={t('collection.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 mb-4 bg-[#141414] border border-[#262626] text-[#e0e0e0] text-sm placeholder-[#555] focus:outline-none focus:border-[#444]"
          />

          {/* Missions */}
          <p className="text-xs text-[#888888] uppercase tracking-wider mb-2">
            {t('deckBuilder.missions', { count: deckMissions.length })}
          </p>
          <div className="grid grid-cols-3 gap-1 mb-4">
            {availableMissions.map((m) => {
              const mImgPath = getImagePath(m);
              const isDisabled =
                deckMissions.length >= 3 ||
                deckMissions.some((dm) => dm.id === m.id);
              return (
                <DraggableCard
                  key={m.id}
                  id={`drag-mission-${m.id}`}
                  data={{ card: m, type: 'mission' }}
                >
                  <button
                    onClick={() => addMission(m)}
                    className="relative w-full mission-aspect bg-[#141414] border border-[#262626] overflow-hidden hover:border-[#444] transition-colors cursor-grab active:cursor-grabbing"
                    disabled={isDisabled}
                    title={m.name_fr}
                  >
                    {mImgPath ? (
                      <img
                        src={mImgPath}
                        alt={m.name_fr}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        style={{ opacity: isDisabled ? 0.3 : 1 }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-[7px] text-[#555]">
                          {m.name_fr}
                        </span>
                      </div>
                    )}
                    <div
                      className="absolute inset-x-0 bottom-0 px-1 py-0.5 text-center"
                      style={{ backgroundColor: 'rgba(0, 0, 0, 0.75)' }}
                    >
                      <span className="text-[8px] text-[#e0e0e0] leading-tight">
                        {m.name_fr}
                      </span>
                    </div>
                  </button>
                </DraggableCard>
              );
            })}
          </div>

          {/* Characters */}
          <p className="text-xs text-[#888888] uppercase tracking-wider mb-2">
            {t('deckBuilder.characters', { count: filteredChars.length })}
          </p>
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-1">
            {filteredChars.map((card) => {
              const imgPath = getImagePath(card);
              return (
                <DraggableCard
                  key={card.id}
                  id={`drag-char-${card.id}`}
                  data={{ card, type: 'character' }}
                >
                  <button
                    onClick={() => addChar(card)}
                    className="relative w-full card-aspect bg-[#141414] border border-[#262626] overflow-hidden hover:border-[#444] transition-colors cursor-grab active:cursor-grabbing"
                    title={`${card.name_fr} - ${card.title_fr} (${card.chakra}/${card.power})`}
                  >
                    {imgPath ? (
                      <img
                        src={imgPath}
                        alt={card.name_fr}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-[7px] text-[#555]">
                          {card.name_fr}
                        </span>
                      </div>
                    )}
                  </button>
                </DraggableCard>
              );
            })}
          </div>
        </div>

        {/* Right panel: Current deck */}
        <DroppableDeck>
          <div className="w-80 p-4 overflow-y-auto bg-[#0e0e0e] relative z-10">
            {/* Deck name input */}
            <input
              type="text"
              placeholder={t('deckBuilder.deckName')}
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              className="w-full px-3 py-2 mb-2 bg-[#141414] border border-[#262626] text-[#e0e0e0] text-sm placeholder-[#555] focus:outline-none focus:border-[#444]"
            />

            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={handleSave}
                disabled={isSaving || !validation.valid}
                className="px-3 py-1.5 bg-[#1a2a1a] border border-[#3e8b3e]/30 text-[#3e8b3e] text-xs hover:bg-[#1f3a1f] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSaving ? t('common.loading') : t('deckBuilder.saveDeck')}
              </button>
              <button
                onClick={clearDeck}
                className="px-3 py-1.5 bg-[#141414] border border-[#262626] text-[#888888] text-xs hover:bg-[#1a1a1a] transition-colors"
              >
                {t('deckBuilder.clearDeck')}
              </button>
            </div>

            {/* Save/load error display */}
            {saveError && (
              <div className="mb-3 p-2 border border-[#b33e3e]/30 bg-[#b33e3e]/5">
                <p className="text-xs text-[#b33e3e]">{saveError}</p>
              </div>
            )}

            <p className="text-xs text-[#888888] mb-1">
              {t('deckBuilder.characters', { count: deckChars.length })} /{' '}
              {t('deckBuilder.missions', { count: deckMissions.length })}
            </p>

            {/* Validation */}
            {!validation.valid && validation.errors.length > 0 && (
              <div className="mb-4 p-2 border border-[#b33e3e]/30 bg-[#b33e3e]/5">
                {validation.errors.map((err, i) => (
                  <p key={i} className="text-xs text-[#b33e3e]">
                    {err}
                  </p>
                ))}
              </div>
            )}
            {validation.valid && (
              <div className="mb-4 p-2 border border-[#3e8b3e]/30 bg-[#3e8b3e]/5">
                <p className="text-xs text-[#3e8b3e]">
                  {t('deckBuilder.validation.valid')}
                </p>
              </div>
            )}

            {/* Missions */}
            <p className="text-xs text-[#888888] uppercase tracking-wider mb-1">
              {t('deckBuilder.missions', { count: deckMissions.length })}
            </p>
            <div className="space-y-1 mb-4">
              {deckMissions.map((m, i) => (
                <div
                  key={`${m.id}-${i}`}
                  className="flex items-center justify-between p-2 bg-[#141414] border border-[#262626] text-xs"
                >
                  <span className="text-[#e0e0e0]">{m.name_fr}</span>
                  <button
                    onClick={() => removeMission(i)}
                    className="text-[#b33e3e] hover:text-[#d44] text-xs px-1"
                  >
                    X
                  </button>
                </div>
              ))}
              {deckMissions.length === 0 && (
                <p className="text-xs text-[#555] italic">
                  {t('deckBuilder.selectMissions')}
                </p>
              )}
            </div>

            {/* Characters */}
            <p className="text-xs text-[#888888] uppercase tracking-wider mb-1">
              {t('deckBuilder.characters', { count: deckChars.length })}
            </p>
            <div className="space-y-1 mb-6">
              {deckChars.map((card, i) => (
                <div
                  key={`${card.id}-${i}`}
                  className="flex items-center justify-between p-1.5 bg-[#141414] border border-[#262626] text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[#888888] w-4 text-center flex-shrink-0">
                      {card.chakra}
                    </span>
                    <span className="text-[#e0e0e0] truncate">
                      {card.name_fr}
                    </span>
                    <span className="text-[#555] flex-shrink-0">
                      {card.power}P
                    </span>
                  </div>
                  <button
                    onClick={() => removeChar(i)}
                    className="text-[#b33e3e] hover:text-[#d44] text-xs px-1 flex-shrink-0"
                  >
                    X
                  </button>
                </div>
              ))}
              {deckChars.length === 0 && (
                <p className="text-xs text-[#555] italic">
                  {t('deckBuilder.clickToAdd')}
                </p>
              )}
            </div>

            {/* Saved Decks */}
            <div className="border-t border-[#262626] pt-4">
              <p className="text-xs text-[#888888] uppercase tracking-wider mb-2">
                {t('deckBuilder.loadDeck')}
              </p>
              {isLoading && (
                <p className="text-xs text-[#555] italic">
                  {t('common.loading')}
                </p>
              )}
              {!isLoading && savedDecks.length === 0 && (
                <p className="text-xs text-[#555] italic">{t('deckBuilder.noSavedDecks')}</p>
              )}
              <div className="space-y-1">
                {savedDecks.map((deck) => (
                  <div
                    key={deck.id}
                    className={`flex items-center justify-between p-2 bg-[#141414] border text-xs ${
                      loadedDeckId === deck.id
                        ? 'border-[#3e8b3e]/50'
                        : 'border-[#262626]'
                    }`}
                  >
                    <button
                      onClick={() => handleLoadDeck(deck.id)}
                      className="text-[#e0e0e0] hover:text-white text-left truncate flex-1 min-w-0"
                      title={`${deck.name} (${t('deckBuilder.savedDeckInfo', { cards: deck.cardIds.length, missions: deck.missionIds.length })})`}
                    >
                      <span className="truncate block">{deck.name}</span>
                      <span className="text-[#555] text-[10px]">
                        {t('deckBuilder.savedDeckInfo', { cards: deck.cardIds.length, missions: deck.missionIds.length })}
                      </span>
                    </button>
                    <button
                      onClick={() => handleDeleteDeck(deck.id)}
                      className="text-[#b33e3e] hover:text-[#d44] text-xs px-1 shrink-0 ml-2"
                    >
                      X
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DroppableDeck>
      </div>
      <Footer />
      </div>

      {/* Drag overlay - visual feedback while dragging */}
      <DragOverlay>
        {activeDragCard && (
          <div className="w-20 h-28 bg-[#141414] border-2 border-[#c4a35a] flex items-center justify-center text-xs text-[#e0e0e0] p-1 text-center opacity-80 pointer-events-none">
            <span className="leading-tight">
              {activeDragCard.name_fr}
              {activeDragType === 'character' && (
                <span className="block text-[10px] text-[#888888] mt-0.5">
                  {(activeDragCard as CharacterCard).chakra}/
                  {(activeDragCard as CharacterCard).power}
                </span>
              )}
            </span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
