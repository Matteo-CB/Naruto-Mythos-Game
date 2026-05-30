'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { statusColor, formatLocation, formatTournamentDate } from '@/lib/topdeck/detail';

export { statusColor, formatLocation, formatTournamentDate };

export const PANEL_CLIP =
  'polygon(14px 0, calc(100% - 14px) 0, 100% 14px, 100% calc(100% - 14px), calc(100% - 14px) 100%, 14px 100%, 0 calc(100% - 14px), 0 14px)';
export const ROW_CLIP =
  'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';
export const EASE = [0.16, 1, 0.3, 1] as const;

export const TOPDECK_URL = 'https://topdeck.gg';

export interface TdStanding {
  name: string;
  id: string | null;
  standing: number | null;
  points: number | null;
  winRate: number | null;
  opponentWinRate: number | null;
  decklist: string | null;
}

export type TdDeckObj = Record<string, Record<string, { id?: string; count?: number }>>;

export interface TdPlayer {
  name?: string;
  id?: string;
  decklist?: string | null;
  deckObj?: TdDeckObj | null;
}

export interface TdTable {
  table?: number;
  players?: TdPlayer[];
  winner?: string | null;
  winner_id?: string | null;
  status?: string | null;
}

export interface TdRound {
  round?: number | string;
  tables?: TdTable[];
}

export interface TdTournament {
  tid: string;
  name: string;
  game: string;
  format: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
  city: string | null;
  state: string | null;
  country: string | null;
  locationName: string | null;
  lat: number | null;
  lng: number | null;
  headerImage: string | null;
  averageElo: number | null;
  participants: number;
  topCut: number | null;
  swissNum: number | null;
  standings: TdStanding[] | null;
  rounds: TdRound[] | null;
  hasDetail: boolean;
  url: string;
}

export interface TdFacet {
  value: string;
  count: number;
}
export interface TdFacets {
  games: TdFacet[];
  formats: TdFacet[];
  statuses: TdFacet[];
  countries: TdFacet[];
  cities: TdFacet[];
  states: TdFacet[];
}

export function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('topdeck');
  const color = statusColor(status);
  const label = t(`status.${(['upcoming', 'ongoing', 'completed', 'unknown'].includes(status) ? status : 'unknown')}`);
  const live = status === 'ongoing';
  return (
    <motion.span
      className="font-display inline-flex items-center text-[10px] uppercase tracking-[0.18em] px-2.5 py-1 leading-none"
      style={{ backgroundColor: `${color}1f`, color, borderRadius: 9999 }}
      animate={live ? { opacity: [0.62, 1, 0.62], boxShadow: [`0 0 0px ${color}00`, `0 0 12px ${color}55`, `0 0 0px ${color}00`] } : undefined}
      transition={live ? { duration: 1.9, repeat: Infinity, ease: 'easeInOut' } : undefined}
    >
      {label}
    </motion.span>
  );
}

export function TopdeckCredit() {
  const t = useTranslations('topdeck');
  return (
    <a
      href={TOPDECK_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 opacity-60 hover:opacity-100 transition-opacity"
      aria-label="TopDeck.gg"
    >
      <img src="/images/topdeck-mark.webp" alt="" style={{ height: 16, width: 'auto' }} />
      <span className="font-display text-[10px] uppercase tracking-[0.2em]" style={{ color: '#888' }}>
        {t('attribution')}
      </span>
    </a>
  );
}
