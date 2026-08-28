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
const LANGUES_AJOUTEES = ['es', 'pt', 'it', 'pl', 'ja'] as const;

function lireLeDocument() {
  const doc = readFileSync(join(RACINE, 'doc/QUETES_SET_2.txt'), 'utf8').split(/\r?\n/);
  const entrees: Array<{ id: string; fr: string; en: string; target: number; scope: string }> = [];
  for (let i = 0; i < doc.length; i += 1) {
    const entete = /^\s*\d+\.\s+(.*)$/.exec(doc[i]);
    if (!entete) continue;
    const en = doc[i + 1]?.trim() ?? '';
    const meta = /^id\s+(\S+)\s+\|\s+cible\s+(\d+)\s+\|\s+portée\s+(\S+)/.exec(doc[i + 2]?.trim() ?? '');
    if (!en.startsWith('EN ') || !meta) continue;
    entrees.push({
      id: meta[1],
      fr: entete[1].trim(),
      en: en.slice(3).trim(),
      target: Number(meta[2]),
      scope: meta[3],
    });
  }
  return entrees;
}

describe('quetes annoncees de la saison Shinobi Shiren', () => {
  it('annonce la saison en cours et archive la precedente', () => {
    expect(SAISON_COURANTE).toBe('SS');
    expect(SAISON_ARCHIVEE).toBe('KS');
  });

  it('reprend les 183 quetes du document, dans sa repartition par niveau', () => {
    expect(QUETES_SHINOBI_SHIREN.length).toBe(183);
    const attendu: Record<number, number> = { 1: 46, 2: 46, 3: 46, 4: 45 };
    for (const niveau of [1, 2, 3, 4]) {
      const lot = QUETES_SHINOBI_SHIREN.filter((q) => q.level === niveau);
      expect(lot.length, `niveau ${niveau}`).toBe(attendu[niveau]);
    }
  });

  it('reprend mot pour mot le francais, l anglais, la cible et la portee du document', () => {
    const entrees = lireLeDocument();
    expect(entrees.length).toBe(183);
    const parId = new Map(QUETES_SHINOBI_SHIREN.map((q) => [q.id, q]));
    for (const entree of entrees) {
      const quete = parId.get(entree.id);
      expect(quete, `quete ${entree.id} absente des donnees`).toBeDefined();
      expect(quete!.text_fr, entree.id).toBe(entree.fr);
      expect(quete!.text_en, entree.id).toBe(entree.en);
      expect(quete!.target, entree.id).toBe(entree.target);
      expect(quete!.scope, entree.id).toBe(entree.scope);
    }
  });

  it('n ajoute aucune quete que le document ne porte pas', () => {
    const duDocument = new Set(lireLeDocument().map((e) => e.id));
    for (const quete of QUETES_SHINOBI_SHIREN) {
      expect(duDocument.has(quete.id), `${quete.id} absente du document`).toBe(true);
    }
  });

  it('ne reutilise jamais un identifiant, ni entre saisons', () => {
    const ids = QUETES_SHINOBI_SHIREN.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    const anciens = new Set(QUESTS.filter((q) => q.season === SAISON_ARCHIVEE).map((q) => q.id));
    for (const id of ids) expect(anciens.has(id), id).toBe(false);
  });

  it('est traduite dans toutes les langues du site', () => {
    for (const quete of QUETES_SHINOBI_SHIREN) {
      for (const locale of routing.locales) {
        const texte = texteDeQuete(quete, locale);
        expect(texte.length, `${quete.id} en ${locale}`).toBeGreaterThan(0);
        if (locale !== 'en') {
          expect(texte, `${quete.id} en ${locale} retombe sur l anglais`).not.toBe(quete.text_en);
        }
      }
    }
  });

  it('garde le numero imprime de la carte dans chaque langue', () => {
    for (const quete of QUETES_SHINOBI_SHIREN) {
      const numeros = (quete.text_en.match(/\b\d{3}\b/g) ?? []).sort();
      if (numeros.length === 0) continue;
      for (const locale of LANGUES_AJOUTEES) {
        const traduit = (texteDeQuete(quete, locale).match(/\b\d{3}\b/g) ?? []).sort();
        expect(traduit, `${quete.id} en ${locale}`).toEqual(numeros);
      }
    }
  });

  it('ne traduit jamais les mots cles du jeu', () => {
    const motsCles = ['DUEL', 'FIRST STRIKE', 'MAIN', 'AMBUSH', 'UPGRADE', 'SCORE', 'ATTACH', 'POWERUP'];
    for (const quete of QUETES_SHINOBI_SHIREN) {
      for (const mot of motsCles) {
        if (!quete.text_en.includes(mot)) continue;
        for (const locale of LANGUES_AJOUTEES) {
          expect(texteDeQuete(quete, locale), `${quete.id} en ${locale} perd ${mot}`).toContain(mot);
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

  it('est suivie: chaque quete declare son declencheur', () => {
    for (const quete of QUETES_SHINOBI_SHIREN) {
      expect(quete.hook, `${quete.id} sans declencheur`).toBeTruthy();
    }
  });

  it('sort de l API a cote des quetes archivees', () => {
    const source = readFileSync(join(RACINE, 'app/api/quests/route.ts'), 'utf8');
    expect(source).toContain('archivedSeasonSetId');
  });

  it('est affichee sur la page recompenses, suivie et reclamable', () => {
    const page = readFileSync(join(RACINE, 'app/[locale]/battlepass/page.tsx'), 'utf8');
    expect(page).toContain('quetesDeLaSaison');
    expect(page).toContain('quetesArchivees');
    expect(page).toContain("tQuests('seasonHeader')");
    expect(page).toContain("tQuests('archiveShow')");
    const bloc = page.slice(page.indexOf('quetesDeSaisonDuNiveau.map'));
    expect(bloc.slice(0, 2200), 'la saison en cours propose de reclamer').toContain('handleClaimQuest');
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
