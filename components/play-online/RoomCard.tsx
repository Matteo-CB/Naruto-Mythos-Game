'use client';

import { motion } from 'framer-motion';
import { PlayerNameLink } from '@/components/social/PlayerNameLink';
import { useTranslations, useLocale } from 'next-intl';
import { getSetName } from '@/lib/data/sets/registry';
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
  sealedSetChoice?: string | null;
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
  sealedSetChoice,
  onJoin,
}: RoomCardProps) {
  const t = useTranslations();
  const locale = useLocale();

  const sealedSetLabel = gameMode === 'sealed'
    ? (!sealedSetChoice || sealedSetChoice === 'random'
        ? t('online.sealed.setRandom')
        : getSetName(sealedSetChoice, locale))
    : null;

  const anonymousDisplay = hostName === '__anonymous__';
  const displayName = anonymousDisplay ? t('online.anonymous.name') : hostName;

  const content = (
    <motion.div
      whileHover={{ y: -1 }}
      transition={{ duration: 0.15 }}
      className="flex items-center gap-3 px-3 py-2.5 w-full no-select"
      style={{
        backgroundColor: isEvolving ? 'rgba(10, 10, 14, 0.55)' : 'rgba(15, 15, 20, 0.78)',
        boxShadow: '0 4px 16px var(--t-shadow)',
        position: 'relative',
        zIndex: 1,
      }}
    >
      <div className="flex flex-col min-w-0 flex-1">
        <PlayerNameLink
          username={hostName}
          disabled={anonymousDisplay}
          className="text-[12px] font-medium truncate"
          style={{
            color: anonymousDisplay ? 'var(--t-muted)' : 'var(--t-text)',
            fontStyle: anonymousDisplay ? 'italic' : 'normal',
          }}
        >
          {displayName}
        </PlayerNameLink>
        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
          <ChipText label={t(`online.mode.${isRanked ? 'ranked' : gameMode}`)} accent={isRanked ? 'var(--t-danger)' : 'var(--t-accent)'} />
          {sealedSetLabel && <ChipText label={sealedSetLabel} accent="#8fae6b" />}
          {isAnonymous && <ChipText label={t('online.badge.anonymous')} accent="var(--t-muted)" />}
          {isEvolving && <EvoBadge holoHue={holoHue} />}
          <span className="text-[9px]" style={{ color: 'var(--t-muted)', marginLeft: 4 }}>
            {formatTimeAgo(createdAt, t)}
          </span>
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onJoin(); }}
        className="px-3.5 py-1.5 text-[10px] font-bold uppercase cursor-pointer no-select shrink-0"
        style={{
          backgroundColor: isRanked ? 'var(--t-danger)' : 'var(--t-accent)',
          color: isRanked ? 'var(--t-text)' : 'var(--t-bg)',
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
  const color = holoHue != null ? holoFromHue(holoHue).primary : 'var(--t-accent)';
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
