'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Z_APP_MODAL } from '@/lib/ui/zIndex';

const ROWS: Array<{ btn: string; key: string }> = [
  { btn: 'A', key: 'select' },
  { btn: 'B', key: 'back' },
  { btn: '↑↓←→', key: 'move' },
  { btn: 'LB / RB', key: 'page' },
  { btn: 'LT / RT', key: 'scroll' },
  { btn: 'Start', key: 'help' },
];

export function GamepadHelpOverlay({ onClose }: { onClose: () => void }) {
  const t = useTranslations('gamepad');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      data-gp-layer="true"
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: Z_APP_MODAL, backgroundColor: 'rgba(4,4,8,0.86)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col w-full max-w-sm p-5"
        style={{ backgroundColor: 'var(--t-surface-2)', boxShadow: '0 24px 60px var(--t-shadow)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-base uppercase tracking-widest" style={{ color: 'var(--t-accent)' }}>
            {t('title')}
          </h2>
          <button
            data-gp-back="true"
            onClick={onClose}
            className="font-display text-[11px] uppercase tracking-widest px-3 py-1.5 cursor-pointer"
            style={{ color: 'var(--t-muted)' }}
          >
            {t('close')}
          </button>
        </div>
        <div className="flex flex-col">
          {ROWS.map((r, i) => (
            <div
              key={r.key}
              className="flex items-center justify-between py-2.5"
              style={{ borderBottom: i < ROWS.length - 1 ? '1px solid var(--t-divider)' : 'none' }}
            >
              <span
                className="font-display text-xs tabular-nums px-2.5 py-1"
                style={{ backgroundColor: 'var(--t-accent-glow)', color: '#e8d9b0', minWidth: 64, textAlign: 'center' }}
              >
                {r.btn}
              </span>
              <span className="font-body text-sm text-right" style={{ color: '#cfcabb' }}>
                {t(`action.${r.key}`)}
              </span>
            </div>
          ))}
        </div>
        <p className="font-body text-[11px] mt-4" style={{ color: 'var(--t-dim)' }}>
          {t('hint')}
        </p>
      </div>
    </div>
  );
}
