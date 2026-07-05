import type { TdRound, TdPlayer } from '@/components/topdeck/shared';

export interface DeckEntry {
  name: string;
  id: string;
  decklist: string | null;
  deckObj: TdPlayer['deckObj'];
}

const STATUS_COLOR: Record<string, string> = {
  upcoming: '#7eb6ff',
  ongoing: '#6ee7a8',
  completed: '#b59a63',
  unknown: '#8a8a8a',
};

export function statusColor(status: string): string {
  return STATUS_COLOR[status] ?? STATUS_COLOR.unknown;
}

export function pct(v: number | null | undefined): string {
  if (v == null) return '-';
  const n = v <= 1 ? v * 100 : v;
  return `${n.toFixed(1)}%`;
}

export function isUrl(s: string | null | undefined): boolean {
  return !!s && /^https?:\/\//i.test(s);
}

export function isCutRound(round: number | string | undefined): boolean {
  return typeof round === 'string' && !/^\d+$/.test(round.trim());
}

export function splitRounds(rounds: TdRound[]): { swiss: TdRound[]; cut: TdRound[] } {
  const swiss: TdRound[] = [];
  const cut: TdRound[] = [];
  for (const r of rounds) (isCutRound(r.round) ? cut : swiss).push(r);
  return { swiss, cut };
}

export function extractDecks(rounds: TdRound[]): DeckEntry[] {
  const map = new Map<string, DeckEntry>();
  for (const r of rounds) {
    for (const tbl of r.tables ?? []) {
      for (const p of tbl.players ?? []) {
        const id = p.id || p.name || '';
        if (!id) continue;
        const hasDeck = !!p.decklist || (p.deckObj != null && Object.keys(p.deckObj).length > 0);
        if (hasDeck && !map.has(id)) {
          map.set(id, { name: p.name ?? id, id, decklist: p.decklist ?? null, deckObj: p.deckObj ?? null });
        }
      }
    }
  }
  return Array.from(map.values());
}

export function deckCardCount(deckObj: TdPlayer['deckObj']): number {
  if (!deckObj) return 0;
  let n = 0;
  for (const section of Object.values(deckObj)) {
    for (const c of Object.values(section)) n += c.count ?? 0;
  }
  return n;
}

export function formatLocation(t: {
  city: string | null;
  state: string | null;
  country: string | null;
  locationName: string | null;
}): string {
  const parts = [t.city, t.state, t.country].filter((p): p is string => !!p && p.trim() !== '');
  if (parts.length) return Array.from(new Set(parts)).join(', ');
  return t.locationName ?? '';
}

export function formatTournamentDate(iso: string | null, bcp47: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(bcp47, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}
