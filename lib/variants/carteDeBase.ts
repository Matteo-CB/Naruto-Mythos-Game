import { getAllCards } from '@/lib/data/cardLoader';
import { getCardById } from '@/lib/data/cardIndex';
import { baseCardIdFor, parseCardId, stripVariantSuffix, isLockedVariantCard } from './isVariant';

// Ordre de preference quand plusieurs impressions ordinaires existent au meme numero: on
// rend au joueur la version que tout le monde possede, la plus courante d abord.
const RARETES_DE_BASE = ['R', 'S', 'M', 'UC', 'C'] as const;

const BASES_EXPLICITES: Readonly<Record<string, string>> = {
  'SS-999-L': 'SS-141-S',
  'SS-998-L': 'SS-144-S',
};

export const IDS_HERITES: Readonly<Record<string, string>> = {
  'KS-000-L': 'KS-133-L',
  'SS-000-L': 'SS-149-L',
};

export function idActuel(cardId: string): string {
  return IDS_HERITES[cardId] ?? cardId;
}

let index: Map<string, string> | null = null;

function construireIndex(): Map<string, string> {
  const parEmplacement = new Map<string, Map<string, string>>();
  for (const carte of getAllCards()) {
    const parsed = parseCardId(carte.id);
    if (!parsed) continue;
    const cle = `${parsed.set}-${stripVariantSuffix(parsed.number)}`;
    const rarete = String(carte.rarity);
    if (!(RARETES_DE_BASE as readonly string[]).includes(rarete)) continue;
    const seau = parEmplacement.get(cle) ?? new Map<string, string>();
    if (!seau.has(rarete)) seau.set(rarete, carte.id);
    parEmplacement.set(cle, seau);
  }

  const sortie = new Map<string, string>();
  for (const [cle, seau] of parEmplacement) {
    for (const rarete of RARETES_DE_BASE) {
      const id = seau.get(rarete);
      if (id) { sortie.set(cle, id); break; }
    }
  }
  return sortie;
}

export function reinitialiserIndexDeBase(): void {
  index = null;
}

// Rend l identifiant de la carte ordinaire correspondant a une variante. La table de
// correspondance figee ne couvre que quatre raretes; pour les specialites du set 2 on
// retrouve l impression ordinaire au meme numero.
export function carteDeBasePour(identifiant: string): string {
  const cardId = idActuel(identifiant);
  const explicite = BASES_EXPLICITES[cardId];
  if (explicite && getCardById(explicite)) return explicite;
  const parsed = parseCardId(cardId);
  if (!parsed) return cardId;
  if (!index) index = construireIndex();
  const parNumero = index.get(`${parsed.set}-${stripVariantSuffix(parsed.number)}`);

  // La table figee dit vers quelle rarete pointe une variante, mais cette impression
  // n existe pas toujours: une Mythos Variant peut couvrir une carte Secrete.
  const direct = baseCardIdFor(cardId);
  if (direct !== cardId && getCardById(direct)) return direct;
  return parNumero ?? cardId;
}

export function estUneVarianteVerrouillee(identifiant: string): boolean {
  const cardId = idActuel(identifiant);
  const parsed = parseCardId(cardId);
  if (!parsed) return false;
  return isLockedVariantCard({ rarity: parsed.rarity as never, set: parsed.set, id: cardId });
}
