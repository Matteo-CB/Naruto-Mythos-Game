export type IdDeClassement = 'ranked' | 'evolving' | 'highlander';

export interface Classement {
  id: IdDeClassement;
  eloField: 'elo' | 'evolvingElo' | 'highlanderElo';
  winsField: 'wins' | 'evolvingWins' | 'highlanderWins';
  lossesField: 'losses' | 'evolvingLosses' | 'highlanderLosses';
  drawsField: 'draws' | 'evolvingDraws' | 'highlanderDraws';
  compteurDeParties: 'evolvingGamesPlayed' | 'highlanderGamesPlayed' | null;
}

export const CLASSEMENT_PRINCIPAL: Classement = {
  id: 'ranked',
  eloField: 'elo',
  winsField: 'wins',
  lossesField: 'losses',
  drawsField: 'draws',
  compteurDeParties: null,
};

export const CLASSEMENT_EVOLVING: Classement = {
  id: 'evolving',
  eloField: 'evolvingElo',
  winsField: 'evolvingWins',
  lossesField: 'evolvingLosses',
  drawsField: 'evolvingDraws',
  compteurDeParties: 'evolvingGamesPlayed',
};

export const CLASSEMENT_HIGHLANDER: Classement = {
  id: 'highlander',
  eloField: 'highlanderElo',
  winsField: 'highlanderWins',
  lossesField: 'highlanderLosses',
  drawsField: 'highlanderDraws',
  compteurDeParties: 'highlanderGamesPlayed',
};

export const CLASSEMENTS: readonly Classement[] = [
  CLASSEMENT_PRINCIPAL,
  CLASSEMENT_EVOLVING,
  CLASSEMENT_HIGHLANDER,
];

export function classementDe(id: string): Classement {
  return CLASSEMENTS.find((c) => c.id === id) ?? CLASSEMENT_PRINCIPAL;
}

export function classementDeLaPartie(salle: { isEvolving?: boolean; isHighlander?: boolean }): Classement {
  if (salle.isHighlander === true) return CLASSEMENT_HIGHLANDER;
  if (salle.isEvolving === true) return CLASSEMENT_EVOLVING;
  return CLASSEMENT_PRINCIPAL;
}

type Compteurs = Record<string, unknown>;

export function eloDuJoueur(classement: Classement, joueur: Compteurs): number {
  const valeur = joueur[classement.eloField];
  return typeof valeur === 'number' ? valeur : 500;
}

export function partiesDuJoueur(classement: Classement, joueur: Compteurs): number {
  const lire = (champ: string): number => {
    const valeur = joueur[champ];
    return typeof valeur === 'number' ? valeur : 0;
  };
  return lire(classement.winsField) + lire(classement.lossesField) + lire(classement.drawsField);
}
