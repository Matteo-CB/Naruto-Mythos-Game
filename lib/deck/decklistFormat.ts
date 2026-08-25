import { RARITY_ORDER } from '@/lib/cards/order';
import { getSetNumber } from '@/lib/data/sets/registry';

export interface CarteImprimee {
  id: string;
  cardId?: string;
  set?: string;
  number: number | string;
  rarity?: string;
  card_type?: string;
  name_fr?: string;
  name_en?: string;
  title_fr?: string;
  title_en?: string;
}

export const RARETES_NUMEROTEES = ['C', 'UC', 'R'];

function rang(rarity: string | undefined): number {
  const i = RARITY_ORDER.indexOf(rarity ?? '');
  return i === -1 ? RARITY_ORDER.length : i;
}

export function numeroDeCarte(carte: CarteImprimee): number {
  const brut = typeof carte.number === 'string' ? parseInt(carte.number, 10) : carte.number;
  return Number.isFinite(brut) ? brut : 0;
}

export function comptageOfficiel(cartes: CarteImprimee[], setId: string): number {
  const numeros = new Set<number>();
  for (const c of cartes) {
    if ((c.set ?? 'KS') !== setId) continue;
    if (!RARETES_NUMEROTEES.includes(c.rarity ?? '')) continue;
    numeros.add(numeroDeCarte(c));
  }
  return numeros.size;
}

export function lettreDeVariante(rarity: string | undefined): string {
  if (!rarity) return '';
  if (rarity === 'RA') return 'A';
  if (rarity === 'L') return 'G';
  if (rarity.endsWith('V')) return 'V';
  return '';
}

function ordinalDuTirage(id: string): number {
  const m = /_(\d+)-/.exec(id);
  return m ? parseInt(m[1], 10) : 1;
}

export function estUneMission(carte: CarteImprimee): boolean {
  return (carte.card_type ?? '') === 'mission' || carte.rarity === 'MMS';
}

export function codeDeTirage(carte: CarteImprimee): string {
  const ordinal = ordinalDuTirage(carte.cardId ?? carte.id);
  return ordinal > 1 ? `${carte.rarity}${ordinal}` : `${carte.rarity ?? ''}`;
}

export interface IndexDesTirages {
  parEmplacement: Map<string, CarteImprimee[]>;
  parCode: Map<string, CarteImprimee>;
  comptages: Map<string, number>;
}

function emplacement(carte: CarteImprimee): string {
  return `${carte.set ?? 'KS'}-${numeroDeCarte(carte)}`;
}

export function indexerLesTirages(cartes: CarteImprimee[]): IndexDesTirages {
  const parEmplacement = new Map<string, CarteImprimee[]>();
  const parCode = new Map<string, CarteImprimee>();
  const comptages = new Map<string, number>();

  for (const carte of cartes) {
    const cle = emplacement(carte);
    const liste = parEmplacement.get(cle) ?? [];
    liste.push(carte);
    parEmplacement.set(cle, liste);
    parCode.set(`${cle}|${codeDeTirage(carte)}`, carte);
  }
  for (const liste of parEmplacement.values()) {
    liste.sort((a, b) => rang(a.rarity) - rang(b.rarity)
      || ordinalDuTirage(a.cardId ?? a.id) - ordinalDuTirage(b.cardId ?? b.id));
  }
  for (const setId of new Set(cartes.map((c) => c.set ?? 'KS'))) {
    comptages.set(setId, comptageOfficiel(cartes, setId));
  }
  return { parEmplacement, parCode, comptages };
}

export function estLeTirageDeBase(carte: CarteImprimee, index: IndexDesTirages): boolean {
  const liste = index.parEmplacement.get(emplacement(carte));
  if (!liste || liste.length === 0) return true;
  return (liste[0].cardId ?? liste[0].id) === (carte.cardId ?? carte.id);
}

export function referenceOfficielle(carte: CarteImprimee, index: IndexDesTirages): string {
  const setId = carte.set ?? 'KS';
  const numeroSet = getSetNumber(setId) ?? 1;
  const numero = numeroDeCarte(carte);
  const total = index.comptages.get(setId) ?? 0;

  if (estUneMission(carte)) {
    return `${numeroSet}-MSS${String(numero).padStart(2, '0')}`;
  }

  const base = `${numeroSet}-${numero}/${total}`;
  const lettre = lettreDeVariante(carte.rarity);
  return lettre ? `${base} ${lettre}` : base;
}

const SEPARATEUR = '   ';

export function nomAffiche(carte: CarteImprimee): string {
  const nom = carte.name_en || carte.name_fr || '';
  const titre = carte.title_en || carte.title_fr || '';
  if (!titre || titre.trim().toUpperCase() === nom.trim().toUpperCase()) return nom;
  return `${nom} ${titre}`;
}

