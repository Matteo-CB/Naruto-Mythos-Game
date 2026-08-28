import { numeroImprimeDe, setDe } from './engineEmit';

interface CarteDeDeck {
  id?: string;
  name_fr?: string;
  name_en?: string;
  group?: string | null;
  card_type?: string;
}

export interface ResumeDeDeck {
  deckSet?: string;
  deckSets: string[];
  deckSetCount: number;
  deckNumbers: number[];
  deckHasAttachment: boolean;
  monoGroup?: string;
  names: string[];
}

// Ce qu une quete peut demander d un deck: de quel set il vient, combien de cartes en
// viennent, s il porte un equipement, s il tient a un seul village.
export function resumerLeDeck(
  cartes: ReadonlyArray<CarteDeDeck>,
  setVise?: string,
): ResumeDeDeck {
  const sets = new Set<string>();
  const numeros: number[] = [];
  let duSetVise = 0;
  let equipement = false;
  const groupes = new Set<string>();
  const noms: string[] = [];

  for (const c of cartes) {
    const set = setDe(c.id);
    if (set) sets.add(set);
    if (setVise && set === setVise) duSetVise += 1;
    const numero = numeroImprimeDe(c.id);
    if (numero !== null) numeros.push(numero);
    if (c.card_type === 'attachment') equipement = true;
    if (c.group) groupes.add(c.group);
    if (c.name_fr) noms.push(c.name_fr.toUpperCase());
  }

  const listeSets = [...sets];
  return {
    deckSet: listeSets.length === 1 ? listeSets[0] : undefined,
    deckSets: listeSets,
    deckSetCount: setVise ? duSetVise : cartes.length,
    deckNumbers: numeros,
    deckHasAttachment: equipement,
    monoGroup: groupes.size === 1 ? [...groupes][0] : undefined,
    names: noms,
  };
}

// Le nombre de cartes du set le mieux represente, pour les quetes qui demandent « au moins
// N cartes du set 2 » sans exiger un deck entier.
export function compteParSet(cartes: ReadonlyArray<CarteDeDeck>): Record<string, number> {
  const comptes: Record<string, number> = {};
  for (const c of cartes) {
    const set = setDe(c.id);
    if (!set) continue;
    comptes[set] = (comptes[set] ?? 0) + 1;
  }
  return comptes;
}
