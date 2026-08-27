import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import { carteDeBasePour, estUneVarianteVerrouillee } from '@/lib/variants/carteDeBase';
import { getCardById } from '@/lib/data/cardIndex';
import { isHoloId, holoBaseId } from '@/lib/holo/holoId';

const env = readFileSync('.env', 'utf8');
for (const ligne of env.split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(ligne.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const APPLIQUER = process.argv.includes('--apply');

interface Remplacement { avant: string; apres: string | null }

function convertir(cardId: string): Remplacement {
  if (isHoloId(cardId)) return { avant: cardId, apres: holoBaseId(cardId) };
  if (!estUneVarianteVerrouillee(cardId)) return { avant: cardId, apres: cardId };
  const base = carteDeBasePour(cardId);
  if (base === cardId || !getCardById(base)) return { avant: cardId, apres: null };
  return { avant: cardId, apres: base };
}

async function main() {
  const prisma = new PrismaClient();
  const decks = await prisma.deck.findMany({ select: { id: true, name: true, userId: true, cardIds: true } });

  let touches = 0;
  let cartesRemplacees = 0;
  let cartesRetirees = 0;
  const sansBase = new Map<string, number>();
  const parCarte = new Map<string, number>();
  const decksAmputes: string[] = [];

  for (const deck of decks) {
    const nouveaux: string[] = [];
    let change = false;
    let retireIci = 0;

    for (const id of deck.cardIds) {
      const { apres } = convertir(id);
      if (apres === id) { nouveaux.push(id); continue; }
      change = true;
      if (apres === null) {
        cartesRetirees += 1;
        retireIci += 1;
        sansBase.set(id, (sansBase.get(id) ?? 0) + 1);
        continue;
      }
      nouveaux.push(apres);
      cartesRemplacees += 1;
      parCarte.set(id, (parCarte.get(id) ?? 0) + 1);
    }

    if (!change) continue;
    touches += 1;
    if (retireIci > 0) decksAmputes.push(`${deck.id} (${deck.name}) -${retireIci}`);
    if (APPLIQUER) {
      await prisma.deck.update({ where: { id: deck.id }, data: { cardIds: nouveaux } });
    }
  }

  console.log(APPLIQUER ? '=== MIGRATION APPLIQUEE ===' : '=== SIMULATION, rien ecrit ===');
  console.log('decks en base:', decks.length);
  console.log('decks touches:', touches);
  console.log('cartes remplacees par leur carte de base:', cartesRemplacees);
  console.log('cartes retirees faute de carte de base:', cartesRetirees);

  const top = [...parCarte.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  if (top.length) {
    console.log('--- variantes les plus presentes ---');
    for (const [id, n] of top) console.log('  ', id.padEnd(16), n, '->', carteDeBasePour(id));
  }
  if (sansBase.size) {
    console.log('--- sans carte de base, retirees ---');
    for (const [id, n] of sansBase) console.log('  ', id, n);
    console.log('   decks concernes:', decksAmputes.slice(0, 10).join(', '));
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
