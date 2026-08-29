import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import { carteDeBasePour, estUneVarianteVerrouillee, idActuel } from '@/lib/variants/carteDeBase';
import { getCardById } from '@/lib/data/cardIndex';
import { isHoloId, holoBaseId } from '@/lib/holo/holoId';
import { isAdmin } from '@/lib/auth/admins';
import { parseCardId } from '@/lib/variants/isVariant';

const env = readFileSync('.env', 'utf8');
for (const ligne of env.split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(ligne.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const APPLIQUER = process.argv.includes('--apply');
const SETS_A_REPRENDRE = new Set(['SS']);

interface Sort {
  garde: string;
  raison: 'inchangee' | 'possedee' | 'renommee' | 'ramenee-set2' | 'ramenee-non-possedee' | 'holo';
}

function decide(cardId: string, possede: (id: string) => boolean): Sort {
  if (isHoloId(cardId)) return { garde: holoBaseId(cardId), raison: 'holo' };

  const actuel = idActuel(cardId);
  if (!estUneVarianteVerrouillee(actuel)) {
    return { garde: actuel, raison: actuel === cardId ? 'inchangee' : 'renommee' };
  }

  const set = parseCardId(actuel)?.set ?? '';
  const base = carteDeBasePour(actuel);
  const baseValide = base !== actuel && !!getCardById(base);

  if (SETS_A_REPRENDRE.has(set)) {
    return baseValide ? { garde: base, raison: 'ramenee-set2' } : { garde: actuel, raison: 'possedee' };
  }
  if (possede(actuel) || possede(cardId)) {
    return { garde: actuel, raison: actuel === cardId ? 'possedee' : 'renommee' };
  }
  return baseValide ? { garde: base, raison: 'ramenee-non-possedee' } : { garde: actuel, raison: 'possedee' };
}

async function main() {
  const prisma = new PrismaClient();

  const [decks, inventaires, comptes] = await Promise.all([
    prisma.deck.findMany({ select: { id: true, name: true, userId: true, cardIds: true } }),
    prisma.variantInventory.findMany({ select: { userId: true, cardId: true } }),
    prisma.user.findMany({ select: { id: true, username: true, email: true } }),
  ]);

  const possession = new Set(inventaires.map((i) => `${i.userId}:${i.cardId}`));
  const administrateurs = new Set(
    comptes.filter((c) => isAdmin({ username: c.username, email: c.email ?? '' })).map((c) => c.id),
  );

  let decksTouches = 0;
  let decksAdmin = 0;
  const compte = new Map<string, number>();
  const parCarte = new Map<string, number>();

  for (const deck of decks) {
    if (administrateurs.has(deck.userId)) { decksAdmin += 1; continue; }
    const possede = (id: string) => possession.has(`${deck.userId}:${id}`);
    const nouveaux: string[] = [];
    let change = false;

    for (const id of deck.cardIds) {
      const sort = decide(id, possede);
      nouveaux.push(sort.garde);
      compte.set(sort.raison, (compte.get(sort.raison) ?? 0) + 1);
      if (sort.garde !== id) {
        change = true;
        parCarte.set(`${id} -> ${sort.garde}`, (parCarte.get(`${id} -> ${sort.garde}`) ?? 0) + 1);
      }
    }

    if (!change) continue;
    decksTouches += 1;
    if (APPLIQUER) {
      await prisma.deck.update({ where: { id: deck.id }, data: { cardIds: nouveaux } });
    }
  }

  console.log(APPLIQUER ? '=== MIGRATION APPLIQUEE ===' : '=== SIMULATION, rien ecrit ===');
  console.log('decks en base                    :', decks.length);
  console.log('decks appartenant a un admin, intacts:', decksAdmin);
  console.log('decks modifies                   :', decksTouches);
  console.log('cartes inchangees                :', compte.get('inchangee') ?? 0);
  console.log('variantes gardees, possedees     :', compte.get('possedee') ?? 0);
  console.log('identifiants hérités renommés    :', compte.get('renommee') ?? 0);
  console.log('variantes du set 2 ramenees      :', compte.get('ramenee-set2') ?? 0);
  console.log('variantes non possedees ramenees :', compte.get('ramenee-non-possedee') ?? 0);
  console.log('holos ramenees a leur carte      :', compte.get('holo') ?? 0);
  console.log('cartes retirees                  : 0');

  const top = [...parCarte.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  if (top.length) {
    console.log('\n--- conversions les plus frequentes ---');
    for (const [paire, n] of top) console.log(`   ${paire.padEnd(30)} ${n}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
