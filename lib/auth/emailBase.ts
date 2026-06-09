export function normalizeEmailBase(email: string): string {
  if (!email) return '';
  const trimmed = email.trim().toLowerCase();
  const atIdx = trimmed.indexOf('@');
  if (atIdx <= 0) return trimmed;
  const local = trimmed.slice(0, atIdx);
  const domain = trimmed.slice(atIdx + 1);
  const noAlias = local.split('+')[0];
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return `${noAlias.replace(/\./g, '')}@gmail.com`;
  }
  return `${noAlias}@${domain}`;
}
