import type { CharacterCard, MissionCard } from '@/lib/engine/types';
import { isLandscapeCard } from '@/lib/cards/orientation';
import { normalizeImagePath } from './imagePath';

const MM_PAR_POUCE = 25.4;
const POINTS_PAR_POUCE = 72;
const DPI = 300;

export const CARTE_L_MM = 63;
export const CARTE_H_MM = 88;
export const A4_L_MM = 210;
export const A4_H_MM = 297;
export const COLONNES = 3;
export const RANGEES = 3;

const MISSIONS_PAR_RANGEE = 2;

function mmEnPoints(mm: number): number {
  return (mm / MM_PAR_POUCE) * POINTS_PAR_POUCE;
}

function mmEnPixels(mm: number): number {
  return Math.round((mm / MM_PAR_POUCE) * DPI);
}

function chargerImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export interface ZoneSource { sx: number; sy: number; sl: number; sh: number }

const SEUIL_ALPHA = 8;
const zonesOpaques = new Map<string, ZoneSource>();

export function boiteOpaque(
  alpha: Uint8ClampedArray,
  largeur: number,
  hauteur: number,
): ZoneSource | null {
  let x0 = largeur;
  let y0 = hauteur;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < hauteur; y += 1) {
    const ligne = y * largeur;
    for (let x = 0; x < largeur; x += 1) {
      if (alpha[(ligne + x) * 4 + 3] <= SEUIL_ALPHA) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < x0 || y1 < y0) return null;
  return { sx: x0, sy: y0, sl: x1 - x0 + 1, sh: y1 - y0 + 1 };
}

export function zoneOpaque(img: HTMLImageElement): ZoneSource {
  const pleine: ZoneSource = { sx: 0, sy: 0, sl: img.width, sh: img.height };
  const cle = img.src;
  if (cle) {
    const connue = zonesOpaques.get(cle);
    if (connue) return connue;
  }

  let zone = pleine;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(img, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      zone = boiteOpaque(pixels, canvas.width, canvas.height) ?? pleine;
    }
  } catch {
    zone = pleine;
  }

  if (cle) zonesOpaques.set(cle, zone);
  return zone;
}

export function dessinerEnRemplissant(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  l: number,
  h: number,
  zone: ZoneSource = zoneOpaque(img),
): void {
  const ratioSource = zone.sl / zone.sh;
  const ratioCible = l / h;
  let sx = zone.sx;
  let sy = zone.sy;
  let sl = zone.sl;
  let sh = zone.sh;
  if (ratioSource > ratioCible) {
    sl = zone.sh * ratioCible;
    sx = zone.sx + (zone.sl - sl) / 2;
  } else {
    sh = zone.sl / ratioCible;
    sy = zone.sy + (zone.sh - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sl, sh, x, y, l, h);
}

function base64VersOctets(base64: string): Uint8Array {
  const binaire = atob(base64);
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i += 1) octets[i] = binaire.charCodeAt(i);
  return octets;
}

interface PageJpeg {
  octets: Uint8Array;
  largeur: number;
  hauteur: number;
}

