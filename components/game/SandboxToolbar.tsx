'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';
import { useUIStore } from '@/stores/uiStore';
import { normalizeImagePath } from '@/lib/utils/imagePath';
import { getCardName } from '@/lib/utils/cardLocale';
import type { CharacterCard } from '@/lib/engine/types';

type SandboxModal = 'none' | 'draw' | 'viewDeck';

export function SandboxToolbar() {
  const t = useTranslations();
  const isSandboxMode = useGameStore((s) => s.isSandboxMode);
  const visibleState = useGameStore((s) => s.visibleState);
  const sandboxDrawCard = useGameStore((s) => s.sandboxDrawCard);
  const sandboxAddChakra = useGameStore((s) => s.sandboxAddChakra);
  const sandboxMoveToTopDeck = useGameStore((s) => s.sandboxMoveToTopDeck);
  const [modal, setModal] = useState<SandboxModal>('none');

  if (!isSandboxMode || !visibleState) return null;

  const deck = visibleState.myState.deck;

  return (
    <>
      {/* Toolbar */}
      <div
        className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-center gap-2 py-1.5 px-3"
        style={{
          backgroundColor: 'rgba(17, 17, 17, 0.95)',
          borderBottom: '1px solid #262626',
        }}
      >
        <span className="text-[10px] uppercase tracking-wider font-bold mr-2" style={{ color: '#c4a35a' }}>
          {t('hotseat.modeFree')}
        </span>

        <ToolbarButton label={t('sandbox.addChakra')} onClick={() => sandboxAddChakra(5)} />
        <ToolbarButton label={t('sandbox.drawCard')} onClick={() => setModal('draw')} />
        <ToolbarButton label={t('sandbox.viewDeck')} onClick={() => setModal('viewDeck')} />
      </div>

      {/* Modal */}
      {modal !== 'none' && (
        <DeckModal
          modal={modal}
          deck={deck}
          onDraw={(idx) => { sandboxDrawCard(idx); setModal('none'); }}
          onMoveToTop={(idx) => { sandboxMoveToTopDeck(idx); setModal('none'); }}
          onClose={() => setModal('none')}
        />
      )}
    </>
  );
}

function ToolbarButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 text-[10px] uppercase tracking-wider font-medium transition-colors"
      style={{
        backgroundColor: '#1a1a1a',
        border: '1px solid #333',
        color: '#ccc',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = '#c4a35a';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = '#333';
      }}
    >
      {label}
    </button>
  );
}

function DeckModal({
  modal,
  deck,
  onDraw,
  onMoveToTop,
  onClose,
}: {
  modal: 'draw' | 'viewDeck';
  deck: CharacterCard[];
  onDraw: (idx: number) => void;
  onMoveToTop: (idx: number) => void;
  onClose: () => void;
}) {
  const t = useTranslations();
  const isDraw = modal === 'draw';
  const title = isDraw ? t('sandbox.drawCard') : t('sandbox.deckOrder');

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg max-h-[80vh] mx-4 overflow-hidden flex flex-col"
        style={{
          backgroundColor: '#111',
          border: '1px solid #333',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #262626' }}>
          <span className="text-xs uppercase tracking-wider font-bold" style={{ color: '#c4a35a' }}>
            {title}
          </span>
          <button
            onClick={onClose}
            className="text-xs px-2 py-1 transition-colors"
            style={{ color: '#888', border: '1px solid #333' }}
          >
            {t('sandbox.close')}
          </button>
        </div>

        {!isDraw && (
          <div className="px-4 py-1.5" style={{ color: '#666' }}>
            <span className="text-[10px]">{t('sandbox.clickToMoveTop')}</span>
          </div>
        )}

        {/* Card grid */}
        <div className="flex-1 overflow-y-auto p-3">
          {deck.length === 0 ? (
            <p className="text-center text-xs py-8" style={{ color: '#666' }}>
              {t('sandbox.emptyDeck')}
            </p>
          ) : (
            <div className="grid grid-cols-5 gap-2">
              {deck.map((card, idx) => (
                <DeckCardItem
                  key={`${card.id}-${idx}`}
                  card={card}
                  index={idx}
                  showIndex={!isDraw}
                  onClick={() => isDraw ? onDraw(idx) : onMoveToTop(idx)}
                />
              ))}
            </div>
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

      {/* Details button */}
      <span
        onClick={(e) => { e.stopPropagation(); zoomCard(card); }}
        className="absolute top-0 right-0 rounded-bl px-1 py-px text-[7px] font-bold cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
        style={{
          backgroundColor: 'rgba(0,0,0,0.85)',
          color: '#c4a35a',
          border: '1px solid rgba(196,163,90,0.3)',
        }}
      >
        {t('game.board.details')}
      </span>
    </button>
  );
}
