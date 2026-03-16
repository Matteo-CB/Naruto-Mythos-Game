'use client';

import { useState, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';
import { useUIStore } from '@/stores/uiStore';
import { normalizeImagePath } from '@/lib/utils/imagePath';
import { getCardName } from '@/lib/utils/cardLocale';
import type { CharacterCard, MissionCard, VisibleCharacter } from '@/lib/engine/types';

type SandboxModal = 'none' | 'draw' | 'viewDeck' | 'addAnyCard' | 'discardHand' | 'returnToHand' | 'moveChar';

export function SandboxToolbar() {
  const t = useTranslations();
  const isSandboxMode = useGameStore((s) => s.isSandboxMode);
  const visibleState = useGameStore((s) => s.visibleState);
  const sandboxDrawCard = useGameStore((s) => s.sandboxDrawCard);
  const sandboxAddChakra = useGameStore((s) => s.sandboxAddChakra);
  const sandboxMoveToTopDeck = useGameStore((s) => s.sandboxMoveToTopDeck);
  const sandboxAddAnyCard = useGameStore((s) => s.sandboxAddAnyCard);
  const sandboxDiscardFromHand = useGameStore((s) => s.sandboxDiscardFromHand);
  const sandboxSetChakra = useGameStore((s) => s.sandboxSetChakra);
  const sandboxReturnToHand = useGameStore((s) => s.sandboxReturnToHand);
  const sandboxMoveCharacter = useGameStore((s) => s.sandboxMoveCharacter);
  const sandboxSetTurn = useGameStore((s) => s.sandboxSetTurn);
  const sandboxSetPhase = useGameStore((s) => s.sandboxSetPhase);
  const sandboxResetAllPowerTokens = useGameStore((s) => s.sandboxResetAllPowerTokens);
  const [modal, setModal] = useState<SandboxModal>('none');
  const [chakraInput, setChakraInput] = useState(false);
  const [chakraVal, setChakraVal] = useState('');

  if (!isSandboxMode || !visibleState) return null;

  const deck = visibleState.myState.deck;
  const hand = visibleState.myState.hand;
  const currentChakra = visibleState.myState.chakra;
  const currentTurn = visibleState.turn;
  const currentPhase = visibleState.phase;

  return (
    <>
      {/* Toolbar - Row 1: Main actions */}
      <div
        className="fixed top-0 left-0 right-0 z-[60] flex flex-col"
        style={{
          backgroundColor: 'rgba(17, 17, 17, 0.95)',
          borderBottom: '1px solid #262626',
        }}
      >
        {/* Row 1: Card actions */}
        <div className="flex items-center justify-center gap-1 sm:gap-1.5 py-1 px-2 sm:px-3 flex-wrap">
          <span className="text-[9px] sm:text-[10px] uppercase tracking-wider font-bold mr-1 sm:mr-2" style={{ color: '#c4a35a' }}>
            {t('hotseat.modeFree')}
          </span>

          <ToolbarButton label={t('sandbox.addAnyCard')} onClick={() => setModal('addAnyCard')} accent />
          <ToolbarButton label={t('sandbox.drawCard')} onClick={() => setModal('draw')} />
          <ToolbarButton label={t('sandbox.discardHand')} onClick={() => setModal('discardHand')} />
          <ToolbarButton label={t('sandbox.returnToHand')} onClick={() => setModal('returnToHand')} />
          <ToolbarButton label={t('sandbox.moveChar')} onClick={() => setModal('moveChar')} />
          <ToolbarButton label={t('sandbox.viewDeck')} onClick={() => setModal('viewDeck')} />

          <div className="w-px h-4 mx-0.5" style={{ backgroundColor: '#333' }} />

          <ToolbarButton label="+5 Chakra" onClick={() => sandboxAddChakra(5)} />

          {/* Inline chakra setter */}
          {chakraInput ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={chakraVal}
                onChange={(e) => setChakraVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const v = parseInt(chakraVal, 10);
                    if (!isNaN(v)) sandboxSetChakra(v);
                    setChakraInput(false);
                    setChakraVal('');
                  }
                  if (e.key === 'Escape') { setChakraInput(false); setChakraVal(''); }
                }}
                autoFocus
                className="w-12 px-1 py-0.5 text-[10px] text-center"
                style={{ backgroundColor: '#0a0a0a', border: '1px solid #c4a35a', color: '#e0e0e0', outline: 'none' }}
                placeholder={String(currentChakra)}
              />
            </div>
          ) : (
            <ToolbarButton label={`${t('sandbox.setChakra')}: ${currentChakra}`} onClick={() => { setChakraInput(true); setChakraVal(String(currentChakra)); }} />
          )}

          <div className="w-px h-4 mx-0.5" style={{ backgroundColor: '#333' }} />

          {/* Turn control */}
          <div className="flex items-center gap-0.5">
            <span className="text-[8px] uppercase" style={{ color: '#666' }}>T</span>
            {[1, 2, 3, 4].map((turn) => (
              <button
                key={turn}
                onClick={() => sandboxSetTurn(turn)}
                className="w-5 h-5 text-[9px] font-bold"
                style={{
                  backgroundColor: currentTurn === turn ? 'rgba(196,163,90,0.2)' : '#1a1a1a',
                  border: `1px solid ${currentTurn === turn ? '#c4a35a' : '#333'}`,
                  color: currentTurn === turn ? '#c4a35a' : '#888',
                }}
              >{turn}</button>
            ))}
          </div>

          {/* Phase control */}
          <div className="flex items-center gap-0.5">
            {(['action', 'mission'] as const).map((phase) => (
              <button
                key={phase}
                onClick={() => sandboxSetPhase(phase)}
                className="px-1.5 py-0.5 text-[8px] uppercase font-bold"
                style={{
                  backgroundColor: currentPhase === phase ? 'rgba(196,163,90,0.2)' : '#1a1a1a',
                  border: `1px solid ${currentPhase === phase ? '#c4a35a' : '#333'}`,
                  color: currentPhase === phase ? '#c4a35a' : '#888',
                }}
              >{phase === 'action' ? t('sandbox.phaseAction') : t('sandbox.phaseMission')}</button>
            ))}
          </div>

          <ToolbarButton label={t('sandbox.resetTokens')} onClick={sandboxResetAllPowerTokens} />
        </div>
      </div>

      {/* Modals */}
      {modal === 'draw' && (
        <CardGridModal
          title={t('sandbox.drawCard')}
          cards={deck}
          showIndex={false}
          onSelect={(idx) => { sandboxDrawCard(idx); setModal('none'); }}
          onClose={() => setModal('none')}
        />
      )}
      {modal === 'viewDeck' && (
        <CardGridModal
          title={t('sandbox.deckOrder')}
          subtitle={t('sandbox.clickToMoveTop')}
          cards={deck}
          showIndex
          onSelect={(idx) => { sandboxMoveToTopDeck(idx); setModal('none'); }}
          onClose={() => setModal('none')}
        />
      )}
      {modal === 'addAnyCard' && (
        <AllCardsModal
          onSelect={(cardId) => { sandboxAddAnyCard(cardId); }}
          onClose={() => setModal('none')}
        />
      )}
      {modal === 'discardHand' && (
        <CardGridModal
          title={t('sandbox.discardHand')}
          cards={hand}
          showIndex={false}
          onSelect={(idx) => { sandboxDiscardFromHand(idx); setModal('none'); }}
          onClose={() => setModal('none')}
        />
      )}
      {modal === 'returnToHand' && (
        <BoardCharactersModal
          title={t('sandbox.returnToHand')}
          subtitle={t('sandbox.selectCharToReturn')}
          onSelect={(missionIdx, instanceId) => { sandboxReturnToHand(missionIdx, instanceId); }}
          onClose={() => setModal('none')}
        />
      )}
      {modal === 'moveChar' && (
        <MoveCharacterModal
          onMove={(fromMission, instanceId, toMission) => { sandboxMoveCharacter(fromMission, instanceId, toMission); }}
          onClose={() => setModal('none')}
        />
      )}
    </>
  );
}

