import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const RACINE = process.cwd();
const ROUTE = readFileSync(join(RACINE, 'app/api/profile/[username]/route.ts'), 'utf8');
const PAGE = readFileSync(join(RACINE, 'app/[locale]/profile/[username]/page.tsx'), 'utf8');
const PAR_PAGE = 5;

function boutonVisible(totalAffiche: number, dejaCharge: number): boolean {
  return dejaCharge < totalAffiche;
}

describe('le profil compte toutes les parties, pas seulement celles de la page', () => {
  it("l ancienne formule cachait le bouton des qu il n y avait aucune partie classee", () => {
    const partiesReelles = 14;
    const classees = 0;
    const ancienTotal = classees + Math.min(partiesReelles, PAR_PAGE) + Math.min(0, PAR_PAGE);
    expect(ancienTotal, 'le total plafonnait a la taille de page').toBe(PAR_PAGE);
    expect(boutonVisible(ancienTotal, PAR_PAGE), 'et le bouton disparaissait').toBe(false);

    const nouveauTotal = classees + partiesReelles + 0;
    expect(boutonVisible(nouveauTotal, PAR_PAGE), 'avec le vrai total il reste').toBe(true);
  });

  it("un joueur avec des parties classees ne voyait pas le probleme, d ou l asymetrie signalee", () => {
    const classees = 30;
    const ancienTotal = classees + Math.min(14, PAR_PAGE);
    expect(boutonVisible(ancienTotal, PAR_PAGE), 'chez l adversaire le bouton restait').toBe(true);
  });

  it('le total ne se deduit plus de tableaux tronques par la pagination', () => {
    expect(ROUTE, 'la longueur du tableau de la page ne fait plus le total')
      .not.toContain('const totalGames = totalRanked + casualPvpEntries.length + aiGames.length;');
    expect(ROUTE, 'les parties contre l IA sont vraiment comptees').toContain('prisma.game.count(');
    expect(ROUTE).toContain('const totalGames = totalRanked + totalAmicales + totalIA;');
  });

  it('les parties classees sont exclues du compte des amicales, sans plafond de page', () => {
    const bloc = ROUTE.slice(ROUTE.indexOf('const tousLesIdsClasses'), ROUTE.indexOf('const totalGames'));
    expect(bloc, 'tous les identifiants classes sont lus, pas seulement ceux de la page')
      .toContain("where: { userId: user.id, gameId: { not: null } }");
    expect(bloc, 'les parties classees ne sont pas comptees deux fois').toContain('notIn: tousLesIdsClasses');
    expect(bloc, 'une liste vide ne casse pas la requete').toContain('tousLesIdsClasses.length > 0');
  });

  it('la page continue de decider a partir du total renvoye', () => {
    expect(PAGE).toContain('profile.recentGames.length < profile.totalGames');
  });

  it('la taille de page reste celle attendue par ce raisonnement', () => {
    expect(ROUTE).toContain('const perPage = 5;');
  });
});
