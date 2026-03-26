import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { readFile } from 'fs/promises';
import { join } from 'path';

export async function GET() {
  try {
    // Total training samples
    const totalSamples = await prisma.trainingData.count();

    // Samples per day (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentSamples = await prisma.trainingData.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // Group by date string
    const samplesPerDay: Record<string, number> = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const key = d.toISOString().split('T')[0];
      samplesPerDay[key] = 0;
    }
    for (const sample of recentSamples) {
      const key = sample.createdAt.toISOString().split('T')[0];
      if (key in samplesPerDay) {
        samplesPerDay[key]++;
      }
    }

    // Distinct games count
    const distinctGames = await prisma.trainingData.findMany({
      distinct: ['gameId'],
      select: { gameId: true },
    });

    // Current model metadata (if it exists)
    let modelMetadata: Record<string, unknown> | null = null;
    try {
      const metaPath = join(process.cwd(), 'public', 'models', 'naruto_ai_meta.json');
      const raw = await readFile(metaPath, 'utf-8');
      modelMetadata = JSON.parse(raw);
    } catch {
      // No model trained yet
    }

    return NextResponse.json({
      totalSamples,
      totalGames: distinctGames.length,
      samplesPerDay,
      modelMetadata,
    });
  } catch (err) {
    console.error('[API] Training stats error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
