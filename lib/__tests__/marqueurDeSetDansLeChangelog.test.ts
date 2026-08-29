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

  it('la banniere reste accrochee a sa date, elle ne remonte pas avec le temps', () => {
    const entrees = (changelog as { entries: Array<{ date: string }> }).entries;
    const plusRecente = entrees[0].date;
    const marquee = marqueurALaDate('2026-08-29');
    expect(marquee, 'le 29 aout porte bien le marqueur').toBeTruthy();
    for (const entree of entrees) {
      const attendu = entree.date === '2026-08-29' ? 'SS' : null;
      expect(marqueurALaDate(entree.date)?.setId ?? null, `${entree.date}`).toBe(attendu);
    }
    expect(
      marqueurALaDate(plusRecente)?.setId ?? null,
      'le jour le plus recent ne herite pas du marqueur, sauf si c est le sien',
    ).toBe(plusRecente === '2026-08-29' ? 'SS' : null);
  });

  it('la banniere lit la date de son entree, jamais la plus recente', () => {
    const source = readFileSync(join(RACINE, 'components/ChangelogButton.tsx'), 'utf8');
    expect(source).toContain('marqueurALaDate(entry.date)');
    expect(source, 'jamais accrochee a la derniere entree').not.toContain('marqueurALaDate(latestDate)');
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
    const banniere = source.slice(debut, source.indexOf('</motion.div>', debut));
    expect(banniere, 'aucune ombre, aucun halo').not.toContain('boxShadow');
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

describe('rien de ce qui a ete ajoute ne porte d ombre', () => {
  const FICHIERS = [
    'components/ChangelogButton.tsx',
    'components/badges/BadgeTooltip.tsx',
    'components/badges/SeasonBadgeModal.tsx',
    'components/badges/SeasonBadge.tsx',
    'components/badges/LeagueBadge.tsx',
    'components/PlayerFlag.tsx',
    'components/settings/SeasonBadgePicker.tsx',
    'components/profile/SeasonBadgesPanel.tsx',
  ];

  it('ni ombre portee ni halo dans les composants de badges et de nouvelles', () => {
    for (const fichier of FICHIERS) {
      const source = readFileSync(join(RACINE, fichier), 'utf8');
      expect(source, `${fichier} ne doit porter aucune ombre`).not.toContain('boxShadow');
      expect(source, `${fichier} ne doit porter aucun halo`).not.toContain('drop-shadow');
    }
  });

  it('l icone de palier du battlepass n a pas non plus d ombre', () => {
    const source = readFileSync(join(RACINE, 'components/battlepass/TierNode.tsx'), 'utf8');
    const icone = source.slice(source.indexOf('const icone = iconeDuPalier'));
    const bloc = icone.slice(icone.indexOf('{icone && ('), icone.indexOf('{isSpecial && isCurrent && ('));
    expect(bloc, 'l icone ajoutee ne porte aucune ombre').not.toContain('drop-shadow');
    expect(bloc).not.toContain('boxShadow');
  });
});
