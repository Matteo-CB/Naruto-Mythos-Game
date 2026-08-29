import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { marqueursDeSet, marqueurALaDate, libelleDuMarqueur } from '@/lib/data/marqueursDeSet';
import changelog from '@/lib/data/changelog.json';
import { SET_REGISTRY, getSetName, getSetNumber } from '@/lib/data/sets/registry';

const RACINE = process.cwd();
const LOCALES = ['en', 'fr', 'es', 'pt', 'it', 'pl', 'ja'];

describe('chaque nouveau set marque le changelog', () => {
  it('le set 2 est marque, juste au niveau des changements du 29 aout', () => {
    const marqueurs = marqueursDeSet();
    expect(marqueurs.length).toBeGreaterThan(0);
    expect(marqueurs).toContainEqual({ setId: 'SS', date: '2026-08-29' });
    expect(marqueurALaDate('2026-08-29')?.setId).toBe('SS');
  });

  it('un jour sans nouveau set ne porte aucun marqueur', () => {
    expect(marqueurALaDate('2026-08-28')).toBeNull();
    expect(marqueurALaDate('2020-01-01')).toBeNull();
  });

  it('chaque marqueur vise un set qui existe vraiment et une entree qui existe', () => {
    const dates = new Set((changelog as { entries: Array<{ date: string }> }).entries.map((e) => e.date));
    for (const marqueur of marqueursDeSet()) {
      expect(SET_REGISTRY[marqueur.setId], `${marqueur.setId} doit exister au registre`).toBeTruthy();
      expect(dates.has(marqueur.date), `aucune entree au ${marqueur.date}`).toBe(true);
    }
  });

  it('deux sets ne peuvent pas marquer le meme jour', () => {
    const dates = marqueursDeSet().map((m) => m.date);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it('le libelle vient du registre, jamais d un nom invente', () => {
    const libelle = libelleDuMarqueur('SS', 'fr');
    expect(libelle.number).toBe(getSetNumber('SS'));
    expect(libelle.name).toBe(getSetName('SS', 'fr'));
    expect(libelleDuMarqueur('SS', 'ja').name).toBe(getSetName('SS', 'ja'));
  });

  it('la banniere est rendue avant les changements de sa journee', () => {
    const source = readFileSync(join(RACINE, 'components/ChangelogButton.tsx'), 'utf8');
    expect(source).toContain('marqueurALaDate(entry.date)');
    const debut = source.indexOf('{marqueur && (');
    const titre = source.indexOf('{formatDate(entry.date');
    expect(debut, 'la banniere existe').toBeGreaterThan(-1);
    expect(debut, 'elle passe avant la date de l entree').toBeLessThan(titre);
    expect(source, 'elle est rouge').toContain('var(--t-danger)');
    expect(source, 'jamais une bordure d accent').not.toMatch(/border(Left|Right|Top|Bottom): '[0-9]+px solid var\(--t-danger\)/);
  });

  it('les sept langues savent ecrire le marqueur', () => {
    for (const code of LOCALES) {
      const messages = JSON.parse(readFileSync(join(RACINE, `messages/${code}.json`), 'utf8'));
      const modele = messages.changelog?.setMarker;
      expect(modele, `messages/${code}.json`).toBeTruthy();
      expect(modele, `${code}: le numero`).toContain('{number}');
      expect(modele, `${code}: le nom du set`).toContain('{name}');
    }
  });
});
