import { getAllCards } from '@/lib/data/cardLoader';
import type { CardData } from '@/lib/engine/types';

export function cardEfficiency(card: Pick<CardData, 'chakra' | 'power'>): number {
  const chakra = card.chakra ?? 0;
  const power = card.power ?? 0;
  if (chakra <= 0) return power;
  return power / chakra;
}

interface Baseline {
  avgChakra: number;
  avgPower: number;
  avgEfficiency: number;
  maxEfficiency: number;
}

let cachedBaseline: Baseline | null = null;

function characterBaseline(): Baseline {
  if (cachedBaseline) return cachedBaseline;
  const chars = getAllCards().filter((c) => c.card_type === 'character');
  const n = chars.length || 1;
  const effs = chars.map(cardEfficiency);
  cachedBaseline = {
    avgChakra: chars.reduce((s, c) => s + (c.chakra ?? 0), 0) / n,
    avgPower: chars.reduce((s, c) => s + (c.power ?? 0), 0) / n,
    avgEfficiency: effs.reduce((s, e) => s + e, 0) / n,
    maxEfficiency: Math.max(1, ...effs),
  };
  return cachedBaseline;
}

export interface CardStats {
  chakra: number;
  power: number;
  efficiency: number;
  avgEfficiency: number;
  maxEfficiency: number;
  efficiencyPercent: number;
  avgEfficiencyPercent: number;
  vsAveragePercent: number;
  effectCounts: Array<{ type: string; count: number }>;
}

export function getCardStats(card: CardData): CardStats {
  const b = characterBaseline();
  const efficiency = cardEfficiency(card);

  const counts = new Map<string, number>();
  for (const e of card.effects ?? []) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);

  return {
    chakra: card.chakra ?? 0,
    power: card.power ?? 0,
    efficiency,
    avgEfficiency: b.avgEfficiency,
    maxEfficiency: b.maxEfficiency,
    efficiencyPercent: Math.round((efficiency / b.maxEfficiency) * 100),
    avgEfficiencyPercent: Math.round((b.avgEfficiency / b.maxEfficiency) * 100),
    vsAveragePercent: b.avgEfficiency > 0 ? Math.round((efficiency / b.avgEfficiency) * 100) : 100,
    effectCounts: Array.from(counts.entries()).map(([type, count]) => ({ type, count })),
  };
}
