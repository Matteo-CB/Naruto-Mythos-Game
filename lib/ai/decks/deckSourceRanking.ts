export interface DeckOwnerStats {
  elo?: number;
  wins?: number;
  losses?: number;
  draws?: number;
}

export interface DeckSourceCandidate {
  id: string;
  name: string;
  cardIds: string[];
  missionIds: string[];
  updatedAt?: Date | string;
  owner?: DeckOwnerStats;
}

export interface RankedDeckSource {
  id: string;
  name: string;
  cardIds: string[];
  missionIds: string[];
  sourceScore: number;
}

function getOwnerStrength(owner?: DeckOwnerStats): number {
  if (!owner) return 0;

  const elo = owner.elo ?? 500;
  const wins = owner.wins ?? 0;
  const losses = owner.losses ?? 0;
  const draws = owner.draws ?? 0;
  const games = wins + losses + draws;
  const winRate = games > 0 ? (wins + draws * 0.5) / games : 0.5;
  const confidence = Math.min(1, games / 40);

  // A simple blend: player skill (ELO) + observed performance.
  return elo * 0.65 + (winRate * 500) * confidence + wins * 0.25;
}

function deckSignature(cardIds: string[], missionIds: string[]): string {
  const chars = [...cardIds].sort().join(',');
  const missions = [...missionIds].sort().join(',');
  return `${chars}::${missions}`;
}

export function rankStrongDeckSources(
  candidates: DeckSourceCandidate[],
  limit = 10,
): RankedDeckSource[] {
  const dedup = new Map<string, RankedDeckSource>();

  for (const candidate of candidates) {
    if (candidate.cardIds.length < 30 || candidate.missionIds.length < 3) {
      continue;
    }

    const ownerStrength = getOwnerStrength(candidate.owner);
    const recencyBonus = candidate.updatedAt
      ? Math.max(0, 25 - Math.floor((Date.now() - new Date(candidate.updatedAt).getTime()) / (1000 * 60 * 60 * 24 * 14)))
      : 0;
    const score = ownerStrength + recencyBonus;

    const signature = deckSignature(candidate.cardIds, candidate.missionIds);
    const existing = dedup.get(signature);
    if (!existing || existing.sourceScore < score) {
      dedup.set(signature, {
        id: candidate.id,
        name: candidate.name,
        cardIds: candidate.cardIds,
        missionIds: candidate.missionIds,
        sourceScore: score,
      });
    }
  }

  return [...dedup.values()]
    .sort((a, b) => b.sourceScore - a.sourceScore)
    .slice(0, limit);
}
