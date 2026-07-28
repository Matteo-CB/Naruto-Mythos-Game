'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations, useLocale } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { getCharacterById, getMissionById } from '@/lib/data/cardIndex';
import { normalizeImagePath , portraitImagePath } from '@/lib/utils/imagePath';
import { getCardName } from '@/lib/utils/cardLocale';
import { exportDeckAsImage } from '@/lib/utils/exportDeckImage';
import { trackUiHook } from '@/lib/hooks/useTrackUi';
import { Z_APP_MODAL } from '@/lib/ui/zIndex';
import { useRouter } from '@/lib/i18n/navigation';
import { PostDeckButton } from '@/components/social/PostDeckButton';
import { DeckPublicToggle } from '@/components/profile/DeckPublicToggle';

interface Props {
  deck: { id: string; name: string; cardIds: string[]; missionIds: string[] };
  ownerName?: string;
  isAdminView?: boolean;
  isOwner?: boolean;
  deckIsPublic?: boolean;
  onClose: () => void;
}

const CARD_CLIP = 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)';

export default function DeckViewerModal({ deck, ownerName, isAdminView, isOwner, deckIsPublic, onClose }: Props) {
  const t = useTranslations('profile');
  const tb = useTranslations('deckBuilder');
  const tm = useTranslations('deckManager');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const characters = useMemo(() => {
    const counts = new Map<string, number>();
    for (const id of deck.cardIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    return Array.from(counts.entries())
      .map(([id, qty]) => ({ card: getCharacterById(id), qty }))
      .filter((e): e is { card: NonNullable<ReturnType<typeof getCharacterById>>; qty: number } => e.card != null)
      .sort((a, b) => {
        const c = (a.card.chakra ?? 0) - (b.card.chakra ?? 0);
        if (c !== 0) return c;
        return getCardName(a.card, locale).localeCompare(getCardName(b.card, locale));
      });
  }, [deck.cardIds, locale]);

  const missions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const id of deck.missionIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    return Array.from(counts.entries())
      .map(([id, qty]) => ({ card: getMissionById(id), qty }))
      .filter((e): e is { card: NonNullable<ReturnType<typeof getMissionById>>; qty: number } => e.card != null);
  }, [deck.missionIds]);

  const totalCards = deck.cardIds.length;

  const handleExportImage = async () => {
    setExporting(true);
    try {
      const chars = deck.cardIds
        .map((id) => getCharacterById(id))
        .filter((c): c is NonNullable<typeof c> => c != null);
      const miss = deck.missionIds
        .map((id) => getMissionById(id))
        .filter((m): m is NonNullable<typeof m> => m != null);
      await exportDeckAsImage(deck.name, chars, miss);
      trackUiHook('deck.exported');
    } catch {
      /* ignore */
    } finally {
      setExporting(false);
    }
  };

  const buildDeckCode = () => {
    const counts = new Map<string, number>();
    for (const id of deck.cardIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    for (const id of deck.missionIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    const parts: string[] = [];
    for (const [id, qty] of counts) parts.push(`${id}--${qty}`);
    parts.push((deck.name || 'Deck').replace(/\s+/g, '_'));
    return parts.join('|');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(buildDeckCode()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      trackUiHook('deck.exported');
    }).catch(() => {});
  };

  const handleUseDeck = () => {
    try { sessionStorage.setItem('importDeckCode', buildDeckCode()); } catch { /* ignore */ }
    onClose();
    router.push('/deck-builder' as '/');
  };

  const content = (
    <div
      className="fixed inset-0 flex items-center justify-center p-3 sm:p-6"
      style={{ zIndex: Z_APP_MODAL, backgroundColor: 'rgba(4, 4, 8, 0.85)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="relative flex flex-col w-full max-w-3xl max-h-[90vh]"
        style={{ backgroundColor: '#0c0b10', boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="min-w-0">
            <h2 className="font-display text-lg truncate" style={{ color: '#e8e6df', letterSpacing: '0.03em' }}>
              {deck.name}
            </h2>
            <p className="font-inter-force text-[11px] mt-0.5" style={{ color: '#666' }}>
              {totalCards} {tm('cards')} + {missions.length} missions
              {isAdminView && ownerName ? ` · ${t('deckOf', { name: ownerName })}` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="font-display text-[11px] uppercase tracking-widest shrink-0 px-3 py-1.5 cursor-pointer transition-colors hover:text-[#c4a35a]"
            style={{ color: '#888' }}
          >
            {tc('close')}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))' }}
          >
            {characters.map(({ card, qty }) => (
              <div key={card.id} className="relative overflow-hidden" style={{ aspectRatio: '5/7', clipPath: CARD_CLIP, backgroundColor: '#050508' }} title={getCardName(card, locale)}>
                {card.image_file
                  ? <img src={portraitImagePath(card) ?? undefined} alt={getCardName(card, locale)} className="w-full h-full object-cover" draggable={false} />
                  : <div className="w-full h-full flex items-center justify-center text-[8px] text-center px-1" style={{ color: '#777' }}>{getCardName(card, locale)}</div>}
                {qty > 1 && (
                  <span
                    className="absolute bottom-0.5 right-0.5 font-display text-[10px] tabular-nums px-1.5 py-0.5"
                    style={{ backgroundColor: 'rgba(4,4,8,0.9)', color: '#c4a35a' }}
                  >
                    x{qty}
                  </span>
                )}
              </div>
            ))}
          </div>

          {missions.length > 0 && (
            <>
              <p className="font-display text-[11px] uppercase tracking-widest mt-5 mb-2" style={{ color: '#666' }}>
                Missions
              </p>
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
                {missions.map(({ card, qty }) => (
                  <div key={card.id} className="relative" style={{ aspectRatio: '7/5', clipPath: CARD_CLIP, backgroundColor: '#050508' }} title={getCardName(card, locale)}>
                    {card.image_file
                      ? <img src={portraitImagePath(card) ?? undefined} alt={getCardName(card, locale)} className="w-full h-full object-cover" draggable={false} />
                      : <div className="w-full h-full flex items-center justify-center text-[9px] text-center px-1" style={{ color: '#777' }}>{getCardName(card, locale)}</div>}
                    {qty > 1 && (
                      <span
                        className="absolute bottom-0.5 right-0.5 font-display text-[10px] tabular-nums px-1.5 py-0.5"
                        style={{ backgroundColor: 'rgba(4,4,8,0.9)', color: '#c4a35a' }}
                      >
                        x{qty}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {isOwner && (
            <div className="flex flex-wrap items-center gap-2 mr-auto">
              <PostDeckButton deckId={deck.id} />
              <DeckPublicToggle deckId={deck.id} initialPublic={deckIsPublic === true} />
            </div>
          )}
          <button
            onClick={handleUseDeck}
            className="font-display px-4 py-2 text-[11px] uppercase tracking-widest cursor-pointer transition-colors"
            style={{ backgroundColor: '#c4a35a', color: '#0a0a0a' }}
          >
            {tb('useDeck')}
          </button>
          <button
            onClick={handleCopy}
            className="font-display px-4 py-2 text-[11px] uppercase tracking-widest cursor-pointer transition-colors"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: copied ? '#5fb05f' : '#ccc' }}
          >
            {copied ? tb('exportCopied') : tb('exportAsText')}
          </button>
          <button
            onClick={handleExportImage}
            disabled={exporting}
            className="font-display px-4 py-2 text-[11px] uppercase tracking-widest cursor-pointer transition-colors disabled:opacity-40"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: '#ccc' }}
          >
            {exporting ? tc('loading') : tb('exportAsImage')}
          </button>
        </div>
      </motion.div>
    </div>
  );

  return createPortal(<AnimatePresence>{content}</AnimatePresence>, document.body);
}
