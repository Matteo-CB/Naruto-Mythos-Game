'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';

export type LeaderboardMode = 'ranked' | 'evolving';

interface LeaderboardModeSwitchProps {
  value: LeaderboardMode;
  onChange: (mode: LeaderboardMode) => void;
  layoutId?: string;
  size?: 'sm' | 'md';
}

export function LeaderboardModeSwitch({
  value,
  onChange,
  layoutId = 'leaderboard-pill',
  size = 'md',
}: LeaderboardModeSwitchProps) {
  const t = useTranslations();
  const labelSize = size === 'sm' ? 'text-[9px]' : 'text-[10px]';
  const padX = size === 'sm' ? 'px-2.5' : 'px-3.5';
  const padY = size === 'sm' ? 'py-1.5' : 'py-2';
  const minHeight = size === 'sm' ? 32 : 36;

  return (
    <div
      className="relative inline-flex items-center"
      style={{
        backgroundColor: 'rgba(8, 8, 14, 0.6)',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)',
      }}
    >
      {(['ranked', 'evolving'] as LeaderboardMode[]).map((mode) => {
        const active = value === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            className={`relative ${padX} ${padY} font-bold uppercase ${labelSize} cursor-pointer no-select`}
            style={{
              letterSpacing: '0.18em',
              color: active ? '#e8e8e8' : '#5a5a5a',
              transition: 'color 0.2s',
              background: 'transparent',
              minHeight,
            }}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0"
                style={{
                  backgroundColor: 'rgba(196, 163, 90, 0.18)',
                  boxShadow: 'inset 0 -2px 0 #c4a35a',
                  pointerEvents: 'none',
                }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <span className="relative" style={{ zIndex: 1 }}>
              {t(`online.leaderboard.${mode}`)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
