'use client';

import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Z_APP_MODAL } from '@/lib/ui/zIndex';
import { MAX_TILES, isTileSelectable, type LiveMatch } from '@/lib/spectate/tileSelection';

interface Props {
  open: boolean;
  matches: LiveMatch[];
  selected: string[];
  onToggle: (roomCode: string) => void;
  onClose: () => void;
  mounted: boolean;
}

export function SpectateTilePicker({ open, matches, selected, onToggle, onClose, mounted }: Props) {
  const t = useTranslations('tournamentSpectate');

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0"
            style={{ zIndex: Z_APP_MODAL - 1, backgroundColor: 'rgba(0,0,0,0.6)' }}
          />
          <motion.aside
            initial={{ x: 60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed inset-y-0 right-0 flex w-full flex-col sm:w-[400px]"
            style={{
              zIndex: Z_APP_MODAL,
              backgroundColor: 'rgba(8,8,12,0.98)',
              boxShadow: '-12px 0 48px rgba(0,0,0,0.6)',
            }}
          >
            <header
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: '1px solid rgba(196,163,90,0.12)' }}
            >
              <div>
                <h2 className="text-[13px] uppercase tracking-[0.18em] text-[#c4a35a]">{t('panelTitle')}</h2>
                <p className="mt-1 text-[11px] text-[#8a8a8a]">
                  {t('selectedCount', { count: selected.length, max: MAX_TILES })}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t('closePanel')}
                data-gp="true"
                className="px-3 py-2 text-[16px] text-[#8a8a8a] hover:text-[#e8e8e8]"
              >
                X
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {matches.length === 0 && (
                <p className="px-1 py-6 text-center text-[12px] text-[#8a8a8a]">{t('noLiveMatches')}</p>
              )}

              <ul className="flex flex-col gap-2">
                {matches.map((match) => {
                  const isSelected = selected.includes(match.roomCode);
                  const selectable = isTileSelectable(selected, match.roomCode);
                  return (
                    <li key={match.roomCode}>
                      <button
                        type="button"
                        disabled={!selectable}
                        onClick={() => onToggle(match.roomCode)}
                        data-gp={selectable ? 'true' : undefined}
                        className="w-full px-4 py-3 text-left"
                        style={{
                          backgroundColor: isSelected ? 'rgba(196,163,90,0.12)' : 'rgba(255,255,255,0.02)',
                          color: isSelected ? '#c4a35a' : '#e8e8e8',
                          opacity: selectable ? 1 : 0.4,
                          cursor: selectable ? 'pointer' : 'not-allowed',
                          borderRadius: '4px',
                          boxShadow: isSelected ? '0 0 12px rgba(196,163,90,0.22)' : 'none',
                        }}
                      >
                        <span className="block text-[13px]">
                          {match.player1Name} {t('versus')} {match.player2Name}
                        </span>
                        <span className="mt-1 block text-[11px] text-[#8a8a8a]">
                          {t('roundState', { turn: match.turn })}
                          {match.spectatorCount > 0 && ` · ${t('watching', { count: match.spectatorCount })}`}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
