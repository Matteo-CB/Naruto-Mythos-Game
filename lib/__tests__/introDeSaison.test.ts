import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  DATE_DE_DEPLOIEMENT,
  PAGES_DE_LINTRO,
  compteDejaInscrit,
  doitVoirLintro,
  introADejaEteVue,
  pagesAAfficher,
  type DonneesDeLintro,
} from '@/lib/season/intro';

const RACINE = process.cwd();
const LOCALES = ['en', 'fr', 'es', 'pt', 'it', 'pl', 'ja'];

function donnees(surcharge: Partial<DonneesDeLintro> = {}): DonneesDeLintro {
  return {
    seasonId: 'KS',
    badges: [{ seasonId: 'KS', badge: 'top-10', rank: 7 }],
    ancienElo: 2400,
    nouvelElo: 1400,
    ligue: 'specialJonin',
    niveau: 2,
    ...surcharge,
  };
}

describe('la fenetre ne s ouvre que pour les comptes deja inscrits', () => {
  it('un compte cree avant le deploiement la voit', () => {
    const avant = new Date(DATE_DE_DEPLOIEMENT.getTime() - 86_400_000);
    expect(compteDejaInscrit(avant)).toBe(true);
    expect(doitVoirLintro(avant, null)).toBe(true);
  });

  it('un compte cree apres ne la voit jamais', () => {
    const apres = new Date(DATE_DE_DEPLOIEMENT.getTime() + 1000);
    expect(compteDejaInscrit(apres)).toBe(false);
    expect(doitVoirLintro(apres, null)).toBe(false);
  });

  it('une date absente ou illisible ne declenche rien', () => {
    expect(compteDejaInscrit(null)).toBe(false);
    expect(compteDejaInscrit(undefined)).toBe(false);
    expect(compteDejaInscrit('pas une date')).toBe(false);
  });

  it('une fois vue, elle ne revient plus', () => {
    const avant = new Date(DATE_DE_DEPLOIEMENT.getTime() - 86_400_000);
    expect(introADejaEteVue(new Date())).toBe(true);
    expect(doitVoirLintro(avant, new Date())).toBe(false);
  });
});

describe('les pages suivent ce que le joueur a vraiment vecu', () => {
  it('quatre pages quand le joueur a gagne des badges', () => {
    expect(pagesAAfficher(donnees())).toEqual([...PAGES_DE_LINTRO]);
  });

  it('la page de saison disparait quand il n a rien gagne', () => {
    const pages = pagesAAfficher(donnees({ badges: [] }));
    expect(pages).not.toContain('saison');
    expect(pages).toEqual(['highlander', 'badges', 'elo']);
  });

  it('les autres pages sont toujours la', () => {
    for (const page of ['highlander', 'badges', 'elo'] as const) {
      expect(pagesAAfficher(donnees({ badges: [] })), page).toContain(page);
    }
  });
});

