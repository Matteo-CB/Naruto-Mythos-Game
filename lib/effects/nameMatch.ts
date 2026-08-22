import type { CardData } from '@/lib/engine/types';

export function nomComplet(carte: { name_fr?: string | null; name_en?: string | null } | null | undefined): string {
  if (!carte) return '';
  return `${carte.name_fr ?? ''} ${carte.name_en ?? ''}`.toUpperCase();
}

function motEntier(texte: string, mot: string): boolean {
  const cible = mot.toUpperCase();
  let depuis = 0;
  for (;;) {
    const at = texte.indexOf(cible, depuis);
    if (at === -1) return false;
    const avant = at === 0 ? ' ' : texte[at - 1];
    const apres = at + cible.length >= texte.length ? ' ' : texte[at + cible.length];
    if (!/[A-ZÀ-Ý0-9]/.test(avant) && !/[A-ZÀ-Ý0-9]/.test(apres)) return true;
    depuis = at + 1;
  }
}

export function porteLeNom(
  carte: { name_fr?: string | null; name_en?: string | null } | null | undefined,
  ...noms: string[]
): boolean {
  const complet = nomComplet(carte);
  if (!complet.trim()) return false;
  return noms.some((nom) => motEntier(complet, nom));
}

export const CLAN_UCHIHA = ['UCHIHA', 'UCHIWA'];
export const CLAN_HYUGA = ['HYUGA', 'HYÛGA', 'HYUGA'];

export function estDuClanUchiha(carte: CardData | null | undefined): boolean {
  return porteLeNom(carte, ...CLAN_UCHIHA);
}
