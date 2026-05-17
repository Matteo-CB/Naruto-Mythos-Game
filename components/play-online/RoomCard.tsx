'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { HoloSurface } from '@/components/HoloSurface';
import { holoFromHue } from '@/lib/utils/holoColor';

interface RoomCardProps {
  code: string;
  hostName: string;
  gameMode: string;
  createdAt: number;
  isEvolving: boolean;
  holoHue: number | null;
  isRanked: boolean;
  isAnonymous: boolean;
  onJoin: () => void;
}

export function RoomCard({
  hostName,
  gameMode,
  createdAt,
  isEvolving,
  holoHue,
  isRanked,
  isAnonymous,
  onJoin,
}: RoomCardProps) {
  const t = useTranslations();

  const anonymousDisplay = hostName === '__anonymous__';
  const displayName = anonymousDisplay ? t('online.anonymous.name') : hostName;

  const content = (
    <motion.div
      whileHover={{ y: -1 }}
      transition={{ duration: 0.15 }}
      className="flex items-center gap-3 px-3 py-2.5 w-full no-select"
      style={{
        backgroundColor: isEvolving ? 'rgba(10, 10, 14, 0.55)' : 'rgba(15, 15, 20, 0.78)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
        position: 'relative',
        zIndex: 1,
      }}
    >
      <div className="flex flex-col min-w-0 flex-1">
        <span
          className="text-[12px] font-medium truncate"
          style={{
            color: anonymousDisplay ? '#888' : '#e8e8e8',
            fontStyle: anonymousDisplay ? 'italic' : 'normal',
          }}
        >
          {displayName}
        </span>
        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
          <ChipText label={t(`online.mode.${isRanked ? 'ranked' : gameMode}`)} accent={isRanked ? '#b33e3e' : '#c4a35a'} />
          {isAnonymous && <ChipText label={t('online.badge.anonymous')} accent="#888" />}
          {isEvolving && <EvoBadge holoHue={holoHue} />}
          <span className="text-[9px]" style={{ color: '#444', marginLeft: 4 }}>
            {formatTimeAgo(createdAt, t)}
          </span>
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onJoin(); }}
        className="px-3.5 py-1.5 text-[10px] font-bold uppercase cursor-pointer no-select shrink-0"
        style={{
          backgroundColor: isRanked ? '#b33e3e' : '#c4a35a',
          color: isRanked ? '#e8e8e8' : '#0a0a0a',
          letterSpacing: '0.14em',
          transform: 'skewX(-3deg)',
        }}
      >
        <span style={{ display: 'inline-block', transform: 'skewX(3deg)' }}>
          {t('online.join')}
        </span>
      </button>
    </motion.div>
  );

  if (!isEvolving) return content;

  return (
    <HoloSurface hue={holoHue} intensity="card" motion="idle" className="overflow-hidden">
      {content}
    </HoloSurface>
  );
}

function EvoBadge({ holoHue }: { holoHue: number | null }) {
  const color = holoHue != null ? holoFromHue(holoHue).primary : '#c4a35a';
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider whitespace-nowrap"
      style={{
        color,
        backgroundColor: 'rgba(0,0,0,0.35)',
        border: `1px solid ${color}`,
        borderRadius: '3px',
        opacity: 0.92,
      }}
    >
      EVO
    </span>
  );
}

function ChipText({ label, accent }: { label: string; accent: string }) {
  return (
    <span
      className="text-[8.5px] font-bold uppercase"
      style={{
        color: accent,
        letterSpacing: '0.18em',
        backgroundColor: `${accent}14`,
        padding: '2px 6px',
      }}
    >
      {label}
    </span>
  );
}

function formatTimeAgo(timestamp: number, t: ReturnType<typeof useTranslations>): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return t('online.timeJustNow');
  const minutes = Math.floor(seconds / 60);
  return t('online.timeMinutesAgo', { minutes });
}
