'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';

// ============================================================
// Shared popup primitives for all effect/confirm overlays.
// Design: angular corner brackets, chakra-line titles,
// skewed action buttons, text-link dismissals.
// ============================================================

// ----- Fullscreen backdrop -----

export function PopupOverlay({
  children,
  onClickBg,
}: {
  children: React.ReactNode;
  onClickBg?: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      onClick={onClickBg}
      style={{
        backgroundColor: 'rgba(4, 4, 8, 0.92)',
        // Subtle layered depth without CSS gradients — just overlapping shadows
        boxShadow: 'inset 0 0 200px 60px rgba(0,0,0,0.4)',
        overflow: 'hidden',
      }}
    >
      {children}
    </motion.div>
  );
}

// ----- Corner-bracket frame -----
// Four L-shaped corner accents around the content area.

const CORNER_SIZE = 24;
const CORNER_THICKNESS = 2;

function Corner({
  position,
  color,
}: {
  position: 'tl' | 'tr' | 'bl' | 'br';
  color: string;
}) {
  const isTop = position.startsWith('t');
  const isLeft = position.endsWith('l');

  return (
    <div
      style={{
        position: 'absolute',
        top: isTop ? -1 : undefined,
        bottom: !isTop ? -1 : undefined,
        left: isLeft ? -1 : undefined,
        right: !isLeft ? -1 : undefined,
        width: CORNER_SIZE + 'px',
        height: CORNER_SIZE + 'px',
        pointerEvents: 'none',
        borderTop: isTop ? `${CORNER_THICKNESS}px solid ${color}` : 'none',
        borderBottom: !isTop ? `${CORNER_THICKNESS}px solid ${color}` : 'none',
        borderLeft: isLeft ? `${CORNER_THICKNESS}px solid ${color}` : 'none',
        borderRight: !isLeft ? `${CORNER_THICKNESS}px solid ${color}` : 'none',
      }}
    />
  );
}

export function PopupCornerFrame({
  children,
  accentColor = 'rgba(196, 163, 90, 0.45)',
  maxWidth = '560px',
  padding = '32px 28px',
  className = '',
  backgroundColor = 'rgba(8, 8, 14, 0.85)',
  fitContent = false,
}: {
  children: React.ReactNode;
  accentColor?: string;
  maxWidth?: string;
  padding?: string;
  className?: string;
  backgroundColor?: string;
  fitContent?: boolean;
}) {
  return (
    <motion.div
      initial={{ scale: 0.96, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.05 }}
      className={`relative ${className}`}
      style={{
        maxWidth: `min(${maxWidth}, calc(100vw - 24px))`,
        width: fitContent ? 'fit-content' : '90vw',
        minWidth: fitContent ? '220px' : undefined,
        padding,
        boxSizing: 'border-box' as const,
        backgroundColor,
        boxShadow: '0 12px 48px rgba(0,0,0,0.6), 0 0 1px rgba(255,255,255,0.04)',
      }}
    >
      <Corner position="tl" color={accentColor} />
      <Corner position="tr" color={accentColor} />
      <Corner position="bl" color={accentColor} />
      <Corner position="br" color={accentColor} />
      {children}
    </motion.div>
  );
}

// ----- Title with animated chakra line -----

export function PopupTitle({
  children,
  accentColor = '#c4a35a',
  size = 'lg',
}: {
  children: React.ReactNode;
  accentColor?: string;
  size?: 'md' | 'lg' | 'xl';
}) {
  const fontSizes = { md: '14px', lg: '18px', xl: '22px' };
  const lineWidths = { md: 100, lg: 160, xl: 200 };

  return (
    <div className="flex flex-col items-center gap-3 mb-5">
      <span
        className="uppercase text-center"
        style={{
          color: accentColor,
          fontSize: fontSizes[size],
          letterSpacing: '0.22em',
          textShadow: `0 0 24px ${accentColor}30`,
          lineHeight: 1.3,
        }}
      >
        {children}
      </span>
      {/* Animated chakra line — draws from center outward */}
      <svg
        width={lineWidths[size]}
        height="3"
        viewBox={`0 0 ${lineWidths[size]} 3`}
        style={{ overflow: 'visible' }}
      >
        <motion.line
          x1={lineWidths[size] / 2}
          y1="1.5"
          x2={lineWidths[size]}
          y2="1.5"
          stroke={accentColor}
          strokeWidth="1"
          strokeOpacity="0.5"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
        />
        <motion.line
          x1={lineWidths[size] / 2}
          y1="1.5"
          x2={0}
          y2="1.5"
          stroke={accentColor}
          strokeWidth="1"
          strokeOpacity="0.5"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
        />
        {/* Center diamond dot */}
        <motion.rect
          x={lineWidths[size] / 2 - 2}
          y="-0.5"
          width="4"
          height="4"
          fill={accentColor}
          style={{ transformOrigin: 'center', transform: 'rotate(45deg)' }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.15, type: 'spring', stiffness: 400 }}
        />
      </svg>
    </div>
  );
}