describe('la fenetre est branchee de bout en bout', () => {
  it('elle est montee pour toute l application', () => {
    const layout = readFileSync(join(RACINE, 'app/[locale]/layout.tsx'), 'utf8');
    expect(layout).toContain('<SeasonIntroGate />');
  });

  it('la route dit qui la voit et retient la fermeture', () => {
    const route = readFileSync(join(RACINE, 'app/api/user/season-intro/route.ts'), 'utf8');
    expect(route).toContain('doitVoirLintro');
    expect(route).toContain('seasonIntroSeenAt: new Date()');
    expect(route, 'la lecture precede toute ecriture').toContain('export async function GET');
    expect(route).toContain('export async function POST');
  });

  it('la fermeture est enregistree cote serveur, pas seulement dans le navigateur', () => {
    const gate = readFileSync(join(RACINE, 'components/season/SeasonIntroGate.tsx'), 'utf8');
    expect(gate).toContain("method: 'POST'");
    expect(gate, 'jamais un simple drapeau local').not.toContain('localStorage');
  });

  it('la base retient que le compte a vu la fenetre', () => {
    const schema = readFileSync(join(RACINE, 'prisma/schema.prisma'), 'utf8');
    expect(schema).toContain('seasonIntroSeenAt');
  });

  it('l image du selecteur de badge est livree', () => {
    expect(existsSync(join(RACINE, 'public/images/season-intro/badge-picker.webp'))).toBe(true);
    const modale = readFileSync(join(RACINE, 'components/season/SeasonIntroModal.tsx'), 'utf8');
    expect(modale).toContain('/images/season-intro/badge-picker.webp');
  });

  it('la fenetre ne porte aucune ombre', () => {
    for (const fichier of ['components/season/SeasonIntroModal.tsx', 'components/admin/SeasonIntroPreview.tsx']) {
      const source = readFileSync(join(RACINE, fichier), 'utf8');
      expect(source, fichier).not.toContain('boxShadow');
      expect(source, fichier).not.toContain('drop-shadow');
    }
  });

  it('l administration peut la simuler avec des donnees qui changent', () => {
    const apercu = readFileSync(join(RACINE, 'components/admin/SeasonIntroPreview.tsx'), 'utf8');
    expect(apercu).toContain('donneesAleatoires');
    expect(apercu).toContain('Math.random');
    expect(apercu, 'le tirage se refait a chaque clic').toContain('setDonnees(donneesAleatoires())');
    const admin = readFileSync(join(RACINE, 'app/[locale]/admin/page.tsx'), 'utf8');
    expect(admin).toContain('<SeasonIntroPreview />');
  });

  it('le nom de la saison est fourni au titre comme au texte', () => {
    const modale = readFileSync(join(RACINE, 'components/season/SeasonIntroModal.tsx'), 'utf8');
    expect(modale, 'le titre doit recevoir la saison').toContain('t(`page.${page}.title`, { season: nomDeSaison })');
    expect(modale, 'le texte aussi').toContain('t(`page.${page}.body`, { season: nomDeSaison })');
  });

  it('aucun texte de page ne reclame un parametre que la fenetre ne passe pas', () => {
    const modale = readFileSync(join(RACINE, 'components/season/SeasonIntroModal.tsx'), 'utf8');
    const fournis = new Set(['season']);
    for (const code of LOCALES) {
      const messages = JSON.parse(readFileSync(join(RACINE, `messages/${code}.json`), 'utf8'));
      for (const page of PAGES_DE_LINTRO) {
        for (const champ of ['title', 'body'] as const) {
          const texte = String(messages.seasonIntro.page[page][champ]);
          for (const trouve of texte.matchAll(/\{(\w+)\}/g)) {
            expect(fournis.has(trouve[1]), `${code}.${page}.${champ} reclame {${trouve[1]}}`).toBe(true);
          }
        }
      }
    }
    expect(modale).toContain('nomDeSaison');
  });

  it('les sept langues ont les quatre pages', () => {
    for (const code of LOCALES) {
      const messages = JSON.parse(readFileSync(join(RACINE, `messages/${code}.json`), 'utf8'));
      const bloc = messages.seasonIntro;
      expect(bloc, `messages/${code}.json`).toBeTruthy();
      for (const cle of ['kicker', 'title', 'next', 'close', 'rank']) {
        expect(bloc[cle], `${code}.seasonIntro.${cle}`).toBeTruthy();
      }
      for (const page of PAGES_DE_LINTRO) {
        expect(bloc.page?.[page]?.title, `${code}: titre de ${page}`).toBeTruthy();
        expect(bloc.page?.[page]?.body, `${code}: texte de ${page}`).toBeTruthy();
      }
      expect(bloc.page.saison.title, `${code}: la page de saison nomme la saison`).toContain('{season}');
      expect(bloc.page.badges.imageAlt, `${code}: description de l image`).toBeTruthy();
      expect(messages.adminSeasonIntro?.cta, `${code}: bouton d apercu`).toBeTruthy();
    }
  });
});
