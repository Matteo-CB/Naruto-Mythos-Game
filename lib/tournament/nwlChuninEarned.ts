import { prisma } from '@/lib/db/prisma';

const CLE_REGLAGES = 'global';

type ChampListe = 'nwlChuninEarned' | 'nwlJoninGranted';

async function lireListe(champ: ChampListe): Promise<string[]> {
  const reglages = await prisma.siteSettings.findUnique({
    where: { key: CLE_REGLAGES },
    select: { nwlChuninEarned: true, nwlJoninGranted: true },
  });
  const brut = (reglages as Record<string, unknown> | null)?.[champ];
  return Array.isArray(brut) ? brut.filter((x): x is string => typeof x === 'string' && !!x) : [];
}

async function ecrireListe(champ: ChampListe, discordIds: string[]): Promise<void> {
  const valeur = [...new Set(discordIds.filter(Boolean))];
  await prisma.siteSettings.upsert({
    where: { key: CLE_REGLAGES },
    update: { [champ]: valeur },
    create: { key: CLE_REGLAGES, [champ]: valeur },
  });
}

export async function lireChuninGagnes(): Promise<string[]> {
  return lireListe('nwlChuninEarned');
}

export async function ecrireChuninGagnes(discordIds: string[]): Promise<void> {
  return ecrireListe('nwlChuninEarned', discordIds);
}

export async function ajouterChuninGagnes(discordIds: string[]): Promise<string[]> {
  const nouveaux = discordIds.filter(Boolean);
  if (nouveaux.length === 0) return lireChuninGagnes();
  const total = [...new Set([...(await lireChuninGagnes()), ...nouveaux])];
  await ecrireChuninGagnes(total);
  return total;
}

export async function lireJoninAccordes(): Promise<string[]> {
  return lireListe('nwlJoninGranted');
}

export async function ecrireJoninAccordes(discordIds: string[]): Promise<void> {
  return ecrireListe('nwlJoninGranted', discordIds);
}