// ----- Description text -----

export function PopupDescription({
  children,
  accentColor = 'rgba(196, 163, 90, 0.4)',
}: {
  children: React.ReactNode;
  accentColor?: string;
}) {
  return (
    <motion.div
      initial={{ x: -12, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ delay: 0.12, duration: 0.35 }}
      className="mb-5 px-5 py-3"
      style={{
        borderLeft: `3px solid ${accentColor}`,
        maxWidth: 'min(480px, calc(100vw - 48px))',
      }}
    >
      <span className="font-body text-xs leading-relaxed" style={{ color: '#c8c8c8' }}>
        {children}
      </span>
    </motion.div>
  );
}

// ----- Confirm / Action button (skewed accent) -----

export function PopupActionButton({
  onClick,
  children,
  accentColor = '#c4a35a',
  disabled = false,
}: {
  onClick: () => void;
  children: React.ReactNode;
  accentColor?: string;
  disabled?: boolean;
}) {
  const bgColor = disabled ? 'rgba(40,40,40,0.6)' : `${accentColor}18`;
  const textColor = disabled ? '#555555' : accentColor;
  const borderColor = disabled ? '#333333' : accentColor;

  return (
    <motion.button
      whileHover={disabled ? {} : {
        backgroundColor: `${accentColor}dd`,
        color: '#0a0a0a',
        scale: 1.03,
      }}
      whileTap={disabled ? {} : { scale: 0.97 }}
      onClick={disabled ? undefined : onClick}
      className="relative cursor-pointer uppercase no-select"
      style={{
        padding: '10px 28px',
        backgroundColor: bgColor,
        color: textColor,
        border: 'none',
        borderLeft: `3px solid ${borderColor}`,
        fontSize: '13px',
        fontWeight: 700,
        letterSpacing: '0.14em',
        transform: 'skewX(-3deg)',
        cursor: disabled ? 'default' : 'pointer',
        boxShadow: disabled ? 'none' : `0 2px 16px ${accentColor}20`,
        transition: 'background-color 0.2s, color 0.2s',
      }}
    >
      <span style={{ display: 'inline-block', transform: 'skewX(3deg)' }}>
        {children}
      </span>
    </motion.button>
  );
}

// ----- Skip / Decline text link -----

export function PopupDismissLink({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.35 }}
      whileHover={{ opacity: 1, color: '#999999' }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="uppercase no-select cursor-pointer"
      style={{
        background: 'none',
        border: 'none',
        color: '#555555',
        fontSize: '11px',
        letterSpacing: '0.16em',
        fontWeight: 600,
        padding: '8px 16px',
        textDecoration: 'none',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        cursor: 'pointer',
      }}
    >
      {children}
    </motion.button>
  );
}

// ----- Minimized floating pill (shared) -----

