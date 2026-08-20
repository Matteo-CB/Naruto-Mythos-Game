const SIGNATURES_OBSOLETES = [
  'failed to find server action',
  'chunkloaderror',
  'loading chunk',
  'loading css chunk',
  'failed to fetch dynamically imported module',
  'importing a module script failed',
  'unexpected token \'<\'',
];

export function estBundleObsolete(error: { name?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const texte = `${error.name ?? ''} ${error.message ?? ''}`.toLowerCase();
  return SIGNATURES_OBSOLETES.some((signature) => texte.includes(signature));
}

export const CLE_RECHARGEMENT_OBSOLETE = 'naruto-mythos-stale-reload';

export function rechargerUneSeuleFois(
  stockage: Pick<Storage, 'getItem' | 'setItem'> | null | undefined,
  recharger: () => void,
): boolean {
  if (!stockage) return false;
  try {
    if (stockage.getItem(CLE_RECHARGEMENT_OBSOLETE)) return false;
    stockage.setItem(CLE_RECHARGEMENT_OBSOLETE, '1');
  } catch {
    return false;
  }
  recharger();
  return true;
}
