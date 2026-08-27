import { SHINOBI_SHIREN_ODDS } from '@/lib/sealed/shinobiShirenRates';
import { VARIANT_PACK_PROBABILITIES, type PackSlotKind } from './constants';

// Part des huit cases d un booster variante reservee aux illustrations holo. Le reste se
// partage entre les raretes speciales, dans l ordre de rarete du set concerne.
export const PART_HOLO_C = 0.55;
export const PART_HOLO_UC = 0.25;
export const PART_DES_VARIANTES = 1 - PART_HOLO_C - PART_HOLO_UC;

// Le booster variante du set 2 reprend l ordre de rarete officiel du set: une Rare Art est
// la plus courante, une Numerotee la plus rare. Les poids officiels sont des chances par
// paquet; on garde leurs proportions et on les ramene a la part reservee aux variantes.
const CORRESPONDANCE_SET2: Record<string, PackSlotKind> = {
  RA: 'RA',
  SP: 'SPV',
  SHINOBI: 'SHINOBIV',
  L: 'L',
};

const POIDS_MV_SET2 = 1 / 35;

function poidsBrutsSet2(): Partial<Record<PackSlotKind, number>> {
  const poids: Partial<Record<PackSlotKind, number>> = { MV: POIDS_MV_SET2 };
  for (const { hit, oneIn } of SHINOBI_SHIREN_ODDS) {
    const kind = CORRESPONDANCE_SET2[hit];
    if (kind) poids[kind] = (poids[kind] ?? 0) + 1 / oneIn;
    else if (hit === 'NUMBERED') {
      // Les cartes numerotees du set couvrent deux raretes, qui se partagent la chance.
      poids.SV = (poids.SV ?? 0) + 1 / oneIn / 2;
      poids.POPV = (poids.POPV ?? 0) + 1 / oneIn / 2;
    }
  }
  return poids;
}

function normaliser(bruts: Partial<Record<PackSlotKind, number>>): Record<string, number> {
  const somme = Object.values(bruts).reduce((t, v) => t + (v ?? 0), 0);
  const sortie: Record<string, number> = { HOLO_C: PART_HOLO_C, HOLO_UC: PART_HOLO_UC };
  for (const [kind, poids] of Object.entries(bruts)) {
    sortie[kind] = ((poids ?? 0) / somme) * PART_DES_VARIANTES;
  }
  return sortie;
}

const TAUX_SET2 = normaliser(poidsBrutsSet2());

export function tauxDuBoosterVariante(setId: string): Record<string, number> {
  if (setId === 'SS') return { ...TAUX_SET2 };
  return { ...VARIANT_PACK_PROBABILITIES };
}

export function ordreDeTirage(setId: string): PackSlotKind[] {
  return (Object.entries(tauxDuBoosterVariante(setId)) as Array<[PackSlotKind, number]>)
    .sort((a, b) => a[1] - b[1])
    .map(([kind]) => kind);
}

// Une meme rarete peut abriter deux impressions dont l une se veut plus rare que l autre.
// Le poids par defaut vaut 1; une valeur plus basse rend la carte plus difficile a sortir.
export const POIDS_PAR_CARTE: Readonly<Record<string, number>> = {
  'SS-112_2-SPV': 0.4,
};

export function poidsDeLaCarte(cardId: string): number {
  return POIDS_PAR_CARTE[cardId] ?? 1;
}