export function construirePdf(pages: PageJpeg[]): Blob {
  const morceaux: Uint8Array[] = [];
  const encodeur = new TextEncoder();
  let position = 0;
  const decalages: number[] = [];

  const ecrire = (texte: string) => {
    const octets = encodeur.encode(texte);
    morceaux.push(octets);
    position += octets.length;
  };
  const ecrireOctets = (octets: Uint8Array) => {
    morceaux.push(octets);
    position += octets.length;
  };
  const objet = (numero: number, corps: string) => {
    decalages[numero] = position;
    ecrire(`${numero} 0 obj\n${corps}\nendobj\n`);
  };

  const nbPages = pages.length;
  const idsPages: number[] = [];
  for (let i = 0; i < nbPages; i += 1) idsPages.push(3 + i * 3);

  ecrire('%PDF-1.4\n');

  objet(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objet(
    2,
    `<< /Type /Pages /Kids [${idsPages.map((n) => `${n} 0 R`).join(' ')}] /Count ${nbPages} >>`,
  );

  const lPt = mmEnPoints(A4_L_MM).toFixed(2);
  const hPt = mmEnPoints(A4_H_MM).toFixed(2);

  for (let i = 0; i < nbPages; i += 1) {
    const idPage = idsPages[i];
    const idImage = idPage + 1;
    const idContenu = idPage + 2;

    objet(
      idPage,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${lPt} ${hPt}] `
      + `/Resources << /XObject << /Im0 ${idImage} 0 R >> >> /Contents ${idContenu} 0 R >>`,
    );

    const page = pages[i];
    decalages[idImage] = position;
    ecrire(
      `${idImage} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${page.largeur} `
      + `/Height ${page.hauteur} /ColorSpace /DeviceRGB /BitsPerComponent 8 `
      + `/Filter /DCTDecode /Length ${page.octets.length} >>\nstream\n`,
    );
    ecrireOctets(page.octets);
    ecrire('\nendstream\nendobj\n');

    const contenu = `q\n${lPt} 0 0 ${hPt} 0 0 cm\n/Im0 Do\nQ\n`;
    objet(idContenu, `<< /Length ${contenu.length} >>\nstream\n${contenu}endstream`);
  }

  const nbObjets = 3 + nbPages * 3;
  const debutXref = position;
  ecrire(`xref\n0 ${nbObjets}\n0000000000 65535 f \n`);
  for (let n = 1; n < nbObjets; n += 1) {
    ecrire(`${String(decalages[n] ?? 0).padStart(10, '0')} 00000 n \n`);
  }
  ecrire(
    `trailer\n<< /Size ${nbObjets} /Root 1 0 R >>\nstartxref\n${debutXref}\n%%EOF\n`,
  );

  return new Blob(morceaux as BlobPart[], { type: 'application/pdf' });
}

async function rendrePage(
  images: Array<HTMLImageElement | null>,
  carteLmm: number,
  carteHmm: number,
  colonnes: number,
  rangeesGrille: number,
): Promise<PageJpeg> {
  const canvas = document.createElement('canvas');
  canvas.width = mmEnPixels(A4_L_MM);
  canvas.height = mmEnPixels(A4_H_MM);
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const carteL = mmEnPixels(carteLmm);
  const carteH = mmEnPixels(carteHmm);
  const origineX = Math.round((canvas.width - colonnes * carteL) / 2);
  const origineY = Math.round((canvas.height - rangeesGrille * carteH) / 2);

  for (let i = 0; i < images.length; i += 1) {
    const col = i % colonnes;
    const rang = Math.floor(i / colonnes);
    const x = origineX + col * carteL;
    const y = origineY + rang * carteH;
    const img = images[i];
    if (img) {
      dessinerEnRemplissant(ctx, img, x, y, carteL, carteH);
    } else {
      ctx.fillStyle = '#e6e6e6';
      ctx.fillRect(x, y, carteL, carteH);
    }
  }

  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  return {
    octets: base64VersOctets(dataUrl.slice(dataUrl.indexOf(',') + 1)),
    largeur: canvas.width,
    hauteur: canvas.height,
  };
}

export async function exportDeckAsPdf(
  deckName: string,
  characters: CharacterCard[],
  missions: MissionCard[],
): Promise<void> {
  const chargerToutes = async (cartes: Array<{ image_file?: string }>) =>
    Promise.all(
      cartes.map((c) => {
        const src = normalizeImagePath(c.image_file);
        return src ? chargerImage(src).catch(() => null) : Promise.resolve(null);
      }),
    );

  const estCouchee = (c: CharacterCard) =>
    isLandscapeCard(c as Parameters<typeof isLandscapeCard>[0]);

  const debout = characters.filter((c) => !estCouchee(c));
  const couchees = [
    ...characters.filter(estCouchee),
    ...missions,
  ] as Array<{ image_file?: string }>;

  const imagesDebout = await chargerToutes(debout);
  const imagesCouchees = await chargerToutes(couchees);

  const pages: PageJpeg[] = [];
  const parPage = COLONNES * RANGEES;

  for (let i = 0; i < imagesDebout.length; i += parPage) {
    pages.push(await rendrePage(
      imagesDebout.slice(i, i + parPage), CARTE_L_MM, CARTE_H_MM, COLONNES, RANGEES,
    ));
  }

  const coucheesParPage = MISSIONS_PAR_RANGEE * RANGEES;
  for (let i = 0; i < imagesCouchees.length; i += coucheesParPage) {
    const lot = imagesCouchees.slice(i, i + coucheesParPage);
    pages.push(await rendrePage(
      lot,
      CARTE_H_MM,
      CARTE_L_MM,
      MISSIONS_PAR_RANGEE,
      Math.ceil(lot.length / MISSIONS_PAR_RANGEE),
    ));
  }

  if (pages.length === 0) return;

  const blob = construirePdf(pages);
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.download = `${(deckName || 'deck').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
  lien.href = url;
  lien.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
