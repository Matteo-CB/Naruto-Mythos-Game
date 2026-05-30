import type { TopdeckTournament } from '@prisma/client';
import {
  topdeckEventUrl,
  topdeckBracketUrl,
  TOPDECK_ATTRIBUTION_URL,
  TOPDECK_ATTRIBUTION_TEXT_EN,
  TOPDECK_ATTRIBUTION_TEXT_FR,
} from './constants';

export interface SerializedTournament {
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
  standings: unknown;
  rounds: unknown;
  hasDetail: boolean;
  url: string;
}

export function serializeTournament(row: TopdeckTournament): SerializedTournament {
  const loc = (row.location && typeof row.location === 'object' ? row.location : {}) as Record<string, unknown>;
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
  return {
    tid: row.tid,
    name: row.name,
    game: row.game,
    format: row.format,
    startDate: row.startDate ? row.startDate.toISOString() : null,
    endDate: row.endDate ? row.endDate.toISOString() : null,
    status: row.status,
    city: row.city,
    state: row.state,
    country: row.country,
    locationName: row.locationName,
    lat: num(loc.lat),
    lng: num(loc.lng),
    headerImage: str(loc.headerImage),
    averageElo: num(loc.averageElo),
    participants: row.participants,
    topCut: row.topCut,
    swissNum: row.swissNum,
    standings: row.standings ?? null,
    rounds: row.rounds ?? null,
    hasDetail: row.hasDetail,
    url: row.status === 'upcoming' ? topdeckEventUrl(row.tid) : topdeckBracketUrl(row.tid),
  };
}

export const TOPDECK_ATTRIBUTION = {
  url: TOPDECK_ATTRIBUTION_URL,
  textEn: TOPDECK_ATTRIBUTION_TEXT_EN,
  textFr: TOPDECK_ATTRIBUTION_TEXT_FR,
};
