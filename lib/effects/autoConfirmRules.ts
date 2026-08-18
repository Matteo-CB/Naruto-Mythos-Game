import type { EffectType } from '@/lib/engine/types';

const TYPES_CONCERNES: EffectType[] = ['MAIN', 'AMBUSH', 'UPGRADE', 'DUEL', 'FIRST_STRIKE'];

const ADVERSAIRE_EST_LE_SUJET = /^(?:the\s+)?opponent\s+(?:must\s+)?(?:gains?|draws?|discards?|chooses?|takes?|loses?|reveals?|plays?|defeats?|moves?|hides?|returns?|shuffles?)/i;

export function texteNu(description: string): string {
  return description
    .replace(/^\s*\[[^\]]*\]\s*/, '')
    .replace(/^DUEL\s+[^:]*:\s*/i, '')
    .trim();
}

export function adversaireEstLeSujet(description: string): boolean {
  return ADVERSAIRE_EST_LE_SUJET.test(texteNu(description));
}

export function effetInstantOptionnel(description: string, type: EffectType): boolean {
  if (description.includes('[⧗]')) return false;
  if (/\bMUST\b/i.test(description)) return false;
  if (adversaireEstLeSujet(description)) return false;
  return TYPES_CONCERNES.includes(type);
}