export function PopupMinimizePill({
  text,
  onRestore,
}: {
  text: string;
  onRestore: () => void;
}) {
  const pillText = text.length > 40 ? text.slice(0, 37) + '...' : text;

  return (
    <motion.button
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 40, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      whileHover={{ scale: 1.05, y: -2 }}
      whileTap={{ scale: 0.97 }}
      onClick={onRestore}
      className="fixed z-50 flex items-center gap-2 no-select"
      style={{
        bottom: '14px',
        left: '50%',
        transform: 'translateX(-50%) skewX(-2deg)',
        padding: '8px 22px',
        backgroundColor: 'rgba(12, 12, 18, 0.95)',
        color: '#c4a35a',
        fontSize: '11px',
        fontWeight: 700,
        cursor: 'pointer',
        border: '1px solid rgba(196, 163, 90, 0.25)',
        borderLeft: '3px solid #c4a35a',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.5)',
        letterSpacing: '0.06em',
      }}
    >
      <span style={{ fontSize: '10px', lineHeight: 1, opacity: 0.6 }}>&#x25B2;</span>
      <span style={{ display: 'inline-block', transform: 'skewX(2deg)' }}>{pillText}</span>
    </motion.button>
  );
}

// ----- Minimize X button (top-right of popup) -----

export function PopupMinimizeX({ onClick }: { onClick: () => void }) {
  const t = useTranslations();
  return (
    <div style={{
      width: '100%',
      display: 'flex',
      justifyContent: 'flex-end',
      marginBottom: '4px',
    }}>
      <motion.button
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className="no-select"
        whileHover={{ scale: 1.12, borderColor: 'rgba(196, 163, 90, 0.8)' }}
        whileTap={{ scale: 0.88 }}
        style={{
          background: 'rgba(196, 163, 90, 0.08)',
          border: '1px solid rgba(196, 163, 90, 0.35)',
          color: '#c4a35a',
          fontSize: '13px',
          lineHeight: '1',
          cursor: 'pointer',
          fontWeight: 700,
          width: '28px',
          height: '28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: 'rotate(45deg)',
        }}
        title={t('game.board.minimize')}
      >
        <span style={{ transform: 'rotate(-45deg)', display: 'block' }}>&#x2715;</span>
      </motion.button>
    </div>
  );
}

// ----- Small corner-bracket panel (non-animated, for sidebar/HUD sections) -----

const SMALL_CORNER = 16;
const SMALL_CORNER_THICKNESS = 1;

function SmallCorner({
  position,
  color,
}: {
  position: 'tl' | 'tr' | 'bl' | 'br';
  color: string;
}) {
  const isTop = position.startsWith('t');
  const isLeft = position.endsWith('l');

  return (
    <div
      style={{
        position: 'absolute',
        top: isTop ? -1 : undefined,
        bottom: !isTop ? -1 : undefined,
        left: isLeft ? -1 : undefined,
        right: !isLeft ? -1 : undefined,
        width: SMALL_CORNER + 'px',
        height: SMALL_CORNER + 'px',
        pointerEvents: 'none',
        borderTop: isTop ? `${SMALL_CORNER_THICKNESS}px solid ${color}` : 'none',
        borderBottom: !isTop ? `${SMALL_CORNER_THICKNESS}px solid ${color}` : 'none',
        borderLeft: isLeft ? `${SMALL_CORNER_THICKNESS}px solid ${color}` : 'none',
        borderRight: !isLeft ? `${SMALL_CORNER_THICKNESS}px solid ${color}` : 'none',
      }}
    />
  );
}

export function PanelFrame({
  children,
  accentColor = 'rgba(196, 163, 90, 0.3)',
  padding = '10px 12px',
  className = '',
}: {
  children: React.ReactNode;
  accentColor?: string;
  padding?: string;
  className?: string;
}) {
  return (
    <div
      className={`relative ${className}`}
      style={{
        padding,
        backgroundColor: 'rgba(255, 255, 255, 0.02)',
      }}
    >
      <SmallCorner position="tl" color={accentColor} />
      <SmallCorner position="tr" color={accentColor} />
      <SmallCorner position="bl" color={accentColor} />
      <SmallCorner position="br" color={accentColor} />
      {children}
    </div>
  );
}

// ----- Section divider (thin line with optional center diamond) -----

export function SectionDivider({
  color = 'rgba(196, 163, 90, 0.2)',
  width = 60,
  showDiamond = false,
}: {
  color?: string;
  width?: number;
  showDiamond?: boolean;
}) {
  return (
    <div className="flex items-center justify-center my-1.5">
      <svg
        width={width}
        height="5"
        viewBox={`0 0 ${width} 5`}
        style={{ overflow: 'visible' }}
      >
        <line
          x1={0}
          y1="2.5"
          x2={width}
          y2="2.5"
          stroke={color}
          strokeWidth="1"
        />
        {showDiamond && (
          <rect
            x={width / 2 - 2}
            y="0.5"
            width="4"
            height="4"
            fill={color}
            style={{ transformOrigin: 'center', transform: 'rotate(45deg)' }}
          />
        )}
      </svg>
    </div>
  );
}

