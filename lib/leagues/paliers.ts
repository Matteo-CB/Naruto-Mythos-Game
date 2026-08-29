export interface PalierDeLigue {
  key: string;
  seuils: readonly number[];
}

export const NIVEAUX_ROMAINS = ['I', 'II', 'III'] as const;

export const LIGUES: readonly PalierDeLigue[] = [
  { key: 'academyStudent', seuils: [0, 300, 420] },
  { key: 'genin', seuils: [500, 600, 700] },
  { key: 'chunin', seuils: [850, 1000, 1150] },
  { key: 'specialJonin', seuils: [1300, 1450, 1600] },
  { key: 'eliteJonin', seuils: [1750, 1900, 2050] },
  { key: 'legendarySannin', seuils: [2200, 2400, 2600] },
  { key: 'kage', seuils: [2850, 3100, 3350] },
  { key: 'sageOfSixPaths', seuils: [3650, 4000, 4350] },
  { key: 'willOfFire', seuils: [4750, 5200, 5700] },
];

export const LIGUES_KONOHA_SHIDO: readonly PalierDeLigue[] = [
  { key: 'academyStudent', seuils: [0] },
  { key: 'genin', seuils: [450] },
  { key: 'chunin', seuils: [550] },
  { key: 'specialJonin', seuils: [700] },
  { key: 'eliteJonin', seuils: [1000] },
  { key: 'legendarySannin', seuils: [1200] },
  { key: 'kage', seuils: [1700] },
  { key: 'sageOfSixPaths', seuils: [2000] },
  { key: 'willOfFire', seuils: [2500] },
];

export const LIGUES_PAR_SAISON: Readonly<Record<string, readonly PalierDeLigue[]>> = {
  KS: LIGUES_KONOHA_SHIDO,
};

export function echelleDeLaSaison(seasonId: string): readonly PalierDeLigue[] {
  return LIGUES_PAR_SAISON[seasonId] ?? LIGUES;
}

export interface RangDeLigue {
  key: string;
  niveau: number;
  seuil: number;
}

export function rangDeLigue(elo: number, echelle: readonly PalierDeLigue[] = LIGUES): RangDeLigue {
  let trouve: RangDeLigue = { key: echelle[0].key, niveau: 1, seuil: echelle[0].seuils[0] };
  for (const ligue of echelle) {
    ligue.seuils.forEach((seuil, i) => {
      if (elo >= seuil) trouve = { key: ligue.key, niveau: i + 1, seuil };
    });
  }
  return trouve;
}

export function ligueDe(elo: number, echelle: readonly PalierDeLigue[] = LIGUES): string {
  return rangDeLigue(elo, echelle).key;
}

export function niveauDe(elo: number, echelle: readonly PalierDeLigue[] = LIGUES): number {
  return rangDeLigue(elo, echelle).niveau;
}

export function niveauRomain(niveau: number): string {
  return NIVEAUX_ROMAINS[Math.min(Math.max(niveau, 1), NIVEAUX_ROMAINS.length) - 1];
}

export function seuilDEntree(key: string, echelle: readonly PalierDeLigue[] = LIGUES): number {
  return echelle.find((l) => l.key === key)?.seuils[0] ?? 0;
}

export function aDesDivisions(echelle: readonly PalierDeLigue[] = LIGUES): boolean {
  return echelle.some((l) => l.seuils.length > 1);
}

export function tousLesRangs(echelle: readonly PalierDeLigue[] = LIGUES): RangDeLigue[] {
  const rangs: RangDeLigue[] = [];
  for (const ligue of echelle) {
    ligue.seuils.forEach((seuil, i) => rangs.push({ key: ligue.key, niveau: i + 1, seuil }));
  }
  return rangs.sort((a, b) => a.seuil - b.seuil);
}
