export interface TrancheDeCompression {
  jusqua: number;
  taux: number;
}

export const PLAFOND_DE_DEBUT_DE_SAISON = 2000;
export const PLANCHER_ELO = 100;

export const TRANCHES_DE_COMPRESSION: readonly TrancheDeCompression[] = [
  { jusqua: 800, taux: 1 },
  { jusqua: 1400, taux: 0.55 },
  { jusqua: 2200, taux: 0.35 },
  { jusqua: 3500, taux: 0.2 },
  { jusqua: Number.POSITIVE_INFINITY, taux: 0.1 },
];

export function eloApresReset(
  elo: number,
  tranches: readonly TrancheDeCompression[] = TRANCHES_DE_COMPRESSION,
): number {
  if (!Number.isFinite(elo)) return PLANCHER_ELO;
  let reste = Math.max(0, elo);
  let sortie = 0;
  let bas = 0;
  for (const tranche of tranches) {
    const largeur = Math.min(reste, tranche.jusqua - bas);
    if (largeur <= 0) break;
    sortie += largeur * tranche.taux;
    reste -= largeur;
    bas = tranche.jusqua;
  }
  const arrondi = Math.round(sortie);
  return Math.min(PLAFOND_DE_DEBUT_DE_SAISON, Math.max(PLANCHER_ELO, arrondi));
}

export function perteDuReset(elo: number): number {
  return elo - eloApresReset(elo);
}
