import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import {
  emptyPlayStats,
  fillMissingDays,
  playStatsDayKey,
  shiftDayKey,
  summarizePeriod,
  type DailyPlayRow,
} from '@/lib/stats/dailyPlay';

export const dynamic = 'force-dynamic';

interface RawRow {
  day?: string;
  games?: number;
  evolving?: number;
  players?: number;
  decks?: number;
}

interface RawUnique {
  players?: number;
  decks?: number;
}

function toRows(batch: RawRow[]): DailyPlayRow[] {
  return batch
    .filter((r): r is RawRow & { day: string } => typeof r.day === 'string')
    .map((r) => ({
      day: r.day,
      games: r.games ?? 0,
      evolving: r.evolving ?? 0,
      players: r.players ?? 0,
      decks: r.decks ?? 0,
    }));
}

export async function GET() {
  const today = playStatsDayKey(new Date());
  const updatedAt = new Date().toISOString();

  try {
    const from = shiftDayKey(today, -29);
    const weekFrom = shiftDayKey(today, -6);

    const raw = await prisma.$runCommandRaw({
      aggregate: 'DailyPlayStat',
      pipeline: [
        { $match: { day: { $gte: from, $lte: today } } },
        {
          $facet: {
            series: [
              {
                $project: {
                  _id: 0,
                  day: 1,
                  games: 1,
                  evolving: 1,
                  players: { $size: { $ifNull: ['$playerIds', []] } },
                  decks: { $size: { $ifNull: ['$deckKeys', []] } },
                },
              },
              { $sort: { day: 1 } },
            ],
            weekUnique: [
              { $match: { day: { $gte: weekFrom } } },
              {
                $group: {
                  _id: null,
                  players: { $addToSet: '$playerIds' },
                  decks: { $addToSet: '$deckKeys' },
                },
              },
              {
                $project: {
                  _id: 0,
                  players: {
                    $size: {
                      $reduce: {
                        input: '$players',
                        initialValue: [],
                        in: { $setUnion: ['$$value', { $ifNull: ['$$this', []] }] },
                      },
                    },
                  },
                  decks: {
                    $size: {
                      $reduce: {
                        input: '$decks',
                        initialValue: [],
                        in: { $setUnion: ['$$value', { $ifNull: ['$$this', []] }] },
                      },
                    },
                  },
                },
              },
            ],
            monthUnique: [
              {
                $group: {
                  _id: null,
                  players: { $addToSet: '$playerIds' },
                  decks: { $addToSet: '$deckKeys' },
                },
              },
              {
                $project: {
                  _id: 0,
                  players: {
                    $size: {
                      $reduce: {
                        input: '$players',
                        initialValue: [],
                        in: { $setUnion: ['$$value', { $ifNull: ['$$this', []] }] },
                      },
                    },
                  },
                  decks: {
                    $size: {
                      $reduce: {
                        input: '$decks',
                        initialValue: [],
                        in: { $setUnion: ['$$value', { $ifNull: ['$$this', []] }] },
                      },
                    },
                  },
                },
              },
            ],
          },
        },
      ],
      cursor: {},
    }) as {
      cursor?: {
        firstBatch?: Array<{ series?: RawRow[]; weekUnique?: RawUnique[]; monthUnique?: RawUnique[] }>;
      };
    };

    const facet = raw.cursor?.firstBatch?.[0];
    const stored = toRows(facet?.series ?? []);
    const weekUnique = facet?.weekUnique?.[0] ?? {};
    const monthUnique = facet?.monthUnique?.[0] ?? {};

    const monthSeries = fillMissingDays(stored, today, 30);
    const weekSeries = fillMissingDays(stored, today, 7);

    return NextResponse.json(
      {
        series: weekSeries,
        monthSeries,
        week: summarizePeriod(weekSeries, weekUnique.players ?? 0, weekUnique.decks ?? 0, 7),
        month: summarizePeriod(monthSeries, monthUnique.players ?? 0, monthUnique.decks ?? 0, 30),
        today: stored.find((r) => r.day === today) ?? null,
        updatedAt,
      },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900' } },
    );
  } catch (err) {
    console.error('[PlayStats] aggregation failed:', err instanceof Error ? err.message : err);
    const fallback = emptyPlayStats(today, updatedAt);
    return NextResponse.json({ ...fallback, monthSeries: fillMissingDays([], today, 30) });
  }
}
