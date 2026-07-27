'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  DEFAULT_BOARD_PALETTE,
  isLowContrastOnBoard,
  normalizeHexColor,
  resolveBoardPalette,
  type BoardSide,
  type StoredBoardPalette,
  type StoredSidePalette,
} from '@/lib/game/boardPalette';
import { BoardBackgroundPicker } from './BoardBackgroundPicker';

const BoardColorPreview = dynamic(
  () => import('./BoardColorPreview').then((mod) => mod.BoardColorPreview),
  { ssr: false },
);

type PaletteToken = 'primary' | 'bright';

const SIDES: BoardSide[] = ['me', 'opponent'];

function setToken(
  draft: StoredBoardPalette | null,
  side: BoardSide,
  token: PaletteToken,
  value: string | null,
): StoredBoardPalette | null {
  const next: StoredBoardPalette = {
    me: { ...(draft?.me ?? {}) },
    opponent: { ...(draft?.opponent ?? {}) },
  };
  const target = next[side] as StoredSidePalette;
  if (value === null) delete target[token];
  else target[token] = value;
  for (const s of SIDES) {
    if (next[s] && Object.keys(next[s] as StoredSidePalette).length === 0) delete next[s];
  }
  return Object.keys(next).length === 0 ? null : next;
}

function ColorField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  disabled: boolean;
}) {
  const t = useTranslations('settings');
  const [text, setText] = useState(value);
  const [invalid, setInvalid] = useState(false);
  const [syncedValue, setSyncedValue] = useState(value);

  if (value !== syncedValue) {
    setSyncedValue(value);
    setText(value);
    setInvalid(false);
  }

  const commitText = () => {
    const normalized = normalizeHexColor(text);
    if (!normalized) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setText(normalized);
    onChange(normalized);
  };

  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <span className="text-[11px] font-medium tracking-wide" style={{ color: '#999999' }}>
        {label}
      </span>
      <div className="flex items-center gap-2 min-w-0">
        <input
          type="color"
          aria-label={label}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          style={{
            width: 40,
            height: 32,
            padding: 0,
            backgroundColor: 'transparent',
            border: '1px solid #333333',
            cursor: disabled ? 'default' : 'pointer',
            flexShrink: 0,
          }}
        />
        <input
          type="text"
          inputMode="text"
          spellCheck={false}
          maxLength={7}
          aria-label={label}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => { if (e.key === 'Enter') commitText(); }}
          className="min-w-0 flex-1 px-2 py-1.5 text-[12px] tabular-nums"
          style={{
            backgroundColor: '#0d0d0d',
            border: '1px solid #333333',
            color: '#e0e0e0',
            outline: 'none',
          }}
        />
      </div>
      {invalid && (
        <span className="text-[11px] tracking-wide" style={{ color: '#d97676' }}>
          {t('boardColorsInvalidHex')}
        </span>
      )}
    </div>
  );
}

export function BoardColorsSection() {
  const t = useTranslations('settings');
  const isLoaded = useSettingsStore((s) => s.isLoaded);
  const storedPalette = useSettingsStore((s) => s.boardPalette);
  const setBoardPalette = useSettingsStore((s) => s.setBoardPalette);

  const [advancedOpen, setAdvancedOpen] = useState(false);

  const draft = storedPalette;
  const resolved = useMemo(() => resolveBoardPalette(draft), [draft]);

  const apply = (next: StoredBoardPalette | null) => {
    setBoardPalette(next);
  };

  const updateToken = (side: BoardSide, token: PaletteToken, hex: string) => {
    const normalized = normalizeHexColor(hex);
    if (!normalized) return;
    apply(setToken(draft, side, token, normalized));
  };

  const resetSide = (side: BoardSide) => {
    let next = setToken(draft, side, 'primary', null);
    next = setToken(next, side, 'bright', null);
    apply(next);
  };

  const lowContrastSides = SIDES.filter(
    (side) => isLowContrastOnBoard(resolved[side].primary) || isLowContrastOnBoard(resolved[side].bright),
  );

  return (
    <div
      className="mt-4 flex flex-col gap-4 p-5 lg:mt-6 lg:p-6"
      style={{ backgroundColor: '#111111', border: '1px solid #262626' }}
    >
      <span className="text-sm font-medium tracking-wide" style={{ color: isLoaded ? '#e0e0e0' : '#555555' }}>
        {t('boardColors')}
      </span>
      <p className="text-xs tracking-wide" style={{ color: '#555555' }}>
        {t('boardColorsHint')}
      </p>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
        <div className="min-w-0 flex-1 flex flex-col gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.25em]" style={{ color: '#888888' }}>
            {t('boardColorsPreviewLabel')}
          </span>
          {isLoaded && <BoardColorPreview palette={resolved} />}
          <BoardBackgroundPicker />
        </div>

        <div className="min-w-0 flex flex-col gap-5 lg:w-70 lg:shrink-0">
          {SIDES.map((side) => (
            <div key={side} className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <span
                  className="px-2 py-1 text-[11px] font-bold uppercase tracking-[0.2em]"
                  style={{ backgroundColor: resolved[side].tint(0.12), color: resolved[side].primary }}
                >
                  {side === 'me' ? t('boardColorsMe') : t('boardColorsOpponent')}
                </span>
                <button
                  type="button"
                  disabled={!isLoaded}
                  onClick={() => resetSide(side)}
                  className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-40"
                  style={{ backgroundColor: 'rgba(196,163,90,0.1)', color: '#c4a35a', border: 'none' }}
                >
                  {t('boardColorsReset')}
                </button>
              </div>

              <ColorField
                label={t('boardColorsPrimary')}
                value={resolved[side].primary}
                disabled={!isLoaded}
                onChange={(hex) => updateToken(side, 'primary', hex)}
              />

              <AnimatePresence initial={false}>
                {advancedOpen && (
                  <motion.div
                    key={`advanced-${side}`}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                    style={{ overflow: 'hidden' }}
                  >
                    <ColorField
                      label={t('boardColorsBright')}
                      value={resolved[side].bright}
                      disabled={!isLoaded}
                      onChange={(hex) => updateToken(side, 'bright', hex)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="self-start px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
            style={{ backgroundColor: 'rgba(255,255,255,0.03)', color: '#888888', border: 'none' }}
          >
            {t('boardColorsAdvanced')}
          </button>

          {lowContrastSides.length > 0 && (
            <p className="text-xs tracking-wide" style={{ color: '#d9a276' }}>
              {t('boardColorsLowContrast')}
            </p>
          )}

          <button
            type="button"
            disabled={!isLoaded || draft === null}
            onClick={() => apply(null)}
            className="self-start px-4 py-2 text-[11px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-40"
            style={{ backgroundColor: 'rgba(196,163,90,0.1)', color: '#c4a35a', border: 'none' }}
          >
            {t('boardColorsResetAll')}
          </button>

          <p className="text-xs tracking-wide" style={{ color: '#555555' }}>
            {t('boardColorsDefaultsHint', {
              me: DEFAULT_BOARD_PALETTE.me.primary,
              opponent: DEFAULT_BOARD_PALETTE.opponent.primary,
            })}
          </p>
        </div>
      </div>
    </div>
  );
}