export function construireDecklist(
  personnages: CarteImprimee[],
  missions: CarteImprimee[],
  toutesLesCartes: CarteImprimee[],
): string {
  const index = indexerLesTirages(toutesLesCartes);

  const compter = (cartes: CarteImprimee[]) => {
    const parId = new Map<string, { carte: CarteImprimee; quantite: number }>();
    for (const c of cartes) {
      const cle = c.cardId ?? c.id;
      const entree = parId.get(cle);
      if (entree) entree.quantite += 1;
      else parId.set(cle, { carte: c, quantite: 1 });
    }
    return [...parId.values()];
  };

  const lignes: string[] = [];
  lignes.push(`Main Deck: ${personnages.length}`);
  for (const { carte, quantite } of compter(personnages)) {
    lignes.push(
      `${quantite}x${SEPARATEUR}${nomAffiche(carte)}${SEPARATEUR}(${referenceOfficielle(carte, index)})`,
    );
  }

  lignes.push('', `Missions: ${missions.length}`);
  for (const { carte } of compter(missions)) {
    lignes.push(`${nomAffiche(carte)} (${referenceOfficielle(carte, index)})`);
  }

  return lignes.join('\n');
}

export interface LigneAnalysee {
  quantite: number;
  setNumero: number;
  carteNumero: number;
  marqueur: string;
  libelle: string;
  mission: boolean;
  brut: string;
}

export function normaliserLibelle(texte: string): string {
  return texte
    .replace(/[‘’“”]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function libelleDeLaLigne(brut: string): string {
  const avantParenthese = brut.slice(0, brut.lastIndexOf('('));
  return normaliserLibelle(avantParenthese.replace(QUANTITE, ''));
}

const LIGNE_MISSION = /\(\s*(\d+)\s*-\s*MSS\s*(\d+)\s*(?:-\s*(\d+))?\s*\)/i;
const LIGNE_CARTE = /\(\s*(\d+)\s*-\s*(\d+)\s*[/\-]\s*(\d+)\s*([A-Za-z0-9-]*)\s*\)/;
const QUANTITE = /^\s*(\d+)\s*[xX*]?\s+/;

export function analyserLigne(ligne: string): LigneAnalysee | null {
  const brut = ligne.trim();
  if (!brut) return null;

  const mission = LIGNE_MISSION.exec(brut);
  if (mission) {
    return {
      quantite: 1,
      setNumero: parseInt(mission[1], 10),
      carteNumero: parseInt(mission[2], 10),
      marqueur: mission[3] ?? '',
      libelle: libelleDeLaLigne(brut),
      mission: true,
      brut,
    };
  }

  const carte = LIGNE_CARTE.exec(brut);
  if (!carte) return null;

  const q = QUANTITE.exec(brut);
  return {
    quantite: q ? Math.max(1, parseInt(q[1], 10)) : 1,
    setNumero: parseInt(carte[1], 10),
    carteNumero: parseInt(carte[2], 10),
    marqueur: (carte[4] ?? '').trim().toUpperCase(),
    libelle: libelleDeLaLigne(brut),
    mission: false,
    brut,
  };
}

export function analyserDecklist(texte: string): LigneAnalysee[] {
  const lignes: LigneAnalysee[] = [];
  for (const brut of texte.split(/\r?\n/)) {
    const analysee = analyserLigne(brut);
    if (analysee) lignes.push(analysee);
  }
  return lignes;
}

export function ressemblELaUneDecklist(texte: string): boolean {
  return analyserDecklist(texte).length > 0;
}

export function resoudreLigne(
  ligne: LigneAnalysee,
  index: IndexDesTirages,
  setParNumero: Map<number, string>,
): CarteImprimee | null {
  const setId = setParNumero.get(ligne.setNumero);
  if (!setId) return null;
  const cle = `${setId}-${ligne.carteNumero}`;
  const liste = index.parEmplacement.get(cle);
  if (!liste || liste.length === 0) return null;

  const parLeLibelle = (candidats: CarteImprimee[]): CarteImprimee => {
    if (candidats.length === 1 || !ligne.libelle) return candidats[0];
    return candidats.find((c) => normaliserLibelle(nomAffiche(c)) === ligne.libelle) ?? candidats[0];
  };

  if (ligne.mission) {
    const missions = liste.filter(estUneMission);
    if (missions.length === 0) return null;
    return parLeLibelle(missions);
  }

  const personnages = liste.filter((c) => !estUneMission(c));
  if (personnages.length === 0) return null;

  if (!ligne.marqueur) {
    const sansLettre = personnages.filter((c) => !lettreDeVariante(c.rarity));
    return parLeLibelle(sansLettre.length > 0 ? sansLettre : personnages);
  }

  const morceaux = ligne.marqueur.split('-').filter(Boolean);
  for (const morceau of morceaux) {
    const exact = index.parCode.get(`${cle}|${morceau}`);
    if (exact) return exact;
  }

  const lettre = morceaux[0] ?? '';
  const parLettre = personnages.filter((c) => lettreDeVariante(c.rarity) === lettre);
  if (parLettre.length > 0) return parLeLibelle(parLettre);

  return parLeLibelle(personnages);
}
