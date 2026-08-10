'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { Z_APP_MODAL } from '@/lib/ui/zIndex';

interface Props {
  actual: number;
  label?: string;
  hasModifier?: boolean;
  color?: string;
  fontSize?: number | string;
}

export function ManualGuess({ actual, label, hasModifier, color = '#e0e0e0', fontSize }: Props) {
  const t = useTranslations('manualMode');
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [guess, setGuess] = useState('');
  const [result, setResult] = useState<null | { correct: boolean }>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function openPopup(e: React.MouseEvent | React.KeyboardEvent) {
    e.stopPropagation();
    if (result) {
      setResult(null);
      setGuess('');
      return;
    }
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.top });
    setOpen(true);
  }

  function submit() {
    const g = parseInt(guess, 10);
    if (Number.isNaN(g)) return;
    setResult({ correct: g === actual });
    setOpen(false);
  }

  const shownColor = result ? (result.correct ? '#5ac47a' : '#d97676') : color;

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        onClick={openPopup}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openPopup(e); }}
        title={t('clickToGuess')}
        style={{
          cursor: 'pointer',
          color: shownColor,
          fontSize,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 2,
          lineHeight: 1,
        }}
      >
        {result ? actual : (
          hasModifier
            ? <span className="animate-pulse" title={t('hasModifier')}>?</span>
            : '?'
        )}
        {result && (
          <span aria-hidden="true" style={{ fontSize: '0.75em' }}>{result.correct ? '✓' : '✗'}</span>
        )}
      </span>

      {open && createPortal(
        <div
          className="fixed inset-0"
          style={{ zIndex: Z_APP_MODAL }}
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="fixed flex flex-col gap-2 p-3"
            style={{
              left: Math.min(Math.max(pos.x - 90, 8), (typeof window !== 'undefined' ? window.innerWidth : 400) - 188),
              top: Math.max(pos.y - 96, 8),
              width: 180,
              backgroundColor: '#141414',
              boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
            }}
          >
            <span className="text-[10px] uppercase tracking-widest" style={{ color: '#c4a35a' }}>
              {label ?? t('yourGuess')}
            </span>
            <input
              ref={inputRef}
              type="number"
              inputMode="numeric"
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setOpen(false); }}
              className="w-full px-2 py-1.5 text-sm tabular-nums"
              style={{ backgroundColor: '#0a0a0a', color: '#e8e8e8', border: '1px solid #333' }}
            />
            <button
              type="button"
              onClick={submit}
              className="w-full py-1.5 text-xs font-bold uppercase tracking-widest"
              style={{ backgroundColor: '#c4a35a', color: '#0a0a0a', cursor: 'pointer' }}
            >
              {t('check')}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