// ----- Animated stat value -----

export function StatValue({
  value,
  color = '#c4a35a',
  size = 'md',
}: {
  value: number;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const fontSizes = { sm: 'text-sm', md: 'text-xl', lg: 'text-2xl' };

  return (
    <motion.span
      key={value}
      initial={{ scale: 1.4, opacity: 0.5 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className={`${fontSizes[size]} font-bold tabular-nums`}
      style={{ color }}
    >
      {value}
    </motion.span>
  );
}

// ----- Angular button (general-purpose, for use outside popups) -----

export function AngularButton({
  onClick,
  children,
  accentColor = '#c4a35a',
  variant = 'primary',
  disabled = false,
  size = 'md',
}: {
  onClick: () => void;
  children: React.ReactNode;
  accentColor?: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'muted';
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  const colors: Record<string, { bg: string; text: string; border: string; hoverBg: string; hoverText: string }> = {
    primary: {
      bg: `${accentColor}18`,
      text: accentColor,
      border: accentColor,
      hoverBg: `${accentColor}dd`,
      hoverText: '#0a0a0a',
    },
    secondary: {
      bg: 'rgba(255, 255, 255, 0.03)',
      text: '#888888',
      border: 'rgba(255, 255, 255, 0.15)',
      hoverBg: 'rgba(255, 255, 255, 0.08)',
      hoverText: '#cccccc',
    },
    danger: {
      bg: 'rgba(179, 62, 62, 0.1)',
      text: '#b33e3e',
      border: '#b33e3e',
      hoverBg: 'rgba(179, 62, 62, 0.8)',
      hoverText: '#ffffff',
    },
    muted: {
      bg: 'rgba(255, 255, 255, 0.03)',
      text: '#666666',
      border: 'rgba(255, 255, 255, 0.08)',
      hoverBg: 'rgba(255, 255, 255, 0.06)',
      hoverText: '#999999',
    },
  };

  const c = disabled
    ? { bg: 'rgba(40,40,40,0.4)', text: '#444444', border: '#333333', hoverBg: 'rgba(40,40,40,0.4)', hoverText: '#444444' }
    : colors[variant];

  const paddings = { sm: '5px 14px', md: '8px 20px', lg: '10px 28px' };
  const fontSizes = { sm: '10px', md: '11px', lg: '13px' };

  return (
    <motion.button
      whileHover={disabled ? {} : {
        backgroundColor: c.hoverBg,
        color: c.hoverText,
        scale: 1.03,
      }}
      whileTap={disabled ? {} : { scale: 0.97 }}
      onClick={disabled ? undefined : onClick}
      className="relative cursor-pointer uppercase no-select"
      style={{
        padding: paddings[size],
        backgroundColor: c.bg,
        color: c.text,
        border: 'none',
        borderLeft: `3px solid ${c.border}`,
        fontSize: fontSizes[size],
        fontWeight: 700,
        letterSpacing: '0.12em',
        transform: 'skewX(-3deg)',
        cursor: disabled ? 'default' : 'pointer',
        boxShadow: disabled ? 'none' : '0 2px 12px rgba(0,0,0,0.3)',
        transition: 'background-color 0.2s, color 0.2s',
      }}
    >
      <span style={{ display: 'inline-block', transform: 'skewX(3deg)' }}>
        {children}
      </span>
    </motion.button>
  );
}

// ----- Valid targets count badge -----

export function PopupTargetCount({
  count,
  accentColor = '#4a7fff',
}: {
  count: number;
  accentColor?: string;
}) {
  const t = useTranslations();
  return (
    <span
      className="font-body text-[10px]"
      style={{ color: `${accentColor}88` }}
    >
      {count === 1
        ? t('game.board.validTargetOne', { count })
        : t('game.board.validTargets', { count })}
    </span>
  );
}
