import { readFileSync, writeFileSync } from 'fs';

const VARIANTES = new Set(['RA', 'SV', 'MV', 'SPV', 'CHIBIV', 'SHINOBIV', 'POPV', 'POP', 'CHIBI', 'SP', 'SHINOBI']);

const data = JSON.parse(readFileSync('lib/data/sets/SS/cards.json', 'utf8')).cards;

const parNumero = new Map();
for (const carte of Object.values(data)) {
  if (VARIANTES.has(carte.rarity)) continue;
  const cle = `${carte.card_type}#${carte.number}`;
  const actuel = parNumero.get(cle);
  if (!actuel || String(carte.id) < String(actuel.id)) parNumero.set(cle, carte);
}

const cartes = [...parNumero.values()].sort((a, b) => {
  const na = (a.name_fr || a.name_en || '').toLocaleUpperCase('fr');
  const nb = (b.name_fr || b.name_en || '').toLocaleUpperCase('fr');
  if (na !== nb) return na.localeCompare(nb, 'fr');
  return Number(a.number) - Number(b.number);
});

const TYPE_COURT = { character: 'P', attachment: 'E', mission: 'M' };

function echappe(texte) {
  return texte.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function latin1(texte) {
  return texte
    .replace(/[’‘]/g, "'").replace(/[“”]/g, '"')
    .replace(/…/g, '...').replace(/[–—]/g, '-')
    .split('').filter((c) => c.charCodeAt(0) < 256).join('');
}

const LARGEUR = 595.28;
const HAUTEUR = 841.89;
const MARGE = 34;
const COLONNES = 2;
const LARGEUR_COL = (LARGEUR - MARGE * 2) / COLONNES;
const LIGNE = 15.2;
const HAUT_LISTE = HAUTEUR - MARGE - 46;
const BAS = MARGE + 22;
const PAR_COLONNE = Math.floor((HAUT_LISTE - BAS) / LIGNE);
const PAR_PAGE = PAR_COLONNE * COLONNES;

const pages = [];
for (let debut = 0; debut < cartes.length; debut += PAR_PAGE) {
  pages.push(cartes.slice(debut, debut + PAR_PAGE));
}

function contenuPage(lot, indexPage) {
  const ops = [];
  ops.push('BT /F2 15 Tf 1 0 0 1 ' + MARGE + ' ' + (HAUTEUR - MARGE - 8) + ' Tm (' + echappe('SHINOBI SHIREN - CARTES A VERIFIER') + ') Tj ET');
  ops.push('BT /F1 8.5 Tf 1 0 0 1 ' + MARGE + ' ' + (HAUTEUR - MARGE - 24) + ' Tm ('
    + echappe(latin1(`${cartes.length} cartes, hors variantes. P personnage, E equipement, M mission. Page ${indexPage + 1} sur ${pages.length}`))
    + ') Tj ET');
  ops.push('0.75 w 0.6 0.6 0.6 RG');
  ops.push(MARGE + ' ' + (HAUTEUR - MARGE - 32) + ' m ' + (LARGEUR - MARGE) + ' ' + (HAUTEUR - MARGE - 32) + ' l S');

  lot.forEach((carte, i) => {
    const colonne = Math.floor(i / PAR_COLONNE);
    const rang = i % PAR_COLONNE;
    const x = MARGE + colonne * LARGEUR_COL;
    const y = HAUT_LISTE - rang * LIGNE;

    ops.push('0.25 0.25 0.25 RG 0.9 w');
    ops.push([x, y - 7.6, 9.2, 9.2].join(' ') + ' re S');

    const nom = latin1((carte.name_fr || carte.name_en || '').toLocaleUpperCase('fr'));
    const titre = latin1(carte.title_fr || carte.title_en || '');
    const numero = String(carte.number).padStart(3, '0');
    const type = TYPE_COURT[carte.card_type] || '?';

    ops.push('0 0 0 rg BT /F2 8.6 Tf 1 0 0 1 ' + (x + 14) + ' ' + (y - 6) + ' Tm (' + echappe(nom.slice(0, 26)) + ') Tj ET');
    if (titre) {
      ops.push('0.35 0.35 0.35 rg BT /F1 6.6 Tf 1 0 0 1 ' + (x + 14) + ' ' + (y - 13.4) + ' Tm (' + echappe(titre.slice(0, 34)) + ') Tj ET');
    }
    ops.push('0.45 0.45 0.45 rg BT /F1 7.4 Tf 1 0 0 1 ' + (x + LARGEUR_COL - 44) + ' ' + (y - 6) + ' Tm (' + echappe(`${type} ${numero}`) + ') Tj ET');
    ops.push('0 0 0 rg');
  });

  return ops.join('\n');
}

const objets = [];
function ajoute(contenu) {
  objets.push(contenu);
  return objets.length;
}

const idsPages = [];
const idsContenus = [];
for (let i = 0; i < pages.length; i++) {
  idsContenus.push(0);
  idsPages.push(0);
}

const idCatalogue = ajoute('<< /Type /Catalog /Pages 2 0 R >>');
const idArbre = ajoute('PLACEHOLDER');
const idF1 = ajoute('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
const idF2 = ajoute('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

for (let i = 0; i < pages.length; i++) {
  const flux = contenuPage(pages[i], i);
  idsContenus[i] = ajoute(`<< /Length ${Buffer.byteLength(flux, 'latin1')} >>\nstream\n${flux}\nendstream`);
  idsPages[i] = ajoute(`<< /Type /Page /Parent ${idArbre} 0 R /MediaBox [0 0 ${LARGEUR} ${HAUTEUR}] /Resources << /Font << /F1 ${idF1} 0 R /F2 ${idF2} 0 R >> >> /Contents ${idsContenus[i]} 0 R >>`);
}

objets[idArbre - 1] = `<< /Type /Pages /Count ${pages.length} /Kids [${idsPages.map((id) => `${id} 0 R`).join(' ')}] >>`;

let pdf = '%PDF-1.4\n';
const decalages = [];
for (let i = 0; i < objets.length; i++) {
  decalages.push(Buffer.byteLength(pdf, 'latin1'));
  pdf += `${i + 1} 0 obj\n${objets[i]}\nendobj\n`;
}
const debutXref = Buffer.byteLength(pdf, 'latin1');
pdf += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`;
for (const d of decalages) pdf += `${String(d).padStart(10, '0')} 00000 n \n`;
pdf += `trailer\n<< /Size ${objets.length + 1} /Root ${idCatalogue} 0 R >>\nstartxref\n${debutXref}\n%%EOF\n`;

writeFileSync('set2-cartes-a-verifier.pdf', Buffer.from(pdf, 'latin1'));
console.log(`PDF genere: ${cartes.length} cartes sur ${pages.length} pages`);
