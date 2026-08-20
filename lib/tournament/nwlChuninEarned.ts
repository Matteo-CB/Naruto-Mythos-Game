import { prisma } from '@/lib/db/prisma';

const CLE_REGLAGES = 'global';

export async function lireChuninGagnes(): Promise<string[]> {
  const reglages = await prisma.siteSettings.findUnique({
    where: { key: CLE_REGLAGES },
    select: { nwlChuninEarned: true },
  });
  const brut = reglages?.nwlChuninEarned as unknown;
  return Array.isArray(brut) ? brut.filter((x): x is string => typeof x === 'string' && !!x) : [];
}

export async function ecrireChuninGagnes(discordIds: string[]): Promise<void> {
  const valeur = [...new Set(discordIds.filter(Boolean))];
  await prisma.siteSettings.upsert({
    where: { key: CLE_REGLAGES },
    update: { nwlChuninEarned: valeur },
    create: { key: CLE_REGLAGES, nwlChuninEarned: valeur },
  });
}

export async function ajouterChuninGagnes(discordIds: string[]): Promise<string[]> {
  const nouveaux = discordIds.filter(Boolean);
  if (nouveaux.length === 0) return lireChuninGagnes();
  const total = [...new Set([...(await lireChuninGagnes()), ...nouveaux])];
  await ecrireChuninGagnes(total);
  return total;
}
