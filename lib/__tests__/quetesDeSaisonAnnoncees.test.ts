import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  QUETES_SHINOBI_SHIREN,
  SAISON_COURANTE,
  SAISON_ARCHIVEE,
  texteDeQuete,
} from '@/lib/quests/saisonShinobiShiren';
import { routing } from '@/lib/i18n/routing';
import { QUESTS } from '@/lib/quests/questData';
import { QUEST_XP_BY_LEVEL } from '@/lib/battlepass/constants';

const RACINE = process.cwd();

describe('quetes annoncees de la saison Shinobi Shiren', () => {
  it('annonce la saison en cours et archive la precedente', () => {
    expect(SAISON_COURANTE).toBe('SS');
    expect(SAISON_ARCHIVEE).toBe('KS');
  });

  it('propose six quetes par niveau', () => {
    for (const niveau of [1, 2, 3, 4] as const) {
      const lot = QUETES_SHINOBI_SHIREN.filter((q) => q.level === niveau);
      expect(lot.length, `niveau ${niveau}`).toBe(6);
    }
  });

  it('ne reutilise jamais un identifiant, ni entre saisons', () => {
    const ids = QUETES_SHINOBI_SHIREN.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    const anciens = new Set(QUESTS.map((q) => q.id));
    for (const id of ids) expect(anciens.has(id), id).toBe(false);
  });

  it('est traduite dans toutes les langues du site', () => {
    for (const quete of QUETES_SHINOBI_SHIREN) {
      for (const locale of routing.locales) {
        const texte = texteDeQuete(quete, locale);
        expect(texte.length, `${quete.id} en ${locale}`).toBeGreaterThan(0);
        if (locale !== 'en') {
          expect(texte, `${quete.id} en ${locale} retombe sur l anglais`).not.toBe(
            texteDeQuete(quete, 'en'),
          );
        }
      }
    }
  });

  it('herite du bareme de recompense des niveaux, sans en inventer un second', () => {
    const source = readFileSync(join(RACINE, 'lib/quests/saisonShinobiShiren.ts'), 'utf8');
    expect(source).not.toMatch(/\bxpReward\b/);
    const route = readFileSync(join(RACINE, 'app/api/quests/route.ts'), 'utf8');
    expect(route).toContain('xpReward: QUEST_XP_BY_LEVEL[q.level]');
    const bareme = [1, 2, 3, 4].map((n) => QUEST_XP_BY_LEVEL[n as 1 | 2 | 3 | 4]);
    for (let i = 1; i < bareme.length; i += 1) {
      expect(bareme[i - 1]).toBeLessThan(bareme[i]);
    }
  });

  it('reste annoncee et non suivie: aucun hook n est declare', () => {
    const source = readFileSync(join(RACINE, 'lib/quests/saisonShinobiShiren.ts'), 'utf8');
    expect(source).not.toMatch(/\bhook\s*:/);
    for (const quete of QUETES_SHINOBI_SHIREN) {
      expect('hook' in quete, quete.id).toBe(false);
    }
  });

  it('sort de l API marquee comme non suivie, a cote des quetes archivees', () => {
    const source = readFileSync(join(RACINE, 'app/api/quests/route.ts'), 'utf8');
    expect(source).toContain('seasonQuests');
    expect(source).toContain('tracked: false');
    expect(source).toContain('archivedSeasonSetId');
  });

  it('est affichee sur la page recompenses, sans barre de progression ni bouton', () => {
    const page = readFileSync(join(RACINE, 'app/[locale]/battlepass/page.tsx'), 'utf8');
    expect(page).toContain('seasonQuests');
    expect(page).toContain("tQuests('seasonHeader')");
    expect(page).toContain("tQuests('archiveShow')");
  });

  it('a ses libelles dans les sept fichiers de langue', () => {
    const cles = ['seasonHeader', 'seasonSoon', 'seasonIntro', 'archiveHeader', 'archiveShow', 'archiveHide'];
    for (const locale of routing.locales) {
      const messages = JSON.parse(
        readFileSync(join(RACINE, `messages/${locale}.json`), 'utf8'),
      ) as { quests?: Record<string, string> };
      for (const cle of cles) {
        expect(messages.quests?.[cle], `${cle} manquant en ${locale}`).toBeTruthy();
      }
    }
  });
});
