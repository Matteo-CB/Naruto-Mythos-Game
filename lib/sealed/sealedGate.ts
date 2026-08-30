import { isAdmin } from '@/lib/auth/admins';

export const SEALED_TEMPORAIREMENT_FERME = false;

export function sealedOuvertPour(
  utilisateur: { username?: string | null; email?: string | null } | null | undefined,
): boolean {
  if (!SEALED_TEMPORAIREMENT_FERME) return true;
  if (!utilisateur) return false;
  return isAdmin({ username: utilisateur.username ?? undefined, email: utilisateur.email ?? undefined });
}
