import { getAllCards } from '@/lib/data/cardLoader';
import { getCardById } from '@/lib/data/cardIndex';
import { baseCardIdFor, parseCardId, stripVariantSuffix, isLockedVariantCard } from './isVariant';

// Ordre de preference quand plusieurs impressions ordinaires existent au meme numero: on
// rend au joueur la version que tout le monde possede, la plus courante d abord.
const RARETES_DE_BASE = ['R', 'S', 'M', 'UC', 'C'] as const;

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
export function carteDeBasePour(cardId: string): string {
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

export function estUneVarianteVerrouillee(cardId: string): boolean {
  const parsed = parseCardId(cardId);
  if (!parsed) return false;
  return isLockedVariantCard({ rarity: parsed.rarity as never, set: parsed.set, id: cardId });
}
