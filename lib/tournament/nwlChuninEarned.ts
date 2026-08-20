import { prisma } from '@/lib/db/prisma';

const CLE_REGLAGES = 'global';

export const NWL_CHUNIN_TAG_DAYS = 3;
export const NWL_CHUNIN_TAG_MS = NWL_CHUNIN_TAG_DAYS * 24 * 60 * 60 * 1000;

export interface TagChunin {
  discordId: string;
  expiresAt: number;
}

type ChampListe = 'nwlChuninEarned' | 'nwlJoninGranted';

async function lireListe(champ: ChampListe): Promise<unknown[]> {
  const reglages = await prisma.siteSettings.findUnique({
    where: { key: CLE_REGLAGES },
    select: { nwlChuninEarned: true, nwlJoninGranted: true },
  });
  const brut = (reglages as Record<string, unknown> | null)?.[champ];
  return Array.isArray(brut) ? brut : [];
}

async function ecrireListe(champ: ChampListe, valeur: unknown[]): Promise<void> {
  await prisma.siteSettings.upsert({
    where: { key: CLE_REGLAGES },
    update: { [champ]: valeur },
    create: { key: CLE_REGLAGES, [champ]: valeur },
  });
}

export function normaliserTag(entree: unknown): TagChunin | null {
  if (typeof entree === 'string') return entree ? { discordId: entree, expiresAt: 0 } : null;
  if (entree && typeof entree === 'object') {
    const o = entree as { discordId?: unknown; expiresAt?: unknown };
    if (typeof o.discordId === 'string' && o.discordId) {
      return { discordId: o.discordId, expiresAt: typeof o.expiresAt === 'number' ? o.expiresAt : 0 };
    }
  }
  return null;
}

export async function lireTagsChunin(): Promise<TagChunin[]> {
  const brut = await lireListe('nwlChuninEarned');
  const tags = brut.map(normaliserTag).filter((t): t is TagChunin => t !== null);
  const parJoueur = new Map<string, TagChunin>();
  for (const t of tags) {
    const existant = parJoueur.get(t.discordId);
    if (!existant || t.expiresAt > existant.expiresAt) parJoueur.set(t.discordId, t);
  }
  return [...parJoueur.values()];
}

export async function ecrireTagsChunin(tags: TagChunin[]): Promise<void> {
  return ecrireListe('nwlChuninEarned', tags);
}

export async function ajouterTagsChunin(discordIds: string[], expireLe: number): Promise<TagChunin[]> {
  const nouveaux = discordIds.filter(Boolean);
  if (nouveaux.length === 0) return lireTagsChunin();
  const total = [...(await lireTagsChunin()), ...nouveaux.map((discordId) => ({ discordId, expiresAt: expireLe }))];
  const parJoueur = new Map<string, TagChunin>();
  for (const t of total) {
    const existant = parJoueur.get(t.discordId);
    if (!existant || t.expiresAt > existant.expiresAt) parJoueur.set(t.discordId, t);
  }
  const fusionnes = [...parJoueur.values()];
  await ecrireTagsChunin(fusionnes);
  return fusionnes;
}

export function separerTagsExpires(tags: TagChunin[], maintenant: number): { expires: TagChunin[]; valides: TagChunin[] } {
  return {
    expires: tags.filter((t) => t.expiresAt <= maintenant),
    valides: tags.filter((t) => t.expiresAt > maintenant),
  };
}

export async function lireJoninAccordes(): Promise<string[]> {
  const brut = await lireListe('nwlJoninGranted');
  return brut.filter((x): x is string => typeof x === 'string' && !!x);
}

export async function ecrireJoninAccordes(discordIds: string[]): Promise<void> {
  return ecrireListe('nwlJoninGranted', [...new Set(discordIds.filter(Boolean))]);
}
