import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getAllCards } from '@/lib/data/cardIndex';
import { SET_REGISTRY } from '@/lib/data/sets/registry';
import {
  indexerLesTirages,
  referenceOfficielle,
  nomAffiche,
  construireDecklist,
  analyserDecklist,
  analyserLigne,
  resoudreLigne,
  ressemblELaUneDecklist,
  lettreDeVariante,
  estLeTirageDeBase,
  type CarteImprimee,
} from '@/lib/deck/decklistFormat';

const CARTES = getAllCards() as unknown as CarteImprimee[];
const INDEX = indexerLesTirages(CARTES);
const SET_PAR_NUMERO = new Map<number, string>(
  Object.entries(SET_REGISTRY).map(([id, spec]) => [(spec as { number: number }).number, id]),
);

function carte(id: string): CarteImprimee {
  const c = CARTES.find((x) => (x.cardId ?? x.id) === id);
  if (!c) throw new Error(`carte absente du catalogue: ${id}`);
  return c;
}

function reference(id: string): string {
  return referenceOfficielle(carte(id), INDEX);
}

describe('la reference reproduit les exemples officiels', () => {
  const attendus: Array<[string, string]> = [
    ['KS-027-C', '1-27/130'],
    ['KS-113-RA', '1-113/130 A'],
    ['KS-130-R', '1-130/130'],
    ['SS-078-CHIBIV', '2-78/140 V'],
    ['KS-001-MMS', '1-MSS01'],
    ['SS-004-MMS', '2-MSS04'],
    ['KS-010-MMS', '1-MSS10'],
    ['SS-004_2-MMS', '2-MSS04'],
  ];
  for (const [id, attendu] of attendus) {
    it(`${id} donne ${attendu}`, () => {
      expect(reference(id)).toBe(attendu);
    });
  }

  it('le nombre total est celui du set, pas un compteur invente', () => {
    expect(reference('KS-001-C').endsWith('/130'), 'Konoha Shido compte 130 cartes').toBe(true);
    expect(reference('SS-008-C').endsWith('/140'), 'Shinobi Shiren en compte 140').toBe(true);
  });

  it('le nom porte le personnage puis sa version', () => {
    expect(nomAffiche(carte('KS-027-C'))).toBe('AKAMARU Ninja Hound');
  });

  it('une mission dont le titre repete le nom ne le dit pas deux fois', () => {
    const m = nomAffiche(carte('SS-004-MMS'));
    expect(m.toLowerCase().split('high priority mission').length - 1, 'une seule fois').toBe(1);
  });
});