function ToolbarButton({ label, onClick, accent }: { label: string; onClick: () => void; accent?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="px-2 py-1 text-[9px] sm:text-[10px] uppercase tracking-wider font-medium transition-colors shrink-0"
      style={{
        backgroundColor: accent ? 'rgba(196,163,90,0.1)' : '#1a1a1a',
        border: `1px solid ${accent ? 'rgba(196,163,90,0.3)' : '#333'}`,
        color: accent ? '#c4a35a' : '#ccc',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#c4a35a'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = accent ? 'rgba(196,163,90,0.3)' : '#333'; }}
    >
      {label}
    </button>
  );
}

/** Reusable modal that displays a grid of cards (deck, hand, etc.) */
function CardGridModal({
  title,
  subtitle,
  cards,
  showIndex,
  onSelect,
  onClose,
}: {
  title: string;
  subtitle?: string;
  cards: CharacterCard[];
  showIndex: boolean;
  onSelect: (idx: number) => void;
  onClose: () => void;
}) {
  const t = useTranslations();

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg max-h-[80vh] mx-4 overflow-hidden flex flex-col rounded-lg"
        style={{ backgroundColor: '#111', border: '1px solid #333' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #262626' }}>
          <div>
            <span className="text-xs uppercase tracking-wider font-bold" style={{ color: '#c4a35a' }}>{title}</span>
            {subtitle && <p className="text-[10px] mt-0.5" style={{ color: '#666' }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-xs px-2 py-1 transition-colors" style={{ color: '#888', border: '1px solid #333' }}>
            {t('sandbox.close')}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {cards.length === 0 ? (
            <p className="text-center text-xs py-8" style={{ color: '#666' }}>{t('sandbox.emptyDeck')}</p>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {cards.map((card, idx) => (
                <DeckCardItem key={`${card.id}-${idx}`} card={card} index={idx} showIndex={showIndex} onClick={() => onSelect(idx)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Modal for browsing ALL cards in the game and adding them to hand */
function AllCardsModal({
  onSelect,
  onClose,
}: {
  onSelect: (cardId: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [search, setSearch] = useState('');
  const [addedCardId, setAddedCardId] = useState<string | null>(null);

  const allCards = useMemo(() => {
    try {
      const { getAllCharacters } = require('@/lib/data/cardIndex');
      return getAllCharacters() as CharacterCard[];
    } catch {
      return [] as CharacterCard[];
    }
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return allCards;
    const q = search.toLowerCase();
    return allCards.filter((c: CharacterCard) =>
      c.name_fr.toLowerCase().includes(q) ||
      (c.name_en && c.name_en.toLowerCase().includes(q)) ||
      c.cardId?.toLowerCase().includes(q) ||
      String(c.chakra).includes(q)
    );
  }, [allCards, search]);

  const handleAdd = (card: CharacterCard) => {
    onSelect(card.cardId || card.id);
    setAddedCardId(card.cardId || card.id);
    setTimeout(() => setAddedCardId(null), 600);
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[85vh] mx-3 overflow-hidden flex flex-col rounded-lg"
        style={{ backgroundColor: '#111', border: '1px solid #333' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #262626' }}>
          <span className="text-xs uppercase tracking-wider font-bold" style={{ color: '#c4a35a' }}>
            {t('sandbox.allCards')} ({filtered.length})
          </span>
          <button onClick={onClose} className="text-xs px-2 py-1" style={{ color: '#888', border: '1px solid #333' }}>
            {t('sandbox.close')}
          </button>
        </div>

        {/* Search */}
        <div className="px-3 pt-3 pb-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('sandbox.searchCards')}
            autoFocus
            className="w-full px-3 py-2 text-sm rounded"
            style={{ backgroundColor: '#0a0a0a', border: '1px solid #262626', color: '#e0e0e0', outline: 'none' }}
            onFocus={(e) => (e.target.style.borderColor = '#c4a35a55')}
            onBlur={(e) => (e.target.style.borderColor = '#262626')}
          />
        </div>

        {/* Card grid */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {filtered.map((card: CharacterCard) => {
              const cid = card.cardId || card.id;
              const justAdded = addedCardId === cid;
              return (
                <button
                  key={cid}
                  onClick={() => handleAdd(card)}
                  className="group relative w-full overflow-hidden transition-all"
                  style={{
                    aspectRatio: '63/88',
                    backgroundColor: '#1a1a1a',
                    border: justAdded ? '2px solid #3e8b3e' : '1px solid #333',
                    opacity: justAdded ? 0.6 : 1,
                  }}
                >
                  {card.image_file ? (
                    <img
                      src={normalizeImagePath(card.image_file) || undefined}
                      alt={getCardName(card, locale as 'en' | 'fr')}
                      className="w-full h-full"
                      style={{ objectFit: 'cover' }}
                      draggable={false}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-[7px] text-center px-0.5" style={{ color: '#666' }}>
                        {getCardName(card, locale as 'en' | 'fr')}
                      </span>
                    </div>
                  )}
                  {/* Cost badge */}
                  <span
                    className="absolute top-0 left-0 text-[8px] font-bold px-1"
                    style={{ backgroundColor: 'rgba(0,0,0,0.8)', color: '#4a9eff' }}
                  >
                    {card.chakra}
                  </span>
                  {/* Power badge */}
                  <span
                    className="absolute top-0 right-0 text-[8px] font-bold px-1"
                    style={{ backgroundColor: 'rgba(0,0,0,0.8)', color: '#c4a35a' }}
                  >
                    {card.power}
                  </span>
                  {/* Name */}
                  <span
                    className="absolute bottom-0 left-0 right-0 text-[6px] sm:text-[7px] text-center truncate px-0.5"
                    style={{ backgroundColor: 'rgba(0,0,0,0.85)', color: '#ccc' }}
                  >
                    {getCardName(card, locale as 'en' | 'fr')}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Modal showing all characters on the board — click to return one to hand */
function BoardCharactersModal({
  title,
  subtitle,
  onSelect,
  onClose,
}: {
  title: string;
  subtitle?: string;
  onSelect: (missionIndex: number, instanceId: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const visibleState = useGameStore((s) => s.visibleState);
  if (!visibleState) return null;

  const missions = visibleState.activeMissions;
  const rankLabels = ['D', 'C', 'B', 'A'];

  const hasAnyChars = missions.some((m) =>
    m.player1Characters.length > 0 || m.player2Characters.length > 0
  );

  const renderChar = (char: VisibleCharacter, missionIdx: number) => {
    if (!char.card) return null;
    const imgPath = normalizeImagePath(char.card.image_file);
    return (
      <button
        key={char.instanceId}
        onClick={() => onSelect(missionIdx, char.instanceId)}
        className="group relative w-full overflow-hidden"
        style={{
          aspectRatio: '63/88',
          backgroundColor: '#1a1a1a',
          border: char.isHidden ? '1px dashed #555' : '1px solid #333',
          opacity: char.isHidden ? 0.7 : 1,
        }}
      >
        {imgPath && !char.isHidden ? (
          <img src={imgPath} alt="" className="w-full h-full" style={{ objectFit: 'cover' }} draggable={false} />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#1a1a1a' }}>
            <span className="text-[7px] text-center px-0.5" style={{ color: char.isHidden ? '#888' : '#666' }}>
              {char.isHidden ? t('sandbox.hide') : getCardName(char.card, locale as 'en' | 'fr')}
            </span>
          </div>
        )}
        <span className="absolute bottom-0 left-0 right-0 text-[7px] text-center truncate px-0.5"
          style={{ backgroundColor: 'rgba(0,0,0,0.8)', color: '#ccc' }}>
          {getCardName(char.card, locale as 'en' | 'fr')}
        </span>
        {char.powerTokens > 0 && (
          <span className="absolute top-0 right-0 text-[8px] font-bold px-1"
            style={{ backgroundColor: 'rgba(0,0,0,0.8)', color: '#c4a35a' }}>
            +{char.powerTokens}
          </span>
        )}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 flex items-center justify-center pointer-events-none"
          style={{ backgroundColor: 'rgba(62,139,62,0.35)', transition: 'opacity 80ms' }}>
          <span className="text-sm font-bold" style={{ color: '#fff' }}>{t('sandbox.returnToHand')}</span>
        </div>
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.85)' }} onClick={onClose}>
      <div className="relative w-full max-w-2xl max-h-[85vh] mx-3 overflow-hidden flex flex-col rounded-lg"
        style={{ backgroundColor: '#111', border: '1px solid #333' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #262626' }}>
          <div>
            <span className="text-xs uppercase tracking-wider font-bold" style={{ color: '#c4a35a' }}>{title}</span>
            {subtitle && <p className="text-[10px] mt-0.5" style={{ color: '#666' }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-xs px-2 py-1" style={{ color: '#888', border: '1px solid #333' }}>
            {t('sandbox.close')}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {!hasAnyChars ? (
            <p className="text-center text-xs py-8" style={{ color: '#666' }}>{t('sandbox.noCharsOnBoard')}</p>
          ) : (
            missions.map((m, mi) => {
              const allChars = [...m.player1Characters, ...m.player2Characters];
              if (allChars.length === 0) return null;
              return (
                <div key={mi} className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold px-1.5 py-0.5" style={{
                      backgroundColor: 'rgba(196,163,90,0.15)', color: '#c4a35a',
                    }}>Mission {rankLabels[mi] || mi + 1}</span>
                    <span className="text-[10px]" style={{ color: '#666' }}>
                      {getCardName(m.card, locale as 'en' | 'fr')}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {allChars.map((c) => renderChar(c, mi))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

/** Modal for moving a character between missions */
function MoveCharacterModal({
  onMove,
  onClose,
}: {
  onMove: (fromMission: number, instanceId: string, toMission: number) => void;
  onClose: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const visibleState = useGameStore((s) => s.visibleState);
  const [selected, setSelected] = useState<{ missionIdx: number; instanceId: string; name: string } | null>(null);

  if (!visibleState) return null;

  const missions = visibleState.activeMissions;
  const rankLabels = ['D', 'C', 'B', 'A'];

  if (selected) {
    // Step 2: choose destination mission
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.85)' }} onClick={onClose}>
        <div className="relative w-full max-w-md max-h-[60vh] mx-3 overflow-hidden flex flex-col rounded-lg"
          style={{ backgroundColor: '#111', border: '1px solid #333' }} onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #262626' }}>
            <div>
              <span className="text-xs uppercase tracking-wider font-bold" style={{ color: '#c4a35a' }}>
                {t('sandbox.moveTo')}
              </span>
              <p className="text-[10px] mt-0.5" style={{ color: '#888' }}>{selected.name}</p>
            </div>
            <button onClick={() => setSelected(null)} className="text-xs px-2 py-1" style={{ color: '#888', border: '1px solid #333' }}>
              {t('common.back')}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <div className="flex flex-col gap-2">
              {missions.map((m, mi) => {
                if (mi === selected.missionIdx) return null;
                return (
                  <button key={mi} onClick={() => { onMove(selected.missionIdx, selected.instanceId, mi); onClose(); }}
                    className="flex items-center gap-3 px-3 py-2 text-left"
                    style={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}>
                    <span className="text-[10px] font-bold px-1.5 py-0.5" style={{
                      backgroundColor: 'rgba(196,163,90,0.15)', color: '#c4a35a',
                    }}>{rankLabels[mi] || mi + 1}</span>
                    <span className="text-xs" style={{ color: '#ccc' }}>
                      {getCardName(m.card, locale as 'en' | 'fr')}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step 1: select a character to move
  const hasAnyChars = missions.some((m) =>
    m.player1Characters.length > 0 || m.player2Characters.length > 0
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.85)' }} onClick={onClose}>
      <div className="relative w-full max-w-2xl max-h-[85vh] mx-3 overflow-hidden flex flex-col rounded-lg"
        style={{ backgroundColor: '#111', border: '1px solid #333' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #262626' }}>
          <div>
            <span className="text-xs uppercase tracking-wider font-bold" style={{ color: '#c4a35a' }}>
              {t('sandbox.moveChar')}
            </span>
            <p className="text-[10px] mt-0.5" style={{ color: '#666' }}>{t('sandbox.selectCharToMove')}</p>
          </div>
          <button onClick={onClose} className="text-xs px-2 py-1" style={{ color: '#888', border: '1px solid #333' }}>
            {t('sandbox.close')}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {!hasAnyChars ? (
            <p className="text-center text-xs py-8" style={{ color: '#666' }}>{t('sandbox.noCharsOnBoard')}</p>
          ) : (
            missions.map((m, mi) => {
              const allChars = [...m.player1Characters, ...m.player2Characters];
              if (allChars.length === 0) return null;
              return (
                <div key={mi} className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold px-1.5 py-0.5" style={{
                      backgroundColor: 'rgba(196,163,90,0.15)', color: '#c4a35a',
                    }}>Mission {rankLabels[mi] || mi + 1}</span>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {allChars.map((char) => {
                      if (!char.card) return null;
                      const imgPath = normalizeImagePath(char.card.image_file);
                      return (
                        <button key={char.instanceId}
                          onClick={() => setSelected({ missionIdx: mi, instanceId: char.instanceId, name: getCardName(char.card!, locale as 'en' | 'fr') })}
                          className="group relative w-full overflow-hidden"
                          style={{ aspectRatio: '63/88', backgroundColor: '#1a1a1a', border: '1px solid #333' }}>
                          {imgPath && !char.isHidden ? (
                            <img src={imgPath} alt="" className="w-full h-full" style={{ objectFit: 'cover' }} draggable={false} />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <span className="text-[7px] text-center px-0.5" style={{ color: '#666' }}>
                                {getCardName(char.card, locale as 'en' | 'fr')}
                              </span>
                            </div>
                          )}
                          <span className="absolute bottom-0 left-0 right-0 text-[7px] text-center truncate px-0.5"
                            style={{ backgroundColor: 'rgba(0,0,0,0.8)', color: '#ccc' }}>
                            {getCardName(char.card, locale as 'en' | 'fr')}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function DeckCardItem({
  card,
  index,
  showIndex,
  onClick,
}: {
  card: CharacterCard;
  index: number;
  showIndex: boolean;
  onClick: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const zoomCard = useUIStore((s) => s.zoomCard);
  const imagePath = normalizeImagePath(card.image_file);

  return (
    <button
      onClick={onClick}
      className="group relative w-full overflow-hidden transition-transform hover:scale-105"
      style={{
        aspectRatio: '63/88',
        backgroundColor: '#1a1a1a',
        border: '1px solid #333',
      }}
    >
      {imagePath ? (
        <img
          src={imagePath}
          alt={card.name_en || card.name_fr}
          className="w-full h-full"
          style={{ objectFit: 'cover' }}
          draggable={false}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <span className="text-[8px] text-center px-1" style={{ color: '#666' }}>
            {getCardName(card, locale as 'en' | 'fr')}
          </span>
        </div>
      )}
      {showIndex && (
        <span
          className="absolute top-0 left-0 text-[8px] font-bold px-1"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)', color: '#c4a35a' }}
        >
          {index + 1}
        </span>
      )}
      <span
        className="absolute bottom-0 left-0 right-0 text-[7px] text-center truncate px-0.5"
        style={{ backgroundColor: 'rgba(0,0,0,0.8)', color: '#ccc' }}
      >
        {card.name_en || card.name_fr}
      </span>
      <span
        onClick={(e) => { e.stopPropagation(); zoomCard(card); }}
        className="absolute top-0 right-0 rounded-bl px-1 py-px text-[7px] font-bold cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ backgroundColor: 'rgba(0,0,0,0.85)', color: '#c4a35a', border: '1px solid rgba(196,163,90,0.3)' }}
      >
        {t('game.board.details')}
      </span>
    </button>
  );
}
