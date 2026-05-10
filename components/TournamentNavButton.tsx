'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';

export type TournamentMenuStatus =
  | 'none'
  | 'available'
  | 'registered'
  | 'needs_deck'
  | 'in_progress';

interface Props {
  status: TournamentMenuStatus;
  label: string;
  primary?: boolean;
  delay?: number;
}

const COLORS: Record<TournamentMenuStatus, { ring: string; ember: string; glow: string; accent: string }> = {
  none: { ring: '#262626', ember: '#c4a35a', glow: 'rgba(196,163,90,0.0)', accent: '#c4a35a' },
  available: { ring: '#c4a35a', ember: '#ffd966', glow: 'rgba(196,163,90,0.45)', accent: '#c4a35a' },
  registered: { ring: '#c4a35a', ember: '#ffe28a', glow: 'rgba(196,163,90,0.55)', accent: '#c4a35a' },
  needs_deck: { ring: '#ef4444', ember: '#ff8a8a', glow: 'rgba(239,68,68,0.55)', accent: '#ef4444' },
  in_progress: { ring: '#3b82f6', ember: '#7eb6ff', glow: 'rgba(59,130,246,0.55)', accent: '#3b82f6' },
};

const PARTICLE_COUNT = 6;

export function TournamentNavButton({ status, label, primary = false, delay = 0 }: Props) {
  const t = useTranslations('home');
  const isActive = status !== 'none';
  const colors = COLORS[status];

  const baseHref = '/tournaments' as const;
  const statusLabel: string | null = (() => {
    switch (status) {
      case 'available': return t('tournamentBadgeAvailable');
      case 'registered': return t('tournamentBadgeRegistered');
      case 'needs_deck': return t('tournamentBadgeNeedsDeck');
      case 'in_progress': return t('tournamentBadgeInProgress');
      default: return null;
    }
  })();

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay, ease: 'easeOut' }}
      className="relative"
    >
      {/* Halo / radial glow */}
      {isActive && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          animate={{
            opacity: [0.55, 0.85, 0.55],
            scale: [1.0, 1.08, 1.0],
          }}
          transition={{ duration: status === 'needs_deck' ? 1.2 : 2.4, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            boxShadow: `0 0 28px ${colors.glow}, 0 0 56px ${colors.glow}`,
          }}
        />
      )}

      {/* Rotating conic-gradient sweep behind the button */}
      {isActive && (
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-px overflow-hidden"
          style={{ padding: 0 }}
        >
          <motion.span
            className="absolute inset-[-50%]"
            animate={{ rotate: 360 }}
            transition={{ duration: status === 'needs_deck' ? 4 : 7, repeat: Infinity, ease: 'linear' }}
            style={{
              background: `conic-gradient(from 0deg, transparent 0%, ${colors.ring}cc 18%, ${colors.ember}ff 25%, ${colors.ring}cc 32%, transparent 50%, transparent 100%)`,
            }}
          />
          {/* Inner mask cuts the sweep into a thin border */}
          <span
            className="absolute inset-[2px]"
            style={{ backgroundColor: '#141414' }}
          />
        </span>
      )}

      {/* The actual button */}
      <Link
        href={baseHref}
        className={`group relative flex h-10 items-center justify-center overflow-visible text-sm font-semibold tracking-wide transition-all sm:h-12 sm:text-base`}
        style={{
          backgroundColor: '#141414',
          border: isActive ? `1px solid ${colors.ring}` : (primary ? '1px solid #c4a35a' : '1px solid #262626'),
          color: isActive ? colors.accent : (primary ? '#c4a35a' : '#e0e0e0'),
        }}
        onMouseEnter={(e) => {
          const target = e.currentTarget as HTMLElement;
          target.style.transform = 'scale(1.03)';
          target.style.boxShadow = `0 0 24px ${isActive ? colors.glow : 'rgba(196, 163, 90, 0.15)'}`;
          target.style.color = isActive ? colors.accent : '#c4a35a';
          target.style.backgroundColor = '#1a1a1a';
        }}
        onMouseLeave={(e) => {
          const target = e.currentTarget as HTMLElement;
          target.style.transform = 'scale(1)';
          target.style.boxShadow = 'none';
          target.style.color = isActive ? colors.accent : (primary ? '#c4a35a' : '#e0e0e0');
          target.style.backgroundColor = '#141414';
        }}
      >
        {/* Left accent stripe */}
        <span
          className="absolute left-0 top-0 h-full w-1 transition-all"
          style={{ backgroundColor: isActive ? colors.ring : (primary ? '#c4a35a' : 'transparent') }}
        />

        {/* Orbiting embers */}
        {isActive && (
          <span aria-hidden className="pointer-events-none absolute inset-0">
            {Array.from({ length: PARTICLE_COUNT }).map((_, i) => {
              const angle = (i / PARTICLE_COUNT) * 360;
              const size = i % 2 === 0 ? 3 : 2;
              const duration = status === 'needs_deck' ? 3.2 : (5 + i * 0.4);
              const radiusY = 22; // px from center vertically
              return (
                <motion.span
                  key={i}
                  className="absolute"
                  style={{
                    top: '50%',
                    left: '50%',
                    width: size + 'px',
                    height: size + 'px',
                    borderRadius: '50%',
                    backgroundColor: colors.ember,
                    boxShadow: `0 0 8px ${colors.ember}, 0 0 14px ${colors.ember}`,
                    marginLeft: -size / 2,
                    marginTop: -size / 2,
                  }}
                  initial={{ rotate: angle }}
                  animate={{
                    rotate: angle + 360,
                  }}
                  transition={{ duration, repeat: Infinity, ease: 'linear' }}
                >
                  <span
                    className="absolute"
                    style={{
                      width: size + 'px',
                      height: size + 'px',
                      borderRadius: '50%',
                      backgroundColor: colors.ember,
                      transform: `translate(0, -${radiusY}px) scaleX(${i % 2 === 0 ? 8 : 5})`,
                      transformOrigin: 'center',
                    }}
                  />
                </motion.span>
              );
            })}
          </span>
        )}

        {/* Subtle sweep highlight (tiny diagonal gleam that crosses the button periodically) */}
        {isActive && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute top-0 bottom-0"
            initial={{ x: '-30%' }}
            animate={{ x: '130%' }}
            transition={{ duration: 2.6, repeat: Infinity, repeatDelay: 1.4, ease: 'easeInOut' }}
            style={{
              width: '24%',
              background: `linear-gradient(105deg, transparent 0%, ${colors.ember}33 50%, transparent 100%)`,
              filter: 'blur(2px)',
            }}
          />
        )}

        <span className="relative z-10 flex items-center gap-2">
          {label}
          {statusLabel && (
            <span
              className="hidden sm:inline px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em]"
              style={{
                color: colors.accent,
                backgroundColor: `${colors.ring}1a`,
                border: `1px solid ${colors.ring}55`,
                borderRadius: '2px',
              }}
            >
              {statusLabel}
            </span>
          )}
        </span>

        {/* Indicator dot top-right (urgent ! when needs_deck) */}
        {isActive && (
          <span className="relative ml-2 flex items-center justify-center">
            <motion.span
              aria-hidden
              className="absolute inline-flex rounded-full"
              animate={{
                scale: [1, 1.6, 1],
                opacity: [0.7, 0.0, 0.7],
              }}
              transition={{ duration: status === 'needs_deck' ? 1.0 : 1.8, repeat: Infinity, ease: 'easeOut' }}
              style={{
                width: '12px',
                height: '12px',
                backgroundColor: colors.ring,
              }}
            />
            <span
              className="relative inline-flex h-2.5 w-2.5 rounded-full items-center justify-center"
              style={{
                backgroundColor: colors.ring,
                boxShadow: `0 0 8px ${colors.glow}, 0 0 18px ${colors.glow}`,
              }}
            >
              {status === 'needs_deck' && (
                <span className="text-[6px] font-black" style={{ color: '#fff' }}>!</span>
              )}
            </span>
          </span>
        )}
      </Link>
    </motion.div>
  );
}