describe('la decklist est ecrite en anglais quelle que soit la langue du site', () => {
  it('le nom et la version sont ceux imprimes en anglais', () => {
    expect(nomAffiche(carte('KS-007-C')), 'JIRAYA Ermite des Crapauds en francais')
      .toBe('JIRAIYA Toad Sage');
    expect(nomAffiche(carte('KS-013-C'))).toBe('SASUKE UCHIHA Last of the Uchiha Clan');
    expect(nomAffiche(carte('KS-002-MMS')), 'les missions aussi').toBe(
      carte('KS-002-MMS').title_en || carte('KS-002-MMS').name_en!,
    );
  });

  it('une decklist complete ne contient aucun mot francais', () => {
    const texte = construireDecklist(
      [carte('KS-007-C'), carte('KS-013-C'), carte('KS-017-C')], [carte('KS-002-MMS')], CARTES,
    );
    for (const fr of ['Ermite des Crapauds', 'UCHIWA', 'Décuplement', 'CHÔJI']) {
      expect(texte, `le francais ne doit pas apparaitre: ${fr}`).not.toContain(fr);
    }
    expect(texte).toContain('Toad Sage');
  });

  it('aucun appelant ne peut demander une autre langue', () => {
    const source = readFileSync(join(__dirname, '..', 'deck', 'decklistFormat.ts'), 'utf8');
    expect(source, 'le nom se lit uniquement sur les champs anglais')
      .not.toMatch(/name_\$\{|title_\$\{/);
    const signature = source.slice(source.indexOf('export function construireDecklist'));
    expect(signature.slice(0, signature.indexOf('{')), 'construireDecklist ne prend pas de langue')
      .not.toContain('locale');
  });
});

describe('la lettre de variante suit la rarete imprimee', () => {
  it('une Rare Art porte A, une variante porte V, une dorée porte G', () => {
    expect(lettreDeVariante('RA')).toBe('A');
    expect(lettreDeVariante('MV')).toBe('V');
    expect(lettreDeVariante('CHIBIV')).toBe('V');
    expect(lettreDeVariante('SHINOBIV')).toBe('V');
    expect(lettreDeVariante('L')).toBe('G');
  });

  it('un tirage de base ne porte aucune lettre', () => {
    expect(lettreDeVariante('C')).toBe('');
    expect(lettreDeVariante('UC')).toBe('');
    expect(lettreDeVariante('R')).toBe('');
    expect(reference('KS-113-R'), 'la Rare de base reste nue').toBe('1-113/130');
  });
});

describe('la reference ne porte que ce que le format officiel prevoit', () => {
  it('aucune reference ne porte de code interne au simulateur', () => {
    const bavardes = CARTES
      .map((c) => referenceOfficielle(c, INDEX))
      .filter((ref) => !/^\d+-(\d+\/\d+( [AVG])?|MSS\d\d)$/.test(ref));
    expect(
      [...new Set(bavardes)].slice(0, 10),
      'le document decrit "(B-CC/DDD E)" et "(B-MSSFF)", rien d autre: '
      + 'une precision ajoutee par nos soins ne serait pas comprise par les organisateurs',
    ).toEqual([]);
  });

  it('toutes les impressions speciales d un numero partagent la meme lettre', () => {
    for (const id of ['SS-121-SPV', 'SS-121-MV', 'SS-149-CHIBIV', 'SS-149-SPV']) {
      expect(reference(id).split(' ')[1], `${id} porte la lettre officielle seule`).toBe('V');
    }
    expect(reference('SS-149-L'), 'la dorée porte G').toBe('2-149/140 G');
  });
});

describe('chaque carte du jeu se relit telle qu elle a ete ecrite', () => {
  it('aller-retour exact sur tout le catalogue', () => {
    const perdues: string[] = [];
    for (const c of CARTES) {
      const id = c.cardId ?? c.id;
      const ligne = `2x   ${nomAffiche(c)}   (${referenceOfficielle(c, INDEX)})`;
      const analysee = analyserLigne(ligne);
      if (!analysee) { perdues.push(`${id}: ligne illisible`); continue; }
      const relue = resoudreLigne(analysee, INDEX, SET_PAR_NUMERO);
      const idRelu = relue ? (relue.cardId ?? relue.id) : 'aucune';
      const memeCarte = idRelu === id;
      const memeTexte = relue ? nomAffiche(relue) === nomAffiche(c) : false;
      if (!memeCarte && !memeTexte) perdues.push(`${id} relu en ${idRelu}`);
    }
    expect(CARTES.length, 'le catalogue est bien charge').toBeGreaterThan(400);
    expect(
      perdues.slice(0, 10),
      `${perdues.length} cartes mal relues. Plusieurs impressions partagent la meme reference `
      + 'officielle: c est le nom et la version de la ligne qui doivent retrouver la bonne',
    ).toEqual([]);
  });

  it('deux impressions de meme reference sont departagees par leur version', () => {
    const chibi = carte('SS-149-CHIBIV');
    const ligne = analyserLigne(`2x   ${nomAffiche(chibi)}   (${referenceOfficielle(chibi, INDEX)})`)!;
    const relue = resoudreLigne(ligne, INDEX, SET_PAR_NUMERO)!;
    expect(
      relue.cardId ?? relue.id,
      'la reference seule ne suffit pas, mais la version imprimee sur la ligne, oui',
    ).toBe('SS-149-CHIBIV');
  });

  it('une reference nue donne le tirage sans lettre, jamais une variante', () => {
    const ligne = analyserLigne('2x   KAKASHI HATAKE Peu importe   (2-149/140)')!;
    const relue = resoudreLigne(ligne, INDEX, SET_PAR_NUMERO)!;
    expect(lettreDeVariante(relue.rarity), 'aucune lettre, donc aucune variante').toBe('');
  });

  it('la quantite est respectee', () => {
    expect(analyserLigne('2x Akamaru Ninja Hound (1-27/130)')!.quantite).toBe(2);
    expect(analyserLigne('1x Rasa Fourth Kazekage (1-83/130)')!.quantite).toBe(1);
    expect(analyserLigne('Assassination (1-MSS04)')!.quantite, 'une mission vaut un').toBe(1);
  });
});

describe('le lecteur accepte les variations tolerees par le reglement', () => {
  const variantes = [
    '2x Gaara — Genin of the Sand Village (1-74/130)',
    '2 Gaara - Genin of the Sand Village (1-74/130)',
    '2X Gaara Genin of the Sand Village ( 1-74/130 )',
    '2x Gaara You sad little pawn. (2-78-140 V)',
  ];
  for (const ligne of variantes) {
    it(`lit: ${ligne.slice(0, 44)}`, () => {
      const a = analyserLigne(ligne);
      expect(a, 'la ligne est comprise').not.toBeNull();
      expect(a!.quantite).toBe(2);
      expect(resoudreLigne(a!, INDEX, SET_PAR_NUMERO), 'une carte est trouvee').not.toBeNull();
    });
  }

  it('le tiret a la place de la barre oblique marche aussi', () => {
    const a = analyserLigne('2x Gaara You sad little pawn. (2-78-140 V)')!;
    const c = resoudreLigne(a, INDEX, SET_PAR_NUMERO)!;
    expect(c.cardId ?? c.id).toBe('SS-078-CHIBIV');
  });

  it('les lignes de titre et les lignes vides sont ignorees', () => {
    const lu = analyserDecklist(['Mon deck', '', 'Main Deck: 2', '2x Akamaru Ninja Hound (1-27/130)',
      '', 'Missions : 1', 'Assassination (1-MSS04)'].join('\n'));
    expect(lu.length, 'deux lignes de cartes seulement').toBe(2);
    expect(lu[1].mission).toBe(true);
  });

  it('un texte sans reference chiffree n est pas pris pour une decklist', () => {
    expect(ressemblELaUneDecklist('KS-027-C--2|KS-001-MMS--1|Mon_Deck'), 'ancien code').toBe(false);
    expect(ressemblELaUneDecklist('bonjour')).toBe(false);
    expect(ressemblELaUneDecklist('2x Akamaru (1-27/130)')).toBe(true);
  });
});

describe('la decklist complete se lit comme le document officiel', () => {
  const persos = [carte('KS-027-C'), carte('KS-027-C'), carte('KS-072-C')];
  const missions = [carte('KS-004-MMS'), carte('SS-004-MMS')];
  const texte = construireDecklist(persos, missions, CARTES);

  it('elle commence directement par le total de cartes principales', () => {
    expect(texte.split('\n')[0], 'aucun nom de deck en tete').toBe('Main Deck: 3');
  });

  it('aucune ligne ne porte de nom de deck', () => {
    for (const ligne of texte.split('\n')) {
      const attendue = ligne === '' || /^(Main Deck|Missions): \d+$/.test(ligne) || /\(.+\)$/.test(ligne);
      expect(attendue, `ligne inattendue: ${ligne}`).toBe(true);
    }
  });

  it('elle annonce le total de missions', () => {
    expect(texte).toContain('Missions: 2');
  });

  it('une ligne suit la forme quantite, nom, version, reference', () => {
    expect(texte).toContain('2x   AKAMARU Ninja Hound   (1-27/130)');
    expect(texte.split('AKAMARU Ninja Hound').length - 1, 'une seule ligne pour les deux').toBe(1);
  });

  it('la quantite porte toujours le x, meme pour un seul exemplaire', () => {
    const deux = texte.split('\n').find((l) => l.includes('1-27/130'))!;
    expect(deux.startsWith('2x'), `obtenu: ${deux}`).toBe(true);
    const un = texte.split('\n').find((l) => l.includes('1-72/130'))!;
    expect(un.startsWith('1x'), `obtenu: ${un}`).toBe(true);
  });

  it('les missions n ont pas de quantite, comme dans le document', () => {
    const ligneMission = texte.split('\n').find((l) => l.includes('MSS04'))!;
    expect(/^\d/.test(ligneMission), 'pas de quantite devant une mission').toBe(false);
    expect(ligneMission, 'un seul espace avant la reference').toContain('Assassination (1-MSS04)');
  });

  it('elle se relit entierement', () => {
    const lu = analyserDecklist(texte);
    expect(lu.length, 'deux personnages distincts et deux missions').toBe(4);
    const ids = lu.map((l) => {
      const c = resoudreLigne(l, INDEX, SET_PAR_NUMERO)!;
      return c.cardId ?? c.id;
    });
    expect(ids).toEqual(['KS-027-C', 'KS-072-C', 'KS-004-MMS', 'SS-004-MMS']);
    expect(lu[0].quantite).toBe(2);
  });
});

describe('une reference sans precision retombe sur la carte que tout le monde possede', () => {
  it('un numero nu donne le tirage de base, jamais une variante', () => {
    for (const [numero, setNum] of [[113, 1], [121, 2], [78, 2], [126, 2]] as const) {
      const a = analyserLigne(`1x Peu importe (${setNum}-${numero}/${setNum === 1 ? 130 : 140})`)!;
      const c = resoudreLigne(a, INDEX, SET_PAR_NUMERO)!;
      expect(
        estLeTirageDeBase(c, INDEX),
        `${setNum}-${numero} sans lettre doit donner le tirage de base, obtenu ${c.cardId ?? c.id}`,
      ).toBe(true);
    }
  });

  it('une variante exportee sans lettre revient sur la carte que tout le monde possede', () => {
    for (const id of ['SS-149-CHIBIV', 'SS-121-SPV', 'KS-113-RA']) {
      const v = carte(id);
      const nu = referenceOfficielle(v, INDEX).replace(/ [AVG]$/, '');
      const relue = resoudreLigne(analyserLigne(`2x ${nomAffiche(v)} (${nu})`)!, INDEX, SET_PAR_NUMERO)!;
      expect(
        lettreDeVariante(relue.rarity),
        `${id} ecrit sans sa lettre doit donner un tirage de base, obtenu ${relue.cardId ?? relue.id}`,
      ).toBe('');
    }
  });

  it('une lettre inconnue retombe sur la base au lieu d echouer', () => {
    const a = analyserLigne('1x Peu importe (1-113/130 Z)')!;
    const c = resoudreLigne(a, INDEX, SET_PAR_NUMERO)!;
    expect(c.cardId ?? c.id).toBe('KS-113-R');
  });

  it('un set inconnu ne renvoie rien plutot que n importe quoi', () => {
    const a = analyserLigne('1x Peu importe (9-13/130)')!;
    expect(resoudreLigne(a, INDEX, SET_PAR_NUMERO)).toBeNull();
  });
});

describe('le deck builder ecrit et relit ce format', () => {
  const RACINE = join(__dirname, '..', '..');
  const page = readFileSync(join(RACINE, 'app', '[locale]', 'deck-builder', 'page.tsx'), 'utf8');

  it('le code propose a la copie est la decklist officielle', () => {
    expect(page).toContain('construireDecklist(');
    expect(page, 'plus de code a rallonge separe par des barres').not.toMatch(
      /exportCode[\s\S]{0,200}\.join\("\|"\)/,
    );
  });

  it('l import reconnait une decklist avant de retomber sur l ancien code', () => {
    const debut = page.indexOf('const handleImport');
    const corps = page.slice(debut, debut + 2600);
    const posDecklist = corps.indexOf('ressemblELaUneDecklist(code)');
    const posAncien = corps.indexOf('code.split("|")');
    expect(posDecklist, 'la decklist est essayee').toBeGreaterThan(-1);
    expect(posAncien, 'les anciens codes restent acceptes').toBeGreaterThan(-1);
    expect(posDecklist, 'et elle est essayee en premier').toBeLessThan(posAncien);
  });

  it('une carte que le joueur ne possede pas devient la carte de base', () => {
    const debut = page.indexOf('const handleImport');
    const corps = page.slice(debut, debut + 2600);
    expect(corps, 'la substitution vaut aussi pour une decklist importee')
      .toContain('addChar(remplacerParLaBase(c))');
    expect(corps).toContain('isLockedVariantCard(carte) && !unlockedVariantIds.has(carte.id)');
    expect(corps).toContain('baseCardIdFor(carte.cardId || carte.id)');
  });

  it('les deux champs acceptent plusieurs lignes', () => {
    const imports = page.indexOf('deckBuilder.importPlaceholder');
    expect(page.slice(imports - 200, imports + 200), 'coller une decklist entiere')
      .toContain('<textarea');
    const exports = page.indexOf('readOnly value={exportCode}');
    expect(page.slice(exports - 200, exports + 200), 'lire la decklist entiere')
      .toContain('<textarea');
  });

  it('le deck partage depuis un profil se copie aussi en decklist', () => {
    const modale = readFileSync(join(RACINE, 'components', 'profile', 'DeckViewerModal.tsx'), 'utf8');
    expect(modale).toContain('navigator.clipboard.writeText(buildDecklist())');
    expect(modale, 'le transfert interne vers le deck builder reste tel quel')
      .toContain("sessionStorage.setItem('importDeckCode', buildDeckCode())");
  });
});
